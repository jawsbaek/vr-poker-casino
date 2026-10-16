import * as THREE from 'three';
import { Card, ChipDenomination } from '../types/poker';
import { getRankLabel, getSuitSymbol } from '../logic/pokerEngine';

// Texture cache to prevent memory leaks and recreate overhead
const cardTextureCache = new Map<string, THREE.CanvasTexture>();
const chipTextureCache = new Map<ChipDenomination, { face: THREE.CanvasTexture; edge: THREE.CanvasTexture }>();
let feltTextureCache: THREE.CanvasTexture | null = null;
let cardBackTextureCache: THREE.CanvasTexture | null = null;
let rugTextureCache: THREE.CanvasTexture | null = null;
let wallTextureCache: THREE.CanvasTexture | null = null;


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
 * Creates 2048x2048 Monte Carlo Salon Prive wool-baize felt texture with hot-stamped gold-leaf
 * betting oval, royal crest, diamond weave, and millimeter-aligned community card boxes
 */
export function getCasinoFeltTexture(): THREE.CanvasTexture {
  if (feltTextureCache) return feltTextureCache;

  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d')!;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  // 1.0 meter = 994.17 pixels on the 1.03m radius recessed baize
  const pxPerMeter = 1024 / 1.03;

  // 1. Radial spotlight emerald wool-baize base gradient
  const grad = ctx.createRadialGradient(cx, cy - 40, 60, cx, cy, 980);
  grad.addColorStop(0, '#0e5230');
  grad.addColorStop(0.55, '#093e24');
  grad.addColorStop(1, '#052716');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. Subtle diamond-weave & wool-baize micro-grain
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.018)';
  ctx.lineWidth = 1;
  const step = 24;
  for (let i = -2048; i < 4096; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 2048, 2048);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i, 2048);
    ctx.lineTo(i + 2048, 0);
    ctx.stroke();
  }

  // 3. Recessed outer racetrack shadow vignette around edge of baize (rx = 1.015m)
  ctx.save();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.lineWidth = 28;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 1.015 * pxPerMeter, 1.015 * 0.66 * pxPerMeter, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // 4. Hot-Stamped Gold-Leaf Double Betting Line (rx = 0.78m, rz = 0.78 * 0.66m)
  const betRx = 0.78 * pxPerMeter;
  const betRz = 0.78 * 0.66 * pxPerMeter;

  ctx.strokeStyle = 'rgba(229, 193, 88, 0.62)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(cx, cy, betRx, betRz, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(229, 193, 88, 0.28)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, betRx - 16, betRz - 14, 0, 0, Math.PI * 2);
  ctx.stroke();

  // 8 Gold Diamond Pips along the Betting Line
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const px = cx + Math.cos(ang) * (betRx - 8);
    const py = cy + Math.sin(ang) * (betRz - 7);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang + Math.PI / 4);
    ctx.fillStyle = 'rgba(243, 212, 110, 0.65)';
    ctx.fillRect(-5, -5, 10, 10);
    ctx.restore();
  }

  // 5. 5 Gold-Filigree Community Card Boxes calibrated to COMMUNITY_POSITIONS (x = -0.28..+0.28m, z = -0.06m)
  const slotW = 0.098 * pxPerMeter;
  const slotH = 0.138 * pxPerMeter;
  const slotCenterY = cy + -0.06 * pxPerMeter;
  const suits = ['♠', '♥', '♦', '♣', '♠'];

  for (let i = 0; i < 5; i++) {
    const worldX = (i - 2) * 0.14;
    const slotCenterX = cx + worldX * pxPerMeter;
    const sx = slotCenterX - slotW / 2;
    const sy = slotCenterY - slotH / 2;

    // Subtle darkened inner card bed
    ctx.fillStyle = 'rgba(4, 24, 14, 0.32)';
    ctx.beginPath();
    ctx.roundRect(sx, sy, slotW, slotH, 8);
    ctx.fill();

    // Outer gold frame
    ctx.strokeStyle = 'rgba(229, 193, 88, 0.48)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(sx, sy, slotW, slotH, 8);
    ctx.stroke();

    // Inner hairline frame
    ctx.strokeStyle = 'rgba(229, 193, 88, 0.22)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(sx + 6, sy + 6, slotW - 12, slotH - 12, 5);
    ctx.stroke();

    // Subtle suit emblem in center of empty card box
    ctx.fillStyle = 'rgba(229, 193, 88, 0.16)';
    ctx.font = 'bold 28px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(suits[i], slotCenterX, slotCenterY);
  }

  // 6. Monte Carlo Salon Prive Royal Crest & Typography
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Crown / Diamond emblem above title
  ctx.strokeStyle = 'rgba(229, 193, 88, 0.42)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy - 265, 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(229, 193, 88, 0.38)';
  ctx.font = 'bold 26px serif';
  ctx.fillText('♛', cx, cy - 264);

  ctx.font = 'bold 46px "Plus Jakarta Sans", serif';
  ctx.fillStyle = 'rgba(235, 201, 96, 0.36)';
  ctx.fillText('CASINO DE MONTE-CARLO', cx, cy - 208);

  ctx.font = 'bold 22px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = 'rgba(229, 193, 88, 0.28)';
  ctx.fillText('SALON PRIVÉ • HIGH-STAKES NO-LIMIT HOLD’EM', cx, cy + 88);

  // Decorative gold flourish line under subtitle
  ctx.strokeStyle = 'rgba(229, 193, 88, 0.30)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 220, cy + 122);
  ctx.lineTo(cx + 220, cy + 122);
  ctx.stroke();
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  feltTextureCache = texture;
  return texture;
}

/**
 * Creates an ornate 1024x1024 Crimson, Obsidian & Gold-Leaf Monte Carlo Art Deco / Persian
 * woven area rug texture placed beneath the poker table and VIP armchairs
 */
export function getMonteCarloRugTexture(): THREE.CanvasTexture {
  if (rugTextureCache) return rugTextureCache;

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  const cx = 512;
  const cy = 512;

  // Deep royal crimson-burgundy wool base
  const bgGrad = ctx.createRadialGradient(cx, cy, 80, cx, cy, 700);
  bgGrad.addColorStop(0, '#450d16');
  bgGrad.addColorStop(0.65, '#2b080e');
  bgGrad.addColorStop(1, '#160509');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1024, 1024);

  // Outer Obsidian & Gold Greek-Key / Art Deco Border Frieze
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 10;
  ctx.strokeRect(28, 28, 968, 968);

  ctx.strokeStyle = 'rgba(212, 175, 55, 0.55)';
  ctx.lineWidth = 4;
  ctx.strokeRect(52, 52, 920, 920);
  ctx.strokeRect(88, 88, 848, 848);

  // Geometric Art Deco border medallions
  ctx.fillStyle = 'rgba(212, 175, 55, 0.28)';
  for (let i = 64; i < 960; i += 48) {
    ctx.fillRect(i - 8, 64, 16, 12);
    ctx.fillRect(i - 8, 948, 16, 12);
    ctx.fillRect(64, i - 8, 12, 16);
    ctx.fillRect(948, i - 8, 12, 16);
  }

  // Central Concentric Persian/Casino Rosette Medallion
  for (let r = 380; r >= 100; r -= 70) {
    ctx.strokeStyle = r % 140 === 0 ? 'rgba(212, 175, 55, 0.42)' : 'rgba(15, 23, 42, 0.65)';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 16 Radial Gold Sunburst Spokes
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.22)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * 95, cy + Math.sin(ang) * 95);
    ctx.lineTo(cx + Math.cos(ang) * 380, cy + Math.sin(ang) * 380);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  rugTextureCache = texture;
  return texture;
}

/**
 * Creates a repeating architectural mahogany boiserie & gold-leaf coffered wainscoting wall texture
 */
export function getCofferedWallTexture(): THREE.CanvasTexture {
  if (wallTextureCache) return wallTextureCache;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Rich dark walnut/mahogany wall base
  ctx.fillStyle = '#180c08';
  ctx.fillRect(0, 0, 512, 512);

  // Upper damask / espresso panel & lower wainscoting dado rail
  ctx.fillStyle = '#120906';
  ctx.fillRect(24, 24, 464, 300);
  ctx.fillRect(24, 356, 464, 132);

  // Gold-leaf recessed architectural coffer moldings
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.55)';
  ctx.lineWidth = 4;
  ctx.strokeRect(28, 28, 456, 292);
  ctx.strokeRect(42, 42, 428, 264);

  // Lower wainscoting panel molding
  ctx.strokeRect(28, 360, 456, 124);
  ctx.strokeRect(42, 374, 428, 96);

  // Horizontal Brass Chair Rail & Crown Cornice
  ctx.fillStyle = '#b48a2e';
  ctx.fillRect(0, 0, 512, 10);
  ctx.fillRect(0, 336, 512, 8);
  ctx.fillRect(0, 500, 512, 12);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 1);
  texture.anisotropy = 8;
  wallTextureCache = texture;
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
  const r = role === 'bao' ? 0.106 : role === 'dealer' ? 0.102 : 0.095;

  // Elongate head slightly for natural 3D cranial/jaw proportions
  headGroup.scale.set(role === 'bao' ? 1.05 : 0.95, 1.08, 0.97);

  // Shared materials
  const scleraMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.22 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: '#090d16', roughness: 0.12 });
  const whiteShirtMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.4 });
  const noseMat = new THREE.MeshStandardMaterial({
    color: skinMat.color.clone().multiplyScalar(0.91),
    roughness: 0.42,
  });

  const irisColorMap: Record<CharacterModelRole, string> = {
    dealer: '#451a03',
    viktor: '#2563eb', // steel sapphire-blue
    elena: '#7c2d12',  // warm amber-brown
    bao: '#1e1b18',    // dark espresso
    marcus: '#78350f', // warm hazel
  };
  const irisMat = new THREE.MeshStandardMaterial({ color: irisColorMap[role], roughness: 0.18 });

  const hairColorMap: Record<CharacterModelRole, string> = {
    dealer: '#1c1917',
    viktor: '#27272a', // dark charcoal with silver temples
    elena: '#181311',  // glossy espresso
    bao: '#0f172a',    // jet black
    marcus: '#291d16', // rich dark chestnut
  };
  const hairMat = new THREE.MeshStandardMaterial({
    color: hairColorMap[role],
    roughness: role === 'elena' || role === 'dealer' ? 0.32 : 0.45,
    metalness: 0.08,
  });

  // 0. Sculpted 3D Lateral Deltoids & Rounded Shoulders Bridge (tucked in Z so it never pokes through chest garments)
  const bustRadius = role === 'dealer' ? 0.152 : 0.132;
  const shoulderBustGeo = new THREE.SphereGeometry(bustRadius, 32, 24);
  const bustScaleX = role === 'bao' ? 1.66 : role === 'elena' ? 1.08 : 1.32;
  const bustScaleY = role === 'dealer' ? 0.62 : 0.58;
  const bustScaleZ = role === 'bao' ? 0.98 : role === 'elena' ? 0.72 : 0.74;
  shoulderBustGeo.scale(bustScaleX, bustScaleY, bustScaleZ);
  const shoulderBust = new THREE.Mesh(
    shoulderBustGeo,
    role === 'elena' ? skinMat : suitMat
  );
  shoulderBust.position.set(0, role === 'dealer' ? 0.41 : 0.37, -0.01);
  torsoGroup.add(shoulderBust);

  // For Elena's off-shoulder evening gown, add a sculpted velvet bustier below her collarbone
  if (role === 'elena') {
    const gownBustGeo = new THREE.SphereGeometry(0.132, 32, 20);
    gownBustGeo.scale(1.06, 0.55, 0.88);
    const gownBust = new THREE.Mesh(gownBustGeo, suitMat);
    gownBust.position.set(0, 0.33, 0.008);
    torsoGroup.add(gownBust);
  }

  // 1. Sculpted Neck & Jaw Chin Contour connecting torso and head
  const neckRadius = role === 'bao' ? 0.056 : role === 'elena' ? 0.038 : 0.045;
  const neckGeo = new THREE.CylinderGeometry(neckRadius, neckRadius * 1.18, 0.15, 24);
  const neckMesh = new THREE.Mesh(neckGeo, skinMat);
  neckMesh.position.set(0, -r * 0.88, -0.005);
  headGroup.add(neckMesh);

  // Sculpted Chin / Jawline rounded taper
  const chinGeo = new THREE.SphereGeometry(r * 0.54, 24, 18);
  chinGeo.scale(role === 'elena' ? 0.86 : 1.0, 0.64, 0.82);
  const chinMesh = new THREE.Mesh(chinGeo, skinMat);
  chinMesh.position.set(0, -r * 0.52, r * 0.28);
  headGroup.add(chinMesh);

  // 2. Sculpted 3D Ears (Left & Right)
  const earGeo = new THREE.SphereGeometry(r * 0.22, 16, 16);
  earGeo.scale(0.42, 0.85, 0.58);
  const leftEar = new THREE.Mesh(earGeo, skinMat);
  leftEar.position.set(-r * 0.96, -0.01, -0.01);
  const rightEar = new THREE.Mesh(earGeo, skinMat);
  rightEar.position.set(r * 0.96, -0.01, -0.01);
  headGroup.add(leftEar, rightEar);

  // 3. Sculpted 3D Nose Bridge & Rounded Tip (shaded for crisp 3D depth)
  const noseBridgeGeo = new THREE.CapsuleGeometry(
    role === 'bao' ? 0.0115 : role === 'elena' ? 0.0088 : 0.01,
    0.025,
    10,
    14
  );
  const noseMesh = new THREE.Mesh(noseBridgeGeo, noseMat);
  noseMesh.position.set(0, 0.004, r * 0.985);
  noseMesh.rotation.x = -0.2;
  headGroup.add(noseMesh);

  // 4. Sculpted 3D Eyes (Sclera + Iris + Pupil + Upper Eyelid Hood)
  const eyeX = r * 0.34;
  const eyeY = r * 0.12;
  const eyeZ = r * 0.88;
  const scleraGeo = new THREE.SphereGeometry(0.015, 18, 18);
  scleraGeo.scale(1.18, 0.85, 0.55);
  const irisGeo = new THREE.SphereGeometry(0.009, 16, 16);
  irisGeo.scale(1.0, 1.0, 0.42);
  const pupilGeo = new THREE.SphereGeometry(0.005, 14, 14);
  pupilGeo.scale(1.0, 1.0, 0.42);
  const eyelidGeo = new THREE.SphereGeometry(0.0165, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.48);
  eyelidGeo.scale(1.2, 0.86, 0.62);

  [-1, 1].forEach((dir) => {
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(dir * eyeX, eyeY, eyeZ);
    eyeGroup.rotation.y = dir * 0.16;

    const sclera = new THREE.Mesh(scleraGeo, scleraMat);
    const iris = new THREE.Mesh(irisGeo, irisMat);
    iris.position.set(0, 0, 0.0072);
    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.set(0, 0, 0.0098);

    const eyelid = new THREE.Mesh(eyelidGeo, skinMat);
    eyelid.rotation.x = role === 'viktor' ? 0.22 : 0.12;
    eyelid.position.set(0, 0.002, 0.001);

    eyeGroup.add(sclera, iris, pupil, eyelid);

    if (role === 'elena') {
      const lashGeo = new THREE.CapsuleGeometry(0.0022, 0.028, 6, 10);
      lashGeo.rotateZ(Math.PI / 2);
      const lash = new THREE.Mesh(lashGeo, pupilMat);
      lash.position.set(dir * 0.002, 0.008, 0.006);
      lash.rotation.z = dir * -0.1;
      eyeGroup.add(lash);
    }
    headGroup.add(eyeGroup);
  });

  // 5. Sculpted 3D Eyebrows (Smooth Capsules)
  const browRadius = role === 'elena' ? 0.0032 : 0.0045;
  const browGeo = new THREE.CapsuleGeometry(browRadius, 0.026, 8, 12);
  browGeo.rotateZ(Math.PI / 2);
  [-1, 1].forEach((dir) => {
    const brow = new THREE.Mesh(browGeo, hairMat);
    brow.position.set(dir * eyeX, eyeY + 0.023, eyeZ + 0.005);
    brow.rotation.y = dir * 0.16;
    if (role === 'viktor') {
      brow.rotation.z = dir * 0.12;
    } else if (role === 'elena') {
      brow.rotation.z = dir * -0.06;
    } else if (role === 'marcus') {
      brow.rotation.z = dir === 1 ? -0.14 : 0.05;
    }
    headGroup.add(brow);
  });

  // 6. Sculpted 3D Mouth / Lips (positioned outside the head surface at z = r * 0.965)
  const lipColorMap: Record<CharacterModelRole, string> = {
    dealer: '#9a5b4a',
    viktor: '#8c5343',
    elena: '#be123c', // rich crimson rose
    bao: '#8f5542',
    marcus: '#8a4b38',
  };
  const lipMat = new THREE.MeshStandardMaterial({
    color: lipColorMap[role],
    roughness: role === 'elena' ? 0.24 : 0.42,
  });

  if (role === 'elena') {
    const upperLipGeo = new THREE.SphereGeometry(0.013, 16, 12);
    upperLipGeo.scale(1.28, 0.34, 0.55);
    const upperLip = new THREE.Mesh(upperLipGeo, lipMat);
    upperLip.position.set(0, -r * 0.30, r * 0.955);
    const lowerLipGeo = new THREE.SphereGeometry(0.012, 16, 12);
    lowerLipGeo.scale(1.18, 0.36, 0.56);
    const lowerLip = new THREE.Mesh(lowerLipGeo, lipMat);
    lowerLip.position.set(0, -r * 0.36, r * 0.945);
    headGroup.add(upperLip, lowerLip);
  } else {
    const mouthGeo = new THREE.CapsuleGeometry(0.0042, role === 'bao' ? 0.026 : 0.024, 10, 14);
    mouthGeo.rotateZ(Math.PI / 2);
    const mouth = new THREE.Mesh(mouthGeo, lipMat);
    mouth.position.set(0, -r * 0.34, r * 0.965);
    if (role === 'marcus') {
      mouth.rotation.z = 0.1;
    }
    headGroup.add(mouth);
  }

  // 7. Role-Specific 3D Hair (Concentric outer radius > r so zero forehead polygon clipping!), Eyewear & Garments
  if (role === 'dealer') {
    // Neat side-parted dark croupier hair cap + sculpted front wave
    const hairCapGeo = new THREE.SphereGeometry(r * 1.05, 36, 28, 0, Math.PI * 2, 0, Math.PI * 0.48);
    const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
    hairCap.position.set(0, 0.004, 0);
    hairCap.rotation.x = -0.22;
    headGroup.add(hairCap);

    const waveGeo = new THREE.SphereGeometry(r * 0.56, 24, 16);
    waveGeo.scale(1.45, 0.42, 0.78);
    const wave = new THREE.Mesh(waveGeo, hairMat);
    wave.position.set(0.01, r * 0.80, r * 0.52);
    wave.rotation.z = -0.1;
    headGroup.add(wave);

    // Groomed 3D Sideburns + Dapper Handlebar Mustache + Sculpted Chin Goatee (leaves cheeks & smile visible!)
    const sideburnGeo = new THREE.CapsuleGeometry(0.007, 0.032, 8, 12);
    [-1, 1].forEach((dir) => {
      const sideburn = new THREE.Mesh(sideburnGeo, hairMat);
      sideburn.position.set(dir * (r * 0.95), 0.0, r * 0.22);
      headGroup.add(sideburn);
    });

    const stacheWingGeo = new THREE.CapsuleGeometry(0.0052, 0.018, 8, 12);
    stacheWingGeo.rotateZ(Math.PI / 2);
    [-1, 1].forEach((dir) => {
      const wing = new THREE.Mesh(stacheWingGeo, hairMat);
      wing.position.set(dir * 0.011, -r * 0.23, r * 0.975);
      wing.rotation.z = dir * -0.18;
      headGroup.add(wing);
    });

    const goateeGeo = new THREE.SphereGeometry(r * 0.28, 20, 16);
    goateeGeo.scale(1.05, 0.78, 0.65);
    const goatee = new THREE.Mesh(goateeGeo, hairMat);
    goatee.position.set(0, -r * 0.58, r * 0.82);
    headGroup.add(goatee);

    // Flush White Dress Shirt Chest Panel + 3D Gold Bow Tie + Gold Vest Buttons
    const shirtPanelGeo = new THREE.BoxGeometry(0.095, 0.19, 0.024);
    const shirtPanel = new THREE.Mesh(shirtPanelGeo, whiteShirtMat);
    shirtPanel.position.set(0, 0.38, 0.132);
    shirtPanel.rotation.x = -0.14;
    torsoGroup.add(shirtPanel);

    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.013, 14, 14), goldMat);
    knot.position.set(0, 0.45, 0.148);
    torsoGroup.add(knot);

    [-1, 1].forEach((dir) => {
      const wingGeo = new THREE.ConeGeometry(0.02, 0.038, 4);
      wingGeo.rotateZ(dir * (Math.PI / 2));
      const wing = new THREE.Mesh(wingGeo, goldMat);
      wing.position.set(dir * 0.022, 0.45, 0.146);
      torsoGroup.add(wing);
    });

    [0.30, 0.24, 0.18].forEach((yPos) => {
      const btnGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.008, 14);
      btnGeo.rotateX(Math.PI / 2);
      const btn = new THREE.Mesh(btnGeo, goldMat);
      btn.position.set(0, yPos, 0.152);
      torsoGroup.add(btn);
    });
  } else if (role === 'viktor') {
    // Viktor ("The Shark"): Swept-back executive charcoal hair with smooth silver-grey temples
    const hairCapGeo = new THREE.SphereGeometry(r * 1.05, 36, 28, 0, Math.PI * 2, 0, Math.PI * 0.48);
    const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
    hairCap.position.set(0, 0.004, 0);
    hairCap.rotation.x = -0.22;
    headGroup.add(hairCap);

    const pompadourGeo = new THREE.SphereGeometry(r * 0.58, 24, 16);
    pompadourGeo.scale(1.38, 0.44, 0.84);
    const pompadour = new THREE.Mesh(pompadourGeo, hairMat);
    pompadour.position.set(0, r * 0.82, r * 0.44);
    headGroup.add(pompadour);

    // Smooth contoured silver-grey sideburns/temples hugging the cranium
    const silverMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.35, metalness: 0.15 });
    const templeGeo = new THREE.SphereGeometry(r * 0.36, 16, 16);
    templeGeo.scale(0.26, 0.72, 0.85);
    [-1, 1].forEach((dir) => {
      const temple = new THREE.Mesh(templeGeo, silverMat);
      temple.position.set(dir * (r * 0.92), r * 0.22, 0.01);
      headGroup.add(temple);
    });

    // Flush White Shirt V-Panel, Silk Navy Tie, Notched Suit Lapels & Emerald Pocket Square
    const shirtPanelGeo = new THREE.BoxGeometry(0.082, 0.19, 0.024);
    const shirtPanel = new THREE.Mesh(shirtPanelGeo, whiteShirtMat);
    shirtPanel.position.set(0, 0.35, 0.118);
    shirtPanel.rotation.x = -0.12;
    torsoGroup.add(shirtPanel);

    const tieMat = new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.28, metalness: 0.25 });
    const tieKnot = new THREE.Mesh(new THREE.SphereGeometry(0.013, 12, 12), tieMat);
    tieKnot.position.set(0, 0.415, 0.132);
    const tieBlade = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.15, 0.012), tieMat);
    tieBlade.position.set(0, 0.33, 0.136);
    tieBlade.rotation.x = -0.12;
    torsoGroup.add(tieKnot, tieBlade);

    const lapelMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.38, metalness: 0.18 });
    const lapelGeo = new THREE.BoxGeometry(0.032, 0.20, 0.016);
    [-1, 1].forEach((dir) => {
      const lapel = new THREE.Mesh(lapelGeo, lapelMat);
      lapel.position.set(dir * 0.048, 0.34, 0.132);
      lapel.rotation.set(-0.12, 0, dir * -0.22);
      torsoGroup.add(lapel);
    });

    const pocketMat = new THREE.MeshStandardMaterial({ color: '#10b981', roughness: 0.3 });
    const pocketSquare = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.016, 0.012), pocketMat);
    pocketSquare.position.set(0.076, 0.34, 0.126);
    pocketSquare.rotation.set(-0.12, 0.2, -0.1);
    torsoGroup.add(pocketSquare);
  } else if (role === 'elena') {
    // Elena ("The Rock"): Sculpted dark hair crown, high braided updo bun with gold cuff, ruby drop earrings & necklace
    const hairCapGeo = new THREE.SphereGeometry(r * 1.05, 36, 28, 0, Math.PI * 2, 0, Math.PI * 0.48);
    const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
    hairCap.position.set(0, 0.004, 0);
    hairCap.rotation.x = -0.22;
    headGroup.add(hairCap);

    const crownGeo = new THREE.SphereGeometry(r * 0.62, 24, 16);
    crownGeo.scale(1.34, 0.44, 0.82);
    const crown = new THREE.Mesh(crownGeo, hairMat);
    crown.position.set(0, r * 0.80, r * 0.38);
    headGroup.add(crown);

    const bunGeo = new THREE.SphereGeometry(0.056, 20, 20);
    bunGeo.scale(1.06, 0.88, 1.0);
    const bun = new THREE.Mesh(bunGeo, hairMat);
    bun.position.set(0, r * 1.02, -0.032);
    headGroup.add(bun);

    const bunCuffGeo = new THREE.TorusGeometry(0.042, 0.0055, 12, 28);
    bunCuffGeo.rotateX(Math.PI / 2.2);
    const bunCuff = new THREE.Mesh(bunCuffGeo, goldMat);
    bunCuff.position.set(0, r * 0.82, -0.026);
    headGroup.add(bunCuff);

    const rubyMat = new THREE.MeshStandardMaterial({ color: '#e11d48', roughness: 0.15, metalness: 0.35 });
    [-1, 1].forEach((dir) => {
      const stud = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 12, 12), goldMat);
      stud.position.set(dir * (r * 0.98), -0.02, 0.01);
      const drop = new THREE.Mesh(new THREE.ConeGeometry(0.0085, 0.024, 12), rubyMat);
      drop.position.set(dir * (r * 0.98), -0.038, 0.01);
      drop.rotation.x = Math.PI;
      headGroup.add(stud, drop);
    });

    // Symmetrical Gold Collar Necklace + Ruby Diamond Pendant on Collarbone
    const necklaceGeo = new THREE.TorusGeometry(0.058, 0.0045, 12, 32);
    necklaceGeo.rotateX(Math.PI / 2 - 0.18);
    const necklace = new THREE.Mesh(necklaceGeo, goldMat);
    necklace.position.set(0, 0.445, 0.015);
    const pendant = new THREE.Mesh(new THREE.OctahedronGeometry(0.013, 0), rubyMat);
    pendant.position.set(0, 0.425, 0.082);
    torsoGroup.add(necklace, pendant);
  } else if (role === 'bao') {
    // Bao ("The Calling Station"): Broad heavy cheeks, rectangular eyeglasses with cyan phone reflection, short black hair
    const cheekGeo = new THREE.SphereGeometry(0.042, 18, 16);
    [-1, 1].forEach((dir) => {
      const cheek = new THREE.Mesh(cheekGeo, skinMat);
      cheek.position.set(dir * 0.054, -0.022, 0.060);
      headGroup.add(cheek);
    });

    const hairCapGeo = new THREE.SphereGeometry(r * 1.05, 36, 28, 0, Math.PI * 2, 0, Math.PI * 0.44);
    const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
    hairCap.position.set(0, 0.006, 0);
    hairCap.rotation.x = -0.22;
    headGroup.add(hairCap);

    // 3D Rectangular Designer Eyeglasses with Cyan Phone Screen Reflection
    const frameMat = new THREE.MeshStandardMaterial({ color: '#0f172a', metalness: 0.75, roughness: 0.22 });
    const cyanLensMat = new THREE.MeshPhysicalMaterial({
      color: '#38bdf8',
      emissive: '#0284c7',
      emissiveIntensity: 0.42,
      roughness: 0.08,
      metalness: 0.2,
      transparent: true,
      opacity: 0.34,
    });

    [-1, 1].forEach((dir) => {
      const topRim = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.004, 0.005), frameMat);
      topRim.position.set(dir * 0.036, eyeY + 0.011, r * 0.97);
      const botRim = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.0035, 0.005), frameMat);
      botRim.position.set(dir * 0.036, eyeY - 0.011, r * 0.97);
      const sideRim = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.024, 0.005), frameMat);
      sideRim.position.set(dir * 0.055, eyeY, r * 0.97);
      const lensPane = new THREE.Mesh(new THREE.PlaneGeometry(0.038, 0.020), cyanLensMat);
      lensPane.position.set(dir * 0.036, eyeY, r * 0.975);
      headGroup.add(topRim, botRim, sideRim, lensPane);
    });

    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.004, 0.005), frameMat);
    bridge.position.set(0, eyeY + 0.004, r * 0.98);
    headGroup.add(bridge);

    // Flush Crew-Neck T-Shirt Panel & Bomber Jacket Metallic Zippers on Chest
    const teeMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.65 });
    const teePanel = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.22, 0.024), teeMat);
    teePanel.position.set(0, 0.32, 0.165);
    teePanel.rotation.x = -0.12;
    torsoGroup.add(teePanel);

    const zipperMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.88, roughness: 0.2 });
    [-1, 1].forEach((dir) => {
      const zip = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.22, 0.014), zipperMat);
      zip.position.set(dir * 0.056, 0.32, 0.174);
      zip.rotation.set(-0.12, 0, dir * -0.06);
      torsoGroup.add(zip);
    });
  } else if (role === 'marcus') {
    // Marcus ("The Maniac"): Voluminous Pompadour Hair, 3D Gold-Rimmed Aviator Sunglasses, Open Silk Shirt & Gold Chain
    const hairCapGeo = new THREE.SphereGeometry(r * 1.05, 36, 28, 0, Math.PI * 2, 0, Math.PI * 0.48);
    const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
    hairCap.position.set(0, 0.004, 0);
    hairCap.rotation.x = -0.22;
    headGroup.add(hairCap);

    const quiffGeo = new THREE.SphereGeometry(r * 0.62, 24, 18);
    quiffGeo.scale(1.36, 0.56, 0.88);
    const quiff = new THREE.Mesh(quiffGeo, hairMat);
    quiff.position.set(0, r * 0.90, r * 0.44);
    quiff.rotation.x = 0.16;
    headGroup.add(quiff);

    // 3D Gold-Rimmed Tinted Aviator Sunglasses (Dark Amber-Smoke Lenses + Double Gold Bridge)
    const aviatorLensMat = new THREE.MeshPhysicalMaterial({
      color: '#451a03',
      emissive: '#78350f',
      emissiveIntensity: 0.28,
      metalness: 0.35,
      roughness: 0.1,
      transparent: true,
      opacity: 0.78,
    });

    [-1, 1].forEach((dir) => {
      const bezelGeo = new THREE.TorusGeometry(0.021, 0.0028, 10, 24);
      bezelGeo.scale(1.18, 0.92, 1);
      const bezel = new THREE.Mesh(bezelGeo, goldMat);
      bezel.position.set(dir * 0.036, eyeY, r * 0.96);

      const lensGeo = new THREE.CircleGeometry(0.020, 24);
      lensGeo.scale(1.18, 0.92, 1);
      const lens = new THREE.Mesh(lensGeo, aviatorLensMat);
      lens.position.set(dir * 0.036, eyeY, r * 0.962);
      headGroup.add(bezel, lens);
    });

    const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.0038, 0.005), goldMat);
    topBar.position.set(0, eyeY + 0.015, r * 0.97);
    const midBar = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.0032, 0.005), goldMat);
    midBar.position.set(0, eyeY + 0.004, r * 0.97);
    headGroup.add(topBar, midBar);

    // Flush Open-Collar Black Silk Shirt Panel + Gold Chain + Gold-Trimmed Blazer Lapels
    const blackSilkMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.25, metalness: 0.25 });
    const shirtPanel = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.19, 0.024), blackSilkMat);
    shirtPanel.position.set(0, 0.34, 0.120);
    shirtPanel.rotation.x = -0.12;
    torsoGroup.add(shirtPanel);

    const goldChainGeo = new THREE.TorusGeometry(0.036, 0.0045, 10, 24, Math.PI);
    goldChainGeo.rotateX(Math.PI - 0.12);
    const goldChain = new THREE.Mesh(goldChainGeo, goldMat);
    goldChain.position.set(0, 0.405, 0.134);
    torsoGroup.add(goldChain);

    [-1, 1].forEach((dir) => {
      const goldLapel = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.20, 0.016), goldMat);
      goldLapel.position.set(dir * 0.052, 0.34, 0.132);
      goldLapel.rotation.set(-0.12, 0, dir * -0.22);
      torsoGroup.add(goldLapel);
    });
  }
}



