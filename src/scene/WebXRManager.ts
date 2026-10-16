import * as THREE from 'three';

export const XR_HAND_JOINTS: XRHandJoint[] = [
  'wrist',
  'thumb-metacarpal',
  'thumb-phalanx-proximal',
  'thumb-phalanx-distal',
  'thumb-tip',
  'index-finger-metacarpal',
  'index-finger-phalanx-proximal',
  'index-finger-phalanx-intermediate',
  'index-finger-phalanx-distal',
  'index-finger-tip',
  'middle-finger-metacarpal',
  'middle-finger-phalanx-proximal',
  'middle-finger-phalanx-intermediate',
  'middle-finger-phalanx-distal',
  'middle-finger-tip',
  'ring-finger-metacarpal',
  'ring-finger-phalanx-proximal',
  'ring-finger-phalanx-intermediate',
  'ring-finger-phalanx-distal',
  'ring-finger-tip',
  'pinky-finger-metacarpal',
  'pinky-finger-phalanx-proximal',
  'pinky-finger-phalanx-intermediate',
  'pinky-finger-phalanx-distal',
  'pinky-finger-tip',
];

export class WebXRManager {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  public cameraRig: THREE.Group;
  private currentSession: XRSession | null = null;
  private referenceSpace: XRReferenceSpace | null = null;

  public isXRSupported: boolean = false;
  public isPresenting: boolean = false;

  private controllers: THREE.XRTargetRaySpace[] = [];
  private controllerGrips: THREE.XRGripSpace[] = [];
  private rayLines: THREE.Line[] = [];
  private activeControllerIndex: number = -1;

  // Batched 25-joint x 2 hands InstancedMesh (1 draw call total for both hands)
  private handJointsInstanced: THREE.InstancedMesh;
  private handPinchState: [boolean, boolean] = [false, false];
  private dummyMatrix = new THREE.Matrix4();
  private tempVecA = new THREE.Vector3();
  private tempVecB = new THREE.Vector3();

  // Unified Spatial Ray / Pinch Callbacks into CasinoScene
  public onRayDown?: (ray: THREE.Ray) => void;
  public onRayMove?: (ray: THREE.Ray) => void;
  public onRayUp?: (ray: THREE.Ray) => void;
  public onSessionStateChange?: (presenting: boolean, isFloorSpace?: boolean) => void;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, cameraRig?: THREE.Group) {
    this.renderer = renderer;
    this.scene = scene;
    this.cameraRig = cameraRig || new THREE.Group();
    if (!cameraRig) {
      this.scene.add(this.cameraRig);
    }

    // Single InstancedMesh for 50 optical hand joints (25 per hand) to preserve draw-call budget
    const jointGeo = new THREE.SphereGeometry(1, 10, 10);
    const jointMat = new THREE.MeshStandardMaterial({
      color: '#f3e5ab',
      metalness: 0.75,
      roughness: 0.25,
    });
    this.handJointsInstanced = new THREE.InstancedMesh(jointGeo, jointMat, 50);
    this.handJointsInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.handJointsInstanced.count = 0;
    this.handJointsInstanced.frustumCulled = false;
    this.cameraRig.add(this.handJointsInstanced);

    this.checkSupport();
    this.setupControllers();
  }

  public async checkSupport(): Promise<boolean> {
    if ('xr' in navigator && navigator.xr) {
      try {
        const supported = await navigator.xr.isSessionSupported('immersive-vr');
        this.isXRSupported = supported;
        return supported;
      } catch {
        this.isXRSupported = false;
        return false;
      }
    }
    this.isXRSupported = false;
    return false;
  }

  private extractControllerRay(controller: THREE.XRTargetRaySpace): THREE.Ray {
    controller.updateWorldMatrix(true, false);
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    const origin = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
    const direction = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix).normalize();
    return new THREE.Ray(origin, direction);
  }

  private setupControllers() {
    // Supports Vision Pro Transient Pointer (gaze+pinch) and 6DOF VR Controllers
    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);

      controller.addEventListener('selectstart', () => {
        this.activeControllerIndex = i;
        const ray = this.extractControllerRay(controller);
        this.onRayDown?.(ray);
      });

      controller.addEventListener('selectend', () => {
        const ray = this.extractControllerRay(controller);
        this.onRayUp?.(ray);
        if (this.activeControllerIndex === i) {
          this.activeControllerIndex = -1;
        }
      });

      controller.addEventListener('squeeze', () => {
        const ray = this.extractControllerRay(controller);
        this.onRayDown?.(ray);
        this.onRayUp?.(ray);
      });

      this.cameraRig.add(controller);
      this.controllers.push(controller);

      // Gold luminous pointer ray
      const rayGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -2.2),
      ]);
      const rayMat = new THREE.LineBasicMaterial({
        color: '#d4af37',
        transparent: true,
        opacity: 0.55,
      });
      const rayLine = new THREE.Line(rayGeo, rayMat);
      controller.add(rayLine);
      this.rayLines.push(rayLine);

      // Controller Grip / Pinch indicator sphere
      const grip = this.renderer.xr.getControllerGrip(i);
      const gripPinchSphereGeo = new THREE.SphereGeometry(0.012, 12, 12);
      const gripMat = new THREE.MeshStandardMaterial({
        color: '#d4af37',
        metalness: 0.85,
        roughness: 0.2,
      });
      const gripSphere = new THREE.Mesh(gripPinchSphereGeo, gripMat);
      grip.add(gripSphere);
      this.cameraRig.add(grip);
      this.controllerGrips.push(grip);
    }
  }

  /**
   * Called each frame in the render loop to update 25-joint optical hands and active controller rays
   */
  public updateFrame(frame?: XRFrame) {
    if (!this.isPresenting) {
      this.handJointsInstanced.count = 0;
      return;
    }

    // Stream continuous drag updates for active controller or Vision Pro transient pointer
    if (this.activeControllerIndex >= 0 && this.controllers[this.activeControllerIndex]) {
      const ray = this.extractControllerRay(this.controllers[this.activeControllerIndex]);
      this.onRayMove?.(ray);
    }

    if (!frame || !this.currentSession) return;
    const refSpace = this.referenceSpace || this.renderer.xr.getReferenceSpace();
    if (!refSpace || !frame.getJointPose) return;

    let instanceIdx = 0;
    let handIdx = 0;

    for (const inputSource of this.currentSession.inputSources) {
      if (inputSource.hand && handIdx < 2) {
        let thumbTipPos: THREE.Vector3 | null = null;
        let indexTipPos: THREE.Vector3 | null = null;

        for (const jointName of XR_HAND_JOINTS) {
          const jointSpace = inputSource.hand.get(jointName);
          if (!jointSpace) continue;

          const pose = frame.getJointPose(jointSpace, refSpace);
          if (pose && instanceIdx < 50) {
            const p = pose.transform.position;
            const r = pose.radius || 0.008;

            this.dummyMatrix.makeScale(r, r, r);
            this.dummyMatrix.setPosition(p.x, p.y, p.z);
            this.handJointsInstanced.setMatrixAt(instanceIdx++, this.dummyMatrix);

            if (jointName === 'thumb-tip') {
              thumbTipPos = this.tempVecA.set(p.x, p.y, p.z).clone();
            } else if (jointName === 'index-finger-tip') {
              indexTipPos = this.tempVecB.set(p.x, p.y, p.z).clone();
            }
          }
        }

        // Optical Pinch Detection (< 2.2cm between thumb-tip and index-finger-tip)
        if (thumbTipPos && indexTipPos) {
          const dist = thumbTipPos.distanceTo(indexTipPos);
          const midpoint = thumbTipPos.clone().add(indexTipPos).multiplyScalar(0.5);
          // Construct downward/forward ray from pinch point toward table surface in world space
          this.cameraRig.updateWorldMatrix(true, false);
          const pinchOrigin = new THREE.Vector3(midpoint.x, midpoint.y + 0.15, midpoint.z).applyMatrix4(
            this.cameraRig.matrixWorld
          );
          const pinchRay = new THREE.Ray(
            pinchOrigin,
            new THREE.Vector3(0, -1, 0)
          );

          const wasPinching = this.handPinchState[handIdx];
          if (dist < 0.022 && !wasPinching) {
            this.handPinchState[handIdx] = true;
            this.onRayDown?.(pinchRay);
          } else if (dist < 0.026 && wasPinching) {
            this.onRayMove?.(pinchRay);
          } else if (dist >= 0.026 && wasPinching) {
            this.handPinchState[handIdx] = false;
            this.onRayUp?.(pinchRay);
          }
        }

        handIdx++;
      }
    }

    this.handJointsInstanced.count = instanceIdx;
    if (instanceIdx > 0) {
      this.handJointsInstanced.instanceMatrix.needsUpdate = true;
    }
  }

  public async enterVR(): Promise<boolean> {
    if (!navigator.xr) return false;

    try {
      const sessionInit: XRSessionInit = {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
      };
      const session = await navigator.xr.requestSession('immersive-vr', sessionInit);
      this.renderer.xr.setReferenceSpaceType('local-floor');
      await this.renderer.xr.setSession(session);

      let isFloorSpace = true;
      try {
        this.referenceSpace = await session.requestReferenceSpace('local-floor');
      } catch {
        this.referenceSpace = await session.requestReferenceSpace('local');
        isFloorSpace = false;
      }

      this.currentSession = session;
      this.isPresenting = true;
      this.onSessionStateChange?.(true, isFloorSpace);

      session.addEventListener('end', () => {
        this.currentSession = null;
        this.referenceSpace = null;
        this.isPresenting = false;
        this.handJointsInstanced.count = 0;
        this.onSessionStateChange?.(false, false);
      });

      return true;
    } catch (err) {
      console.warn('Failed to start WebXR session:', err);
      return false;
    }
  }

  public async exitVR() {
    if (this.currentSession) {
      await this.currentSession.end();
    }
  }
}
