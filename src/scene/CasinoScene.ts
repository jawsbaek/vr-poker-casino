import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Card, PlayerState, TableState, ChipDenomination } from '../types/poker';
import { getCardBackTexture, getCardFrontTexture, getCasinoFeltTexture, getChipTextures } from './proceduralAssets';
import { pokerAudio } from '../audio/pokerAudio';

export interface CardMeshRef {
  mesh: THREE.Group;
  card: Card;
  targetPosition: THREE.Vector3;
  targetRotation: THREE.Euler;
  currentRotation: THREE.Euler;
  isPeeked: boolean;
}

export interface ChipMeshRef {
  mesh: THREE.Group;
  denom: ChipDenomination;
  targetPosition: THREE.Vector3;
}

export class CasinoScene {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;

  private container: HTMLElement;
  private animationFrameId: number | null = null;
  private clock = new THREE.Clock();

  // Mesh registries
  private cardMeshes: Map<string, CardMeshRef> = new Map();
  private chipMeshes: ChipMeshRef[] = [];
  private avatarMeshes: THREE.Group[] = [];
  private activeSpotlight: THREE.SpotLight | null = null;
  private dealerMesh: THREE.Group | null = null;

  // Peeking interaction state
  public isPeekingCards: boolean = false;
  private peekProgress: number = 0; // 0 to 1

  // Seat Coordinates in 3D world (Seat 0: Player at z=1.2, x=0)
  // Table center is (0, 0.75, 0)
  public static readonly SEAT_POSITIONS = [
    new THREE.Vector3(0, 0.78, 0.72),       // Seat 0: Human Player (Front Center)
    new THREE.Vector3(1.05, 0.78, 0.35),    // Seat 1: Viktor (Right)
    new THREE.Vector3(0.75, 0.78, -0.55),   // Seat 2: Elena (Top Right)
    new THREE.Vector3(-0.75, 0.78, -0.55),  // Seat 3: Bao (Top Left)
    new THREE.Vector3(-1.05, 0.78, 0.35),   // Seat 4: Marcus (Left)
  ];

  public static readonly COMMUNITY_POSITIONS = [
    new THREE.Vector3(-0.32, 0.765, -0.05),
    new THREE.Vector3(-0.16, 0.765, -0.05),
    new THREE.Vector3(0, 0.765, -0.05),
    new THREE.Vector3(0.16, 0.765, -0.05),
    new THREE.Vector3(0.32, 0.765, -0.05),
  ];

  constructor(container: HTMLElement) {
    this.container = container;

    // 1. Scene Setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#070a12');
    this.scene.fog = new THREE.FogExp2('#070a12', 0.12);

    // 2. Camera Setup (Positioned right behind Seat 0 for natural first-person poker view)
    this.camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.05,
      50
    );
    this.camera.position.set(0, 1.45, 1.35);
    this.camera.lookAt(0, 0.75, -0.05);

    // 3. Renderer Setup with WebXR enabled
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.xr.enabled = true; // Enable WebXR rendering pipeline
    container.appendChild(this.renderer.domElement);

    // 4. Orbit Controls (Desktop fallback)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2.05; // Don't allow viewing from below table
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 4.5;
    this.controls.target.set(0, 0.76, 0);

    // 5. Build VIP Casino Environment
    this.setupLighting();
    this.buildVIPRoom();
    this.buildPokerTable();
    this.buildDealer();

    // 6. Bind events
    window.addEventListener('resize', this.onResize);
    this.startAnimationLoop();
  }

  private setupLighting() {
    // Ambient Soft Warmth
    const ambientLight = new THREE.AmbientLight('#ffe5b4', 0.45);
    this.scene.add(ambientLight);

    // Overhead Center Table Pendant Downlight (Warm Golden)
    const pendantLight = new THREE.SpotLight('#fff0d0', 5.5);
    pendantLight.position.set(0, 2.7, 0);
    pendantLight.angle = Math.PI / 3.2;
    pendantLight.penumbra = 0.8;
    pendantLight.decay = 1.5;
    pendantLight.distance = 6;
    pendantLight.castShadow = true;
    pendantLight.shadow.mapSize.width = 2048;
    pendantLight.shadow.mapSize.height = 2048;
    pendantLight.shadow.bias = -0.0001;
    this.scene.add(pendantLight);

    // Table accent downlight
    const rimLight = new THREE.DirectionalLight('#d4af37', 0.75);
    rimLight.position.set(0, 4, 2);
    this.scene.add(rimLight);

    // Subtle blue architectural rim light from behind dealer
    const backRim = new THREE.DirectionalLight('#3b82f6', 0.4);
    backRim.position.set(0, 3, -4);
    this.scene.add(backRim);

    // Active Turn Spotlight (moves to highlight active player)
    this.activeSpotlight = new THREE.SpotLight('#fef08a', 2.8, 4, Math.PI / 6, 0.8, 1.2);
    this.activeSpotlight.position.set(0, 2.2, 0.72);
    this.activeSpotlight.target.position.set(0, 0.75, 0.72);
    this.scene.add(this.activeSpotlight);
    this.scene.add(this.activeSpotlight.target);
  }

  private buildVIPRoom() {
    // Luxury dark room floor (parquetry/carpet)
    const floorGeo = new THREE.PlaneGeometry(16, 16);
    const floorMat = new THREE.MeshStandardMaterial({
      color: '#0e111a',
      roughness: 0.85,
      metalness: 0.1,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Warm ceiling pendant fixture model
    const fixtureGeo = new THREE.CylinderGeometry(0.35, 0.45, 0.25, 32);
    const fixtureMat = new THREE.MeshStandardMaterial({
      color: '#1a140f',
      metalness: 0.8,
      roughness: 0.2,
    });
    const fixture = new THREE.Mesh(fixtureGeo, fixtureMat);
    fixture.position.set(0, 2.8, 0);
    this.scene.add(fixture);

    // Brass accent ring on pendant
    const ringGeo = new THREE.TorusGeometry(0.46, 0.02, 16, 48);
    const brassMat = new THREE.MeshStandardMaterial({
      color: '#d4af37',
      metalness: 0.9,
      roughness: 0.25,
    });
    const ring = new THREE.Mesh(ringGeo, brassMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 2.68, 0);
    this.scene.add(ring);
  }

  private buildPokerTable() {
    const tableGroup = new THREE.Group();

    // 1. Table Felt Surface (Main play area)
    const feltTexture = getCasinoFeltTexture();
    const feltGeo = new THREE.CylinderGeometry(1.25, 1.25, 0.04, 64);
    feltGeo.scale(1, 1, 0.65); // Oval aspect ratio
    const feltMat = new THREE.MeshStandardMaterial({
      map: feltTexture,
      roughness: 0.9,
      metalness: 0.05,
    });
    const felt = new THREE.Mesh(feltGeo, feltMat);
    felt.position.y = 0.74;
    felt.receiveShadow = true;
    tableGroup.add(felt);

    // 2. Polished Dark Mahogany Wood Bevel / Rim
    const rimGeo = new THREE.CylinderGeometry(1.36, 1.34, 0.05, 64);
    rimGeo.scale(1, 1, 0.65);
    const woodMat = new THREE.MeshStandardMaterial({
      color: '#2a140e',
      roughness: 0.25,
      metalness: 0.15,
    });
    const woodRim = new THREE.Mesh(rimGeo, woodMat);
    woodRim.position.y = 0.73;
    woodRim.receiveShadow = true;
    tableGroup.add(woodRim);

    // 3. Luxurious Padded Leather Armrest (Outer Ring)
    const armrestGeo = new THREE.TorusGeometry(1.35, 0.07, 24, 64);
    armrestGeo.scale(1, 0.65, 0.5);
    armrestGeo.rotateX(Math.PI / 2);
    const leatherMat = new THREE.MeshStandardMaterial({
      color: '#151316',
      roughness: 0.7,
      metalness: 0.05,
    });
    const armrest = new THREE.Mesh(armrestGeo, leatherMat);
    armrest.position.y = 0.76;
    armrest.castShadow = true;
    tableGroup.add(armrest);

    // 4. Antique Brass Table Legs & Pedestal
    const baseGeo = new THREE.CylinderGeometry(0.35, 0.5, 0.72, 32);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: '#241a12',
      roughness: 0.4,
      metalness: 0.6,
    });
    const pedestal = new THREE.Mesh(baseGeo, pedestalMat);
    pedestal.position.y = 0.36;
    pedestal.castShadow = true;
    tableGroup.add(pedestal);

    // Brass accent trims on pedestal
    const trimTorus = new THREE.TorusGeometry(0.48, 0.025, 16, 32);
    trimTorus.rotateX(Math.PI / 2);
    const brassTrimMat = new THREE.MeshStandardMaterial({
      color: '#d4af37',
      metalness: 0.85,
      roughness: 0.3,
    });
    const legTrim = new THREE.Mesh(trimTorus, brassTrimMat);
    legTrim.position.y = 0.08;
    tableGroup.add(legTrim);

    this.scene.add(tableGroup);
  }

  private buildDealer() {
    const dealerGroup = new THREE.Group();
    dealerGroup.position.set(0, 0.75, -0.85);

    // Elegant stylized wooden/brass dealer podium
    const trayGeo = new THREE.BoxGeometry(0.4, 0.03, 0.18);
    const trayMat = new THREE.MeshStandardMaterial({
      color: '#1e1b18',
      metalness: 0.7,
      roughness: 0.3,
    });
    const tray = new THREE.Mesh(trayGeo, trayMat);
    tray.position.y = 0.02;
    dealerGroup.add(tray);

    // Dealer button (White ceramic disc)
    const buttonGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.012, 32);
    const buttonMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.4,
      metalness: 0.1,
    });
    const dealerButton = new THREE.Mesh(buttonGeo, buttonMat);
    dealerButton.position.set(0, 0.04, 0.15);
    dealerGroup.add(dealerButton);

    // Stylized dealer bust / silhouette
    const torsoGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.5, 24);
    const vestMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      roughness: 0.7,
    });
    const torso = new THREE.Mesh(torsoGeo, vestMat);
    torso.position.y = 0.35;
    dealerGroup.add(torso);

    // Dealer head
    const headGeo = new THREE.SphereGeometry(0.12, 24, 24);
    const headMat = new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      roughness: 0.5,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.68;
    dealerGroup.add(head);

    // Red Bowtie
    const bowtieGeo = new THREE.BoxGeometry(0.07, 0.03, 0.02);
    const bowtieMat = new THREE.MeshStandardMaterial({ color: '#dc2626' });
    const bowtie = new THREE.Mesh(bowtieGeo, bowtieMat);
    bowtie.position.set(0, 0.56, 0.18);
    dealerGroup.add(bowtie);

    this.dealerMesh = dealerGroup;
    this.scene.add(dealerGroup);
  }

  /**
   * Spawns or updates AI avatar representations around the table
   */
  public updateAvatars(players: PlayerState[]) {
    // Clear existing
    this.avatarMeshes.forEach((m) => this.scene.remove(m));
    this.avatarMeshes = [];

    players.forEach((p) => {
      if (p.isHuman) return; // Human doesn't need an avatar blocking the camera

      const pos = CasinoScene.SEAT_POSITIONS[p.seatIndex];
      const avatarGroup = new THREE.Group();
      avatarGroup.position.set(pos.x * 1.35, 0.75, pos.z * 1.35);
      avatarGroup.lookAt(0, 0.8, 0);

      // Body capsule
      const bodyGeo = new THREE.CylinderGeometry(0.14, 0.18, 0.45, 20);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: p.color,
        roughness: 0.6,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.3;
      avatarGroup.add(body);

      // Head
      const headGeo = new THREE.SphereGeometry(0.1, 20, 20);
      const headMat = new THREE.MeshStandardMaterial({
        color: '#e2e8f0',
        roughness: 0.4,
      });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.y = 0.58;
      avatarGroup.add(head);

      // Turn Highlight Ring on Floor
      const ringGeo = new THREE.RingGeometry(0.2, 0.24, 32);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: p.isTurn ? '#eab308' : 'rgba(255,255,255,0.1)',
        transparent: true,
        opacity: p.isTurn ? 0.9 : 0.2,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.01;
      avatarGroup.add(ring);

      this.avatarMeshes.push(avatarGroup);
      this.scene.add(avatarGroup);
    });
  }

  /**
   * Sets up 3D card mesh with front and back canvas textures
   */
  public createCardMesh(card: Card): THREE.Group {
    const cardGroup = new THREE.Group();

    const width = 0.088;
    const height = 0.124;
    const thickness = 0.0006;

    const frontTexture = getCardFrontTexture(card);
    const backTexture = getCardBackTexture();

    const geometry = new THREE.BoxGeometry(width, thickness, height);
    const edgeMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 });
    const topMaterial = new THREE.MeshStandardMaterial({ map: frontTexture, roughness: 0.45 });
    const bottomMaterial = new THREE.MeshStandardMaterial({ map: backTexture, roughness: 0.45 });

    // Box faces: [right, left, top(+y=front), bottom(-y=back), front, back]
    const materials = [
      edgeMaterial,
      edgeMaterial,
      topMaterial,
      bottomMaterial,
      edgeMaterial,
      edgeMaterial,
    ];

    const mesh = new THREE.Mesh(geometry, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    cardGroup.add(mesh);

    return cardGroup;
  }

  /**
   * Synchronizes table state (community cards, player cards) to 3D meshes
   */
  public syncCards(table: TableState, players: PlayerState[]) {
    // 1. Community Cards
    table.communityCards.forEach((card, idx) => {
      if (!this.cardMeshes.has(card.id)) {
        const mesh = this.createCardMesh(card);
        // Start from dealer
        mesh.position.set(0, 0.9, -0.6);
        mesh.rotation.set(0, Math.PI, 0);
        this.scene.add(mesh);

        const targetPos = CasinoScene.COMMUNITY_POSITIONS[idx];
        const targetRot = new THREE.Euler(0, 0, 0); // Face up

        this.cardMeshes.set(card.id, {
          mesh,
          card,
          targetPosition: targetPos,
          targetRotation: targetRot,
          currentRotation: new THREE.Euler(0, Math.PI, 0),
          isPeeked: false,
        });

        pokerAudio.playCardSlide();
      }
    });

    // 2. Players Hole Cards
    players.forEach((player) => {
      const seatPos = CasinoScene.SEAT_POSITIONS[player.seatIndex];

      player.cards.forEach((card, cardIdx) => {
        if (!this.cardMeshes.has(card.id)) {
          const mesh = this.createCardMesh(card);
          // Start from dealer
          mesh.position.set(0, 0.9, -0.6);
          mesh.rotation.set(0, Math.PI, 0);
          this.scene.add(mesh);

          const offsetMultiplier = cardIdx === 0 ? -0.05 : 0.05;
          const targetPos = new THREE.Vector3(
            seatPos.x + offsetMultiplier,
            0.762 + cardIdx * 0.001,
            seatPos.z
          );

          // For human player (seat 0): face down towards player
          // If peeking, rotate to reveal
          const faceAngle = player.isHuman ? (card.faceUp ? 0 : Math.PI) : Math.PI;
          const targetRot = new THREE.Euler(0, 0, faceAngle);

          this.cardMeshes.set(card.id, {
            mesh,
            card,
            targetPosition: targetPos,
            targetRotation: targetRot,
            currentRotation: new THREE.Euler(0, 0, faceAngle),
            isPeeked: false,
          });

          pokerAudio.playCardSlide();
        } else {
          // If showdown or fold, update rotation
          const ref = this.cardMeshes.get(card.id)!;
          if (card.faceUp || table.phase === 'showdown') {
            ref.targetRotation.z = 0; // Flip face up
          }
        }
      });
    });
  }

  /**
   * Human hole card peeking animation (peels corners up)
   */
  public setPeekProgress(progress: number, humanCards: Card[]) {
    this.peekProgress = Math.max(0, Math.min(1, progress));

    humanCards.forEach((c) => {
      const ref = this.cardMeshes.get(c.id);
      if (ref) {
        // As progress increases: lift slightly and rotate up towards camera
        const lift = this.peekProgress * 0.06;
        const tiltX = -this.peekProgress * 0.75;
        const rollZ = Math.PI - this.peekProgress * Math.PI * 0.65; // Reveal rank/suit

        ref.mesh.position.y = ref.targetPosition.y + lift;
        ref.mesh.rotation.x = tiltX;
        ref.mesh.rotation.z = rollZ;
      }
    });
  }

  /**
   * Sync active spotlight to current turn seat
   */
  public updateActiveTurn(activeSeat: number) {
    if (this.activeSpotlight && CasinoScene.SEAT_POSITIONS[activeSeat]) {
      const pos = CasinoScene.SEAT_POSITIONS[activeSeat];
      this.activeSpotlight.target.position.set(pos.x, 0.75, pos.z);
      this.activeSpotlight.position.set(pos.x * 0.6, 2.2, pos.z * 0.6 + 0.1);
    }
  }

  /**
   * Spawns physical chip stacks on the table
   */
  public syncChips(table: TableState, players: PlayerState[]) {
    // Clear old chips
    this.chipMeshes.forEach((c) => this.scene.remove(c.mesh));
    this.chipMeshes = [];

    // 1. Center Pot Chips
    if (table.pot > 0) {
      this.spawnChipStack(new THREE.Vector3(0, 0.76, 0.12), table.pot);
    }

    // 2. Player Bet Chips & Stacks
    players.forEach((p) => {
      const seatPos = CasinoScene.SEAT_POSITIONS[p.seatIndex];

      // Player bank chips
      if (p.chips > 0) {
        const bankPos = new THREE.Vector3(seatPos.x * 1.15, 0.76, seatPos.z * 1.15);
        this.spawnChipStack(bankPos, Math.min(p.chips, 80));
      }

      // In-flight bet chips in front of player
      if (p.currentBet > 0) {
        const betPos = new THREE.Vector3(seatPos.x * 0.7, 0.76, seatPos.z * 0.7);
        this.spawnChipStack(betPos, p.currentBet);
      }
    });
  }

  private spawnChipStack(basePos: THREE.Vector3, amount: number) {
    const denoms: ChipDenomination[] = [100, 25, 5, 1];
    let remaining = amount;
    let stackHeight = 0;

    denoms.forEach((denom) => {
      const count = Math.floor(remaining / denom);
      remaining %= denom;

      const numChips = Math.min(count, 8);
      for (let i = 0; i < numChips; i++) {
        const chipGroup = this.createChipMesh(denom);
        chipGroup.position.set(basePos.x, basePos.y + stackHeight * 0.006, basePos.z);
        this.scene.add(chipGroup);

        this.chipMeshes.push({
          mesh: chipGroup,
          denom,
          targetPosition: chipGroup.position.clone(),
        });

        stackHeight++;
      }
    });
  }

  private createChipMesh(denom: ChipDenomination): THREE.Group {
    const group = new THREE.Group();
    const textures = getChipTextures(denom);

    const radius = 0.024;
    const height = 0.005;

    const geometry = new THREE.CylinderGeometry(radius, radius, height, 32);
    const sideMat = new THREE.MeshStandardMaterial({ map: textures.edge, roughness: 0.5 });
    const faceMat = new THREE.MeshStandardMaterial({ map: textures.face, roughness: 0.45 });

    // Cylinder materials: [side, top, bottom]
    const materials = [sideMat, faceMat, faceMat];
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    return group;
  }

  public clearCards() {
    this.cardMeshes.forEach((ref) => this.scene.remove(ref.mesh));
    this.cardMeshes.clear();
  }

  private startAnimationLoop() {
    const animate = () => {
      this.animationFrameId = requestAnimationFrame(animate);

      // Smooth card interpolation towards target position & rotation
      this.cardMeshes.forEach((ref) => {
        if (!ref.isPeeked) {
          ref.mesh.position.lerp(ref.targetPosition, 0.12);
          ref.mesh.rotation.x = THREE.MathUtils.lerp(ref.mesh.rotation.x, ref.targetRotation.x, 0.12);
          ref.mesh.rotation.y = THREE.MathUtils.lerp(ref.mesh.rotation.y, ref.targetRotation.y, 0.12);
          ref.mesh.rotation.z = THREE.MathUtils.lerp(ref.mesh.rotation.z, ref.targetRotation.z, 0.12);
        }
      });

      // Update Orbit controls in desktop mode
      if (!this.renderer.xr.isPresenting) {
        this.controls.update();
      }

      this.renderer.render(this.scene, this.camera);
    };

    // Use renderer.setAnimationLoop for WebXR compliance
    this.renderer.setAnimationLoop(animate);
  }

  private onResize = () => {
    if (!this.container) return;
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  };

  public destroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    this.controls.dispose();
    this.renderer.dispose();
    if (this.container && this.renderer.domElement) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
