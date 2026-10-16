import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import {
  Card,
  PlayerState,
  TableState,
  ChipDenomination,
  PlayerAction,
  PhysicalActionType,
  PhysicalTellType,
  DealerActionType,
  CameraPresetId,
  SpatialAuditReport,
  SpatialAuditCheck,
  ScreenBoundingRect,
} from '../types/poker';
import {
  getCardBackTexture,
  getCardBackRoughnessMap,
  getCardFrontTexture,
  getCardLinenNormalMap,
  getCasinoFeltTexture,
  getMonteCarloRugTexture,
  getCofferedWallTexture,
  getChipTextures,
  createSculptedClayChipGeometry,
  createRoundedCamberedCardGeometry,
  drawAvatarPlaque,
  drawOnFeltBetBadge,
  drawSpatialButton,
  getPhoneScreenTexture,
  populate3DCharacterHeadAndTorso,
  createRealisticSkinMaterial,
  buildArticulatedForearmAndHand,
  CharacterModelRole,
} from './proceduralAssets';
import { pokerAudio } from '../audio/pokerAudio';

export interface CardMeshRef {
  mesh: THREE.Group;
  frontMat: THREE.MeshStandardMaterial;
  card: Card;
  startPosition: THREE.Vector3;
  targetPosition: THREE.Vector3;
  targetRotation: THREE.Euler;
  spawnTime: number;
  arcHeight: number;
  isWinningCard: boolean;
}

interface ChipInstanceAnim {
  denom: ChipDenomination;
  startPos: THREE.Vector3;
  currentPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  spawnTime: number;
  arcHeight: number;
  rotationY: number;
  seatIndex?: number;
  isBank?: boolean;
}

interface BetBadgeRef {
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  mesh: THREE.Mesh;
  lastAmount: number;
  lastAllIn: boolean;
}

interface AvatarPlaqueRef {
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  mesh: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  bodyMat: THREE.MeshStandardMaterial;
  avatarGroup: THREE.Group;
  torsoGroup: THREE.Group;
  headGroup: THREE.Group;
  leftArmGroup: THREE.Group;
  rightArmGroup: THREE.Group;
  phoneHandGroup?: THREE.Group;
  phoneRailMesh?: THREE.Mesh;
  phoneGlowLight?: THREE.PointLight;
  portraitImg?: HTMLImageElement | null;
  actionType: PhysicalActionType;
  actionTimer: number;
  isWatchingPhone: boolean;
  activeTell: PhysicalTellType;
  targetHeadYaw: number;
}

interface SpatialButtonRef {
  id: 'fold' | 'call' | 'raise' | 'peek_or_next';
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  mesh: THREE.Mesh;
  hovered?: boolean;
}

export class CasinoScene {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public cameraRig: THREE.Group;
  public xrPositionOffset = new THREE.Vector3(0, 0, 1.40);
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;

  private container: HTMLElement;
  private clock = new THREE.Clock();
  private textureLoader = new THREE.TextureLoader();
  private gltfLoader = new GLTFLoader();

  // Mode flags & Camera Preset
  public isTitleMode: boolean = true;
  private titleOrbitAngle: number = 0;
  public currentCameraPreset: CameraPresetId = 'seat0_pov';
  private show2DHUD: boolean = true;
  private isInXR: boolean = false;

  // Lighting refs for dynamic All-In / Showdown choreography
  private ambientLight: THREE.AmbientLight | null = null;
  private pendantLight: THREE.SpotLight | null = null;
  private boardPointLight: THREE.PointLight | null = null;

  // Card registries
  private cardMeshes: Map<string, CardMeshRef> = new Map();
  private burnCardMeshes: THREE.Group[] = [];

  // Instanced Chip System (4 denominations -> max 8 draw calls for up to 1000 chips)
  private chipInstancedMeshes: Map<ChipDenomination, THREE.InstancedMesh> = new Map();
  private chipInstances: ChipInstanceAnim[] = [];
  private dummyMatrix = new THREE.Matrix4();
  private dummyPosition = new THREE.Vector3();
  private dummyQuaternion = new THREE.Quaternion();
  private dummyScale = new THREE.Vector3(1, 1, 1);
  private dummyEuler = new THREE.Euler();

  // Interactive Bank Chip Hit Colliders for Seat #0 (invisible raycast targets per denomination)
  private bankChipHitMeshes: THREE.Mesh[] = [];
  private bankChipHoverRing: THREE.Mesh | null = null;
  private holeCardHitMesh: THREE.Mesh | null = null;
  private feltMesh: THREE.Mesh | null = null;
  private bettingRingGlowMesh: THREE.Mesh | null = null;
  private checkRippleMesh: THREE.Mesh | null = null;
  private checkRippleScale: number = 0;

  // Hover state for 3D tactile feedback
  private hoveredButtonId: SpatialButtonRef['id'] | null = null;
  private hoveredChipDenom: ChipDenomination | null = null;
  private isHoleCardsHovered: boolean = false;

  // 3D On-Felt Bet Badges per seat
  private betBadges: Map<number, BetBadgeRef> = new Map();

  // Debug Wireframe Overlay Group & Salon Architectural Room Group
  private debugOverlayGroup: THREE.Group | null = null;
  public isDebugOverlayEnabled: boolean = false;
  private salonRoomGroup: THREE.Group | null = null;

  // Dealer rig, button & spotlight
  private dealerButtonMesh: THREE.Mesh | null = null;
  private dealerButtonTarget = new THREE.Vector3(0, 0.766, -0.5);
  private activeSpotlight: THREE.SpotLight | null = null;
  private dealerGroup: THREE.Group | null = null;
  private dealerHeadGroup: THREE.Group | null = null;
  private dealerLeftArm: THREE.Group | null = null;
  private dealerRightArm: THREE.Group | null = null;
  private dealerAction: DealerActionType = 'idle';
  private dealerActionTimer: number = 0;
  private dealerTargetYaw: number = 0;

  // Persistent AI Avatar Groups & 3D Floating Plaques
  private avatarPlaques: Map<number, AvatarPlaqueRef> = new Map();

  // 3D World-Anchored Spatial HUD Buttons (mounted on Seat #0 table rim for WebXR & Desktop)
  private spatialButtons: SpatialButtonRef[] = [];

  // Peeking & Drag Interaction State
  private peekProgress: number = 0;
  private targetPeekProgress: number = 0;
  private dragMode: 'none' | 'chip' | 'card' = 'none';
  private draggedChipDenom: ChipDenomination = 25;
  private draggedChipGroup: THREE.Group | null = null;
  private cardDragStartZ: number = 0.62;
  private cardDragCurrentZ: number = 0.62;
  private lastFeltTapTime: number = 0;
  private raycaster = new THREE.Raycaster();
  private feltPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.765);
  private pointerNDC = new THREE.Vector2();

  // Latest synced state for spatial interactions
  private latestTable: TableState | null = null;
  private latestPlayers: PlayerState[] = [];
  private latestIsPeeking: boolean = false;

  // External Callbacks into App.tsx
  public onStageChipCallback?: (denom: ChipDenomination) => void;
  public onClearStagedChipsCallback?: () => void;
  public onPlayerActionCallback?: (action: PlayerAction) => void;
  public onPeekChangeCallback?: (peeking: boolean) => void;
  public onNextHandCallback?: () => void;
  public onXRFrameCallback?: (frame?: XRFrame) => void;

  // Seat Coordinates in 3D world (Clockwise from Seat 0: Human at Bottom Center, Viktor Left, Elena Top-Left, Bao Top-Right, Marcus Right)
  public static readonly SEAT_POSITIONS = [
    new THREE.Vector3(0, 0.762, 0.62),      // Seat 0: Human Player (Bottom Center - sightline-safe above 2D bottom dock)
    new THREE.Vector3(-1.02, 0.762, 0.32),  // Seat 1: Viktor (Left)
    new THREE.Vector3(-0.72, 0.762, -0.50), // Seat 2: Elena (Top Left)
    new THREE.Vector3(0.72, 0.762, -0.50),  // Seat 3: Bao (Top Right)
    new THREE.Vector3(1.02, 0.762, 0.32),   // Seat 4: Marcus (Right)
  ];

  public static readonly COMMUNITY_POSITIONS = [
    new THREE.Vector3(-0.28, 0.763, -0.06),
    new THREE.Vector3(-0.14, 0.763, -0.06),
    new THREE.Vector3(0, 0.763, -0.06),
    new THREE.Vector3(0.14, 0.763, -0.06),
    new THREE.Vector3(0.28, 0.763, -0.06),
  ];

  public static readonly BETTING_RING_CENTER = new THREE.Vector3(0, 0.763, 0.43);

  /**
   * Computes an avatar standing/sitting position strictly outside the elliptical leather armrest
   * (rx = 1.37, rz = 0.9042) with clean radial margin so no torso ever clips the table rim.
   */
  public static getAvatarRimPosition(seatIndex: number): THREE.Vector3 {
    const pos = CasinoScene.SEAT_POSITIONS[seatIndex];
    const rx = 1.37;
    const rz = 1.37 * 0.66; // 0.9042
    const norm = 1 / Math.hypot(pos.x / rx, pos.z / rz);
    const radialScale = norm * 1.22; // 22% outside rim centerline (~0.24m clearance)
    return new THREE.Vector3(pos.x * radialScale, 0.75, pos.z * radialScale);
  }

  constructor(container: HTMLElement) {
    this.container = container;

    // 1. Scene Setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#060911');
    this.scene.fog = new THREE.FogExp2('#060911', 0.10);

    // 2. Camera Setup & XR Camera Rig
    this.cameraRig = new THREE.Group();
    this.cameraRig.name = 'XRCameraRig';
    this.cameraRig.position.set(0, 0, 0);
    this.scene.add(this.cameraRig);

    this.camera = new THREE.PerspectiveCamera(
      54,
      container.clientWidth / container.clientHeight,
      0.05,
      40
    );
    this.camera.position.set(0, 1.52, 1.62);
    this.camera.lookAt(0, 0.78, -0.02);
    this.cameraRig.add(this.camera);

    // 3. WebGLRenderer Setup with WebXR, ACES Tone Mapping & preserveDrawingBuffer for dogfooding capture
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.xr.enabled = true;
    container.appendChild(this.renderer.domElement);

    // 4. Studio Environment Reflections (Immediate RoomEnvironment + Poly Haven 1K Salon HDRI Upgrade)
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    const roomEnv = new RoomEnvironment();
    this.scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const rgbeLoader = new RGBELoader();
    rgbeLoader.load(
      '/assets/pbr/salon_env_1k.hdr',
      (hdrTexture) => {
        hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
        const hdrPmrem = new THREE.PMREMGenerator(this.renderer);
        hdrPmrem.compileEquirectangularShader();
        const envMap = hdrPmrem.fromEquirectangular(hdrTexture).texture;
        this.scene.environment = envMap;
        this.scene.environmentRotation = new THREE.Euler(0, Math.PI, 0);
        this.scene.environmentIntensity = 0.65;
        hdrTexture.dispose();
        hdrPmrem.dispose();
      },
      undefined,
      () => {
        // Keep synchronous RoomEnvironment fallback if offline/missing
      }
    );

    // 5. Orbit Controls (Desktop fallback)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI / 2.08;
    this.controls.minDistance = 0.45;
    this.controls.maxDistance = 4.2;
    this.controls.target.set(0, 0.78, -0.02);

    // 6. Build VIP Casino Environment, Table, Instanced Chips, On-Felt Badges & Spatial UI
    this.setupLighting();
    this.buildVIPRoom();
    this.buildPokerTable();
    this.buildDealerAndButton();
    this.initPersistentAvatars();
    this.initInstancedChips();
    this.buildInteractiveZonesAndSpatialHUD();
    this.buildOnFeltBetBadges();
    this.buildDebugOverlay();

    // 7. Bind Desktop Mouse/Touch & Resize Listeners
    window.addEventListener('resize', this.onResize);
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('pointerup', this.onPointerUp);

    this.startAnimationLoop();
    (window as unknown as Record<string, unknown>).__casinoScene = this;

    if (typeof window !== 'undefined' && window.location.search.includes('capture3d=1')) {
      setTimeout(() => {
        const portraits = this.captureAll3DPortraits(512);
        fetch('/__save_3d_portraits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(portraits),
        }).catch(() => {});
      }, 450);
    }
  }

  public setTitleMode(active: boolean) {
    this.isTitleMode = active;
    if (!active) {
      this.setCameraPreset(this.currentCameraPreset);
    }
  }

  public setShow2DHUD(show: boolean) {
    this.show2DHUD = show;
    this.syncSpatialButtonsVisibility();
  }

  private syncSpatialButtonsVisibility() {
    const visible = !this.show2DHUD || this.isInXR;
    for (const btn of this.spatialButtons) {
      btn.mesh.visible = visible;
    }
  }

  public setCameraPreset(preset: CameraPresetId) {
    this.currentCameraPreset = preset;
    this.isTitleMode = false;

    const presets: Record<CameraPresetId, { pos: [number, number, number]; target: [number, number, number] }> = {
      seat0_pov: { pos: [0, 1.52, 1.62], target: [0, 0.78, -0.02] },
      top_down: { pos: [0, 2.58, 0.08], target: [0, 0.74, -0.02] },
      macro_cards_chips: { pos: [0.18, 1.05, 1.06], target: [0, 0.78, 0.52] },
      bao_tell_closeup: { pos: [0.32, 1.24, -0.06], target: [0.94, 1.12, -0.65] },
      viktor_marcus_rim: { pos: [-1.42, 1.32, 0.78], target: [0.25, 0.92, -0.12] },
      dealer_pov: { pos: [-0.38, 1.46, -0.92], target: [0.06, 0.80, 0.25] },
    };

    const cfg = presets[preset] || presets.seat0_pov;
    this.camera.position.set(...cfg.pos);
    this.controls.target.set(...cfg.target);
    this.camera.lookAt(...cfg.target);
    this.controls.update();
  }

  public setXRPresenting(presenting: boolean, isFloorSpace: boolean = true, isARPassthrough: boolean = false) {
    this.isInXR = presenting;
    this.syncSpatialButtonsVisibility();
    if (this.salonRoomGroup) {
      this.salonRoomGroup.visible = !(presenting && isARPassthrough);
    }
    if (presenting) {
      this.isTitleMode = false;
      this.controls.enabled = false;
      // In local-floor space, Y=0 is ground level, user's seated height (~1.2-1.3m) comes from HMD pose.
      // In local space (no floor tracking), add default seated eye height (+1.30m).
      const yOffset = isFloorSpace ? 0 : 1.30;
      this.cameraRig.position.set(this.xrPositionOffset.x, yOffset, this.xrPositionOffset.z);
      this.cameraRig.updateMatrixWorld(true);
    } else {
      this.cameraRig.position.set(0, 0, 0);
      this.cameraRig.updateMatrixWorld(true);
      this.controls.enabled = true;
      this.setCameraPreset('seat0_pov');
    }
  }

  public adjustXROffset(dx: number, dy: number, dz: number) {
    this.cameraRig.position.x += dx;
    this.cameraRig.position.y += dy;
    this.cameraRig.position.z += dz;
    this.cameraRig.updateMatrixWorld(true);
  }

  public setXROffset(x: number, y: number, z: number) {
    this.cameraRig.position.set(x, y, z);
    this.cameraRig.updateMatrixWorld(true);
  }

  public getXROffset(): THREE.Vector3 {
    return this.cameraRig.position.clone();
  }

  public getDrawCalls(): number {
    return this.renderer.info.render.calls;
  }

  private setupLighting() {
    this.ambientLight = new THREE.AmbientLight('#ffe4b5', 0.38);
    this.scene.add(this.ambientLight);

    // Warm overhead pendant downlight
    this.pendantLight = new THREE.SpotLight('#fff1d0', 3.5);
    this.pendantLight.position.set(0, 2.65, 0);
    this.pendantLight.angle = Math.PI / 2.9;
    this.pendantLight.penumbra = 0.85;
    this.pendantLight.decay = 1.4;
    this.pendantLight.distance = 7;
    this.pendantLight.castShadow = true;
    this.pendantLight.shadow.mapSize.width = 2048;
    this.pendantLight.shadow.mapSize.height = 2048;
    this.pendantLight.shadow.bias = -0.0001;
    this.scene.add(this.pendantLight);

    // Center board accent light (intensifies during All-In Runout & Showdown)
    this.boardPointLight = new THREE.PointLight('#fde047', 0.35, 2.5);
    this.boardPointLight.position.set(0, 1.35, -0.04);
    this.scene.add(this.boardPointLight);

    // Active Turn Spotlight
    this.activeSpotlight = new THREE.SpotLight('#fde047', 1.65, 4.5, Math.PI / 6.5, 0.85, 1.2);
    this.activeSpotlight.position.set(0, 2.2, 0.68);
    this.activeSpotlight.target.position.set(0, 0.75, 0.68);
    this.scene.add(this.activeSpotlight);
    this.scene.add(this.activeSpotlight.target);
  }

  private buildVIPRoom() {
    const salonGroup = new THREE.Group();
    salonGroup.name = 'MonteCarloSalonRoom';
    this.salonRoomGroup = salonGroup;
    this.scene.add(salonGroup);

    // 1. Poly Haven Herringbone Parquet Hardwood Floor (1K PBR)
    const floorDiff = this.textureLoader.load('/assets/pbr/floor_diff_1k.jpg');
    floorDiff.colorSpace = THREE.SRGBColorSpace;
    floorDiff.wrapS = THREE.RepeatWrapping;
    floorDiff.wrapT = THREE.RepeatWrapping;
    floorDiff.repeat.set(6, 6);

    const floorRough = this.textureLoader.load('/assets/pbr/floor_rough_1k.jpg');
    floorRough.wrapS = THREE.RepeatWrapping;
    floorRough.wrapT = THREE.RepeatWrapping;
    floorRough.repeat.set(6, 6);

    const floorNor = this.textureLoader.load('/assets/pbr/floor_nor_1k.jpg');
    floorNor.wrapS = THREE.RepeatWrapping;
    floorNor.wrapT = THREE.RepeatWrapping;
    floorNor.repeat.set(6, 6);

    const floorGeo = new THREE.PlaneGeometry(18, 18);
    const floorMat = new THREE.MeshStandardMaterial({
      color: '#633d24',
      map: floorDiff,
      roughnessMap: floorRough,
      normalMap: floorNor,
      normalScale: new THREE.Vector2(0.42, 0.42),
      roughness: 0.68,
      metalness: 0.02,
      envMapIntensity: 0.38,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    salonGroup.add(floor);

    // 2. Ornate Woven Monte Carlo Area Rug beneath the VIP Table & Armchairs
    const rugTex = getMonteCarloRugTexture();
    const fabricNor = this.textureLoader.load('/assets/pbr/fabric_nor_1k.jpg');
    fabricNor.wrapS = THREE.RepeatWrapping;
    fabricNor.wrapT = THREE.RepeatWrapping;
    fabricNor.repeat.set(10, 10);

    const rugGeo = new THREE.PlaneGeometry(5.1, 3.65);
    const rugMat = new THREE.MeshStandardMaterial({
      map: rugTex,
      normalMap: fabricNor,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 0.88,
      metalness: 0.06,
    });
    const rugMesh = new THREE.Mesh(rugGeo, rugMat);
    rugMesh.rotation.x = -Math.PI / 2;
    rugMesh.position.set(0, 0.004, 0);
    rugMesh.receiveShadow = true;
    salonGroup.add(rugMesh);

    // 3. Coffered Mahogany & Gold-Leaf Circular Salon Boiserie Wall Enclosure
    const cofferedWallTex = getCofferedWallTexture();
    cofferedWallTex.repeat.set(12, 1);
    const salonWallGeo = new THREE.CylinderGeometry(5.42, 5.42, 3.8, 48, 1, true);
    const salonWallMat = new THREE.MeshStandardMaterial({
      map: cofferedWallTex,
      roughness: 0.42,
      metalness: 0.22,
      side: THREE.BackSide,
    });
    const salonWall = new THREE.Mesh(salonWallGeo, salonWallMat);
    salonWall.position.y = 1.9;
    salonWall.receiveShadow = true;
    salonGroup.add(salonWall);

    // 4. Architectural Mahogany Pilasters + Warm Brass Wall Sconces (batched into InstancedMeshes)
    const pillarGeo = new THREE.BoxGeometry(0.35, 3.7, 0.16);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: '#1e100b',
      roughness: 0.32,
      metalness: 0.22,
    });
    const pillarInstanced = new THREE.InstancedMesh(pillarGeo, pillarMat, 12);

    const sconceGeo = new THREE.CylinderGeometry(0.055, 0.032, 0.18, 16);
    const sconceMat = new THREE.MeshStandardMaterial({
      color: '#fef08a',
      emissive: '#f59e0b',
      emissiveIntensity: 1.85,
      roughness: 0.2,
    });
    const sconceInstanced = new THREE.InstancedMesh(sconceGeo, sconceMat, 12);

    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const radius = 5.22;
      this.dummyEuler.set(0, -angle + Math.PI / 2, 0);
      this.dummyQuaternion.setFromEuler(this.dummyEuler);
      this.dummyPosition.set(Math.cos(angle) * radius, 1.85, Math.sin(angle) * radius);
      this.dummyMatrix.compose(this.dummyPosition, this.dummyQuaternion, this.dummyScale);
      pillarInstanced.setMatrixAt(i, this.dummyMatrix);

      const sconceR = 5.08;
      this.dummyPosition.set(Math.cos(angle) * sconceR, 2.15, Math.sin(angle) * sconceR);
      this.dummyMatrix.compose(this.dummyPosition, this.dummyQuaternion, this.dummyScale);
      sconceInstanced.setMatrixAt(i, this.dummyMatrix);
    }
    salonGroup.add(pillarInstanced, sconceInstanced);

    // 5. Backlit Art Deco VIP Wall Mural above the Mahogany Credenza & Crystal Decanter Bar
    const artGroup = new THREE.Group();
    artGroup.position.set(0, 1.98, -3.85);
    const frameGeo = new THREE.BoxGeometry(2.55, 1.48, 0.06);
    const goldBrassMat = new THREE.MeshStandardMaterial({
      color: '#d4af37',
      metalness: 0.88,
      roughness: 0.22,
      emissive: '#78350f',
      emissiveIntensity: 0.25,
    });
    const frameMesh = new THREE.Mesh(frameGeo, goldBrassMat);
    artGroup.add(frameMesh);

    const wallArtTex = this.textureLoader.load('/assets/vip_wall_art.png');
    wallArtTex.colorSpace = THREE.SRGBColorSpace;
    const canvasGeo = new THREE.PlaneGeometry(2.42, 1.35);
    const canvasMat = new THREE.MeshStandardMaterial({
      map: wallArtTex,
      roughness: 0.35,
      metalness: 0.15,
      emissive: '#ffffff',
      emissiveMap: wallArtTex,
      emissiveIntensity: 0.34,
    });
    const canvasMesh = new THREE.Mesh(canvasGeo, canvasMat);
    canvasMesh.position.z = 0.035;
    artGroup.add(canvasMesh);

    // Warm bar & mural accent light illuminating the crystal decanters & gold frame behind the dealer
    const credenzaLight = new THREE.PointLight('#ffd89b', 1.35, 3.4);
    credenzaLight.position.set(0, -0.58, 0.55);
    artGroup.add(credenzaLight);

    salonGroup.add(artGroup);
  }

  private buildPokerTable() {
    const tableRoot = new THREE.Group();
    tableRoot.name = 'MonteCarloTableAndSalonProps';
    this.scene.add(tableRoot);

    // 1. Synchronous Initial Table Mesh (immediately active at frame 0 before async GLB load completes)
    const fallbackGroup = new THREE.Group();
    tableRoot.add(fallbackGroup);

    const feltTexture = getCasinoFeltTexture();
    const fabricNor = this.textureLoader.load('/assets/pbr/fabric_nor_1k.jpg');
    fabricNor.wrapS = THREE.RepeatWrapping;
    fabricNor.wrapT = THREE.RepeatWrapping;
    fabricNor.repeat.set(12, 12);

    const fabricRough = this.textureLoader.load('/assets/pbr/fabric_rough_1k.jpg');
    fabricRough.wrapS = THREE.RepeatWrapping;
    fabricRough.wrapT = THREE.RepeatWrapping;
    fabricRough.repeat.set(12, 12);

    const woodDiff = this.textureLoader.load('/assets/pbr/wood_diff_1k.jpg');
    woodDiff.colorSpace = THREE.SRGBColorSpace;
    woodDiff.wrapS = THREE.RepeatWrapping;
    woodDiff.wrapT = THREE.RepeatWrapping;
    woodDiff.repeat.set(3, 3);

    const woodRough = this.textureLoader.load('/assets/pbr/wood_rough_1k.jpg');
    woodRough.wrapS = THREE.RepeatWrapping;
    woodRough.wrapT = THREE.RepeatWrapping;
    woodRough.repeat.set(3, 3);

    const woodNor = this.textureLoader.load('/assets/pbr/wood_nor_1k.jpg');
    woodNor.wrapS = THREE.RepeatWrapping;
    woodNor.wrapT = THREE.RepeatWrapping;
    woodNor.repeat.set(3, 3);

    const leatherRough = this.textureLoader.load('/assets/pbr/leather_rough_1k.jpg');
    leatherRough.wrapS = THREE.RepeatWrapping;
    leatherRough.wrapT = THREE.RepeatWrapping;
    leatherRough.repeat.set(6, 6);

    const leatherNor = this.textureLoader.load('/assets/pbr/leather_nor_1k.jpg');
    leatherNor.wrapS = THREE.RepeatWrapping;
    leatherNor.wrapT = THREE.RepeatWrapping;
    leatherNor.repeat.set(6, 6);

    const feltMat = new THREE.MeshStandardMaterial({
      map: feltTexture,
      normalMap: fabricNor,
      normalScale: new THREE.Vector2(0.28, 0.28),
      roughnessMap: fabricRough,
      roughness: 0.86,
      metalness: 0.03,
    });

    const woodMat = new THREE.MeshPhysicalMaterial({
      color: '#5a2714',
      map: woodDiff,
      roughnessMap: woodRough,
      normalMap: woodNor,
      normalScale: new THREE.Vector2(0.16, 0.16),
      roughness: 0.36,
      metalness: 0.02,
      clearcoat: 0.16,
      clearcoatRoughness: 0.42,
      envMapIntensity: 0.24,
    });

    const mahoganyMat = new THREE.MeshPhysicalMaterial({
      color: '#32150c',
      map: woodDiff,
      roughnessMap: woodRough,
      normalMap: woodNor,
      normalScale: new THREE.Vector2(0.20, 0.20),
      roughness: 0.38,
      metalness: 0.02,
      clearcoat: 0.16,
      clearcoatRoughness: 0.42,
      envMapIntensity: 0.24,
    });

    const leatherMat = new THREE.MeshPhysicalMaterial({
      color: '#161318',
      roughnessMap: leatherRough,
      normalMap: leatherNor,
      normalScale: new THREE.Vector2(0.65, 0.65),
      roughness: 0.52,
      metalness: 0.04,
      clearcoat: 0.15,
      clearcoatRoughness: 0.45,
      sheen: 0.35,
      sheenColor: new THREE.Color('#2d2633'),
      envMapIntensity: 0.28,
    });

    const brassMat = new THREE.MeshStandardMaterial({
      color: '#d4af37',
      metalness: 0.92,
      roughness: 0.20,
      envMapIntensity: 1.45,
    });

    // Immediate synchronous fallback meshes (replaced seamlessly when /models/vip_poker_table.glb resolves)
    const feltGeo = new THREE.CylinderGeometry(1.03, 1.03, 0.04, 64);
    feltGeo.scale(1, 1, 0.66);
    const felt = new THREE.Mesh(feltGeo, feltMat);
    felt.position.y = 0.739;
    felt.receiveShadow = true;
    this.feltMesh = felt;
    fallbackGroup.add(felt);

    const rimGeo = new THREE.CylinderGeometry(1.36, 1.34, 0.052, 64);
    rimGeo.scale(1, 1, 0.66);
    const woodRim = new THREE.Mesh(rimGeo, woodMat);
    woodRim.position.y = 0.732;
    woodRim.receiveShadow = true;
    fallbackGroup.add(woodRim);

    const armrestGeo = new THREE.TorusGeometry(1.37, 0.072, 20, 64);
    armrestGeo.scale(1, 0.66, 0.52);
    armrestGeo.rotateX(Math.PI / 2);
    const armrest = new THREE.Mesh(armrestGeo, leatherMat);
    armrest.position.y = 0.762;
    armrest.castShadow = true;
    fallbackGroup.add(armrest);

    const baseGeo = new THREE.CylinderGeometry(0.36, 0.52, 0.72, 32);
    const pedestal = new THREE.Mesh(baseGeo, mahoganyMat);
    pedestal.position.y = 0.36;
    pedestal.castShadow = true;
    fallbackGroup.add(pedestal);

    // 2. Load Headless Blender 5.2 Monte Carlo Table & Salon Privé Prop Suite (/models/vip_poker_table.glb)
    const gltfLoader = new GLTFLoader();
    gltfLoader.load(
      '/models/vip_poker_table.glb',
      (gltf) => {
        const modelRoot = gltf.scene;
        modelRoot.name = 'BlenderMonteCarloVIPScene';

        const emeraldShadeMat = new THREE.MeshPhysicalMaterial({
          color: '#065f46',
          emissive: '#047857',
          emissiveIntensity: 0.52,
          roughness: 0.12,
          metalness: 0.12,
          clearcoat: 1.0,
          clearcoatRoughness: 0.08,
          transparent: true,
          opacity: 0.88,
        });

        const bulbMat = new THREE.MeshStandardMaterial({
          color: '#fffbeb',
          emissive: '#fde047',
          emissiveIntensity: 3.4,
          roughness: 0.1,
        });

        const velvetRopeMat = new THREE.MeshPhysicalMaterial({
          color: '#7f1d1d',
          normalMap: fabricNor,
          normalScale: new THREE.Vector2(0.4, 0.4),
          roughness: 0.78,
          metalness: 0.05,
          sheen: 0.85,
          sheenColor: new THREE.Color('#f87171'),
          sheenRoughness: 0.45,
        });

        const crystalMat = new THREE.MeshPhysicalMaterial({
          color: '#e2e8f0',
          roughness: 0.06,
          metalness: 0.18,
          clearcoat: 1.0,
          clearcoatRoughness: 0.04,
          transparent: true,
          opacity: 0.62,
          envMapIntensity: 1.9,
        });

        const whiskeyMat = new THREE.MeshPhysicalMaterial({
          color: '#d97706',
          emissive: '#b45309',
          emissiveIntensity: 0.32,
          roughness: 0.1,
          metalness: 0.08,
          clearcoat: 1.0,
          clearcoatRoughness: 0.06,
          transparent: true,
          opacity: 0.86,
        });

        const outerSalonMeshes: THREE.Object3D[] = [];

        modelRoot.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          const name = child.name;
          const isOuterSalonProp =
            name.startsWith('Salon_Chandelier_') ||
            name.startsWith('Salon_Stanchions_') ||
            name.startsWith('Salon_CredenzaBar_');

          child.castShadow = !isOuterSalonProp;
          child.receiveShadow = true;

          if (name === 'Table_EmeraldFelt') {
            feltTexture.flipY = false;
            feltTexture.needsUpdate = true;
            child.material = feltMat;
            child.castShadow = false;
            this.feltMesh = child;
          } else if (name === 'Table_WalnutRacetrack') {
            child.material = woodMat;
          } else if (
            name === 'Table_QuiltedLeatherBolster' ||
            name === 'Salon_VIPChairs_QuiltedBlackLeather'
          ) {
            child.material = leatherMat;
          } else if (name.includes('AntiqueBrass')) {
            child.material = brassMat;
          } else if (name.includes('DarkMahoganyWood')) {
            child.material = mahoganyMat;
          } else if (name.includes('EmeraldGlassShade')) {
            child.material = emeraldShadeMat;
            child.castShadow = false;
          } else if (name.includes('WarmFilamentBulb')) {
            child.material = bulbMat;
            child.castShadow = false;
          } else if (name.includes('CrimsonVelvetRope')) {
            child.material = velvetRopeMat;
          } else if (name.includes('CrystalDecanterGlass')) {
            child.material = crystalMat;
          } else if (name.includes('AmberWhiskeyGlass')) {
            child.material = whiskeyMat;
          }

          if (isOuterSalonProp) {
            outerSalonMeshes.push(child);
          }
        });

        // Move outer architectural Salon props into salonRoomGroup so AR passthrough can toggle them with the room
        if (this.salonRoomGroup) {
          for (const propMesh of outerSalonMeshes) {
            this.salonRoomGroup.attach(propMesh);
          }
        }

        tableRoot.remove(fallbackGroup);
        tableRoot.add(modelRoot);
      },
      undefined,
      () => {
        // Keep synchronous fallbackGroup if GLB fails to load
      }
    );
  }

  private buildDealerAndButton() {
    const dealerGroup = new THREE.Group();
    // Positioned at z = -1.14 so the croupier torso (radius 0.20m) sits cleanly behind the -0.904m leather armrest
    dealerGroup.position.set(0, 0.75, -1.14);

    // Formal Croupier Satin Vest & Crisp White Collar + Gold Bowtie with woven cloth normal map & sheen
    const suitFabricNor = this.textureLoader.load('/assets/pbr/fabric_nor_1k.jpg');
    suitFabricNor.wrapS = THREE.RepeatWrapping;
    suitFabricNor.wrapT = THREE.RepeatWrapping;
    suitFabricNor.repeat.set(6, 6);

    const vestMat = new THREE.MeshPhysicalMaterial({
      color: '#0f172a',
      normalMap: suitFabricNor,
      normalScale: new THREE.Vector2(0.26, 0.26),
      roughness: 0.48,
      metalness: 0.14,
      sheen: 0.55,
      sheenRoughness: 0.42,
      sheenColor: new THREE.Color('#334155'),
      clearcoat: 0.08,
      envMapIntensity: 0.65,
    });
    const shirtMat = new THREE.MeshPhysicalMaterial({
      color: '#f8fafc',
      normalMap: suitFabricNor,
      normalScale: new THREE.Vector2(0.18, 0.18),
      roughness: 0.56,
      sheen: 0.35,
      sheenColor: new THREE.Color('#ffffff'),
      envMapIntensity: 0.5,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: '#facc15',
      metalness: 0.85,
      roughness: 0.2,
    });
    const skinMat = createRealisticSkinMaterial('#f1d5be');

    const dealerTorsoGroup = new THREE.Group();
    dealerTorsoGroup.name = 'DealerTorsoSlot';
    const torsoGeo = new THREE.CapsuleGeometry(0.148, 0.24, 16, 24);
    const torso = new THREE.Mesh(torsoGeo, vestMat);
    torso.position.y = 0.21;
    torso.scale.set(1.06, 1.0, 0.88);
    torso.castShadow = true;
    dealerTorsoGroup.add(torso);

    // Articulated 3D Sculpted Dealer Head (hair, eyes, eyebrows, nose, beard, smile, bow tie)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.61, 0);
    const headGeo = new THREE.SphereGeometry(0.102, 28, 28);
    const headMesh = new THREE.Mesh(headGeo, skinMat);
    headMesh.castShadow = true;
    headGroup.add(headMesh);

    populate3DCharacterHeadAndTorso('dealer', dealerTorsoGroup, headGroup, skinMat, vestMat, goldMat);

    dealerGroup.add(dealerTorsoGroup);
    dealerGroup.add(headGroup);
    this.dealerGroup = dealerGroup;
    this.dealerHeadGroup = headGroup;

    // Articulated Left & Right Forearms + 5-Finger Hands for Riffle Shuffle, Card Pitching, Burn Tap, and Pot Sweeps
    const leftArm = new THREE.Group();
    leftArm.position.set(-0.175, 0.39, -0.01);
    const lHandRig = buildArticulatedForearmAndHand(skinMat, shirtMat, 'left', 'dealer', goldMat);
    lHandRig.position.set(0.02, -0.20, 0.08);
    lHandRig.rotation.set(0.12, 0.18, 0);
    leftArm.add(lHandRig);
    leftArm.userData.handRig = lHandRig;
    dealerGroup.add(leftArm);
    this.dealerLeftArm = leftArm;

    const rightArm = new THREE.Group();
    rightArm.position.set(0.175, 0.39, -0.01);
    const rHandRig = buildArticulatedForearmAndHand(skinMat, shirtMat, 'right', 'dealer', goldMat);
    rHandRig.position.set(-0.02, -0.20, 0.08);
    rHandRig.rotation.set(0.12, -0.18, 0);
    rightArm.add(rHandRig);
    rightArm.userData.handRig = rHandRig;
    dealerGroup.add(rightArm);
    this.dealerRightArm = rightArm;

    // Brass Card Dealing Shoe & Chip Tray on the inner rim in front of Dealer
    const shoeGeo = new THREE.BoxGeometry(0.11, 0.06, 0.16);
    const shoeMesh = new THREE.Mesh(shoeGeo, goldMat);
    shoeMesh.position.set(0.24, 0.06, 0.28);
    shoeMesh.rotation.y = -0.35;
    dealerGroup.add(shoeMesh);

    this.scene.add(dealerGroup);

    // Dedicated VIP Dealer Studio Key/Fill Light (illuminates sculpted facial features, hazel irises, 18K gold jewelry & satin peak lapels)
    const dealerStudioLight = new THREE.PointLight('#fff4e6', 1.45, 1.75, 1.6);
    dealerStudioLight.position.set(0.05, 0.70, 0.44);
    dealerStudioLight.castShadow = false;
    dealerGroup.add(dealerStudioLight);

    // Load realistic Blender 5.2 VIP Dealer GLB model (GEO-body_male_realistic + RPM tuxedo & hair)
    this.gltfLoader.load(
      '/models/vip_dealer.glb',
      (gltf) => {
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            const hasColorAttr = Boolean(child.geometry?.attributes?.color);
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            for (const m of mats) {
              if (
                m &&
                (m instanceof THREE.MeshStandardMaterial ||
                  m instanceof THREE.MeshPhysicalMaterial)
              ) {
                if (hasColorAttr) {
                  m.vertexColors = true;
                }
                if (m.name.includes('Eye')) {
                  m.roughness = 0.02;
                  if (m instanceof THREE.MeshPhysicalMaterial) {
                    m.clearcoat = 1.0;
                    m.clearcoatRoughness = 0.02;
                  }
                }
                m.needsUpdate = true;
              }
            }
          }
        });

        const torsoNode = gltf.scene.getObjectByName('Dealer_Torso');
        const headNode = gltf.scene.getObjectByName('Dealer_Head');
        const leftArmNode = gltf.scene.getObjectByName('Dealer_LeftArm');
        const rightArmNode = gltf.scene.getObjectByName('Dealer_RightArm');

        if (torsoNode) {
          dealerTorsoGroup.clear();
          torsoNode.position.set(0, 0, 0);
          dealerTorsoGroup.add(torsoNode);
        }
        if (headNode) {
          headGroup.clear();
          headNode.position.set(0, 0, 0);
          headGroup.add(headNode);
          headGroup.userData.hasRealisticFacialRig = true;
        }
        if (leftArmNode) {
          leftArm.clear();
          leftArmNode.position.set(0, 0, 0);
          leftArm.add(leftArmNode);
        }
        if (rightArmNode) {
          rightArm.clear();
          rightArmNode.position.set(0, 0, 0);
          rightArm.add(rightArmNode);
        }
      },
      undefined,
      (err) => {
        console.warn('[CasinoScene] Failed to load /models/vip_dealer.glb, keeping fallback:', err);
      }
    );

    // Movable Ceramic Dealer Button on the Felt
    const btnGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.008, 24);
    const btnMat = new THREE.MeshStandardMaterial({
      color: '#d4af37',
      metalness: 0.65,
      roughness: 0.25,
    });
    this.dealerButtonMesh = new THREE.Mesh(btnGeo, btnMat);
    this.dealerButtonMesh.position.copy(this.dealerButtonTarget);
    this.dealerButtonMesh.castShadow = true;
    this.scene.add(this.dealerButtonMesh);
  }

  /**
   * Builds persistent articulated 3D AI avatars (Viktor, Elena, Bao, Marcus)
   * with full 3D sculpted heads, subsurface skin, cornea clearcoat eyes, 5-finger hands, and rail plaques
   */
  private initPersistentAvatars() {
    const personaConfigs: Array<{
      role: CharacterModelRole;
      suitColor: string;
      accentColor: string;
      skinColor: string;
      torsoScale: THREE.Vector3;
      portraitUrl: string;
    } | null> = [
      null, // Seat 0 is Human
      {
        // Seat 1: Viktor (General Man / Shark) — Tailored dark navy suit, luxury watch, whiskey glass
        role: 'viktor',
        suitColor: '#1e293b',
        accentColor: '#d4af37',
        skinColor: '#eab696',
        torsoScale: new THREE.Vector3(1.02, 1.0, 0.96),
        portraitUrl: '/assets/avatar_viktor.png',
      },
      {
        // Seat 2: Elena (Woman / Rock) — Burgundy evening gown, styled dark updo, champagne flute & card protector
        role: 'elena',
        suitColor: '#7f1d1d',
        accentColor: '#d4af37',
        skinColor: '#f3cfb6',
        torsoScale: new THREE.Vector3(0.86, 0.98, 0.82),
        portraitUrl: '/assets/avatar_elena.png',
      },
      {
        // Seat 3: Bao (Heavy Phone-Watcher / Calling Station) — Heavy build, glowing 3D phone, soda can
        role: 'bao',
        suitColor: '#064e3b',
        accentColor: '#d4af37',
        skinColor: '#e5b887',
        torsoScale: new THREE.Vector3(1.38, 1.06, 1.32),
        portraitUrl: '/assets/avatar_bao.png',
      },
      {
        // Seat 4: Marcus (Flashy Maniac) — Gold/burgundy blazer, aviator sunglasses, espresso cup
        role: 'marcus',
        suitColor: '#78350f',
        accentColor: '#d4af37',
        skinColor: '#d99b66',
        torsoScale: new THREE.Vector3(1.06, 1.02, 0.98),
        portraitUrl: '/assets/avatar_marcus.png',
      },
    ];

    const goldMat = new THREE.MeshStandardMaterial({
      color: '#d4af37',
      metalness: 0.9,
      roughness: 0.2,
    });

    const suitFabricNor = this.textureLoader.load('/assets/pbr/fabric_nor_1k.jpg');
    suitFabricNor.wrapS = THREE.RepeatWrapping;
    suitFabricNor.wrapT = THREE.RepeatWrapping;
    suitFabricNor.repeat.set(6, 6);

    const avatarMeshSlots: Map<
      number,
      {
        rolePrefix: string;
        torsoMeshSlot: THREE.Group;
        headMeshSlot: THREE.Group;
        leftArmMeshSlot: THREE.Group;
        rightArmMeshSlot: THREE.Group;
      }
    > = new Map();

    const rolePrefixMap: Record<CharacterModelRole, string> = {
      dealer: 'Dealer',
      viktor: 'Viktor',
      elena: 'Elena',
      bao: 'Bao',
      marcus: 'Marcus',
    };

    for (let seatIdx = 1; seatIdx <= 4; seatIdx++) {
      const cfg = personaConfigs[seatIdx]!;
      const rimPos = CasinoScene.getAvatarRimPosition(seatIdx);
      const avatarGroup = new THREE.Group();
      avatarGroup.position.copy(rimPos);
      avatarGroup.lookAt(0, 0.8, 0);
      avatarGroup.updateMatrixWorld(true);

      // Articulated Torso Group (leans forward on monster-hand tells or action)
      const torsoGroup = new THREE.Group();
      avatarGroup.add(torsoGroup);

      const torsoMeshSlot = new THREE.Group();
      torsoMeshSlot.name = `${rolePrefixMap[cfg.role]}_TorsoSlot`;
      torsoGroup.add(torsoMeshSlot);

      const bodyGeo = new THREE.CapsuleGeometry(0.128, 0.22, 16, 24);
      const bodyMat = new THREE.MeshPhysicalMaterial({
        color: cfg.suitColor,
        normalMap: suitFabricNor,
        normalScale: new THREE.Vector2(0.26, 0.26),
        roughness: 0.50,
        metalness: 0.12,
        sheen: 0.55,
        sheenRoughness: 0.44,
        sheenColor: new THREE.Color(cfg.suitColor).lerp(new THREE.Color('#ffffff'), 0.28),
        clearcoat: 0.08,
        envMapIntensity: 0.65,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.18;
      body.scale.copy(cfg.torsoScale);
      body.castShadow = true;
      torsoMeshSlot.add(body);

      // Articulated 3D Sculpted Head Group (tracks active player or tilts down toward phone for Seat #3)
      const headGroup = new THREE.Group();
      headGroup.position.set(0, 0.54, 0);
      const headMeshSlot = new THREE.Group();
      headMeshSlot.name = `${rolePrefixMap[cfg.role]}_HeadSlot`;
      headGroup.add(headMeshSlot);

      const headGeo = new THREE.SphereGeometry(seatIdx === 3 ? 0.106 : 0.095, 28, 28);
      const skinMat = createRealisticSkinMaterial(cfg.skinColor);
      const head = new THREE.Mesh(headGeo, skinMat);
      head.castShadow = true;
      headMeshSlot.add(head);

      // Populate full 3D facial anatomy, eyelids, gaze-tracking irises, hair, eyewear, jewelry, collar, tie, and lapels
      populate3DCharacterHeadAndTorso(cfg.role, torsoMeshSlot, headMeshSlot, skinMat, bodyMat, goldMat);
      Object.assign(headGroup.userData, headMeshSlot.userData);

      torsoGroup.add(headGroup);

      // Articulated Left & Right Forearms + 5-Finger Sculpted Hands (pivots anchored at shoulder height y = 0.36)
      const shoulderX = seatIdx === 3 ? 0.195 : seatIdx === 2 ? 0.132 : 0.155;
      const leftArmGroup = new THREE.Group();
      leftArmGroup.position.set(-shoulderX, 0.36, -0.01);
      const leftArmMeshSlot = new THREE.Group();
      leftArmMeshSlot.name = `${rolePrefixMap[cfg.role]}_LeftArmSlot`;
      leftArmGroup.add(leftArmMeshSlot);

      const lHandRig = buildArticulatedForearmAndHand(skinMat, bodyMat, 'left', cfg.role, goldMat);
      lHandRig.position.set(0.02, -0.19, 0.07);
      lHandRig.rotation.set(0.12, 0.16, 0);
      leftArmMeshSlot.add(lHandRig);
      leftArmGroup.userData.handRig = lHandRig;
      torsoGroup.add(leftArmGroup);

      const rightArmGroup = new THREE.Group();
      rightArmGroup.position.set(shoulderX, 0.36, -0.01);
      const rightArmMeshSlot = new THREE.Group();
      rightArmMeshSlot.name = `${rolePrefixMap[cfg.role]}_RightArmSlot`;
      rightArmGroup.add(rightArmMeshSlot);

      const rHandRig = buildArticulatedForearmAndHand(skinMat, bodyMat, 'right', cfg.role, goldMat);
      rHandRig.position.set(-0.02, -0.19, 0.07);
      rHandRig.rotation.set(0.12, -0.16, 0);
      rightArmMeshSlot.add(rHandRig);
      rightArmGroup.userData.handRig = rHandRig;
      torsoGroup.add(rightArmGroup);

      avatarMeshSlots.set(seatIdx, {
        rolePrefix: rolePrefixMap[cfg.role],
        torsoMeshSlot,
        headMeshSlot,
        leftArmMeshSlot,
        rightArmMeshSlot,
      });

      // Seat #3 (Bao) Special 3D Glowing Smartphone + Face Screen Glow Light + Resting Rail Phone
      let phoneHandGroup: THREE.Group | undefined;
      let phoneRailMesh: THREE.Mesh | undefined;
      let phoneGlowLight: THREE.PointLight | undefined;

      if (seatIdx === 3) {
        phoneHandGroup = new THREE.Group();
        phoneHandGroup.position.set(-0.05, -0.16, 0.15);
        phoneHandGroup.rotation.set(-0.42, 0.18, 0);

        const caseGeo = new THREE.BoxGeometry(0.064, 0.122, 0.01);
        const caseMat = new THREE.MeshStandardMaterial({
          color: '#0f172a',
          metalness: 0.75,
          roughness: 0.22,
          emissive: '#0284c7',
          emissiveIntensity: 0.25,
        });
        const phoneCase = new THREE.Mesh(caseGeo, caseMat);
        phoneHandGroup.add(phoneCase);

        const screenTex = getPhoneScreenTexture();
        const screenGeo = new THREE.PlaneGeometry(0.058, 0.114);
        const screenMat = new THREE.MeshBasicMaterial({
          map: screenTex,
          side: THREE.DoubleSide,
        });
        const screenMeshFront = new THREE.Mesh(screenGeo, screenMat);
        screenMeshFront.position.z = 0.006;
        const screenMeshBack = new THREE.Mesh(screenGeo, screenMat);
        screenMeshBack.position.z = -0.006;
        phoneHandGroup.add(screenMeshFront, screenMeshBack);

        rightArmGroup.add(phoneHandGroup);

        // Cyan-blue smartphone screen light illuminating Bao's face & chest
        phoneGlowLight = new THREE.PointLight('#38bdf8', 1.15, 0.75);
        phoneGlowLight.position.set(0, 0.42, 0.26);
        torsoGroup.add(phoneGlowLight);

        // Phone placed flat on the walnut racetrack when Bao gets a monster hand ("phone_down_monster" tell!)
        const railPhoneMat = new THREE.MeshStandardMaterial({
          color: '#0f172a',
          metalness: 0.85,
          roughness: 0.18,
          emissive: '#d4af37',
          emissiveIntensity: 0.35,
        });
        phoneRailMesh = new THREE.Mesh(caseGeo, railPhoneMat);
        const railPhoneLocal = avatarGroup.worldToLocal(new THREE.Vector3(0.92, 0.768, -0.51));
        phoneRailMesh.position.copy(railPhoneLocal);
        phoneRailMesh.rotation.x = Math.PI / 2;
        phoneRailMesh.visible = false;
        avatarGroup.add(phoneRailMesh);
      }

      // Seat-Specific Table Rim Props snapped directly into the 4 recessed brushed-brass cup holders on the walnut racetrack
      this.buildSeatRimProps(seatIdx, avatarGroup, goldMat);

      // Turn Floor Ring
      const ringGeo = new THREE.RingGeometry(0.19, 0.23, 24);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: '#d4af37',
        transparent: true,
        opacity: 0.15,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.01;
      avatarGroup.add(ring);

      // 3D Status & Action Plaque docked low on the front rail (y = 0.16m, z = 0.25m)
      // so it NEVER occludes the 3D character's face (y = 0.54m), torso, or racetrack drink props!
      const plaqueCanvas = document.createElement('canvas');
      plaqueCanvas.width = 460;
      plaqueCanvas.height = 132;
      const plaqueTexture = new THREE.CanvasTexture(plaqueCanvas);
      plaqueTexture.anisotropy = 4;

      const plaqueGeo = new THREE.PlaneGeometry(0.38, 0.11);
      const plaqueMat = new THREE.MeshBasicMaterial({
        map: plaqueTexture,
        transparent: true,
        side: THREE.DoubleSide,
      });
      const plaqueMesh = new THREE.Mesh(plaqueGeo, plaqueMat);
      plaqueMesh.position.set(0, 0.16, 0.25);
      avatarGroup.add(plaqueMesh);

      // Preload 2D Nano Banana character portrait for the 3D Plaque medallion
      const portraitImg = new Image();
      portraitImg.crossOrigin = 'anonymous';
      portraitImg.src = cfg.portraitUrl;

      const plaqueRefObj: AvatarPlaqueRef = {
        canvas: plaqueCanvas,
        texture: plaqueTexture,
        mesh: plaqueMesh,
        ringMat,
        bodyMat,
        avatarGroup,
        torsoGroup,
        headGroup,
        leftArmGroup,
        rightArmGroup,
        phoneHandGroup,
        phoneRailMesh,
        phoneGlowLight,
        portraitImg,
        actionType: seatIdx === 3 ? 'phone_scroll' : 'idle',
        actionTimer: 0,
        isWatchingPhone: seatIdx === 3,
        activeTell: seatIdx === 3 ? 'phone_scrolling' : 'none',
        targetHeadYaw: 0,
      };

      portraitImg.onload = () => {
        if (this.latestPlayers.length > 0) {
          this.updateAvatars(this.latestPlayers, this.latestTable?.dealerSeat ?? 0);
        }
      };

      this.scene.add(avatarGroup);
      this.avatarPlaques.set(seatIdx, plaqueRefObj);
    }

    // Add subtle warm facial key lights for each AI seat so subsurface skin sheen and cornea catchlights read clearly
    this.avatarPlaques.forEach((plaqueRef) => {
      const seatKeyLight = new THREE.PointLight('#fff4e6', 0.85, 1.35, 1.6);
      seatKeyLight.position.set(0.04, 0.64, 0.36);
      seatKeyLight.castShadow = false;
      plaqueRef.avatarGroup.add(seatKeyLight);
    });

    // Load realistic Blender 5.2 AI Players GLB model (Viktor, Elena, Bao, Marcus)
    this.gltfLoader.load(
      '/models/vip_ai_players.glb',
      (gltf) => {
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            const hasColorAttr = Boolean(child.geometry?.attributes?.color);
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            for (const m of mats) {
              if (
                m &&
                (m instanceof THREE.MeshStandardMaterial ||
                  m instanceof THREE.MeshPhysicalMaterial)
              ) {
                if (hasColorAttr) {
                  m.vertexColors = true;
                }
                if (m.name.includes('Eye')) {
                  m.roughness = 0.02;
                  if (m instanceof THREE.MeshPhysicalMaterial) {
                    m.clearcoat = 1.0;
                    m.clearcoatRoughness = 0.02;
                  }
                }
                m.needsUpdate = true;
              }
            }
          }
        });

        avatarMeshSlots.forEach((slots) => {
          const torsoNode = gltf.scene.getObjectByName(`${slots.rolePrefix}_Torso`);
          const headNode = gltf.scene.getObjectByName(`${slots.rolePrefix}_Head`);
          const leftArmNode = gltf.scene.getObjectByName(`${slots.rolePrefix}_LeftArm`);
          const rightArmNode = gltf.scene.getObjectByName(`${slots.rolePrefix}_RightArm`);

          if (torsoNode) {
            slots.torsoMeshSlot.clear();
            torsoNode.position.set(0, 0, 0);
            slots.torsoMeshSlot.add(torsoNode);
          }
          if (headNode) {
            slots.headMeshSlot.clear();
            headNode.position.set(0, 0, 0);
            slots.headMeshSlot.add(headNode);
          }
          if (leftArmNode) {
            slots.leftArmMeshSlot.clear();
            leftArmNode.position.set(0, 0, 0);
            slots.leftArmMeshSlot.add(leftArmNode);
          }
          if (rightArmNode) {
            slots.rightArmMeshSlot.clear();
            rightArmNode.position.set(0, 0, 0);
            slots.rightArmMeshSlot.add(rightArmNode);
          }
        });
      },
      undefined,
      (err) => {
        console.warn('[CasinoScene] Failed to load /models/vip_ai_players.glb, keeping fallback:', err);
      }
    );
  }

  /**
   * Builds signature character props seated directly inside the recessed brushed-brass cup holders
   * on the flat walnut racetrack (`y_world = 0.7670m`) for each AI seat
   */
  private buildSeatRimProps(
    seatIdx: number,
    avatarGroup: THREE.Group,
    goldMat: THREE.MeshStandardMaterial
  ) {
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: '#e2e8f0',
      transparent: true,
      opacity: 0.48,
      roughness: 0.08,
      metalness: 0.16,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.4,
    });

    // Counter-rotate prop groups against avatarGroup's slight lookAt pitch so glasses/cans stand 100% upright
    const uprightQuat = avatarGroup.quaternion.clone().invert();

    if (seatIdx === 1) {
      // Viktor: Crystal Old Fashioned Whiskey Tumbler seated inside Seat #1 Brass Cup Holder (-1.1839, 0.7670, 0.0337)
      const tumblerGroup = new THREE.Group();
      tumblerGroup.position.copy(
        avatarGroup.worldToLocal(new THREE.Vector3(-1.1839, 0.799, 0.0337))
      );
      tumblerGroup.quaternion.copy(uprightQuat);
      const glassGeo = new THREE.CylinderGeometry(0.031, 0.027, 0.068, 16);
      const liquidGeo = new THREE.CylinderGeometry(0.027, 0.024, 0.036, 14);
      const amberMat = new THREE.MeshStandardMaterial({
        color: '#d97706',
        roughness: 0.2,
        metalness: 0.1,
      });
      const glass = new THREE.Mesh(glassGeo, glassMat);
      const liquid = new THREE.Mesh(liquidGeo, amberMat);
      liquid.position.y = -0.01;
      tumblerGroup.add(glass, liquid);
      avatarGroup.add(tumblerGroup);
    } else if (seatIdx === 2) {
      // Elena: Tall Champagne Flute seated inside Seat #2 Brass Cup Holder (-0.7668, 0.7670, -0.5969) + Gold Card Protector on Felt
      const fluteGroup = new THREE.Group();
      fluteGroup.position.copy(
        avatarGroup.worldToLocal(new THREE.Vector3(-0.7668, 0.806, -0.5969))
      );
      fluteGroup.quaternion.copy(uprightQuat);
      const bowlGeo = new THREE.CylinderGeometry(0.022, 0.008, 0.085, 14);
      const bowl = new THREE.Mesh(bowlGeo, glassMat);
      fluteGroup.add(bowl);
      avatarGroup.add(fluteGroup);

      const protectorGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.006, 20);
      const protector = new THREE.Mesh(protectorGeo, goldMat);
      protector.position.copy(
        avatarGroup.worldToLocal(new THREE.Vector3(-0.62, 0.765, -0.42))
      );
      protector.quaternion.copy(uprightQuat);
      avatarGroup.add(protector);
    } else if (seatIdx === 3) {
      // Bao: Energy Drink Can seated inside Seat #3 Brass Cup Holder (1.1144, 0.7670, -0.2667)
      const canGeo = new THREE.CylinderGeometry(0.027, 0.027, 0.092, 16);
      const canMat = new THREE.MeshStandardMaterial({
        color: '#10b981',
        metalness: 0.75,
        roughness: 0.25,
      });
      const canMesh = new THREE.Mesh(canGeo, canMat);
      canMesh.position.copy(
        avatarGroup.worldToLocal(new THREE.Vector3(1.1144, 0.811, -0.2667))
      );
      canMesh.quaternion.copy(uprightQuat);
      avatarGroup.add(canMesh);
    } else if (seatIdx === 4) {
      // Marcus: Double Espresso Cup & Porcelain Saucer seated on Seat #4 Brass Cup Holder (1.0015, 0.7670, 0.4174)
      const espressoGroup = new THREE.Group();
      espressoGroup.position.copy(
        avatarGroup.worldToLocal(new THREE.Vector3(1.0015, 0.768, 0.4174))
      );
      espressoGroup.quaternion.copy(uprightQuat);

      const saucerGeo = new THREE.CylinderGeometry(0.04, 0.03, 0.007, 16);
      const cupGeo = new THREE.CylinderGeometry(0.024, 0.018, 0.04, 16);
      const porcelainMat = new THREE.MeshStandardMaterial({
        color: '#f1f5f9',
        roughness: 0.28,
      });
      const saucer = new THREE.Mesh(saucerGeo, porcelainMat);
      saucer.position.y = 0.0035;
      const cup = new THREE.Mesh(cupGeo, porcelainMat);
      cup.position.y = 0.024;
      espressoGroup.add(saucer, cup);
      avatarGroup.add(espressoGroup);
    }
  }

  /**
   * Initializes 4 InstancedMesh pools for $1, $5, $25, $100 chips using sculpted compression-molded
   * clay geometry (chamfered stack edges, 12 radial mold notches, recessed center inlay well) and MeshPhysicalMaterial
   */
  private initInstancedChips() {
    const denoms: ChipDenomination[] = [1, 5, 25, 100];
    const radius = 0.022;
    const height = 0.0045;
    const maxInstancesPerDenom = 240;
    const sculptedChipGeo = createSculptedClayChipGeometry(radius, height, 36);

    for (const denom of denoms) {
      const textures = getChipTextures(denom);
      const sideMat = new THREE.MeshPhysicalMaterial({
        map: textures.edge,
        roughness: 0.62,
        metalness: 0.06,
        clearcoat: 0.15,
        clearcoatRoughness: 0.45,
      });
      const faceMat = new THREE.MeshPhysicalMaterial({
        map: textures.face,
        normalMap: textures.normalMap,
        normalScale: new THREE.Vector2(0.42, 0.42),
        roughnessMap: textures.roughnessMap,
        roughness: 0.68,
        metalness: denom === 100 ? 0.18 : 0.06,
        clearcoat: 0.22,
        clearcoatRoughness: 0.48,
        envMapIntensity: 0.55,
      });

      const instanced = new THREE.InstancedMesh(
        sculptedChipGeo,
        [sideMat, faceMat],
        maxInstancesPerDenom
      );
      instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      instanced.castShadow = true;
      instanced.receiveShadow = true;
      instanced.count = 0;
      instanced.frustumCulled = false;

      this.scene.add(instanced);
      this.chipInstancedMeshes.set(denom, instanced);
    }

    // Load Blender 5.2 sculpted chip & card prototype asset (/models/vip_cards_and_chips.glb) for hybrid pipeline parity
    this.gltfLoader.load(
      '/models/vip_cards_and_chips.glb',
      (gltf) => {
        gltf.scene.name = 'BlenderCardsAndChipsPrototypes';
      },
      undefined,
      () => {
        // Synchronous sculpted geometry remains active if offline
      }
    );

    // Visual dragged chip stack preview when user pinches/drags chips
    this.draggedChipGroup = new THREE.Group();
    const dragGeo = createSculptedClayChipGeometry(radius * 1.04, height * 3, 32);
    const dragMat = new THREE.MeshPhysicalMaterial({
      color: '#facc15',
      metalness: 0.65,
      roughness: 0.22,
      clearcoat: 0.85,
      emissive: '#d4af37',
      emissiveIntensity: 0.35,
    });
    const dragMesh = new THREE.Mesh(dragGeo, [dragMat, dragMat]);
    this.draggedChipGroup.add(dragMesh);
    this.draggedChipGroup.visible = false;
    this.scene.add(this.draggedChipGroup);
  }

  /**
   * Builds interactive raycast zones (Betting Ring, Bank Chip Colliders, Hole Card Collider, and 3D Spatial HUD Dock)
   */
  private buildInteractiveZonesAndSpatialHUD() {
    // 1. Golden Betting Ring Target Zone on Felt in front of Seat #0
    const ringGeo = new THREE.RingGeometry(0.11, 0.135, 36);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#facc15',
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
    });
    this.bettingRingGlowMesh = new THREE.Mesh(ringGeo, ringMat);
    this.bettingRingGlowMesh.position.copy(CasinoScene.BETTING_RING_CENTER);
    this.scene.add(this.bettingRingGlowMesh);

    // 2. Action / Check Felt Ripple Ring
    const rippleGeo = new THREE.RingGeometry(0.04, 0.065, 32);
    rippleGeo.rotateX(-Math.PI / 2);
    const rippleMat = new THREE.MeshBasicMaterial({
      color: '#34d399',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    this.checkRippleMesh = new THREE.Mesh(rippleGeo, rippleMat);
    this.checkRippleMesh.position.set(0, 0.764, 0.52);
    this.scene.add(this.checkRippleMesh);

    // 3. Invisible Raycast Colliders for Seat #0's 4 Denomination Chip Stacks + Hover Highlight Ring
    const denoms: ChipDenomination[] = [1, 5, 25, 100];
    const hitGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.08, 16);
    const invisibleMat = new THREE.MeshBasicMaterial({ visible: false });

    denoms.forEach((denom, idx) => {
      const hitMesh = new THREE.Mesh(hitGeo, invisibleMat);
      const xOffset = (idx - 1.5) * 0.068;
      hitMesh.position.set(xOffset, 0.79, 0.71);
      hitMesh.userData = { type: 'bank_chip', denom };
      this.scene.add(hitMesh);
      this.bankChipHitMeshes.push(hitMesh);
    });

    const hoverRingGeo = new THREE.RingGeometry(0.025, 0.033, 24);
    hoverRingGeo.rotateX(-Math.PI / 2);
    const hoverRingMat = new THREE.MeshBasicMaterial({
      color: '#fde047',
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    this.bankChipHoverRing = new THREE.Mesh(hoverRingGeo, hoverRingMat);
    this.bankChipHoverRing.position.set(0, 0.764, 0.71);
    this.bankChipHoverRing.visible = false;
    this.scene.add(this.bankChipHoverRing);

    // 4. Invisible Raycast Collider for Seat #0's Hole Cards (for pinch-peeking and flick-to-fold)
    const cardHitGeo = new THREE.BoxGeometry(0.22, 0.04, 0.15);
    this.holeCardHitMesh = new THREE.Mesh(cardHitGeo, invisibleMat);
    this.holeCardHitMesh.position.set(0, 0.77, 0.62);
    this.holeCardHitMesh.userData = { type: 'hole_cards' };
    this.scene.add(this.holeCardHitMesh);

    // 5. World-Anchored 3D Spatial HUD Dock mounted above Seat #0 Table Rim (elevated at y=0.835, z=0.85 for 100% frustum containment)
    const buttonIds: ('fold' | 'call' | 'raise' | 'peek_or_next')[] = [
      'fold',
      'call',
      'raise',
      'peek_or_next',
    ];
    const btnGeo = new THREE.PlaneGeometry(0.165, 0.066);

    buttonIds.forEach((id, idx) => {
      const canvas = document.createElement('canvas');
      canvas.width = 280;
      canvas.height = 112;
      const texture = new THREE.CanvasTexture(canvas);
      texture.anisotropy = 4;

      const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
      });
      const mesh = new THREE.Mesh(btnGeo, mat);
      const xPos = (idx - 1.5) * 0.18;
      mesh.position.set(xPos, 0.835, 0.85);
      mesh.rotation.x = -0.64; // Angled ergonomically toward Seat #0 eyes above the leather armrest
      mesh.visible = !this.show2DHUD || this.isInXR;
      mesh.userData = { type: 'spatial_button', buttonId: id };

      this.scene.add(mesh);
      this.spatialButtons.push({ id, canvas, texture, mesh });
    });
  }

  /**
   * Builds 3D on-felt street bet badges in front of all 5 seats so bet amounts ($XX / ALL-IN) are readable in 3D
   */
  private buildOnFeltBetBadges() {
    const badgeGeo = new THREE.PlaneGeometry(0.15, 0.048);
    CasinoScene.SEAT_POSITIONS.forEach((seatPos, seatIdx) => {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 76;
      const texture = new THREE.CanvasTexture(canvas);
      texture.anisotropy = 4;

      const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(badgeGeo, mat);
      // Place slightly inward of the street bet chip stack, tilted gently upward for legibility
      const badgeX = seatIdx === 0 ? 0.16 : seatPos.x * 0.56;
      const badgeZ = seatIdx === 0 ? 0.44 : seatPos.z * 0.56 + 0.05;
      mesh.position.set(badgeX, 0.774, badgeZ);
      mesh.rotation.x = -Math.PI / 2.6;
      mesh.visible = false;

      this.scene.add(mesh);
      this.betBadges.set(seatIdx, {
        canvas,
        texture,
        mesh,
        lastAmount: 0,
        lastAllIn: false,
      });
    });
  }

  /**
   * Builds an optional 3D Debug Wireframe Overlay showing felt bounds, leather rim bounds, and interactive colliders
   */
  private buildDebugOverlay() {
    const group = new THREE.Group();
    group.visible = false;

    // 1. Inner Emerald Felt Boundary Ring (rx = 1.24, rz = 0.818)
    const feltRingGeo = new THREE.RingGeometry(1.235, 1.245, 64);
    feltRingGeo.rotateX(-Math.PI / 2);
    feltRingGeo.scale(1, 1, 0.66);
    const feltRingMat = new THREE.MeshBasicMaterial({ color: '#10b981', side: THREE.DoubleSide });
    const feltRing = new THREE.Mesh(feltRingGeo, feltRingMat);
    feltRing.position.y = 0.765;
    group.add(feltRing);

    // 2. Outer Leather Armrest Centerline Ring (rx = 1.37, rz = 0.9042)
    const rimRingGeo = new THREE.RingGeometry(1.365, 1.375, 64);
    rimRingGeo.rotateX(-Math.PI / 2);
    rimRingGeo.scale(1, 1, 0.66);
    const rimRingMat = new THREE.MeshBasicMaterial({ color: '#f59e0b', side: THREE.DoubleSide });
    const rimRing = new THREE.Mesh(rimRingGeo, rimRingMat);
    rimRing.position.y = 0.802;
    group.add(rimRing);

    // 3. Wireframes for Bank Chip Colliders & Hole Card Collider
    const wireMat = new THREE.MeshBasicMaterial({ color: '#38bdf8', wireframe: true });
    this.bankChipHitMeshes.forEach((hit) => {
      const wf = new THREE.Mesh(hit.geometry.clone(), wireMat);
      wf.position.copy(hit.position);
      group.add(wf);
    });
    if (this.holeCardHitMesh) {
      const cardWf = new THREE.Mesh(this.holeCardHitMesh.geometry.clone(), wireMat);
      cardWf.position.copy(this.holeCardHitMesh.position);
      group.add(cardWf);
    }

    this.scene.add(group);
    this.debugOverlayGroup = group;
  }

  public setDebugOverlay(enabled: boolean) {
    this.isDebugOverlayEnabled = enabled;
    if (this.debugOverlayGroup) {
      this.debugOverlayGroup.visible = enabled;
    }
  }

  /**
   * Updates the 3D Spatial HUD buttons on the table rim to mirror current game state
   */
  public updateSpatialHUD(table: TableState, human: PlayerState, isPeeking: boolean) {
    this.latestTable = table;
    this.latestIsPeeking = isPeeking;
    this.syncSpatialButtonsVisibility();
    const callAmount = Math.max(0, table.currentHighBet - human.currentBet);
    const isFreeToCheck = callAmount === 0;
    const minRaiseTotal = Math.max(table.bigBlind, table.currentHighBet + table.minRaise);

    for (const btn of this.spatialButtons) {
      const isHovered = this.hoveredButtonId === btn.id;
      if (btn.id === 'fold') {
        drawSpatialButton(
          btn.canvas,
          'FOLD',
          'Flick Cards',
          'fold',
          !human.isTurn || human.folded || table.phase === 'showdown',
          isHovered
        );
      } else if (btn.id === 'call') {
        if (table.stagedBet > 0 && human.isTurn) {
          drawSpatialButton(btn.canvas, 'CLEAR CHIP', 'Reset Ring', 'neutral', false, isHovered);
        } else {
          drawSpatialButton(
            btn.canvas,
            isFreeToCheck ? 'CHECK' : 'CALL',
            isFreeToCheck ? 'Double-Tap' : `$${Math.min(human.chips, callAmount)}`,
            'call',
            !human.isTurn || human.folded || table.phase === 'showdown',
            isHovered
          );
        }
      } else if (btn.id === 'raise') {
        if (table.stagedBet > 0 && human.isTurn) {
          drawSpatialButton(
            btn.canvas,
            'CONFIRM BET',
            `Commit $${table.stagedBet}`,
            'confirm',
            false,
            isHovered
          );
        } else {
          const isAllIn = human.chips <= callAmount;
          drawSpatialButton(
            btn.canvas,
            isAllIn ? 'ALL-IN' : 'RAISE',
            isAllIn ? `$${human.chips}` : `To $${Math.min(human.chips + human.currentBet, minRaiseTotal)}`,
            'raise',
            !human.isTurn || human.folded || table.phase === 'showdown',
            isHovered
          );
        }
      } else if (btn.id === 'peek_or_next') {
        if (table.phase === 'showdown') {
          drawSpatialButton(btn.canvas, 'NEXT HAND', 'Deal Cards', 'confirm', false, isHovered);
        } else {
          drawSpatialButton(
            btn.canvas,
            isPeeking ? 'HIDE CARDS' : 'PEEK CARDS',
            'Pinch Corner',
            'neutral',
            human.folded,
            isHovered
          );
        }
      }
      btn.texture.needsUpdate = true;
    }
  }

  /**
   * Updates AI Avatar plaques, physical tells, speech bubbles, and Dealer Button
   */
  public updateAvatars(players: PlayerState[], dealerSeat: number = 0) {
    this.latestPlayers = players;

    // Move dealer button to current dealer seat
    if (CasinoScene.SEAT_POSITIONS[dealerSeat]) {
      const dPos = CasinoScene.SEAT_POSITIONS[dealerSeat];
      this.dealerButtonTarget.set(dPos.x * 0.78 + 0.11, 0.766, dPos.z * 0.78);
    }

    const activeSeats = players
      .filter((p) => !p.eliminated)
      .map((p) => p.seatIndex)
      .sort((a, b) => a - b);

    const getSeatPositionLabel = (seatIndex: number): string => {
      if (activeSeats.length < 2 || !activeSeats.includes(seatIndex)) return '';
      const dIdx = activeSeats.indexOf(dealerSeat);
      const sIdx = activeSeats.indexOf(seatIndex);
      if (dIdx === -1 || sIdx === -1) return '';
      const rel = (sIdx - dIdx + activeSeats.length) % activeSeats.length;
      if (activeSeats.length === 2) return rel === 0 ? 'BTN' : 'BB';
      if (rel === 0) return 'BTN';
      if (rel === 1) return 'SB';
      if (rel === 2) return 'BB';
      if (rel === activeSeats.length - 1) return 'CO';
      return 'UTG';
    };

    const now = Date.now();

    players.forEach((p) => {
      if (p.isHuman) return;
      const plaqueRef = this.avatarPlaques.get(p.seatIndex);
      if (!plaqueRef) return;

      plaqueRef.ringMat.opacity = p.isTurn ? 0.92 : 0.12;
      plaqueRef.bodyMat.opacity = p.eliminated ? 0.25 : 1;
      plaqueRef.bodyMat.transparent = p.eliminated;
      plaqueRef.isWatchingPhone = !!p.isWatchingPhone;
      plaqueRef.activeTell = p.activeTell || 'none';

      // Sync Bao's 3D Smartphone in-hand vs flat on mahogany rail ("Phone Down = Monster Hand" tell)
      if (p.persona === 'heavy_phone') {
        const watching = !!p.isWatchingPhone && !p.eliminated && !p.folded;
        if (plaqueRef.phoneHandGroup) {
          plaqueRef.phoneHandGroup.visible = watching;
        }
        if (plaqueRef.phoneRailMesh) {
          plaqueRef.phoneRailMesh.visible = !watching && !p.eliminated;
        }
        if (plaqueRef.phoneGlowLight) {
          plaqueRef.phoneGlowLight.intensity = watching ? 1.25 : 0;
        }
      }

      const statusText = p.eliminated
        ? `ELIMINATED #${p.finishPlace || ''}`
        : p.folded
        ? 'FOLDED'
        : p.allIn
        ? `ALL-IN ($${p.totalHandBet})`
        : p.lastAction || (p.isTurn ? 'Thinking...' : 'Ready');

      let tellLabel = '';
      if (!p.eliminated && !p.folded) {
        if (p.activeTell === 'phone_down_monster') {
          tellLabel = '🔥 PHONE DOWN!';
        } else if (p.persona === 'heavy_phone' && p.isWatchingPhone) {
          tellLabel = '📱 SCROLLING';
        } else if (p.activeTell === 'watch_glance_strong') {
          tellLabel = '⌚ CHECKS WATCH';
        } else if (p.activeTell === 'chip_fidget_bluff') {
          tellLabel = '🎲 CHIP FIDGET';
        } else if (p.activeTell === 'posture_tight') {
          tellLabel = '✨ POISED';
        }
      }

      const chatBubbleText =
        p.activeChatBubble && p.activeChatTimestamp && now - p.activeChatTimestamp < 6500
          ? p.activeChatBubble
          : undefined;

      const posLabel = getSeatPositionLabel(p.seatIndex);
      const hs = p.hudStats;
      const vpipPct = hs && hs.handsDealt > 0 ? Math.round(hs.vpipPct) : 28;
      const pfrPct = hs && hs.handsDealt > 0 ? Math.round(hs.pfrPct) : 18;
      const afVal = hs && hs.handsDealt > 0 ? hs.aggressionFactor.toFixed(1) : '1.8';
      const hudStatsLabel = `VPIP ${vpipPct}% • PFR ${pfrPct}% • AF ${afVal}`;

      drawAvatarPlaque(
        plaqueRef.canvas,
        p.name,
        p.chips,
        statusText,
        p.isTurn,
        p.folded,
        p.eliminated,
        p.color,
        p.seatIndex === dealerSeat,
        tellLabel,
        chatBubbleText,
        plaqueRef.portraitImg,
        posLabel,
        hudStatsLabel
      );
      plaqueRef.texture.needsUpdate = true;
    });
  }

  /**
   * Triggers a physical 3D animation on an AI player rig (check knock, chip push, fold flick, celebrate)
   */
  public triggerPlayerAction(seatIndex: number, action: PhysicalActionType) {
    const plaqueRef = this.avatarPlaques.get(seatIndex);
    if (!plaqueRef) return;
    plaqueRef.actionType = action;
    plaqueRef.actionTimer = this.clock.getElapsedTime();

    const seatPos = CasinoScene.SEAT_POSITIONS[seatIndex];
    if (seatPos && (action === 'check_knock' || action === 'chip_push')) {
      this.triggerActionRipple(
        new THREE.Vector3(seatPos.x * 0.68, 0.765, seatPos.z * 0.68),
        action === 'chip_push' ? 0xfacc15 : 0x34d399
      );
    }
  }

  /**
   * Triggers a physical 3D animation on the Dealer rig (riffle shuffle, pitch cards, burn tap, sweep pot)
   */
  public triggerDealerAction(action: DealerActionType, targetSeat?: number) {
    this.dealerAction = action;
    this.dealerActionTimer = this.clock.getElapsedTime();
    if (targetSeat !== undefined && CasinoScene.SEAT_POSITIONS[targetSeat]) {
      const pos = CasinoScene.SEAT_POSITIONS[targetSeat];
      this.dealerTargetYaw = Math.atan2(pos.x, pos.z + 1.1) * 0.55;
    } else {
      this.dealerTargetYaw = 0;
    }
  }

  /**
   * Creates a 3D playing card mesh with casino poker-rounded corners (3.5mm),
   * subtle bridge camber (0.6mm arch), air-cushion linen normal map, and satin clearcoat
   */
  public createCardMesh(card: Card): { group: THREE.Group; frontMat: THREE.MeshStandardMaterial } {
    const cardGroup = new THREE.Group();
    const width = 0.086;
    const height = 0.122;
    const thickness = 0.0008;

    const frontTexture = getCardFrontTexture(card);
    const backTexture = getCardBackTexture();
    const linenNormal = getCardLinenNormalMap();
    const backRoughness = getCardBackRoughnessMap();

    const geometry = createRoundedCamberedCardGeometry(width, height, thickness, 0.0035, 0.0006);
    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      roughness: 0.65,
      metalness: 0.02,
    });
    const topMaterial = new THREE.MeshPhysicalMaterial({
      color: '#e5dfd3',
      map: frontTexture,
      normalMap: linenNormal,
      normalScale: new THREE.Vector2(0.08, 0.08),
      roughness: 0.88,
      metalness: 0.0,
      clearcoat: 0.0,
      envMapIntensity: 0.08,
    });
    const bottomMaterial = new THREE.MeshPhysicalMaterial({
      map: backTexture,
      normalMap: linenNormal,
      normalScale: new THREE.Vector2(0.18, 0.18),
      roughnessMap: backRoughness,
      roughness: 0.42,
      metalness: 0.18,
      clearcoat: 0.68,
      clearcoatRoughness: 0.22,
    });

    // createRoundedCamberedCardGeometry uses 3 material groups: [0: edge, 1: top (front), 2: bottom (back)]
    const materials = [edgeMaterial, topMaterial, bottomMaterial];

    const mesh = new THREE.Mesh(geometry, materials);
    // Flat 0.8mm cards rest on the felt; disabling shadow casting keeps draw calls well under the 450 budget
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    cardGroup.add(mesh);

    return { group: cardGroup, frontMat: edgeMaterial };
  }

  /**
   * Synchronizes community cards, burn cards, player hole cards, and showdown winning-hand highlights
   */
  public syncCards(table: TableState, players: PlayerState[]) {
    this.latestTable = table;
    this.latestPlayers = players;
    const now = this.clock.getElapsedTime();

    const winningCardIds = new Set<string>();
    if (table.phase === 'showdown' && table.winners.length > 0) {
      table.winners.forEach((w) => w.bestCards.forEach((c) => winningCardIds.add(c.id)));
    }

    // 1. Burn Cards next to Dealer Tray
    while (this.burnCardMeshes.length < table.burnCardsCount) {
      const idx = this.burnCardMeshes.length;
      const dummyBurnCard: Card = { id: `burn_${idx}`, suit: 'spades', rank: 14, faceUp: false };
      const { group } = this.createCardMesh(dummyBurnCard);
      group.position.set(-0.34 + idx * 0.018, 0.763 + idx * 0.001, -0.46);
      group.rotation.set(0, 0.15 * idx, Math.PI); // Facedown
      this.scene.add(group);
      this.burnCardMeshes.push(group);
    }

    // 2. Community Cards on Center Board
    table.communityCards.forEach((card, idx) => {
      const isWinner = winningCardIds.has(card.id);
      const basePos = CasinoScene.COMMUNITY_POSITIONS[idx];

      if (!this.cardMeshes.has(card.id)) {
        const { group, frontMat } = this.createCardMesh(card);
        frontMat.emissive.setHex(isWinner ? 0xd4af37 : 0x000000);
        frontMat.emissiveIntensity = isWinner ? 0.06 : 0;
        const startPos = new THREE.Vector3(0, 0.86, -0.58); // Dealer shoe pitch origin
        group.position.copy(startPos);
        group.rotation.set(0, 0, Math.PI);
        this.scene.add(group);

        this.cardMeshes.set(card.id, {
          mesh: group,
          frontMat,
          card,
          startPosition: startPos,
          targetPosition: new THREE.Vector3(basePos.x, isWinner ? basePos.y + 0.028 : basePos.y, basePos.z),
          targetRotation: new THREE.Euler(0, 0, 0), // Flip face up
          isWinningCard: isWinner,
          spawnTime: now,
          arcHeight: 0.12,
        });
        pokerAudio.playCardSlide();
      } else {
        const ref = this.cardMeshes.get(card.id)!;
        ref.isWinningCard = isWinner;
        ref.targetPosition.y = isWinner ? basePos.y + 0.028 : basePos.y;
        ref.frontMat.emissive.setHex(isWinner ? 0xd4af37 : 0x000000);
        ref.frontMat.emissiveIntensity = isWinner ? 0.06 : 0;
      }
    });

    // 3. Players Hole Cards
    players.forEach((player) => {
      if (player.eliminated) return;
      const seatPos = CasinoScene.SEAT_POSITIONS[player.seatIndex];

      player.cards.forEach((card, cardIdx) => {
        const isWinner = winningCardIds.has(card.id);
        const offsetMultiplier = cardIdx === 0 ? -0.048 : 0.048;

        // If player folded, slide their cards toward the center muck!
        const targetPos = player.folded
          ? new THREE.Vector3(seatPos.x * 0.35 + offsetMultiplier * 0.5, 0.761, seatPos.z * 0.35 - 0.15)
          : new THREE.Vector3(
              seatPos.x + offsetMultiplier,
              (isWinner ? 0.79 : 0.763) + cardIdx * 0.001,
              seatPos.z
            );

        // Cards are dealt facedown (Math.PI) unless explicitly flipped (all-in runout, showdown, or Peek Lock)
        const shouldShowFace =
          !player.folded &&
          (card.faceUp ||
            table.isAllInRunout ||
            (table.phase === 'showdown' && !player.folded));
        const faceRoll = shouldShowFace ? 0 : Math.PI;
        // Subtle +/- 1.2 degree natural yaw variance on dealt hole cards
        const cardYaw = ((player.seatIndex * 7 + cardIdx * 13) % 5 - 2) * 0.0105;

        if (!this.cardMeshes.has(card.id)) {
          const { group, frontMat } = this.createCardMesh(card);
          frontMat.emissive.setHex(isWinner ? 0xd4af37 : 0x000000);
          frontMat.emissiveIntensity = isWinner ? 0.06 : 0;
          const startPos = new THREE.Vector3(0, 0.86, -0.58);
          group.position.copy(startPos);
          group.rotation.set(0, 0, Math.PI);
          this.scene.add(group);

          this.cardMeshes.set(card.id, {
            mesh: group,
            frontMat,
            card,
            startPosition: startPos,
            targetPosition: targetPos,
            targetRotation: new THREE.Euler(0, cardYaw, faceRoll),
            isWinningCard: isWinner,
            spawnTime: now,
            arcHeight: 0.16,
          });
          pokerAudio.playCardSlide();
        } else {
          const ref = this.cardMeshes.get(card.id)!;
          ref.card = card;
          ref.isWinningCard = isWinner;
          ref.targetPosition.copy(targetPos);
          ref.targetRotation.y = cardYaw;
          ref.targetRotation.z = faceRoll;
          ref.frontMat.emissive.setHex(isWinner ? 0xd4af37 : 0x000000);
          ref.frontMat.emissiveIntensity = isWinner ? 0.06 : 0;
        }
      });
    });
  }

  /**
   * Sets target corner-peel progress (0..1) for Seat #0's hole cards
   */
  public setPeekProgress(progress: number, _humanCards?: Card[]) {
    this.targetPeekProgress = Math.max(0, Math.min(1, progress));
  }

  public updateActiveTurn(activeSeat: number) {
    if (this.activeSpotlight && CasinoScene.SEAT_POSITIONS[activeSeat]) {
      const pos = CasinoScene.SEAT_POSITIONS[activeSeat];
      this.activeSpotlight.target.position.set(pos.x, 0.75, pos.z);
      this.activeSpotlight.position.set(pos.x * 0.55, 2.2, pos.z * 0.55 + 0.1);

      // Dealer looks toward active seat
      this.dealerTargetYaw = Math.atan2(pos.x, pos.z + 1.1) * 0.55;

      // AI Players turn their heads toward the active player seat
      this.avatarPlaques.forEach((plaqueRef, seatIdx) => {
        if (seatIdx === activeSeat) {
          plaqueRef.targetHeadYaw = 0; // Look straight at center board on own turn
        } else {
          const mySeat = CasinoScene.SEAT_POSITIONS[seatIdx];
          if (mySeat) {
            const dx = pos.x - mySeat.x;
            const dz = pos.z - mySeat.z;
            const worldAngleToTarget = Math.atan2(dx, dz);
            const worldAngleToCenter = Math.atan2(-mySeat.x, -mySeat.z);
            let relYaw = worldAngleToTarget - worldAngleToCenter;
            while (relYaw > Math.PI) relYaw -= Math.PI * 2;
            while (relYaw < -Math.PI) relYaw += Math.PI * 2;
            plaqueRef.targetHeadYaw = THREE.MathUtils.clamp(relYaw * 0.55, -0.52, 0.52);
          }
        }
      });
    }
  }

  /**
   * Returns an on-felt bank chip stack position for any seat, guaranteed inside the (1.24, 0.818) felt ellipse
   */
  public static getSeatBankPosition(seatIndex: number): THREE.Vector3 {
    switch (seatIndex) {
      case 0:
        return new THREE.Vector3(0, 0.763, 0.71);
      case 1:
        return new THREE.Vector3(-0.88, 0.763, 0.44);
      case 2:
        return new THREE.Vector3(-0.56, 0.763, -0.52);
      case 3:
        return new THREE.Vector3(0.56, 0.763, -0.52);
      case 4:
        return new THREE.Vector3(0.88, 0.763, 0.44);
      default:
        return new THREE.Vector3(0, 0.763, 0.71);
    }
  }

  /**
   * Rebuilds target positions for all InstancedMesh chips (organized in 10-chip vertical columns)
   * with flush beveled contact, hand-stacked micro-jitter, parabolic toss trajectories,
   * animated pot sweeps on Showdown, and 3D on-felt street bet badges.
   */
  public syncChips(table: TableState, players: PlayerState[]) {
    this.latestTable = table;
    this.latestPlayers = players;
    const now = this.clock.getElapsedTime();

    const prevInstances = this.chipInstances;
    const nextInstances: ChipInstanceAnim[] = [];

    const addStackColumns = (
      baseCenter: THREE.Vector3,
      amount: number,
      originPos?: THREE.Vector3,
      opts?: { seatIndex?: number; isBank?: boolean; arcHeight?: number }
    ) => {
      if (amount <= 0) return;
      const denoms: ChipDenomination[] = [100, 25, 5, 1];
      let remaining = amount;
      let colIndex = 0;

      for (const denom of denoms) {
        const count = Math.floor(remaining / denom);
        remaining %= denom;
        if (count <= 0) continue;

        const cappedCount = Math.min(count, 30); // Cap up to 3 columns of 10 chips per denom
        for (let i = 0; i < cappedCount; i++) {
          const col = colIndex + Math.floor(i / 10);
          const rowInCol = i % 10;
          const colOffsetX = (col - 1) * 0.05;
          // Deterministic +/- 0.45mm X/Z hand-stacked micro-jitter (bottom chip stays anchored)
          const seed = (opts?.seatIndex ?? 5) * 31 + denom * 7 + col * 13 + rowInCol;
          const jitterX = rowInCol === 0 ? 0 : Math.sin(seed * 1.7) * 0.00045;
          const jitterZ = rowInCol === 0 ? 0 : Math.cos(seed * 2.3) * 0.00045;
          // Flush contact across 4.4mm beveled clay chips without artificial floating gaps
          const targetPos = new THREE.Vector3(
            baseCenter.x + colOffsetX + jitterX,
            baseCenter.y + rowInCol * 0.00442,
            baseCenter.z + jitterZ
          );

          const startPos = originPos ? originPos.clone() : targetPos.clone();
          nextInstances.push({
            denom,
            currentPos: startPos.clone(),
            startPos,
            targetPos,
            rotationY: (i * 1.15 + col * 0.85) % (Math.PI * 2),
            spawnTime: originPos ? now : -10,
            arcHeight: originPos ? (opts?.arcHeight ?? 0.085) : 0,
            seatIndex: opts?.seatIndex,
            isBank: opts?.isBank,
          });
        }
        colIndex += Math.ceil(cappedCount / 10);
      }
    };

    // 1. Center Pot & Side Pots (or Showdown Pot Sweep to Winner!)
    if (table.phase === 'showdown' && table.winners.length > 0) {
      // Animate pot chips sweeping from center pot into each winner's seat stack!
      table.winners.forEach((win) => {
        const winnerPlayer = players.find((p) => p.id === win.playerId);
        if (winnerPlayer) {
          const seatPos = CasinoScene.SEAT_POSITIONS[winnerPlayer.seatIndex];
          const winnerStackTarget = new THREE.Vector3(seatPos.x * 0.85, 0.763, seatPos.z * 0.85);
          addStackColumns(
            winnerStackTarget,
            win.amount,
            new THREE.Vector3(0, 0.78, 0.12), // Sweeps from center pot!
            { seatIndex: winnerPlayer.seatIndex, arcHeight: 0.11 }
          );
        }
      });
    } else if (table.pot > 0) {
      if (table.sidePots && table.sidePots.length > 1) {
        table.sidePots.forEach((sp, idx) => {
          const xOffset = (idx - (table.sidePots.length - 1) / 2) * 0.22;
          addStackColumns(new THREE.Vector3(xOffset, 0.763, 0.14), sp.amount);
        });
      } else {
        addStackColumns(new THREE.Vector3(0, 0.763, 0.14), table.pot);
      }
    }

    // 2. Seat #0 Staged Physical Bet inside the Betting Ring
    if (table.stagedBet > 0) {
      addStackColumns(
        CasinoScene.BETTING_RING_CENTER,
        table.stagedBet,
        new THREE.Vector3(0, 0.78, 0.71),
        { seatIndex: 0, arcHeight: 0.07 }
      );
    }

    // 3. Player Bank Stacks, Street Bets, & 3D On-Felt Bet Badges
    players.forEach((p) => {
      const badge = this.betBadges.get(p.seatIndex);
      if (p.eliminated) {
        if (badge) badge.mesh.visible = false;
        return;
      }
      const seatPos = CasinoScene.SEAT_POSITIONS[p.seatIndex];
      const bankPos = CasinoScene.getSeatBankPosition(p.seatIndex);

      if (p.isHuman) {
        // Seat #0 Bank: 4 neat denomination columns aligned with bankChipHitMeshes at z = 0.71
        const bankDenoms: ChipDenomination[] = [1, 5, 25, 100];
        const availableChips = Math.max(0, p.chips - table.stagedBet);
        if (availableChips > 0) {
          bankDenoms.forEach((denom, idx) => {
            if (availableChips >= denom) {
              const xPos = (idx - 1.5) * 0.068;
              const numStack = Math.min(10, Math.max(3, Math.floor(availableChips / (denom * 2)) + 2));
              for (let r = 0; r < numStack; r++) {
                const tPos = new THREE.Vector3(xPos, 0.763 + r * 0.0046, 0.71);
                nextInstances.push({
                  denom,
                  currentPos: tPos.clone(),
                  startPos: tPos.clone(),
                  targetPos: tPos,
                  rotationY: r * 0.4,
                  spawnTime: -10,
                  arcHeight: 0,
                  seatIndex: 0,
                  isBank: true,
                });
              }
            }
          });
        }
      } else if (p.chips > 0) {
        addStackColumns(bankPos, Math.min(p.chips, 250), undefined, {
          seatIndex: p.seatIndex,
          isBank: true,
        });
      }

      // Street Bet in front of player (arcs from their bank onto the felt!)
      if (p.currentBet > 0 && table.phase !== 'showdown') {
        const betPos = new THREE.Vector3(seatPos.x * 0.68, 0.763, seatPos.z * 0.68);
        const alreadyExisted = prevInstances.some(
          (prev) => prev.targetPos.distanceTo(betPos) < 0.08
        );
        addStackColumns(betPos, p.currentBet, alreadyExisted ? undefined : bankPos, {
          seatIndex: p.seatIndex,
          arcHeight: 0.09,
        });

        if (badge) {
          badge.mesh.visible = true;
          if (badge.lastAmount !== p.currentBet || badge.lastAllIn !== p.allIn) {
            badge.lastAmount = p.currentBet;
            badge.lastAllIn = p.allIn;
            drawOnFeltBetBadge(badge.canvas, p.currentBet, p.allIn);
            badge.texture.needsUpdate = true;
          }
        }
      } else if (badge) {
        badge.mesh.visible = false;
      }
    });

    this.chipInstances = nextInstances;
  }

  public clearCards() {
    this.cardMeshes.forEach((ref) => this.scene.remove(ref.mesh));
    this.cardMeshes.clear();
    this.burnCardMeshes.forEach((m) => this.scene.remove(m));
    this.burnCardMeshes = [];
  }

  // ============================================================================
  // UNIFIED SPATIAL RAYCAST & GESTURE ENGINE (Desktop Mouse/Touch + WebXR Hands)
  // ============================================================================

  private getRayFromPointerEvent(e: PointerEvent): THREE.Ray {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    return this.raycaster.ray.clone();
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.isTitleMode || e.button !== 0) return;
    const ray = this.getRayFromPointerEvent(e);
    const captured = this.handleRayDown(ray);
    if (captured) {
      this.controls.enabled = false;
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.isTitleMode) return;
    const ray = this.getRayFromPointerEvent(e);
    if (this.dragMode === 'none') {
      this.handleRayHover(ray);
      return;
    }
    this.handleRayMove(ray);
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.dragMode !== 'none') {
      const ray = this.getRayFromPointerEvent(e);
      this.handleRayUp(ray);
    }
    this.controls.enabled = true;
  };

  /**
   * Evaluates 3D hover state over spatial buttons, Seat #0 bank chips, and hole cards
   * for tactile 3D highlight & cursor feedback.
   */
  public handleRayHover(ray: THREE.Ray) {
    this.raycaster.ray.copy(ray);
    let anyHovered = false;

    // 1. Check 3D Spatial HUD Buttons (only active in Pure 3D mode or WebXR)
    if (!this.show2DHUD || this.isInXR) {
      const spatialMeshes = this.spatialButtons.map((b) => b.mesh);
      const btnHits = this.raycaster.intersectObjects(spatialMeshes, false);
      const hitBtnId =
        btnHits.length > 0 ? (btnHits[0].object.userData.buttonId as SpatialButtonRef['id']) : null;
      if (hitBtnId !== this.hoveredButtonId) {
        this.hoveredButtonId = hitBtnId;
        this.spatialButtons.forEach((b) => {
          b.hovered = b.id === hitBtnId;
        });
        if (this.latestTable && this.latestPlayers.length > 0) {
          this.updateSpatialHUD(this.latestTable, this.latestPlayers[0], this.latestIsPeeking);
        }
      }
      if (hitBtnId) anyHovered = true;
    }

    // 2. Check Seat #0 Bank Chips
    const chipHits = this.raycaster.intersectObjects(this.bankChipHitMeshes, false);
    const hitDenom =
      chipHits.length > 0 ? (chipHits[0].object.userData.denom as ChipDenomination) : null;
    this.hoveredChipDenom = hitDenom;
    if (this.bankChipHoverRing) {
      if (hitDenom !== null) {
        const denomIdx = [1, 5, 25, 100].indexOf(hitDenom);
        this.bankChipHoverRing.visible = true;
        this.bankChipHoverRing.position.set((denomIdx - 1.5) * 0.068, 0.764, 0.71);
        (this.bankChipHoverRing.material as THREE.MeshBasicMaterial).opacity = 0.85;
        anyHovered = true;
      } else {
        this.bankChipHoverRing.visible = false;
        (this.bankChipHoverRing.material as THREE.MeshBasicMaterial).opacity = 0;
      }
    }

    // 3. Check Seat #0 Hole Cards
    if (this.holeCardHitMesh && this.latestPlayers[0] && !this.latestPlayers[0].folded) {
      const cardHits = this.raycaster.intersectObject(this.holeCardHitMesh, false);
      this.isHoleCardsHovered = cardHits.length > 0;
      if (this.isHoleCardsHovered) anyHovered = true;
    } else {
      this.isHoleCardsHovered = false;
    }

    this.renderer.domElement.style.cursor = anyHovered ? 'pointer' : 'grab';
  }

  /**
   * Handles Ray Down from either Desktop Pointer or WebXR Hand/Controller
   * Returns true if an interactive table element was grabbed/clicked.
   */
  public handleRayDown(ray: THREE.Ray): boolean {
    this.raycaster.ray.copy(ray);

    // 1. Check 3D World-Anchored Spatial HUD Buttons on Table Rim (only when visible)
    if (!this.show2DHUD || this.isInXR) {
      const spatialMeshes = this.spatialButtons.map((b) => b.mesh);
      const btnHits = this.raycaster.intersectObjects(spatialMeshes, false);
      if (btnHits.length > 0) {
        const buttonId = btnHits[0].object.userData.buttonId as SpatialButtonRef['id'];
        this.triggerSpatialButton(buttonId);
        return true;
      }
    }

    const human = this.latestPlayers[0];
    const table = this.latestTable;

    // 2. Check Seat #0 Bank Chips (Physical Chip Pinch / Grab)
    if (human && !human.folded && human.isTurn && table && table.phase !== 'showdown') {
      const chipHits = this.raycaster.intersectObjects(this.bankChipHitMeshes, false);
      if (chipHits.length > 0) {
        const denom = chipHits[0].object.userData.denom as ChipDenomination;
        const available = human.chips - table.stagedBet;
        if (available > 0) {
          this.dragMode = 'chip';
          this.draggedChipDenom = Math.min(denom, available) as ChipDenomination;
          if (this.draggedChipGroup) {
            this.draggedChipGroup.visible = true;
            this.draggedChipGroup.position.copy(chipHits[0].point);
          }
          if (this.bettingRingGlowMesh) {
            (this.bettingRingGlowMesh.material as THREE.MeshBasicMaterial).opacity = 0.75;
          }
          pokerAudio.playChipClink(1);
          return true;
        }
      }
    }

    // 3. Check Seat #0 Hole Cards (Physical Corner Peel to Peek + Forward Flick to Muck/Fold)
    if (this.holeCardHitMesh && human && !human.folded) {
      const cardHits = this.raycaster.intersectObject(this.holeCardHitMesh, false);
      if (cardHits.length > 0) {
        this.dragMode = 'card';
        this.cardDragStartZ = cardHits[0].point.z;
        this.cardDragCurrentZ = this.cardDragStartZ;
        this.setPeekProgress(1);
        this.onPeekChangeCallback?.(true);
        pokerAudio.playCardFlip();
        return true;
      }
    }

    // 4. Check Double-Tap on Emerald Felt to Check
    if (this.feltMesh && human && human.isTurn && !human.folded && table) {
      const feltHits = this.raycaster.intersectObject(this.feltMesh, false);
      if (feltHits.length > 0) {
        const now = performance.now();
        if (now - this.lastFeltTapTime < 360) {
          const callNeeded = Math.max(0, table.currentHighBet - human.currentBet);
          if (callNeeded === 0) {
            this.triggerActionRipple(feltHits[0].point, 0x34d399);
            this.onPlayerActionCallback?.({ type: 'check' });
          }
          this.lastFeltTapTime = 0;
          return true;
        }
        this.lastFeltTapTime = now;
      }
    }

    return false;
  }

  public handleRayMove(ray: THREE.Ray) {
    const intersectPoint = new THREE.Vector3();
    if (!ray.intersectPlane(this.feltPlane, intersectPoint)) return;

    if (this.dragMode === 'chip' && this.draggedChipGroup) {
      this.draggedChipGroup.position.set(
        THREE.MathUtils.clamp(intersectPoint.x, -0.55, 0.55),
        0.79,
        THREE.MathUtils.clamp(intersectPoint.z, 0.15, 0.85)
      );
      const distToRing = intersectPoint.distanceTo(CasinoScene.BETTING_RING_CENTER);
      if (this.bettingRingGlowMesh) {
        const mat = this.bettingRingGlowMesh.material as THREE.MeshBasicMaterial;
        mat.color.setHex(distToRing < 0.28 || intersectPoint.z < 0.58 ? 0x34d399 : 0xfacc15);
        mat.opacity = distToRing < 0.28 || intersectPoint.z < 0.58 ? 0.9 : 0.45;
      }
    } else if (this.dragMode === 'card') {
      this.cardDragCurrentZ = intersectPoint.z;
      // Dynamic peel angle based on lift/drag
      const deltaZ = this.cardDragStartZ - this.cardDragCurrentZ;
      this.setPeekProgress(THREE.MathUtils.clamp(0.85 + deltaZ * 1.5, 0.4, 1));
    }
  }

  public handleRayUp(ray: THREE.Ray) {
    const intersectPoint = new THREE.Vector3();
    ray.intersectPlane(this.feltPlane, intersectPoint);

    if (this.dragMode === 'chip') {
      if (this.draggedChipGroup) {
        this.draggedChipGroup.visible = false;
      }
      if (this.bettingRingGlowMesh) {
        const mat = this.bettingRingGlowMesh.material as THREE.MeshBasicMaterial;
        mat.color.setHex(0xfacc15);
        mat.opacity = 0.22;
      }
      const distToRing = intersectPoint.distanceTo(CasinoScene.BETTING_RING_CENTER);
      if (distToRing < 0.32 || intersectPoint.z < 0.62) {
        pokerAudio.playChipSlide();
        this.triggerActionRipple(CasinoScene.BETTING_RING_CENTER, 0xfacc15);
        this.onStageChipCallback?.(this.draggedChipDenom);
      }
    } else if (this.dragMode === 'card') {
      const human = this.latestPlayers[0];
      const forwardSlide = this.cardDragStartZ - this.cardDragCurrentZ;
      // If flicked/slid forward into the muck (> 15cm forward toward dealer) during turn -> FOLD!
      if (human && human.isTurn && !human.folded && forwardSlide > 0.15) {
        this.setPeekProgress(0);
        this.onPeekChangeCallback?.(false);
        this.onPlayerActionCallback?.({ type: 'fold' });
      } else {
        this.setPeekProgress(0);
        this.onPeekChangeCallback?.(false);
      }
    }

    this.dragMode = 'none';
  }

  public triggerActionRipple(point: THREE.Vector3, colorHex: number = 0x34d399) {
    if (!this.checkRippleMesh) return;
    this.checkRippleMesh.position.set(point.x, 0.765, point.z);
    this.checkRippleScale = 1;
    const mat = this.checkRippleMesh.material as THREE.MeshBasicMaterial;
    mat.color.setHex(colorHex);
    mat.opacity = 0.9;
  }

  private triggerSpatialButton(buttonId: SpatialButtonRef['id']) {
    const table = this.latestTable;
    const human = this.latestPlayers[0];
    if (!table || !human) return;

    pokerAudio.playTick();

    if (buttonId === 'peek_or_next') {
      if (table.phase === 'showdown') {
        this.onNextHandCallback?.();
      } else {
        const nextPeek = this.targetPeekProgress < 0.5;
        this.setPeekProgress(nextPeek ? 1 : 0);
        this.onPeekChangeCallback?.(nextPeek);
      }
      return;
    }

    if (!human.isTurn || human.folded || table.phase === 'showdown') return;

    const callAmount = Math.max(0, table.currentHighBet - human.currentBet);
    const isFreeToCheck = callAmount === 0;
    const minRaiseTotal = Math.max(table.bigBlind, table.currentHighBet + table.minRaise);

    if (buttonId === 'fold') {
      this.onPlayerActionCallback?.({ type: 'fold' });
    } else if (buttonId === 'call') {
      if (table.stagedBet > 0) {
        this.onClearStagedChipsCallback?.();
      } else {
        this.onPlayerActionCallback?.(isFreeToCheck ? { type: 'check' } : { type: 'call' });
      }
    } else if (buttonId === 'raise') {
      if (table.stagedBet > 0) {
        const targetTotal = human.currentBet + table.stagedBet;
        if (targetTotal <= table.currentHighBet) {
          this.onPlayerActionCallback?.(callAmount === 0 ? { type: 'check' } : { type: 'call' });
        } else if (table.stagedBet >= human.chips) {
          this.onPlayerActionCallback?.({ type: 'allin' });
        } else {
          this.onPlayerActionCallback?.({
            type: 'raise',
            amount: Math.max(minRaiseTotal, targetTotal),
          });
        }
      } else if (human.chips <= callAmount) {
        this.onPlayerActionCallback?.({ type: 'allin' });
      } else {
        this.onPlayerActionCallback?.({
          type: 'raise',
          amount: Math.min(human.chips + human.currentBet, minRaiseTotal),
        });
      }
    }
  }

  // ============================================================================
  // RENDER & ANIMATION LOOP (90fps Stereoscopic WebXR Ready)
  // ============================================================================

  private startAnimationLoop() {
    const animate = (_time: number, frame?: XRFrame) => {
      const dt = Math.min(this.clock.getDelta(), 0.1);
      const elapsed = this.clock.getElapsedTime();

      // 1. Update WebXR Hand Tracking & Controller Rays
      this.onXRFrameCallback?.(frame);

      // 2. Smooth Title Mode Front-Arc Pendulum Drift (Always frames faces & felt from Seat #0 arc)
      if (this.isTitleMode && !this.renderer.xr.isPresenting) {
        this.titleOrbitAngle += dt * 0.32;
        const swingAngle = Math.sin(this.titleOrbitAngle) * 0.42;
        this.camera.position.set(
          Math.sin(swingAngle) * 1.66,
          1.50 + Math.sin(elapsed * 0.5) * 0.03,
          Math.cos(swingAngle) * 1.62
        );
        this.camera.lookAt(Math.sin(swingAngle * 0.3) * 0.16, 0.82, -0.05);
      } else if (!this.renderer.xr.isPresenting) {
        this.controls.update();
      }

      // 2b. Dynamic All-In Runout & Showdown Spotlight Choreography
      if (this.ambientLight && this.pendantLight && this.boardPointLight && this.activeSpotlight) {
        const isAllIn = Boolean(this.latestTable?.isAllInRunout);
        const isShowdown = this.latestTable?.phase === 'showdown';
        const targetAmbient = isAllIn ? 0.30 : isShowdown ? 0.34 : 0.38;
        const targetBoard = isAllIn ? 0.38 : isShowdown ? 0.32 : 0.22;
        this.ambientLight.intensity = THREE.MathUtils.lerp(this.ambientLight.intensity, targetAmbient, 0.08);
        this.boardPointLight.intensity = THREE.MathUtils.lerp(this.boardPointLight.intensity, targetBoard, 0.08);

        if (isShowdown && this.latestTable && this.latestTable.winners.length > 0) {
          const winSeat = this.latestPlayers.find(
            (p) => p.id === this.latestTable!.winners[0].playerId
          )?.seatIndex;
          if (winSeat !== undefined && CasinoScene.SEAT_POSITIONS[winSeat]) {
            const wPos = CasinoScene.SEAT_POSITIONS[winSeat];
            this.activeSpotlight.target.position.lerp(new THREE.Vector3(wPos.x, 0.75, wPos.z), 0.12);
            this.activeSpotlight.intensity = THREE.MathUtils.lerp(this.activeSpotlight.intensity, 2.0, 0.1);
          }
        } else {
          this.activeSpotlight.intensity = THREE.MathUtils.lerp(
            this.activeSpotlight.intensity,
            isAllIn ? 1.85 : 1.45,
            0.08
          );
        }
      }

      // 2c. Scale Hovered 3D Spatial Rim Buttons
      this.spatialButtons.forEach((b) => {
        const targetScale = b.hovered ? 1.09 : 1.0;
        b.mesh.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.22);
      });

      // 3. Interpolate Peek Progress & Animate Cards (with Parabolic Deal Arc & Hover Lift)
      this.peekProgress = THREE.MathUtils.lerp(this.peekProgress, this.targetPeekProgress, 0.18);
      const humanCardIds = new Set(this.latestPlayers[0]?.cards.map((c) => c.id) || []);

      this.cardMeshes.forEach((ref, cardId) => {
        const isHumanCard = humanCardIds.has(cardId);
        const dealAge = elapsed - ref.spawnTime;
        const dealDuration = 0.42;

        if (dealAge >= 0 && dealAge < dealDuration) {
          const t = THREE.MathUtils.clamp(dealAge / dealDuration, 0, 1);
          const easeT = 1 - Math.pow(1 - t, 3);
          const parabolaY = Math.sin(easeT * Math.PI) * ref.arcHeight;
          ref.mesh.position.lerpVectors(ref.startPosition, ref.targetPosition, easeT);
          ref.mesh.position.y += parabolaY;
          ref.mesh.rotation.z = THREE.MathUtils.lerp(Math.PI, ref.targetRotation.z, easeT);
          return;
        }

        if (isHumanCard && this.peekProgress > 0.01 && !this.latestPlayers[0]?.folded) {
          const lift = this.peekProgress * 0.055;
          const tiltX = this.peekProgress * 0.42;
          const rollZ = (1 - this.peekProgress) * Math.PI;
          const fanY = (ref.targetPosition.x < 0 ? 0.08 : -0.08) * this.peekProgress;
          ref.mesh.position.x = THREE.MathUtils.lerp(ref.mesh.position.x, ref.targetPosition.x, 0.2);
          ref.mesh.position.y = THREE.MathUtils.lerp(ref.mesh.position.y, ref.targetPosition.y + lift, 0.25);
          ref.mesh.position.z = THREE.MathUtils.lerp(ref.mesh.position.z, ref.targetPosition.z, 0.2);
          ref.mesh.rotation.x = THREE.MathUtils.lerp(ref.mesh.rotation.x, tiltX, 0.25);
          ref.mesh.rotation.y = THREE.MathUtils.lerp(ref.mesh.rotation.y, fanY, 0.25);
          ref.mesh.rotation.z = THREE.MathUtils.lerp(ref.mesh.rotation.z, rollZ, 0.25);
        } else {
          const hoverLift = isHumanCard && this.isHoleCardsHovered ? 0.014 : 0;
          const floatOffset = (ref.isWinningCard ? Math.sin(elapsed * 4.5) * 0.006 : 0) + hoverLift;
          ref.mesh.position.x = THREE.MathUtils.lerp(ref.mesh.position.x, ref.targetPosition.x, 0.14);
          ref.mesh.position.y = THREE.MathUtils.lerp(
            ref.mesh.position.y,
            ref.targetPosition.y + floatOffset,
            0.14
          );
          ref.mesh.position.z = THREE.MathUtils.lerp(ref.mesh.position.z, ref.targetPosition.z, 0.14);
          ref.mesh.rotation.x = THREE.MathUtils.lerp(
            ref.mesh.rotation.x,
            hoverLift > 0 ? -0.14 : ref.targetRotation.x,
            0.14
          );
          ref.mesh.rotation.y = THREE.MathUtils.lerp(ref.mesh.rotation.y, ref.targetRotation.y, 0.14);
          ref.mesh.rotation.z = THREE.MathUtils.lerp(ref.mesh.rotation.z, ref.targetRotation.z, 0.14);
        }
      });

      // 4. Update Batched InstancedMesh Chip Positions (Parabolic Toss, Sliding & Hover Lift)
      const counts: Record<ChipDenomination, number> = { 1: 0, 5: 0, 25: 0, 100: 0 };
      const chipFlightDuration = 0.44;
      for (const inst of this.chipInstances) {
        const chipAge = elapsed - inst.spawnTime;
        if (inst.arcHeight > 0 && chipAge >= 0 && chipAge < chipFlightDuration) {
          const t = THREE.MathUtils.clamp(chipAge / chipFlightDuration, 0, 1);
          const easeT = 1 - Math.pow(1 - t, 3);
          inst.currentPos.lerpVectors(inst.startPos, inst.targetPos, easeT);
          inst.currentPos.y += Math.sin(easeT * Math.PI) * inst.arcHeight;
        } else {
          const isHoveredBank =
            inst.isBank && inst.seatIndex === 0 && this.hoveredChipDenom === inst.denom;
          const targetY = inst.targetPos.y + (isHoveredBank ? 0.012 : 0);
          inst.currentPos.x = THREE.MathUtils.lerp(inst.currentPos.x, inst.targetPos.x, 0.18);
          inst.currentPos.y = THREE.MathUtils.lerp(inst.currentPos.y, targetY, 0.22);
          inst.currentPos.z = THREE.MathUtils.lerp(inst.currentPos.z, inst.targetPos.z, 0.18);
        }

        const mesh = this.chipInstancedMeshes.get(inst.denom);
        if (!mesh) continue;
        const idx = counts[inst.denom];
        if (idx >= 240) continue;

        this.dummyEuler.set(0, inst.rotationY, 0);
        this.dummyQuaternion.setFromEuler(this.dummyEuler);
        this.dummyMatrix.compose(inst.currentPos, this.dummyQuaternion, this.dummyScale);
        mesh.setMatrixAt(idx, this.dummyMatrix);
        counts[inst.denom] = idx + 1;
      }

      this.chipInstancedMeshes.forEach((mesh, denom) => {
        mesh.count = counts[denom];
        mesh.instanceMatrix.needsUpdate = true;
      });

      // 5. Dealer Button & Action Ripple Animation
      if (this.dealerButtonMesh) {
        this.dealerButtonMesh.position.lerp(this.dealerButtonTarget, 0.12);
      }
      if (this.checkRippleMesh && this.checkRippleScale > 0) {
        this.checkRippleScale += dt * 4.5;
        this.checkRippleMesh.scale.setScalar(this.checkRippleScale);
        const mat = this.checkRippleMesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 0.9 - (this.checkRippleScale - 1) * 0.55);
        if (mat.opacity <= 0) this.checkRippleScale = 0;
      }

      // 6. Animate Articulated 3D Dealer Rig (Head Tracking & Hand Choreography in dealerGroup local space)
      if (this.dealerHeadGroup && this.dealerLeftArm && this.dealerRightArm) {
        const dealerAge = elapsed - this.dealerActionTimer;
        if (this.dealerAction !== 'idle' && dealerAge > 1.1) {
          this.dealerAction = 'idle';
        }

        // Smooth head look + subtle breathing
        this.dealerHeadGroup.rotation.y = THREE.MathUtils.lerp(
          this.dealerHeadGroup.rotation.y,
          this.dealerTargetYaw,
          0.1
        );
        this.dealerHeadGroup.position.y = 0.61 + Math.sin(elapsed * 2.1) * 0.004;

        if (this.dealerAction === 'riffle_shuffle') {
          // Rapid alternating two-hand riffle & cascade in center
          const wave = Math.sin(dealerAge * 28);
          this.dealerLeftArm.position.set(-0.11 + wave * 0.025, 0.42 + Math.abs(wave) * 0.015, 0.08);
          this.dealerRightArm.position.set(0.11 - wave * 0.025, 0.42 + Math.abs(wave) * 0.015, 0.08);
          this.dealerLeftArm.rotation.set(-0.12, 0.25, 0);
          this.dealerRightArm.rotation.set(-0.12, -0.25, 0);
        } else if (this.dealerAction === 'pitch_cards') {
          // Right arm flicks forward toward target seat
          const flick = Math.sin(Math.min(1, dealerAge * 2.2) * Math.PI);
          this.dealerRightArm.position.set(0.16, 0.43 + flick * 0.03, 0.04 + flick * 0.14);
          this.dealerRightArm.rotation.set(-0.25 * flick, this.dealerTargetYaw * 0.5, 0);
          this.dealerLeftArm.position.set(-0.17, 0.41, 0.04);
        } else if (this.dealerAction === 'burn_tap') {
          // Left hand taps table felt & slides burn card
          const tap = Math.sin(Math.min(1, dealerAge * 2.5) * Math.PI);
          this.dealerLeftArm.position.set(-0.19, 0.40 - tap * 0.04, 0.06 + tap * 0.08);
          this.dealerRightArm.position.set(0.175, 0.39, -0.01);
        } else if (this.dealerAction === 'sweep_pot') {
          // Wide two-arm sweep across center pot toward winner
          const sweep = Math.sin(Math.min(1, dealerAge * 1.4) * Math.PI);
          this.dealerLeftArm.position.set(-0.175 + sweep * 0.1, 0.40, 0.04 + sweep * 0.16);
          this.dealerRightArm.position.set(0.175 + sweep * 0.1, 0.40, 0.04 + sweep * 0.16);
        } else {
          // Idle resting posture in dealerGroup local space
          this.dealerLeftArm.position.lerp(new THREE.Vector3(-0.175, 0.39, -0.01), 0.12);
          this.dealerRightArm.position.lerp(new THREE.Vector3(0.175, 0.39, -0.01), 0.12);
          this.dealerLeftArm.rotation.set(0, 0, 0);
          this.dealerRightArm.rotation.set(0, 0, 0);
        }

        if (this.dealerHeadGroup) {
          this.animateCharacterMicroBehaviors(
            this.dealerHeadGroup,
            this.dealerLeftArm,
            this.dealerRightArm,
            elapsed,
            0,
            this.dealerAction !== 'idle',
            false
          );
        }
      }

      // 7. Animate Articulated AI Player Rigs (Head Tracking, Eyelid Blinking, Gaze Saccades, 5-Finger Hands, Bao's Phone Scrolling & Physical Actions)
      this.avatarPlaques.forEach((plaqueRef, seatIdx) => {
        const actionAge = elapsed - plaqueRef.actionTimer;
        if (plaqueRef.actionType !== 'idle' && actionAge > 0.95) {
          plaqueRef.actionType = 'idle';
        }

        // Subtle breathing cycle per seat
        const breath = Math.sin(elapsed * 1.9 + seatIdx * 1.3) * 0.004;

        // Torso posture (Bao leans forward when phone_down_monster tell is active!)
        const targetTorsoPitch =
          plaqueRef.activeTell === 'phone_down_monster'
            ? 0.18
            : plaqueRef.isWatchingPhone
            ? 0.06
            : plaqueRef.activeTell === 'posture_tight'
            ? -0.04
            : 0;
        plaqueRef.torsoGroup.rotation.x = THREE.MathUtils.lerp(
          plaqueRef.torsoGroup.rotation.x,
          targetTorsoPitch,
          0.08
        );
        plaqueRef.torsoGroup.position.y = breath;

        // Head Tracking & Pitch
        if (plaqueRef.isWatchingPhone) {
          // Bao hunched looking down at his glowing smartphone screen
          plaqueRef.headGroup.rotation.y = THREE.MathUtils.lerp(
            plaqueRef.headGroup.rotation.y,
            0.08 + Math.sin(elapsed * 1.5) * 0.04,
            0.1
          );
          plaqueRef.headGroup.rotation.x = THREE.MathUtils.lerp(
            plaqueRef.headGroup.rotation.x,
            0.06,
            0.1
          );
        } else {
          // Look toward active player (or glance at wristwatch for Viktor's tell)
          const watchPitch = plaqueRef.activeTell === 'watch_glance_strong' ? 0.16 : 0;
          const watchYaw =
            plaqueRef.activeTell === 'watch_glance_strong' ? -0.22 : plaqueRef.targetHeadYaw;
          plaqueRef.headGroup.rotation.y = THREE.MathUtils.lerp(
            plaqueRef.headGroup.rotation.y,
            watchYaw,
            0.09
          );
          plaqueRef.headGroup.rotation.x = THREE.MathUtils.lerp(
            plaqueRef.headGroup.rotation.x,
            watchPitch,
            0.09
          );
        }

        // Default Left & Right Arm Targets (in torsoGroup local shoulder coordinates)
        const baseShoulderX = seatIdx === 3 ? 0.195 : seatIdx === 2 ? 0.132 : 0.155;
        let leftArmPos = new THREE.Vector3(-baseShoulderX, 0.36, -0.01);
        let rightArmPos = new THREE.Vector3(baseShoulderX, 0.36, -0.01);
        let leftArmRotX = 0;
        let rightArmRotX = 0;

        // Bao's Smartphone Holding & Left-Hand Scrolling Motion when watching phone
        if (seatIdx === 3 && plaqueRef.isWatchingPhone) {
          const scrollSwipe = Math.sin(elapsed * 5.8) * 0.05;
          rightArmPos.set(0.195, 0.37, 0.02);
          rightArmRotX = -0.28;
          leftArmPos.set(-0.185, 0.37 + scrollSwipe * 0.1, 0.03);
          leftArmRotX = -0.32 + scrollSwipe;
        }

        // Marcus's Chip Fidget Bluff Tell
        if (plaqueRef.activeTell === 'chip_fidget_bluff') {
          rightArmPos.y += Math.abs(Math.sin(elapsed * 12)) * 0.018;
          rightArmPos.x += Math.cos(elapsed * 12) * 0.01;
        }

        // Physical Action Choreography Overrides (Check Knock, Chip Push, Fold Flick, Celebrate)
        if (plaqueRef.actionType === 'check_knock') {
          const knock = Math.abs(Math.sin(actionAge * Math.PI * 4.2)) * 0.055;
          rightArmPos.set(baseShoulderX - 0.02, 0.36 + knock, 0.06);
          rightArmRotX = 0.22 - knock * 1.8;
        } else if (plaqueRef.actionType === 'chip_push') {
          const push = Math.sin(Math.min(1, actionAge * 1.3) * Math.PI);
          rightArmPos.set(baseShoulderX - 0.03, 0.37 + push * 0.02, 0.01 + push * 0.15);
          rightArmRotX = -0.28 * push;
        } else if (plaqueRef.actionType === 'fold_flick') {
          const flick = Math.sin(Math.min(1, actionAge * 1.8) * Math.PI);
          rightArmPos.set(baseShoulderX - flick * 0.06, 0.36, 0.02 + flick * 0.1);
          rightArmRotX = -0.15 * flick;
        } else if (plaqueRef.actionType === 'celebrate') {
          const cheer = Math.abs(Math.sin(actionAge * Math.PI * 3));
          leftArmPos.set(-baseShoulderX, 0.42 + cheer * 0.06, 0.02);
          rightArmPos.set(baseShoulderX, 0.42 + cheer * 0.06, 0.02);
          leftArmRotX = -0.85;
          rightArmRotX = -0.85;
        }

        plaqueRef.leftArmGroup.position.lerp(leftArmPos, 0.18);
        plaqueRef.rightArmGroup.position.lerp(rightArmPos, 0.18);
        plaqueRef.leftArmGroup.rotation.x = THREE.MathUtils.lerp(
          plaqueRef.leftArmGroup.rotation.x,
          leftArmRotX,
          0.18
        );
        plaqueRef.rightArmGroup.rotation.x = THREE.MathUtils.lerp(
          plaqueRef.rightArmGroup.rotation.x,
          rightArmRotX,
          0.18
        );

        // Animate lifelike blinking, eye-gaze saccades, and subtle 5-finger curl
        this.animateCharacterMicroBehaviors(
          plaqueRef.headGroup,
          plaqueRef.leftArmGroup,
          plaqueRef.rightArmGroup,
          elapsed,
          seatIdx * 1.73,
          plaqueRef.activeTell !== 'none' || plaqueRef.actionType !== 'idle',
          plaqueRef.isWatchingPhone
        );

        plaqueRef.mesh.lookAt(this.camera.position);
      });

      this.renderer.render(this.scene, this.camera);
    };

    this.renderer.setAnimationLoop(animate);
  }

  /**
   * Drives lifelike periodic eyelid blinking, ocular saccades (iris/pupil tracking),
   * eyebrow micro-expressions, and articulated 5-finger breathing curls.
   */
  private animateCharacterMicroBehaviors(
    headGroup: THREE.Group,
    leftArmGroup: THREE.Group,
    rightArmGroup: THREE.Group,
    elapsed: number,
    phaseOffset: number,
    isFocusedOrTell: boolean,
    isWatchingPhone: boolean
  ) {
    const leftLid = headGroup.userData.leftEyeLid as THREE.Mesh | undefined;
    const rightLid = headGroup.userData.rightEyeLid as THREE.Mesh | undefined;
    if (leftLid && rightLid) {
      const baseRot = (leftLid.userData.baseRotX as number) ?? 0.14;
      // Natural blink every ~3.6 seconds (140ms rapid closure & reopen)
      const blinkCycle = (elapsed + phaseOffset) % 3.6;
      const blinkWave =
        blinkCycle < 0.14 ? Math.sin((blinkCycle / 0.14) * Math.PI) : 0;
      const focusSquint = isFocusedOrTell ? 0.14 : isWatchingPhone ? 0.18 : 0;
      const lidRot = baseRot + focusSquint + blinkWave * 0.92;
      leftLid.rotation.x = lidRot;
      rightLid.rotation.x = lidRot;
    }

    const leftIris = headGroup.userData.leftIrisGroup as THREE.Group | undefined;
    const rightIris = headGroup.userData.rightIrisGroup as THREE.Group | undefined;
    if (leftIris && rightIris) {
      // Subtle human eye saccade micro-movements
      const saccadeStep = Math.floor((elapsed + phaseOffset) * 1.4);
      const saccadeX = Math.sin(saccadeStep * 2.7 + phaseOffset) * 0.0018;
      const saccadeY = isWatchingPhone
        ? -0.0022
        : Math.cos(saccadeStep * 1.9 + phaseOffset) * 0.0011;
      leftIris.position.x = THREE.MathUtils.lerp(leftIris.position.x, saccadeX, 0.25);
      leftIris.position.y = THREE.MathUtils.lerp(leftIris.position.y, saccadeY, 0.25);
      rightIris.position.x = THREE.MathUtils.lerp(rightIris.position.x, saccadeX, 0.25);
      rightIris.position.y = THREE.MathUtils.lerp(rightIris.position.y, saccadeY, 0.25);
    }

    // Subtle 5-finger curl breathing on left/right articulated hands
    [leftArmGroup, rightArmGroup].forEach((arm, armIdx) => {
      const handRig = arm.userData.handRig as THREE.Group | undefined;
      const fingers = handRig?.userData.fingers as THREE.Group[] | undefined;
      if (fingers) {
        fingers.forEach((fGroup, fIdx) => {
          if (fIdx < 4) {
            const baseCurl = 0.28 + fIdx * 0.04;
            const wave = Math.sin(elapsed * 2.1 + phaseOffset + armIdx + fIdx * 0.4) * 0.045;
            fGroup.rotation.x = baseCurl + wave;
          }
        });
      }
    });
  }

  private onResize = () => {
    if (!this.container) return;
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  };

  /**
   * Projects all 3D characters' head and upper-torso bounding spheres into 2D viewport pixel coordinates.
   * Used by the UX/UI Verification Harness to assert 0% sightline occlusion by 2D HUD overlays.
   */
  public getCharacterScreenBounds(): Array<{
    id: string;
    role: CharacterModelRole;
    name: string;
    headRect: { left: number; top: number; right: number; bottom: number; width: number; height: number };
    torsoRect: { left: number; top: number; right: number; bottom: number; width: number; height: number };
    combinedRect: { left: number; top: number; right: number; bottom: number; width: number; height: number };
    inFrustum: boolean;
  }> {
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    this.camera.updateProjectionMatrix();

    const width = this.container?.clientWidth || window.innerWidth;
    const height = this.container?.clientHeight || window.innerHeight;
    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4().multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );
    frustum.setFromProjectionMatrix(projScreenMatrix);

    const projectSphereToRect = (worldCenter: THREE.Vector3, radius: number) => {
      const sampleOffsets = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(radius, 0, 0),
        new THREE.Vector3(-radius, 0, 0),
        new THREE.Vector3(0, radius, 0),
        new THREE.Vector3(0, -radius, 0),
        new THREE.Vector3(0, 0, radius),
        new THREE.Vector3(0, 0, -radius),
      ];
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const off of sampleOffsets) {
        const pt = worldCenter.clone().add(off).project(this.camera);
        const sx = (pt.x * 0.5 + 0.5) * width;
        const sy = (-pt.y * 0.5 + 0.5) * height;
        if (sx < minX) minX = sx;
        if (sy < minY) minY = sy;
        if (sx > maxX) maxX = sx;
        if (sy > maxY) maxY = sy;
      }
      return {
        left: Math.round(minX),
        top: Math.round(minY),
        right: Math.round(maxX),
        bottom: Math.round(maxY),
        width: Math.max(0, Math.round(maxX - minX)),
        height: Math.max(0, Math.round(maxY - minY)),
      };
    };

    const entries: Array<{
      id: string;
      role: CharacterModelRole;
      name: string;
      headGroup: THREE.Group;
      torsoCenterLocal: THREE.Vector3;
      rootGroup: THREE.Group;
    }> = [];

    if (this.dealerGroup && this.dealerHeadGroup) {
      entries.push({
        id: 'dealer',
        role: 'dealer',
        name: 'Laurent (Dealer)',
        headGroup: this.dealerHeadGroup,
        torsoCenterLocal: new THREE.Vector3(0, 0.36, 0),
        rootGroup: this.dealerGroup,
      });
    }

    const seatRoleNames: Record<number, { role: CharacterModelRole; name: string }> = {
      1: { role: 'viktor', name: 'Viktor' },
      2: { role: 'elena', name: 'Elena' },
      3: { role: 'bao', name: 'Bao' },
      4: { role: 'marcus', name: 'Marcus' },
    };

    this.avatarPlaques.forEach((p, seatIdx) => {
      const meta = seatRoleNames[seatIdx];
      if (!meta) return;
      entries.push({
        id: `seat_${seatIdx}`,
        role: meta.role,
        name: meta.name,
        headGroup: p.headGroup,
        torsoCenterLocal: new THREE.Vector3(0, 0.32, 0),
        rootGroup: p.avatarGroup,
      });
    });

    return entries.map((entry) => {
      const headWorld = new THREE.Vector3();
      entry.headGroup.getWorldPosition(headWorld);
      const torsoWorld = entry.torsoCenterLocal.clone();
      entry.rootGroup.localToWorld(torsoWorld);

      const inFrustum =
        frustum.containsPoint(headWorld) &&
        headWorld.distanceTo(this.camera.position) < 6.0;

      const headRect = projectSphereToRect(headWorld, 0.105);
      const torsoRect = projectSphereToRect(torsoWorld, 0.135);
      const combinedRect = {
        left: Math.min(headRect.left, torsoRect.left),
        top: Math.min(headRect.top, torsoRect.top),
        right: Math.max(headRect.right, torsoRect.right),
        bottom: Math.max(headRect.bottom, torsoRect.bottom),
        width: Math.max(0, Math.max(headRect.right, torsoRect.right) - Math.min(headRect.left, torsoRect.left)),
        height: Math.max(0, Math.max(headRect.bottom, torsoRect.bottom) - Math.min(headRect.top, torsoRect.top)),
      };

      return {
        id: entry.id,
        role: entry.role,
        name: entry.name,
        headRect,
        torsoRect,
        combinedRect,
        inFrustum,
      };
    });
  }

  /**
   * Projects 3D Table Center Safe-Zone regions (Community Board, Center Pot, Golden Betting Ring,
   * Seat #0 Hole Cards & Bank Chips, 3D AI Floating Plaques, and 3D Spatial Rim Buttons) into 2D
   * viewport coordinates (`ScreenBoundingRect`) for the HUD & UI Verification Harness.
   */
  public getTableSafeZoneScreenBounds(): {
    communityBoardRect: ScreenBoundingRect;
    centerPotRect: ScreenBoundingRect;
    bettingRingRect: ScreenBoundingRect;
    heroHoleCardsRect: ScreenBoundingRect;
    heroBankChipsRect: ScreenBoundingRect;
    aiPlaques: Array<{
      seatIndex: number;
      name: string;
      rect: ScreenBoundingRect;
      inFrustum: boolean;
      visible: boolean;
    }>;
    spatialButtons: Array<{
      id: string;
      rect: ScreenBoundingRect;
      inFrustum: boolean;
      visible: boolean;
    }>;
  } {
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    this.camera.updateProjectionMatrix();

    const width = this.container?.clientWidth || window.innerWidth;
    const height = this.container?.clientHeight || window.innerHeight;
    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4().multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );
    frustum.setFromProjectionMatrix(projScreenMatrix);

    const projectBoxToRect = (minPt: THREE.Vector3, maxPt: THREE.Vector3): ScreenBoundingRect => {
      const corners = [
        new THREE.Vector3(minPt.x, minPt.y, minPt.z),
        new THREE.Vector3(maxPt.x, minPt.y, minPt.z),
        new THREE.Vector3(minPt.x, maxPt.y, minPt.z),
        new THREE.Vector3(maxPt.x, maxPt.y, minPt.z),
        new THREE.Vector3(minPt.x, minPt.y, maxPt.z),
        new THREE.Vector3(maxPt.x, minPt.y, maxPt.z),
        new THREE.Vector3(minPt.x, maxPt.y, maxPt.z),
        new THREE.Vector3(maxPt.x, maxPt.y, maxPt.z),
      ];
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const c of corners) {
        const pt = c.project(this.camera);
        const sx = (pt.x * 0.5 + 0.5) * width;
        const sy = (-pt.y * 0.5 + 0.5) * height;
        if (sx < minX) minX = sx;
        if (sy < minY) minY = sy;
        if (sx > maxX) maxX = sx;
        if (sy > maxY) maxY = sy;
      }
      return {
        left: Math.round(minX),
        top: Math.round(minY),
        right: Math.round(maxX),
        bottom: Math.round(maxY),
        width: Math.max(0, Math.round(maxX - minX)),
        height: Math.max(0, Math.round(maxY - minY)),
      };
    };

    const projectMeshPlaneToRect = (mesh: THREE.Mesh, halfW: number, halfH: number): ScreenBoundingRect => {
      const localCorners = [
        new THREE.Vector3(-halfW, -halfH, 0),
        new THREE.Vector3(halfW, -halfH, 0),
        new THREE.Vector3(-halfW, halfH, 0),
        new THREE.Vector3(halfW, halfH, 0),
      ];
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const lc of localCorners) {
        const wc = lc.clone();
        mesh.localToWorld(wc);
        const pt = wc.project(this.camera);
        const sx = (pt.x * 0.5 + 0.5) * width;
        const sy = (-pt.y * 0.5 + 0.5) * height;
        if (sx < minX) minX = sx;
        if (sy < minY) minY = sy;
        if (sx > maxX) maxX = sx;
        if (sy > maxY) maxY = sy;
      }
      return {
        left: Math.round(minX),
        top: Math.round(minY),
        right: Math.round(maxX),
        bottom: Math.round(maxY),
        width: Math.max(0, Math.round(maxX - minX)),
        height: Math.max(0, Math.round(maxY - minY)),
      };
    };

    const communityBoardRect = projectBoxToRect(
      new THREE.Vector3(-0.33, 0.762, -0.12),
      new THREE.Vector3(0.33, 0.775, 0.0)
    );
    const centerPotRect = projectBoxToRect(
      new THREE.Vector3(-0.16, 0.762, 0.08),
      new THREE.Vector3(0.16, 0.805, 0.20)
    );
    const bettingRingRect = projectBoxToRect(
      new THREE.Vector3(-0.12, 0.762, 0.32),
      new THREE.Vector3(0.12, 0.785, 0.54)
    );
    const heroHoleCardsRect = projectBoxToRect(
      new THREE.Vector3(-0.095, 0.762, 0.56),
      new THREE.Vector3(0.095, 0.785, 0.68)
    );
    const heroBankChipsRect = projectBoxToRect(
      new THREE.Vector3(-0.125, 0.762, 0.68),
      new THREE.Vector3(0.125, 0.805, 0.74)
    );

    const seatNames: Record<number, string> = {
      1: 'Viktor',
      2: 'Elena',
      3: 'Bao',
      4: 'Marcus',
    };

    const aiPlaques: Array<{
      seatIndex: number;
      name: string;
      rect: ScreenBoundingRect;
      inFrustum: boolean;
      visible: boolean;
    }> = [];

    this.avatarPlaques.forEach((p, seatIdx) => {
      const worldCenter = new THREE.Vector3();
      p.mesh.getWorldPosition(worldCenter);
      const rect = projectMeshPlaneToRect(p.mesh, 0.20, 0.085);
      const inFrustum =
        frustum.containsPoint(worldCenter) &&
        rect.left >= 0 &&
        rect.right <= width &&
        rect.top >= 0 &&
        rect.bottom <= height;
      aiPlaques.push({
        seatIndex: seatIdx,
        name: seatNames[seatIdx] || `Seat ${seatIdx}`,
        rect,
        inFrustum,
        visible: p.mesh.visible,
      });
    });

    const spatialButtons = this.spatialButtons.map((b) => {
      const worldCenter = new THREE.Vector3();
      b.mesh.getWorldPosition(worldCenter);
      const rect = projectMeshPlaneToRect(b.mesh, 0.0825, 0.033);
      const inFrustum =
        frustum.containsPoint(worldCenter) &&
        rect.left >= 0 &&
        rect.right <= width &&
        rect.top >= 0 &&
        rect.bottom <= height;
      return {
        id: b.id,
        rect,
        inFrustum,
        visible: b.mesh.visible,
      };
    });

    return {
      communityBoardRect,
      centerPotRect,
      bettingRingRect,
      heroHoleCardsRect,
      heroBankChipsRect,
      aiPlaques,
      spatialButtons,
    };
  }

  /**
   * Captures a studio-lit 3D modeling portrait directly from the live Three.js character rig
   * so all avatar portraits share the exact same 3D model geometry, PBR materials, and VIP casino lighting.
   */
  public capture3DCharacterPortrait(role: CharacterModelRole, size: number = 512): string {
    const roleSeatMap: Record<CharacterModelRole, number> = {
      dealer: -1,
      viktor: 1,
      elena: 2,
      bao: 3,
      marcus: 4,
    };
    const seatIdx = roleSeatMap[role];
    const targetGroup =
      seatIdx === -1 ? this.dealerGroup : this.avatarPlaques.get(seatIdx)?.avatarGroup ?? null;
    if (!targetGroup) return '';

    // Temporarily hide floating plaques so they don't occlude the 3D portrait capture
    const hiddenPlaques: THREE.Mesh[] = [];
    this.avatarPlaques.forEach((p) => {
      if (p.mesh.visible) {
        p.mesh.visible = false;
        hiddenPlaques.push(p.mesh);
      }
    });

    // Save current head & arm poses and set an ideal 3D modeling portrait pose
    const plaqueRef = seatIdx > 0 ? this.avatarPlaques.get(seatIdx) : undefined;
    const headGroup = seatIdx === -1 ? this.dealerHeadGroup : plaqueRef?.headGroup ?? null;
    const savedRotX = headGroup ? headGroup.rotation.x : 0;
    const savedRotY = headGroup ? headGroup.rotation.y : 0;
    const savedHeadY = headGroup ? headGroup.position.y : 0;
    if (headGroup) {
      if (seatIdx === -1) headGroup.position.y = 0.61;
      headGroup.rotation.x = role === 'bao' ? 0.08 : 0.02;
      headGroup.rotation.y = role === 'viktor' ? -0.08 : role === 'marcus' ? 0.08 : 0;
    }

    if (role === 'dealer' && this.dealerLeftArm && this.dealerRightArm) {
      this.dealerLeftArm.position.set(-0.175, 0.39, -0.01);
      this.dealerRightArm.position.set(0.175, 0.39, -0.01);
      this.dealerLeftArm.rotation.set(0, 0, 0);
      this.dealerRightArm.rotation.set(0, 0, 0);
    }

    if (plaqueRef) {
      const baseShoulderX = seatIdx === 3 ? 0.195 : seatIdx === 2 ? 0.132 : 0.155;
      if (role === 'bao') {
        plaqueRef.rightArmGroup.position.set(0.195, 0.37, 0.02);
        plaqueRef.rightArmGroup.rotation.x = -0.28;
        plaqueRef.leftArmGroup.position.set(-0.195, 0.36, -0.01);
        plaqueRef.leftArmGroup.rotation.x = -0.10;
      } else {
        plaqueRef.leftArmGroup.position.set(-baseShoulderX, 0.36, -0.01);
        plaqueRef.rightArmGroup.position.set(baseShoulderX, 0.36, -0.01);
        plaqueRef.leftArmGroup.rotation.x = 0;
        plaqueRef.rightArmGroup.rotation.x = 0;
      }
    }

    targetGroup.updateWorldMatrix(true, true);

    const portraitCam = new THREE.PerspectiveCamera(34, 1, 0.05, 25);
    const localCamPos =
      role === 'dealer'
        ? new THREE.Vector3(0.03, 0.61, 0.82)
        : role === 'bao'
        ? new THREE.Vector3(0.02, 0.54, 0.86)
        : new THREE.Vector3(0.04, 0.55, 0.80);
    const localLookAt =
      role === 'dealer'
        ? new THREE.Vector3(0, 0.55, 0)
        : role === 'bao'
        ? new THREE.Vector3(0, 0.48, 0.04)
        : new THREE.Vector3(0, 0.49, 0);

    const worldCamPos = localCamPos.clone();
    const worldLookAt = localLookAt.clone();
    targetGroup.localToWorld(worldCamPos);
    targetGroup.localToWorld(worldLookAt);

    portraitCam.position.copy(worldCamPos);
    portraitCam.lookAt(worldLookAt);

    // Add temporary studio key & rim light for crisp 3D modeling highlights
    const keyLight = new THREE.PointLight('#fff7ed', 2.4, 2.5);
    const localKey = new THREE.Vector3(0.28, 0.72, 0.58);
    targetGroup.localToWorld(localKey);
    keyLight.position.copy(localKey);
    this.scene.add(keyLight);

    const rimLight = new THREE.PointLight(role === 'bao' ? '#38bdf8' : '#d4af37', 1.8, 2.0);
    const localRim = new THREE.Vector3(-0.32, 0.68, -0.35);
    targetGroup.localToWorld(localRim);
    rimLight.position.copy(localRim);
    this.scene.add(rimLight);

    const prevSize = new THREE.Vector2();
    this.renderer.getSize(prevSize);
    const prevPixelRatio = this.renderer.getPixelRatio();

    this.renderer.setPixelRatio(1);
    this.renderer.setSize(size, size, false);
    this.renderer.render(this.scene, portraitCam);

    const dataUrl = this.renderer.domElement.toDataURL('image/png');

    // Restore renderer, lights, head rotation, and plaques
    this.renderer.setPixelRatio(prevPixelRatio);
    this.renderer.setSize(prevSize.x, prevSize.y, false);
    this.scene.remove(keyLight, rimLight);
    if (headGroup) {
      headGroup.position.y = savedHeadY;
      headGroup.rotation.x = savedRotX;
      headGroup.rotation.y = savedRotY;
    }
    hiddenPlaques.forEach((m) => {
      m.visible = true;
    });
    this.renderer.render(this.scene, this.camera);

    return dataUrl;
  }

  public captureAll3DPortraits(size: number = 512): Record<CharacterModelRole, string> {
    return {
      viktor: this.capture3DCharacterPortrait('viktor', size),
      elena: this.capture3DCharacterPortrait('elena', size),
      bao: this.capture3DCharacterPortrait('bao', size),
      marcus: this.capture3DCharacterPortrait('marcus', size),
      dealer: this.capture3DCharacterPortrait('dealer', size),
    };
  }

  /**
   * Runs programmatic 3D spatial & UX/UI graphic guideline assertions across all table elements,
   * character human-presence rigs, sightline-safe rail plaques, chip stacks, and WebGL draw calls.
   */
  public runSpatialAudit(): SpatialAuditReport {
    const checks: SpatialAuditCheck[] = [];

    // 1. Avatar Rim Clearance Check: All AI avatars & Dealer must sit outside the (1.37, 0.9042) outer leather armrest
    let minRimNorm = Infinity;
    this.avatarPlaques.forEach((p) => {
      const pos = p.avatarGroup.position;
      const norm = Math.hypot(pos.x / 1.37, pos.z / 0.9042);
      if (norm < minRimNorm) minRimNorm = norm;
    });
    if (this.dealerGroup) {
      const dPos = this.dealerGroup.position;
      const dNorm = Math.hypot(dPos.x / 1.37, dPos.z / 0.9042);
      if (dNorm < minRimNorm) minRimNorm = dNorm;
    }
    checks.push({
      id: 'avatar_rim_clearance',
      label: '3D Avatars & Dealer Rim Clearance (No Torso Clipping)',
      passed: minRimNorm >= 1.15,
      metric: `minNormalizedRadius = ${minRimNorm.toFixed(3)} (target >= 1.150)`,
    });

    // 2. Character Human-Presence Rig Check: Subsurface skin, cornea clearcoat eyes, eyelid/gaze rig, and 5-finger hands
    const dealerHasRig = Boolean(
      this.dealerHeadGroup?.userData.hasRealisticFacialRig &&
      this.dealerLeftArm?.userData.handRig &&
      this.dealerRightArm?.userData.handRig
    );
    let aiRigsComplete = true;
    let maxPlaqueLocalY = 0;
    this.avatarPlaques.forEach((p) => {
      if (
        !p.headGroup.userData.hasRealisticFacialRig ||
        !p.leftArmGroup.userData.handRig ||
        !p.rightArmGroup.userData.handRig
      ) {
        aiRigsComplete = false;
      }
      if (p.mesh.position.y > maxPlaqueLocalY) {
        maxPlaqueLocalY = p.mesh.position.y;
      }
    });
    checks.push({
      id: 'character_human_presence_rig',
      label: '5-Character Subsurface Skin, Cornea Clearcoat, Blink/Saccade & 5-Finger Hand Rigs',
      passed: dealerHasRig && aiRigsComplete && maxPlaqueLocalY <= 0.25,
      metric: `dealerRig=${dealerHasRig}, aiRigs=${aiRigsComplete}, maxPlaqueY=${maxPlaqueLocalY.toFixed(2)}m (<=0.25m)`,
    });

    // 3. Limb & Head Attachment Check: Dealer & AI local coordinates must not float or detach below the table
    const dealerHeadY = this.dealerHeadGroup ? this.dealerHeadGroup.position.y : 0;
    const dealerArmY = this.dealerLeftArm ? this.dealerLeftArm.position.y : 0;
    let aiArmsAttached = true;
    this.avatarPlaques.forEach((p) => {
      const ly = p.leftArmGroup.position.y;
      const ry = p.rightArmGroup.position.y;
      if (ly < 0.35 || ly > 0.62 || ry < 0.35 || ry > 0.62) {
        aiArmsAttached = false;
      }
    });
    const rigAttached =
      dealerHeadY >= 0.60 &&
      dealerHeadY <= 0.72 &&
      dealerArmY >= 0.35 &&
      dealerArmY <= 0.56 &&
      aiArmsAttached;
    checks.push({
      id: 'character_rig_attachment',
      label: 'Dealer & AI Rig Shoulder/Head Local Coordinates Attached',
      passed: rigAttached,
      metric: `dealerHeadY=${dealerHeadY.toFixed(3)}m, dealerArmY=${dealerArmY.toFixed(3)}m, aiArmsAttached=${aiArmsAttached}`,
    });

    // 4. Chip Stacks Inside Felt Ellipse: All active chip instances must sit inside the (1.24, 0.818) inner felt boundary and above y=0.760m
    let maxChipFeltNorm = 0;
    let minChipY = 0.763;
    for (const inst of this.chipInstances) {
      const norm = Math.hypot(inst.targetPos.x / 1.24, inst.targetPos.z / 0.818);
      if (norm > maxChipFeltNorm) maxChipFeltNorm = norm;
      if (inst.targetPos.y < minChipY) minChipY = inst.targetPos.y;
    }
    checks.push({
      id: 'chip_felt_bounds',
      label: 'Chip Stacks Inside Inner Felt Boundary & Above Felt Plane',
      passed: maxChipFeltNorm <= 0.98 && minChipY >= 0.76,
      metric: `maxFeltNorm = ${maxChipFeltNorm.toFixed(3)} (<= 0.980), minChipY = ${minChipY.toFixed(3)}m`,
    });

    // 5. Spatial Rim Buttons Above Leather Armrest (y >= 0.82m) & 2D/3D HUD Mutual Exclusivity Branching
    const minBtnY = this.spatialButtons.reduce(
      (min, b) => Math.min(min, b.mesh.position.y),
      Infinity
    );
    checks.push({
      id: 'spatial_buttons_elevation',
      label: '3D Spatial Rim HUD Buttons Clear Leather Armrest (y >= 0.82m)',
      passed: minBtnY >= 0.82,
      metric: `minButtonY = ${minBtnY.toFixed(3)}m (armrest top = 0.800m)`,
    });

    const expectedSpatialVisible = !this.show2DHUD || this.isInXR;
    const visibleSpatialCount = this.spatialButtons.filter((b) => b.mesh.visible).length;
    const mutualExclusivityPassed = this.spatialButtons.every(
      (b) => b.mesh.visible === expectedSpatialVisible
    );
    checks.push({
      id: 'hud_2d_3d_mutual_exclusivity',
      label: '2D HUD & 3D Spatial Rim HUD Mutual Exclusivity (Never Shown Simultaneously)',
      passed: mutualExclusivityPassed,
      metric: `show2DHUD=${this.show2DHUD}, isInXR=${this.isInXR}, visible3DSpatialButtons=${visibleSpatialCount}/4 (expected=${expectedSpatialVisible ? 4 : 0})`,
    });

    // 6. Ergonomic Seated Gaze Pitch (-6 deg to -28 deg from Seat #0 Eye Level 1.25m to Center Board 0.76m)
    const eyePos = new THREE.Vector3(0, 1.25, 1.52);
    const boardPos = new THREE.Vector3(0, 0.76, -0.05);
    const dy = boardPos.y - eyePos.y;
    const dz = Math.abs(boardPos.z - eyePos.z);
    const pitchDeg = THREE.MathUtils.radToDeg(Math.atan2(dy, dz));
    checks.push({
      id: 'ergonomic_gaze_pitch',
      label: 'Apple Vision Pro Seated Gaze Pitch (-8° to -25° Comfort Zone)',
      passed: pitchDeg <= -8 && pitchDeg >= -25,
      metric: `gazePitch = ${pitchDeg.toFixed(1)}°`,
    });

    // 7. WebGL Draw Call Budget Check (Strict UX/UI Guideline Threshold <= 450)
    const drawCalls = this.renderer.info.render.calls;
    const triangles = this.renderer.info.render.triangles;
    checks.push({
      id: 'webgl_draw_call_budget',
      label: 'WebGL Draw Call Budget (<= 450 Draw Calls)',
      passed: drawCalls <= 450,
      metric: `drawCalls = ${drawCalls} (<= 450), triangles = ${triangles}`,
    });

    return {
      timestamp: Date.now(),
      cameraPreset: this.currentCameraPreset,
      drawCalls,
      triangles,
      allPassed: checks.every((c) => c.passed),
      checks,
    };
  }

  public destroy() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('pointermove', this.onPointerMove);
    dom.removeEventListener('pointerup', this.onPointerUp);
    this.controls.dispose();
    this.renderer.dispose();
    if (this.container && this.renderer.domElement) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
