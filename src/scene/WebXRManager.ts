import * as THREE from 'three';

export interface XRInteractionEvent {
  type: 'select' | 'squeeze' | 'pinch';
  point?: THREE.Vector3;
}

export class WebXRManager {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private currentSession: XRSession | null = null;

  public isXRSupported: boolean = false;
  public isPresenting: boolean = false;

  private controllers: THREE.XRTargetRaySpace[] = [];
  private controllerGrips: THREE.XRGripSpace[] = [];
  private rayLines: THREE.Line[] = [];

  // Callbacks
  public onSelectCallback?: (point: THREE.Vector3) => void;
  public onPinchCallback?: (isPinching: boolean) => void;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    this.renderer = renderer;
    this.scene = scene;
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

  private setupControllers() {
    // Standard VR / Vision Pro Transient Pointer Controllers
    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);

      controller.addEventListener('selectstart', () => {
        this.onPinchCallback?.(true);
      });

      controller.addEventListener('selectend', () => {
        this.onPinchCallback?.(false);
      });

      controller.addEventListener('select', () => {
        const raycaster = new THREE.Raycaster();
        const tempMatrix = new THREE.Matrix4();
        tempMatrix.identity().extractRotation(controller.matrixWorld);
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

        this.onSelectCallback?.(raycaster.ray.origin);
      });

      this.scene.add(controller);
      this.controllers.push(controller);

      // Visual Ray Pointer (Gold luminous beam)
      const rayGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -2.5),
      ]);
      const rayMat = new THREE.LineBasicMaterial({
        color: '#d4af37',
        transparent: true,
        opacity: 0.6,
      });
      const rayLine = new THREE.Line(rayGeo, rayMat);
      controller.add(rayLine);
      this.rayLines.push(rayLine);

      // Controller Grip / Hand Sphere
      const grip = this.renderer.xr.getControllerGrip(i);
      const gripPinchSphereGeo = new THREE.SphereGeometry(0.015, 16, 16);
      const gripMat = new THREE.MeshStandardMaterial({
        color: '#f3e5ab',
        metalness: 0.8,
        roughness: 0.2,
      });
      const gripSphere = new THREE.Mesh(gripPinchSphereGeo, gripMat);
      grip.add(gripSphere);
      this.scene.add(grip);
      this.controllerGrips.push(grip);
    }
  }

  public async enterVR(): Promise<boolean> {
    if (!navigator.xr) return false;

    try {
      const sessionInit: XRSessionInit = {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
      };
      const session = await navigator.xr.requestSession('immersive-vr', sessionInit);
      await this.renderer.xr.setSession(session);
      this.currentSession = session;
      this.isPresenting = true;

      session.addEventListener('end', () => {
        this.currentSession = null;
        this.isPresenting = false;
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
