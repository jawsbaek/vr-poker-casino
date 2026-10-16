import * as THREE from 'three';
import { Card, ChipDenomination } from '../types/poker';
import { getRankLabel, getSuitSymbol } from '../logic/pokerEngine';

// Texture cache to prevent memory leaks and recreate overhead
const cardTextureCache = new Map<string, THREE.CanvasTexture>();
const chipTextureCache = new Map<ChipDenomination, { face: THREE.CanvasTexture; edge: THREE.CanvasTexture }>();
let feltTextureCache: THREE.CanvasTexture | null = null;
let cardBackTextureCache: THREE.CanvasTexture | null = null;

/**
 * Creates high-res procedural ornate casino card back texture
 */
export function getCardBackTexture(): THREE.CanvasTexture {
  if (cardBackTextureCache) return cardBackTextureCache;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 716;
  const ctx = canvas.getContext('2d')!;

  // Background deep royal burgundy / gold
  ctx.fillStyle = '#1e111a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // White outer margin
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 14;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

  // Inner gold border
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 6;
  ctx.strokeRect(26, 26, canvas.width - 52, canvas.height - 52);

  // Ornate geometric lattice
  ctx.save();
  ctx.beginPath();
  ctx.rect(34, 34, canvas.width - 68, canvas.height - 68);
  ctx.clip();

  ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
  ctx.lineWidth = 2;
  const step = 24;
  for (let x = -canvas.height; x < canvas.width + canvas.height; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x + canvas.height, canvas.height);
    ctx.moveTo(x, canvas.height);
    ctx.lineTo(x + canvas.height, 0);
  }
  ctx.stroke();

  // Central Gold Medallion
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.fillStyle = '#2d1822';
  ctx.beginPath();
  ctx.arc(cx, cy, 90, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#f3e5ab';
  ctx.stroke();

  // Inner star / diamond
  ctx.fillStyle = '#d4af37';
  ctx.font = 'bold 64px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('♠', cx, cy);

  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  cardBackTextureCache = texture;
  return texture;
}

/**
 * Creates crisp front texture for playing card with rank and suit
 */
export function getCardFrontTexture(card: Card): THREE.CanvasTexture {
  const cacheKey = `${card.suit}_${card.rank}`;
  if (cardTextureCache.has(cacheKey)) {
    return cardTextureCache.get(cacheKey)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 716;
  const ctx = canvas.getContext('2d')!;

  // Smooth ivory white card background with subtle gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bgGrad.addColorStop(0, '#ffffff');
  bgGrad.addColorStop(1, '#f8fafc');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle border
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const color = isRed ? '#dc2626' : '#111827';
  const rankStr = getRankLabel(card.rank);
  const suitStr = getSuitSymbol(card.suit);

  ctx.fillStyle = color;

  // Draw Corner Top-Left
  ctx.font = 'bold 56px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(rankStr, 56, 75);
  ctx.font = '48px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(suitStr, 56, 128);

  // Draw Corner Bottom-Right (rotated)
  ctx.save();
  ctx.translate(canvas.width - 56, canvas.height - 75);
  ctx.rotate(Math.PI);
  ctx.font = 'bold 56px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(rankStr, 0, 0);
  ctx.font = '48px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(suitStr, 0, -53);
  ctx.restore();

  // Draw Center Symbol / Face Art
  ctx.font = '180px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(suitStr, canvas.width / 2, canvas.height / 2);

  // Additional Center Rank Watermark
  ctx.font = 'bold 52px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = isRed ? 'rgba(220, 38, 38, 0.25)' : 'rgba(17, 24, 39, 0.2)';
  ctx.fillText(rankStr, canvas.width / 2, canvas.height / 2 + 130);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  cardTextureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Creates authentic clay casino chip textures (Face & Edge)
 */
export function getChipTextures(denom: ChipDenomination): { face: THREE.CanvasTexture; edge: THREE.CanvasTexture } {
  if (chipTextureCache.has(denom)) {
    return chipTextureCache.get(denom)!;
  }

  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = 256;
  faceCanvas.height = 256;
  const fCtx = faceCanvas.getContext('2d')!;

  let primaryColor = '#ffffff';
  let stripeColor = '#3b82f6';
  let textColor = '#0f172a';
  let valueLabel = '$1';

  switch (denom) {
    case 1:
      primaryColor = '#f1f5f9';
      stripeColor = '#3b82f6';
      textColor = '#0f172a';
      valueLabel = '$1';
      break;
    case 5:
      primaryColor = '#dc2626';
      stripeColor = '#ffffff';
      textColor = '#ffffff';
      valueLabel = '$5';
      break;
    case 25:
      primaryColor = '#16a34a';
      stripeColor = '#facc15';
      textColor = '#ffffff';
      valueLabel = '$25';
      break;
    case 100:
      primaryColor = '#1e293b';
      stripeColor = '#d4af37';
      textColor = '#f3e5ab';
      valueLabel = '$100';
      break;
  }

  const cx = 128;
  const cy = 128;

  // Base circular body
  fCtx.fillStyle = primaryColor;
  fCtx.beginPath();
  fCtx.arc(cx, cy, 126, 0, Math.PI * 2);
  fCtx.fill();

  // 6 Edge Inlay Stripes
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    fCtx.save();
    fCtx.translate(cx, cy);
    fCtx.rotate(angle);
    fCtx.fillStyle = stripeColor;
    fCtx.fillRect(100, -14, 26, 28);
    fCtx.restore();
  }

  // Inner ring groove
  fCtx.strokeStyle = 'rgba(0,0,0,0.2)';
  fCtx.lineWidth = 3;
  fCtx.beginPath();
  fCtx.arc(cx, cy, 95, 0, Math.PI * 2);
  fCtx.stroke();

  // Center inlay disc
  fCtx.fillStyle = denom === 100 ? '#0f172a' : '#ffffff';
  fCtx.beginPath();
  fCtx.arc(cx, cy, 75, 0, Math.PI * 2);
  fCtx.fill();

  // Golden accent ring
  fCtx.strokeStyle = '#d4af37';
  fCtx.lineWidth = 4;
  fCtx.beginPath();
  fCtx.arc(cx, cy, 73, 0, Math.PI * 2);
  fCtx.stroke();

  // Denomination text
  fCtx.fillStyle = denom === 100 ? '#f3e5ab' : textColor;
  fCtx.font = 'bold 42px "Plus Jakarta Sans", sans-serif';
  fCtx.textAlign = 'center';
  fCtx.textBaseline = 'middle';
  fCtx.fillText(valueLabel, cx, cy - 4);

  // Subtext
  fCtx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
  fCtx.letterSpacing = '1px';
  fCtx.fillStyle = '#d4af37';
  fCtx.fillText('VIP CASINO', cx, cy + 30);

  // Edge canvas for cylinder sides
  const edgeCanvas = document.createElement('canvas');
  edgeCanvas.width = 512;
  edgeCanvas.height = 64;
  const eCtx = edgeCanvas.getContext('2d')!;

  eCtx.fillStyle = primaryColor;
  eCtx.fillRect(0, 0, 512, 64);

  // Repeating stripes on edge
  const numStripes = 6;
  const stripeW = 512 / (numStripes * 2);
  eCtx.fillStyle = stripeColor;
  for (let i = 0; i < numStripes; i++) {
    eCtx.fillRect(i * stripeW * 2, 0, stripeW, 64);
  }

  const faceTexture = new THREE.CanvasTexture(faceCanvas);
  const edgeTexture = new THREE.CanvasTexture(edgeCanvas);
  faceTexture.anisotropy = 4;
  edgeTexture.anisotropy = 4;

  const result = { face: faceTexture, edge: edgeTexture };
  chipTextureCache.set(denom, result);
  return result;
}

/**
 * Creates luxury felt texture with subtle velvet micro-noise and gold logo
 */
export function getCasinoFeltTexture(): THREE.CanvasTexture {
  if (feltTextureCache) return feltTextureCache;

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // Deep Emerald green base
  ctx.fillStyle = '#0a3d24';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Micro-texture noise for soft velvet feel
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const noise = (Math.random() - 0.5) * 16;
    d[i] = Math.max(0, Math.min(255, d[i] + noise * 0.4));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + noise));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + noise * 0.5));
  }
  ctx.putImageData(imgData, 0, 0);

  // Outer Betting Ring Guide Line
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.45)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(canvas.width / 2, canvas.height / 2, 385, 245, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Inner Hairline Gold Ring
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.2)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(canvas.width / 2, canvas.height / 2, 373, 233, 0, 0, Math.PI * 2);
  ctx.stroke();

  // 5 Community Card Framed Slots in Center
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.28)';
  ctx.lineWidth = 2;
  const slotW = 52;
  const slotH = 74;
  const startX = canvas.width / 2 - (5 * slotW + 4 * 14) / 2;
  const slotY = canvas.height / 2 - slotH / 2 - 18;
  for (let i = 0; i < 5; i++) {
    ctx.strokeRect(startX + i * (slotW + 14), slotY, slotW, slotH);
  }

  // Subtle Center Watermark
  ctx.save();
  ctx.font = 'bold 34px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = 'rgba(212, 175, 55, 0.22)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ROYAL MONTE CARLO', canvas.width / 2, canvas.height / 2 - 86);
  ctx.font = 'bold 16px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('VIP SIT & GO TOURNAMENT • NO-LIMIT HOLD\'EM', canvas.width / 2, canvas.height / 2 + 48);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  feltTextureCache = texture;
  return texture;
}

/**
 * Draws or updates a 3D floating status & action speech plaque for an AI player
 */
export function drawAvatarPlaque(
  canvas: HTMLCanvasElement,
  name: string,
  chips: number,
  actionText: string,
  isTurn: boolean,
  folded: boolean,
  eliminated: boolean,
  accentColor: string,
  isDealer: boolean,
  tellLabel?: string,
  chatBubbleText?: string,
  portraitImg?: HTMLImageElement | null
) {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Dark luxury glass plaque background
  ctx.fillStyle = eliminated
    ? 'rgba(15, 23, 42, 0.55)'
    : isTurn
    ? 'rgba(30, 22, 10, 0.94)'
    : 'rgba(10, 15, 28, 0.88)';
  ctx.beginPath();
  ctx.roundRect(8, 8, w - 16, h - 16, 22);
  ctx.fill();

  // Border (bright gold on active turn)
  ctx.lineWidth = isTurn ? 6 : 3;
  ctx.strokeStyle = isTurn ? '#facc15' : eliminated ? '#334155' : 'rgba(212, 175, 55, 0.45)';
  ctx.stroke();

  let leftOffset = 24;

  // Optional 2D Nano Banana Portrait Medallion on the left of the 3D Plaque
  if (portraitImg && portraitImg.complete && portraitImg.naturalWidth > 0) {
    const cx = 56;
    const cy = h / 2;
    const r = 38;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (eliminated || folded) {
      ctx.filter = 'grayscale(85%) brightness(0.7)';
    }
    ctx.drawImage(portraitImg, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();

    // Gold circular bezel around portrait
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = isTurn ? 4 : 2.5;
    ctx.strokeStyle = isTurn ? '#facc15' : accentColor;
    ctx.stroke();

    leftOffset = 106;
  }

  // Player Name + Dealer Badge
  ctx.fillStyle = eliminated ? '#64748b' : accentColor;
  ctx.font = 'bold 25px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, leftOffset, 38);

  if (tellLabel && !eliminated) {
    ctx.fillStyle = tellLabel.includes('PHONE DOWN') ? '#fde047' : '#94a3b8';
    ctx.font = 'bold 15px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(tellLabel, isDealer ? w - 70 : w - 22, 38);
  }

  if (isDealer && !eliminated) {
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(w - 38, 38, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 19px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('D', w - 38, 39);
  }

  // Stack Readout
  ctx.fillStyle = eliminated ? '#ef4444' : '#fde047';
  ctx.font = 'bold 26px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(eliminated ? 'OUT' : `$${chips}`, leftOffset, 84);

  // Speech / Action Pill on right (or live Chit-Chat remark if active)
  const pillX = Math.max(leftOffset + 96, 198);
  const pillW = w - pillX - 18;
  const displaySpeech = chatBubbleText ? `"${chatBubbleText}"` : actionText;
  ctx.fillStyle = chatBubbleText
    ? 'rgba(20, 83, 45, 0.92)'
    : folded
    ? 'rgba(127, 29, 29, 0.6)'
    : isTurn
    ? 'rgba(234, 179, 8, 0.25)'
    : 'rgba(30, 41, 59, 0.9)';
  ctx.beginPath();
  ctx.roundRect(pillX, 62, pillW, 44, 12);
  ctx.fill();

  ctx.fillStyle = chatBubbleText
    ? '#bbf7d0'
    : folded
    ? '#fca5a5'
    : isTurn
    ? '#fef08a'
    : '#e2e8f0';
  ctx.font = chatBubbleText
    ? 'italic bold 15px "Plus Jakarta Sans", sans-serif'
    : 'bold 19px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  const maxChars = portraitImg ? 24 : 32;
  const truncated =
    displaySpeech.length > maxChars ? displaySpeech.slice(0, maxChars - 2) + '…"' : displaySpeech;
  ctx.fillText(truncated, pillX + pillW / 2, 84);
}

/**
 * Draws a 3D on-felt street bet pill/plaque next to a player's wagered chip stack
 */
export function drawOnFeltBetBadge(
  canvas: HTMLCanvasElement,
  amount: number,
  isAllIn: boolean = false
) {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (amount <= 0) return;

  ctx.fillStyle = isAllIn ? 'rgba(127, 29, 29, 0.94)' : 'rgba(6, 24, 18, 0.92)';
  ctx.beginPath();
  ctx.roundRect(6, 6, w - 12, h - 12, 24);
  ctx.fill();

  ctx.lineWidth = 4;
  ctx.strokeStyle = isAllIn ? '#f87171' : '#facc15';
  ctx.stroke();

  // Mini chip icon on left
  ctx.fillStyle = isAllIn ? '#ef4444' : '#facc15';
  ctx.beginPath();
  ctx.arc(32, h / 2, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#fef08a';
  ctx.font = 'bold 26px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(isAllIn ? `ALL-IN $${amount}` : `$${amount}`, w / 2 + 12, h / 2 + 1);
}

/**
 * Draws a 3D world-anchored Spatial HUD button texture for WebXR & Desktop table rim
 */
export function drawSpatialButton(
  canvas: HTMLCanvasElement,
  label: string,
  sublabel: string,
  variant: 'fold' | 'call' | 'raise' | 'confirm' | 'neutral',
  disabled: boolean = false,
  hovered: boolean = false
) {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const bgMap = {
    fold: hovered ? 'rgba(127, 29, 29, 0.98)' : 'rgba(69, 10, 10, 0.92)',
    call: hovered ? 'rgba(30, 58, 138, 0.98)' : 'rgba(23, 37, 84, 0.92)',
    raise: hovered ? 'rgba(146, 64, 14, 0.98)' : 'rgba(120, 53, 15, 0.95)',
    confirm: hovered ? 'rgba(6, 95, 70, 0.98)' : 'rgba(6, 78, 59, 0.95)',
    neutral: hovered ? 'rgba(30, 41, 59, 0.98)' : 'rgba(15, 23, 42, 0.9)',
  };
  const borderMap = {
    fold: hovered ? '#fca5a5' : '#ef4444',
    call: hovered ? '#93c5fd' : '#60a5fa',
    raise: hovered ? '#fef08a' : '#facc15',
    confirm: hovered ? '#6ee7b7' : '#34d399',
    neutral: hovered ? '#fde047' : '#d4af37',
  };

  ctx.fillStyle = disabled ? 'rgba(15, 23, 42, 0.45)' : bgMap[variant];
  ctx.beginPath();
  ctx.roundRect(6, 6, w - 12, h - 12, 18);
  ctx.fill();

  ctx.lineWidth = hovered && !disabled ? 6 : 4;
  ctx.strokeStyle = disabled ? '#334155' : borderMap[variant];
  ctx.stroke();

  ctx.fillStyle = disabled ? '#64748b' : '#ffffff';
  ctx.font = 'bold 28px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, w / 2, sublabel ? h / 2 - 14 : h / 2);

  if (sublabel) {
    ctx.fillStyle = disabled ? '#475569' : borderMap[variant];
    ctx.font = 'bold 20px monospace';
    ctx.fillText(sublabel, w / 2, h / 2 + 20);
  }
}

let phoneScreenCache: THREE.CanvasTexture | null = null;

/**
 * Generates an emissive short-video feed screen texture for Bao's 3D smartphone (Seat #3)
 */
export function getPhoneScreenTexture(): THREE.CanvasTexture {
  if (phoneScreenCache) return phoneScreenCache;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 128, 256);
  grad.addColorStop(0, '#0ea5e9');
  grad.addColorStop(0.5, '#6366f1');
  grad.addColorStop(1, '#ec4899');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 256);

  // Feed UI overlay bars
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.beginPath();
  ctx.arc(106, 150, 10, 0, Math.PI * 2);
  ctx.arc(106, 182, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillRect(14, 210, 72, 10);
  ctx.fillRect(14, 226, 50, 8);

  const tex = new THREE.CanvasTexture(canvas);
  phoneScreenCache = tex;
  return tex;
}

export type CharacterModelRole = 'dealer' | 'viktor' | 'elena' | 'bao' | 'marcus';

/**
 * Populates a 3D character's torsoGroup and headGroup with sculpted 3D facial features
 * (eyes, irises, pupils, eyebrows, nose, mouth, ears, hair, eyewear, beard)
 * and tailored 3D clothing details (collars, ties, lapels, gowns, jackets, jewelry).
 */
export function populate3DCharacterHeadAndTorso(
  role: CharacterModelRole,
  torsoGroup: THREE.Group,
  headGroup: THREE.Group,
  skinMat: THREE.MeshStandardMaterial,
  suitMat: THREE.MeshStandardMaterial,
  goldMat: THREE.MeshStandardMaterial
): void {
  const r = role === 'bao' ? 0.105 : role === 'dealer' ? 0.1 : 0.095;

  // Elongate head slightly for natural 3D cranial/jaw proportions
  headGroup.scale.set(role === 'bao' ? 1.04 : 0.93, 1.06, 0.96);

  // Shared materials
  const scleraMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.25 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: '#090d16', roughness: 0.12 });
  const whiteShirtMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.42 });

  const irisColorMap: Record<CharacterModelRole, string> = {
    dealer: '#451a03',
    viktor: '#334155', // steel grey-blue
    elena: '#5c2d16',  // warm amber-brown
    bao: '#1e1b18',    // dark espresso
    marcus: '#78350f', // warm hazel
  };
  const irisMat = new THREE.MeshStandardMaterial({ color: irisColorMap[role], roughness: 0.2 });

  const hairColorMap: Record<CharacterModelRole, string> = {
    dealer: '#1c1917',
    viktor: '#27272a', // dark charcoal with silver temples
    elena: '#181311',  // glossy espresso
    bao: '#0f172a',    // jet black
    marcus: '#291d16', // rich dark chestnut
  };
  const hairMat = new THREE.MeshStandardMaterial({
    color: hairColorMap[role],
    roughness: role === 'elena' || role === 'dealer' ? 0.34 : 0.5,
    metalness: 0.08,
  });

  // 0. Sculpted Rounded 3D Shoulders Dome on Top of Torso (eliminates flat cylinder cut)
  const shoulderDomeGeo = new THREE.SphereGeometry(0.128, 24, 16);
  const shoulderScaleX = role === 'bao' ? 1.55 : role === 'elena' ? 1.02 : 1.24;
  const shoulderScaleZ = role === 'bao' ? 1.32 : role === 'elena' ? 0.84 : 0.96;
  shoulderDomeGeo.scale(shoulderScaleX, 0.42, shoulderScaleZ);
  const shoulderDome = new THREE.Mesh(
    shoulderDomeGeo,
    role === 'elena' ? skinMat : suitMat
  );
  shoulderDome.position.set(0, role === 'dealer' ? 0.51 : 0.45, 0);
  torsoGroup.add(shoulderDome);

  // 1. Sculpted Neck & Jaw Chin Contour connecting torso and head
  const neckRadius = role === 'bao' ? 0.055 : role === 'elena' ? 0.036 : 0.043;
  const neckGeo = new THREE.CylinderGeometry(neckRadius, neckRadius * 1.14, 0.13, 18);
  const neckMesh = new THREE.Mesh(neckGeo, skinMat);
  neckMesh.position.set(0, -r * 0.85, -0.006);
  headGroup.add(neckMesh);

  // Sculpted Chin / Jawline rounded taper
  const chinGeo = new THREE.SphereGeometry(r * 0.56, 16, 12);
  chinGeo.scale(role === 'elena' ? 0.88 : 1.04, 0.65, 0.88);
  const chinMesh = new THREE.Mesh(chinGeo, skinMat);
  chinMesh.position.set(0, -r * 0.52, r * 0.36);
  headGroup.add(chinMesh);

  // 2. Sculpted 3D Ears (Left & Right)
  const earGeo = new THREE.SphereGeometry(r * 0.22, 12, 12);
  earGeo.scale(0.42, 0.82, 0.58);
  const leftEar = new THREE.Mesh(earGeo, skinMat);
  leftEar.position.set(-r * 0.96, -0.01, -0.01);
  const rightEar = new THREE.Mesh(earGeo, skinMat);
  rightEar.position.set(r * 0.96, -0.01, -0.01);
  headGroup.add(leftEar, rightEar);

  // 3. Sculpted 3D Nose Bridge & Tip
  const noseGeo = new THREE.ConeGeometry(
    role === 'bao' ? 0.018 : role === 'elena' ? 0.013 : 0.015,
    0.044,
    14
  );
  const noseMesh = new THREE.Mesh(noseGeo, skinMat);
  noseMesh.position.set(0, 0.01, r * 0.96);
  noseMesh.rotation.x = Math.PI * 0.36;
  headGroup.add(noseMesh);

  // 4. Sculpted 3D Eyes (Sclera + Iris + Pupil + Upper Eyelid Hood)
  const eyeX = r * 0.34;
  const eyeY = r * 0.14;
  const eyeZ = r * 0.86;
  const scleraGeo = new THREE.SphereGeometry(0.014, 14, 14);
  scleraGeo.scale(1.18, 0.82, 0.55);
  const irisGeo = new THREE.SphereGeometry(0.0082, 12, 12);
  irisGeo.scale(1.0, 1.0, 0.42);
  const pupilGeo = new THREE.SphereGeometry(0.0045, 10, 10);
  pupilGeo.scale(1.0, 1.0, 0.42);
  const eyelidGeo = new THREE.SphereGeometry(0.0155, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.48);
  eyelidGeo.scale(1.2, 0.85, 0.62);

  [-1, 1].forEach((dir) => {
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(dir * eyeX, eyeY, eyeZ);
    eyeGroup.rotation.y = dir * 0.16;

    const sclera = new THREE.Mesh(scleraGeo, scleraMat);
    const iris = new THREE.Mesh(irisGeo, irisMat);
    iris.position.set(0, role === 'bao' ? -0.002 : 0, 0.0068);
    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.set(0, role === 'bao' ? -0.002 : 0, 0.0092);

    const eyelid = new THREE.Mesh(eyelidGeo, skinMat);
    eyelid.rotation.x = role === 'viktor' || role === 'bao' ? 0.25 : 0.12;
    eyelid.position.set(0, 0.002, 0.001);

    eyeGroup.add(sclera, iris, pupil, eyelid);

    if (role === 'elena') {
      const lashGeo = new THREE.BoxGeometry(0.034, 0.004, 0.01);
      const lash = new THREE.Mesh(lashGeo, pupilMat);
      lash.position.set(dir * 0.002, 0.0075, 0.006);
      lash.rotation.z = dir * -0.12;
      eyeGroup.add(lash);
    }
    headGroup.add(eyeGroup);
  });

  // 5. Sculpted 3D Eyebrows
  const browGeo = new THREE.BoxGeometry(
    role === 'elena' ? 0.033 : 0.036,
    role === 'elena' ? 0.005 : 0.0075,
    0.012
  );
  [-1, 1].forEach((dir) => {
    const brow = new THREE.Mesh(browGeo, hairMat);
    brow.position.set(dir * eyeX, eyeY + 0.022, eyeZ + 0.004);
    brow.rotation.y = dir * 0.16;
    if (role === 'viktor') {
      brow.rotation.z = dir * 0.13;
    } else if (role === 'elena') {
      brow.rotation.z = dir * -0.08;
    } else if (role === 'marcus') {
      brow.rotation.z = dir === 1 ? -0.15 : 0.06;
    }
    headGroup.add(brow);
  });

  // 6. Sculpted 3D Mouth / Lips
  const lipColorMap: Record<CharacterModelRole, string> = {
    dealer: '#9a5b4a',
    viktor: '#9c6654',
    elena: '#be123c', // rich crimson rose
    bao: '#9c644f',
    marcus: '#945643',
  };
  const lipMat = new THREE.MeshStandardMaterial({
    color: lipColorMap[role],
    roughness: role === 'elena' ? 0.25 : 0.48,
  });

  if (role === 'elena') {
    const upperLipGeo = new THREE.SphereGeometry(0.013, 12, 10);
    upperLipGeo.scale(1.25, 0.34, 0.5);
    const upperLip = new THREE.Mesh(upperLipGeo, lipMat);
    upperLip.position.set(0, -r * 0.32, r * 0.9);
    const lowerLipGeo = new THREE.SphereGeometry(0.012, 12, 10);
    lowerLipGeo.scale(1.15, 0.36, 0.52);
    const lowerLip = new THREE.Mesh(lowerLipGeo, lipMat);
    lowerLip.position.set(0, -r * 0.38, r * 0.89);
    headGroup.add(upperLip, lowerLip);
  } else {
    const mouthGeo = new THREE.BoxGeometry(role === 'bao' ? 0.032 : 0.03, 0.0055, 0.01);
    const mouth = new THREE.Mesh(mouthGeo, lipMat);
    mouth.position.set(0, -r * 0.35, r * 0.89);
    if (role === 'marcus') {
      mouth.rotation.z = 0.12;
    }
    headGroup.add(mouth);
  }

  // 7. Role-Specific 3D Hair, Eyewear & Flush Tailored Garments
  if (role === 'dealer') {
    // Neat side-parted dark croupier hair cap + sculpted front wave
    const hairCapGeo = new THREE.SphereGeometry(r * 1.04, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.56);
    const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
    hairCap.position.set(0, 0.01, -0.008);
    hairCap.rotation.x = -0.22;
    headGroup.add(hairCap);

    const waveGeo = new THREE.SphereGeometry(r * 0.54, 16, 12);
    waveGeo.scale(1.42, 0.4, 0.72);
    const wave = new THREE.Mesh(waveGeo, hairMat);
    wave.position.set(0.012, r * 0.84, r * 0.48);
    wave.rotation.z = -0.12;
    headGroup.add(wave);

    // Groomed 3D jawline beard & mustache
    const beardGeo = new THREE.SphereGeometry(r * 0.99, 20, 14, 0, Math.PI * 2, Math.PI * 0.54, Math.PI * 0.42);
    const beard = new THREE.Mesh(beardGeo, hairMat);
    beard.position.set(0, -0.012, 0.012);
    headGroup.add(beard);

    const stacheGeo = new THREE.BoxGeometry(0.042, 0.008, 0.014);
    const stache = new THREE.Mesh(stacheGeo, hairMat);
    stache.position.set(0, -r * 0.25, r * 0.91);
    headGroup.add(stache);

    // Flush White Dress Shirt Chest Panel + 3D Gold Bow Tie + Gold Vest Buttons
    const shirtPanelGeo = new THREE.BoxGeometry(0.095, 0.19, 0.022);
    const shirtPanel = new THREE.Mesh(shirtPanelGeo, whiteShirtMat);
    shirtPanel.position.set(0, 0.42, 0.145);
    shirtPanel.rotation.x = -0.08;
    torsoGroup.add(shirtPanel);

    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.013, 12, 12), goldMat);
    knot.position.set(0, 0.49, 0.162);
    torsoGroup.add(knot);

    [-1, 1].forEach((dir) => {
      const wingGeo = new THREE.ConeGeometry(0.02, 0.038, 4);
      wingGeo.rotateZ(dir * (Math.PI / 2));
      const wing = new THREE.Mesh(wingGeo, goldMat);
      wing.position.set(dir * 0.022, 0.49, 0.16);
      torsoGroup.add(wing);
    });

    [0.32, 0.26, 0.2].forEach((yPos) => {
      const btnGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.008, 12);
      btnGeo.rotateX(Math.PI / 2);
      const btn = new THREE.Mesh(btnGeo, goldMat);
      btn.position.set(0, yPos, 0.172);
      torsoGroup.add(btn);
    });
  } else if (role === 'viktor') {
    // Viktor ("The Shark"): Swept-back executive charcoal hair with smooth silver-grey temples
    const hairCapGeo = new THREE.SphereGeometry(r * 1.04, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.56);
    const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
    hairCap.position.set(0, 0.01, -0.008);
    hairCap.rotation.x = -0.24;
    headGroup.add(hairCap);

    const pompadourGeo = new THREE.SphereGeometry(r * 0.56, 16, 12);
    pompadourGeo.scale(1.36, 0.44, 0.82);
    const pompadour = new THREE.Mesh(pompadourGeo, hairMat);
    pompadour.position.set(0, r * 0.86, r * 0.38);
    headGroup.add(pompadour);

    // Smooth contoured silver-grey sideburns/temples hugging the cranium
    const silverMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.38, metalness: 0.15 });
    const templeGeo = new THREE.SphereGeometry(r * 0.36, 12, 12);
    templeGeo.scale(0.28, 0.72, 0.88);
    [-1, 1].forEach((dir) => {
      const temple = new THREE.Mesh(templeGeo, silverMat);
      temple.position.set(dir * (r * 0.91), r * 0.22, 0.01);
      headGroup.add(temple);
    });

    // Flush White Shirt V-Panel, Silk Navy Tie, Notched Suit Lapels & Emerald Pocket Square
    const shirtPanelGeo = new THREE.BoxGeometry(0.082, 0.18, 0.02);
    const shirtPanel = new THREE.Mesh(shirtPanelGeo, whiteShirtMat);
    shirtPanel.position.set(0, 0.38, 0.125);
    shirtPanel.rotation.x = -0.08;
    torsoGroup.add(shirtPanel);

    const tieMat = new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.28, metalness: 0.25 });
    const tieKnot = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.014), tieMat);
    tieKnot.position.set(0, 0.44, 0.136);
    const tieBlade = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.15, 0.012), tieMat);
    tieBlade.position.set(0, 0.355, 0.141);
    tieBlade.rotation.x = -0.08;
    torsoGroup.add(tieKnot, tieBlade);

    const lapelMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.4, metalness: 0.18 });
    const lapelGeo = new THREE.BoxGeometry(0.032, 0.2, 0.016);
    [-1, 1].forEach((dir) => {
      const lapel = new THREE.Mesh(lapelGeo, lapelMat);
      lapel.position.set(dir * 0.048, 0.365, 0.138);
      lapel.rotation.set(-0.08, 0, dir * -0.22);
      torsoGroup.add(lapel);
    });

    const pocketMat = new THREE.MeshStandardMaterial({ color: '#10b981', roughness: 0.3 });
    const pocketSquare = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.016, 0.012), pocketMat);
    pocketSquare.position.set(0.076, 0.37, 0.132);
    pocketSquare.rotation.set(-0.08, 0.2, -0.1);
    torsoGroup.add(pocketSquare);
  } else if (role === 'elena') {
    // Elena ("The Rock"): Sculpted dark hair crown, high braided updo bun with gold cuff, ruby drop earrings & necklace
    const hairCapGeo = new THREE.SphereGeometry(r * 1.05, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.58);
    const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
    hairCap.position.set(0, 0.012, -0.008);
    hairCap.rotation.x = -0.24;
    headGroup.add(hairCap);

    const crownGeo = new THREE.SphereGeometry(r * 0.62, 16, 12);
    crownGeo.scale(1.32, 0.44, 0.8);
    const crown = new THREE.Mesh(crownGeo, hairMat);
    crown.position.set(0, r * 0.84, r * 0.34);
    headGroup.add(crown);

    const bunGeo = new THREE.SphereGeometry(0.056, 16, 16);
    bunGeo.scale(1.06, 0.88, 1.0);
    const bun = new THREE.Mesh(bunGeo, hairMat);
    bun.position.set(0, r * 1.02, -0.032);
    headGroup.add(bun);

    const bunCuffGeo = new THREE.TorusGeometry(0.042, 0.0055, 10, 24);
    bunCuffGeo.rotateX(Math.PI / 2.2);
    const bunCuff = new THREE.Mesh(bunCuffGeo, goldMat);
    bunCuff.position.set(0, r * 0.82, -0.026);
    headGroup.add(bunCuff);

    const rubyMat = new THREE.MeshStandardMaterial({ color: '#e11d48', roughness: 0.15, metalness: 0.35 });
    [-1, 1].forEach((dir) => {
      const stud = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 10, 10), goldMat);
      stud.position.set(dir * (r * 0.98), -0.02, 0.01);
      const drop = new THREE.Mesh(new THREE.ConeGeometry(0.0085, 0.024, 10), rubyMat);
      drop.position.set(dir * (r * 0.98), -0.038, 0.01);
      drop.rotation.x = Math.PI;
      headGroup.add(stud, drop);
    });

    // Symmetrical Gold Collar Necklace + Ruby Diamond Pendant on Collarbone
    const necklaceGeo = new THREE.TorusGeometry(0.056, 0.0045, 10, 28);
    necklaceGeo.rotateX(Math.PI / 2 - 0.22);
    const necklace = new THREE.Mesh(necklaceGeo, goldMat);
    necklace.position.set(0, 0.465, 0.012);
    const pendant = new THREE.Mesh(new THREE.OctahedronGeometry(0.013, 0), rubyMat);
    pendant.position.set(0, 0.435, 0.078);
    torsoGroup.add(necklace, pendant);

    // Burgundy Velvet Evening Gown Sweetheart Trim
    const trimGeo = new THREE.TorusGeometry(0.105, 0.007, 10, 24, Math.PI * 0.85);
    trimGeo.rotateX(Math.PI / 2 - 0.15);
    trimGeo.rotateZ(Math.PI * 0.075);
    const trim = new THREE.Mesh(trimGeo, goldMat);
    trim.position.set(0, 0.39, 0.012);
    torsoGroup.add(trim);
  } else if (role === 'bao') {
    // Bao ("The Calling Station"): Broad heavy cheeks, rectangular eyeglasses with cyan phone reflection, short black hair
    const cheekGeo = new THREE.SphereGeometry(0.042, 14, 12);
    [-1, 1].forEach((dir) => {
      const cheek = new THREE.Mesh(cheekGeo, skinMat);
      cheek.position.set(dir * 0.055, -0.02, 0.062);
      headGroup.add(cheek);
    });

    const hairCapGeo = new THREE.SphereGeometry(r * 1.04, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.52);
    const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
    hairCap.position.set(0, 0.014, -0.006);
    hairCap.rotation.x = -0.18;
    headGroup.add(hairCap);

    // 3D Rectangular Designer Eyeglasses with Cyan Phone Screen Reflection
    const frameMat = new THREE.MeshStandardMaterial({ color: '#0f172a', metalness: 0.75, roughness: 0.22 });
    const cyanLensMat = new THREE.MeshPhysicalMaterial({
      color: '#38bdf8',
      emissive: '#0284c7',
      emissiveIntensity: 0.5,
      roughness: 0.08,
      metalness: 0.25,
      transparent: true,
      opacity: 0.52,
    });

    [-1, 1].forEach((dir) => {
      const lensRimGeo = new THREE.BoxGeometry(0.042, 0.026, 0.005);
      const lensRim = new THREE.Mesh(lensRimGeo, frameMat);
      lensRim.position.set(dir * 0.035, eyeY - 0.002, r * 0.96);
      const lensPaneGeo = new THREE.PlaneGeometry(0.036, 0.02);
      const lensPane = new THREE.Mesh(lensPaneGeo, cyanLensMat);
      lensPane.position.set(dir * 0.035, eyeY - 0.002, r * 0.99);
      headGroup.add(lensRim, lensPane);
    });

    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.0045, 0.005), frameMat);
    bridge.position.set(0, eyeY + 0.003, r * 0.97);
    headGroup.add(bridge);

    // Flush Crew-Neck T-Shirt Panel & Bomber Jacket Metallic Zippers on Chest
    const teeMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.65 });
    const teePanel = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.22, 0.022), teeMat);
    teePanel.position.set(0, 0.34, 0.175);
    teePanel.rotation.x = -0.09;
    torsoGroup.add(teePanel);

    const zipperMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.88, roughness: 0.2 });
    [-1, 1].forEach((dir) => {
      const zip = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.23, 0.014), zipperMat);
      zip.position.set(dir * 0.056, 0.34, 0.184);
      zip.rotation.set(-0.09, 0, dir * -0.06);
      torsoGroup.add(zip);
    });
  } else if (role === 'marcus') {
    // Marcus ("The Maniac"): Voluminous Pompadour Hair, 3D Gold-Rimmed Aviator Sunglasses, Open Silk Shirt & Gold Chain
    const hairCapGeo = new THREE.SphereGeometry(r * 1.05, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.56);
    const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
    hairCap.position.set(0, 0.012, -0.01);
    hairCap.rotation.x = -0.22;
    headGroup.add(hairCap);

    const quiffGeo = new THREE.SphereGeometry(r * 0.62, 16, 14);
    quiffGeo.scale(1.34, 0.56, 0.88);
    const quiff = new THREE.Mesh(quiffGeo, hairMat);
    quiff.position.set(0, r * 0.94, r * 0.42);
    quiff.rotation.x = 0.18;
    headGroup.add(quiff);

    // 3D Gold-Rimmed Tinted Aviator Sunglasses (Dark Amber-Smoke Lenses + Double Gold Bridge)
    const aviatorLensMat = new THREE.MeshPhysicalMaterial({
      color: '#451a03',
      emissive: '#78350f',
      emissiveIntensity: 0.3,
      metalness: 0.4,
      roughness: 0.1,
      transparent: true,
      opacity: 0.84,
    });

    [-1, 1].forEach((dir) => {
      const bezelGeo = new THREE.CylinderGeometry(0.024, 0.021, 0.006, 18);
      bezelGeo.rotateX(Math.PI / 2);
      bezelGeo.scale(1.18, 0.9, 1);
      const bezel = new THREE.Mesh(bezelGeo, goldMat);
      bezel.position.set(dir * 0.035, eyeY, r * 0.95);

      const lensGeo = new THREE.CylinderGeometry(0.0215, 0.0185, 0.008, 18);
      lensGeo.rotateX(Math.PI / 2);
      lensGeo.scale(1.18, 0.9, 1);
      const lens = new THREE.Mesh(lensGeo, aviatorLensMat);
      lens.position.set(dir * 0.035, eyeY, r * 0.955);
      headGroup.add(bezel, lens);
    });

    const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.004, 0.006), goldMat);
    topBar.position.set(0, eyeY + 0.015, r * 0.97);
    const midBar = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.0035, 0.006), goldMat);
    midBar.position.set(0, eyeY + 0.004, r * 0.97);
    headGroup.add(topBar, midBar);

    // Flush Open-Collar Black Silk Shirt Panel + Gold Chain + Gold-Trimmed Blazer Lapels
    const blackSilkMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.25, metalness: 0.25 });
    const shirtPanel = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.19, 0.02), blackSilkMat);
    shirtPanel.position.set(0, 0.37, 0.128);
    shirtPanel.rotation.x = -0.08;
    torsoGroup.add(shirtPanel);

    const goldChainGeo = new THREE.TorusGeometry(0.036, 0.0045, 8, 20, Math.PI);
    goldChainGeo.rotateX(Math.PI - 0.08);
    const goldChain = new THREE.Mesh(goldChainGeo, goldMat);
    goldChain.position.set(0, 0.43, 0.14);
    torsoGroup.add(goldChain);

    [-1, 1].forEach((dir) => {
      const goldLapel = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.016), goldMat);
      goldLapel.position.set(dir * 0.052, 0.365, 0.14);
      goldLapel.rotation.set(-0.08, 0, dir * -0.22);
      torsoGroup.add(goldLapel);
    });
  }
}



