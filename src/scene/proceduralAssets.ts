import * as THREE from 'three';
import { Card, ChipDenomination } from '../types/poker';
import { getRankLabel, getSuitSymbol } from '../logic/pokerEngine';

// Texture & geometry caches to prevent memory leaks and recreate overhead
const cardTextureCache = new Map<string, THREE.CanvasTexture>();
const chipTextureCache = new Map<
  ChipDenomination,
  {
    face: THREE.CanvasTexture;
    edge: THREE.CanvasTexture;
    normalMap: THREE.CanvasTexture;
    roughnessMap: THREE.CanvasTexture;
  }
>();
let feltTextureCache: THREE.CanvasTexture | null = null;
let cardBackTextureCache: THREE.CanvasTexture | null = null;
let cardBackRoughnessCache: THREE.CanvasTexture | null = null;
let cardLinenNormalCache: THREE.CanvasTexture | null = null;
let chipNormalCache: THREE.CanvasTexture | null = null;
let chipRoughnessCache: THREE.CanvasTexture | null = null;
let sculptedChipGeometryCache: THREE.BufferGeometry | null = null;
let sculptedCardGeometryCache: THREE.BufferGeometry | null = null;
let rugTextureCache: THREE.CanvasTexture | null = null;
let wallTextureCache: THREE.CanvasTexture | null = null;

/**
 * Generates an Air-Cushion Linen micro-weave tangent-space Normal Map for Kem/Copag casino cards
 */
export function getCardLinenNormalMap(): THREE.CanvasTexture {
  if (cardLinenNormalCache) return cardLinenNormalCache;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      // Diagonal cross-hatched air-cushion linen dimple weave
      const u = (x + y) * 0.55;
      const v = (x - y) * 0.55;
      const nx = Math.cos(u) * 14 + Math.cos(v) * 10;
      const ny = Math.sin(u) * 14 - Math.sin(v) * 10;
      data[idx] = Math.max(0, Math.min(255, Math.round(128 + nx)));
      data[idx + 1] = Math.max(0, Math.min(255, Math.round(128 + ny)));
      data[idx + 2] = 252;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 8);
  cardLinenNormalCache = texture;
  return texture;
}

/**
 * Creates a 1024x1432 procedural ornate Monte-Carlo gold-foil & royal burgundy casino card back texture
 */
export function getCardBackTexture(): THREE.CanvasTexture {
  if (cardBackTextureCache) return cardBackTextureCache;

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1432;
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;

  // Warm ivory cellulose-acetate outer border
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, w, h);

  // Deep royal burgundy-obsidian inner back field
  const bgGrad = ctx.createRadialGradient(cx, cy, 80, cx, cy, 780);
  bgGrad.addColorStop(0, '#311324');
  bgGrad.addColorStop(0.6, '#1f0c18');
  bgGrad.addColorStop(1, '#11070e');
  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  ctx.roundRect(42, 42, w - 84, h - 84, 34);
  ctx.fill();

  // Outer double gold-foil filigree border
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.roundRect(56, 56, w - 112, h - 112, 26);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(243, 229, 171, 0.65)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(74, 74, w - 148, h - 148, 18);
  ctx.stroke();

  // Ornate guilloché diamond lattice inside clip
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(80, 80, w - 160, h - 160, 14);
  ctx.clip();

  ctx.strokeStyle = 'rgba(212, 175, 55, 0.34)';
  ctx.lineWidth = 2.5;
  const step = 36;
  for (let x = -h; x < w + h; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + h, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + h, 0);
    ctx.stroke();
  }

  // Subtle gold rosette dots at lattice intersections
  ctx.fillStyle = 'rgba(243, 229, 171, 0.28)';
  for (let y = 96; y < h - 80; y += step) {
    for (let x = 96; x < w - 80; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Corner gold-leaf fan flourishes
  const corners = [
    [96, 96],
    [w - 96, 96],
    [96, h - 96],
    [w - 96, h - 96],
  ];
  for (const [qx, qy] of corners) {
    ctx.fillStyle = '#1f0c18';
    ctx.beginPath();
    ctx.arc(qx, qy, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.fillStyle = '#f3e5ab';
    ctx.font = 'bold 34px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', qx, qy);
  }

  // Central Monte-Carlo Sunburst Medallion
  ctx.fillStyle = '#180912';
  ctx.beginPath();
  ctx.arc(cx, cy, 185, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#d4af37';
  ctx.stroke();

  ctx.lineWidth = 3;
  ctx.strokeStyle = '#f3e5ab';
  ctx.beginPath();
  ctx.arc(cx, cy, 166, 0, Math.PI * 2);
  ctx.stroke();

  // 24 Gold Sunburst Rays inside Medallion
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * Math.PI * 2;
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(243, 229, 171, 0.5)' : 'rgba(212, 175, 55, 0.25)';
    ctx.lineWidth = i % 2 === 0 ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * 58, cy + Math.sin(ang) * 58);
    ctx.lineTo(cx + Math.cos(ang) * 158, cy + Math.sin(ang) * 158);
    ctx.stroke();
  }

  // Center Crown & Spade Crest
  ctx.fillStyle = '#260e1c';
  ctx.beginPath();
  ctx.arc(cx, cy, 82, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f3e5ab';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = '#f3e5ab';
  ctx.font = 'bold 104px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('♠', cx, cy + 4);

  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  cardBackTextureCache = texture;
  return texture;
}

/**
 * Returns a roughness map for the card back so gold-foil lines catch sharp specular reflections
 */
export function getCardBackRoughnessMap(): THREE.CanvasTexture {
  if (cardBackRoughnessCache) return cardBackRoughnessCache;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 358;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#787878'; // Satin base stock (~0.47 roughness)
  ctx.fillRect(0, 0, 256, 358);
  ctx.strokeStyle = '#242424'; // Glossy gold foil border (~0.14 roughness)
  ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, 228, 330);
  ctx.beginPath();
  ctx.arc(128, 179, 46, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  cardBackRoughnessCache = tex;
  return tex;
}

/**
 * Helper to draw traditional 2-10 casino pip grids, ornate Ace centerpiece, or Royal Court (J, Q, K) art
 */
function drawCasinoCardInterior(
  ctx: CanvasRenderingContext2D,
  card: Card,
  w: number,
  h: number,
  color: string,
  isRed: boolean,
  rankStr: string,
  suitStr: string
) {
  const cx = w / 2;
  const cy = h / 2;

  // Subtle inner frame line around the outer card border + interior pip/court frame
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.22)';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.roundRect(28, 28, w - 56, h - 56, 32);
  ctx.stroke();

  // Inner hairline gold/slate frame separating corner indices from the central pip/court field
  ctx.strokeStyle = isRed ? 'rgba(153, 27, 27, 0.38)' : 'rgba(15, 23, 42, 0.28)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(184, 164, w - 368, h - 328, 18);
  ctx.stroke();

  const drawPip = (px: number, py: number, size: number, inverted: boolean = false) => {
    ctx.save();
    ctx.translate(px, py);
    if (inverted) ctx.rotate(Math.PI);
    ctx.fillStyle = color;
    ctx.font = `bold ${size}px Georgia, "Plus Jakarta Sans", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(suitStr, 0, 0);
    ctx.restore();
  };

  if (card.rank === 14) {
    // Ornate Monte-Carlo Ace Centerpiece
    ctx.save();
    ctx.fillStyle = isRed ? 'rgba(153, 27, 27, 0.10)' : 'rgba(9, 13, 22, 0.08)';
    ctx.beginPath();
    ctx.arc(cx, cy, 210, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(161, 114, 23, 0.82)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(cx, cy, 210, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(15, 23, 42, 0.38)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 192, 0, Math.PI * 2);
    ctx.stroke();

    drawPip(cx, cy, 365, false);

    // Subtle gold crown inside Ace pip
    ctx.fillStyle = '#d4af37';
    ctx.font = 'bold 52px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♛', cx, cy - 8);
    ctx.restore();
    return;
  }

  if (card.rank >= 11 && card.rank <= 13) {
    // Royal Court Card (J, Q, K) with High-Contrast Medallion & Double-Headed Royal Crest
    ctx.save();
    const boxX = 196;
    const boxY = 180;
    const boxW = w - 392;
    const boxH = h - 360;

    const courtGrad = ctx.createLinearGradient(boxX, boxY, boxX + boxW, boxY + boxH);
    courtGrad.addColorStop(0, isRed ? 'rgba(153, 27, 27, 0.22)' : 'rgba(9, 13, 22, 0.20)');
    courtGrad.addColorStop(0.5, 'rgba(180, 130, 31, 0.38)');
    courtGrad.addColorStop(1, isRed ? 'rgba(153, 27, 27, 0.22)' : 'rgba(9, 13, 22, 0.20)');
    ctx.fillStyle = courtGrad;
    ctx.fillRect(boxX, boxY, boxW, boxH);

    ctx.strokeStyle = '#855812';
    ctx.lineWidth = 8;
    ctx.strokeRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.38)';
    ctx.lineWidth = 3.5;
    ctx.strokeRect(boxX + 12, boxY + 12, boxW - 24, boxH - 24);

    // Diagonal reflection divider line (traditional double-headed court split)
    ctx.strokeStyle = 'rgba(133, 88, 18, 0.75)';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(boxX + 12, boxY + boxH * 0.58);
    ctx.lineTo(boxX + boxW - 12, boxY + boxH * 0.42);
    ctx.stroke();

    const courtSymbol = card.rank === 13 ? '♚' : card.rank === 12 ? '♛' : '♞';
    const courtTitle = card.rank === 13 ? 'ROI' : card.rank === 12 ? 'DAME' : 'VALET';

    // Top-half upright royal portrait crest & bottom-half inverted mirror crest
    for (const isBottom of [false, true]) {
      ctx.save();
      ctx.translate(cx, isBottom ? cy + 250 : cy - 250);
      if (isBottom) ctx.rotate(Math.PI);

      // High-contrast court inner badge disc behind crown (globalAlpha >= 0.42)
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = isRed ? '#b4821f' : '#475569';
      ctx.beginPath();
      ctx.arc(0, 0, 122, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = '#855812';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, 122, 0, Math.PI * 2);
      ctx.stroke();

      // Royal chess/crown figure
      ctx.fillStyle = color;
      ctx.font = 'bold 162px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(courtSymbol, 0, -8);

      // Flanking large suit pips inside court frame
      ctx.font = 'bold 102px Georgia, serif';
      ctx.fillText(suitStr, -182, -95);
      ctx.fillStyle = '#5c3d08';
      ctx.font = 'bold 32px "Cinzel", Georgia, serif';
      ctx.fillText(courtTitle, 0, 90);
      ctx.restore();
    }

    // Center gold-foil royal rank medallion
    ctx.fillStyle = '#090d16';
    ctx.beginPath();
    ctx.arc(cx, cy, 92, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 6.5;
    ctx.stroke();

    ctx.fillStyle = '#f3e5ab';
    ctx.font = 'bold 98px "Cinzel", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(rankStr, cx, cy + 4);
    ctx.restore();
    return;
  }

  // Authentic Casino Pip Grid Layouts for Ranks 2..10
  const leftX = cx - 148;
  const rightX = cx + 148;
  const topY = 295;
  const botY = h - 295;
  const midY = cy;
  const upperMidY = (topY + midY) / 2;
  const lowerMidY = (midY + botY) / 2;
  const thirdTopY = topY + (botY - topY) * 0.333;
  const thirdBotY = topY + (botY - topY) * 0.667;
  const pipSize = card.rank >= 8 ? 160 : 176;

  const pips: Array<[number, number, boolean]> = [];
  switch (card.rank) {
    case 2:
      pips.push([cx, topY, false], [cx, botY, true]);
      break;
    case 3:
      pips.push([cx, topY, false], [cx, midY, false], [cx, botY, true]);
      break;
    case 4:
      pips.push([leftX, topY, false], [rightX, topY, false], [leftX, botY, true], [rightX, botY, true]);
      break;
    case 5:
      pips.push(
        [leftX, topY, false],
        [rightX, topY, false],
        [cx, midY, false],
        [leftX, botY, true],
        [rightX, botY, true]
      );
      break;
    case 6:
      pips.push(
        [leftX, topY, false],
        [rightX, topY, false],
        [leftX, midY, false],
        [rightX, midY, false],
        [leftX, botY, true],
        [rightX, botY, true]
      );
      break;
    case 7:
      pips.push(
        [leftX, topY, false],
        [rightX, topY, false],
        [cx, upperMidY, false],
        [leftX, midY, false],
        [rightX, midY, false],
        [leftX, botY, true],
        [rightX, botY, true]
      );
      break;
    case 8:
      pips.push(
        [leftX, topY, false],
        [rightX, topY, false],
        [cx, upperMidY, false],
        [leftX, midY, false],
        [rightX, midY, false],
        [cx, lowerMidY, true],
        [leftX, botY, true],
        [rightX, botY, true]
      );
      break;
    case 9:
      pips.push(
        [leftX, topY, false],
        [rightX, topY, false],
        [leftX, thirdTopY, false],
        [rightX, thirdTopY, false],
        [cx, midY, false],
        [leftX, thirdBotY, true],
        [rightX, thirdBotY, true],
        [leftX, botY, true],
        [rightX, botY, true]
      );
      break;
    case 10:
      pips.push(
        [leftX, topY, false],
        [rightX, topY, false],
        [cx, (topY + thirdTopY) / 2, false],
        [leftX, thirdTopY, false],
        [rightX, thirdTopY, false],
        [leftX, thirdBotY, true],
        [rightX, thirdBotY, true],
        [cx, (botY + thirdBotY) / 2, true],
        [leftX, botY, true],
        [rightX, botY, true]
      );
      break;
  }

  for (const [px, py, inv] of pips) {
    drawPip(px, py, pipSize, inv);
  }
}

/**
 * Creates crisp 1024x1432 Casino Jumbo-Index + Authentic Pip Grid / Royal Court playing card front texture
 */
export function getCardFrontTexture(card: Card): THREE.CanvasTexture {
  const cacheKey = `${card.suit}_${card.rank}`;
  if (cardTextureCache.has(cacheKey)) {
    return cardTextureCache.get(cacheKey)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1432;
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;

  // Warm matte ivory/parchment outer border (#ddd6c7) + inner card stock (#e6e0d4)
  // Prevents ACESFilmic tone mapping + directional overhead spotlights from clipping to pure white (255, 255, 255)
  ctx.fillStyle = '#ddd6c7';
  ctx.fillRect(0, 0, w, h);

  const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 80, w / 2, h / 2, 840);
  bgGrad.addColorStop(0, '#e6e0d4');
  bgGrad.addColorStop(0.75, '#dfd8ca');
  bgGrad.addColorStop(1, '#ddd6c7');
  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  ctx.roundRect(28, 28, w - 56, h - 56, 32);
  ctx.fill();

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const color = isRed ? '#991b1b' : '#090d16';
  const rankStr = getRankLabel(card.rank);
  const suitStr = getSuitSymbol(card.suit);

  // Draw Jumbo Corner Indices (Top-Left upright & Bottom-Right inverted)
  const drawJumboCorner = (isBottomRight: boolean) => {
    ctx.save();
    if (isBottomRight) {
      ctx.translate(w - 106, h - 134);
      ctx.rotate(Math.PI);
    } else {
      ctx.translate(106, 134);
    }
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.font =
      rankStr === '10'
        ? '900 124px "Plus Jakarta Sans", Georgia, sans-serif'
        : '900 140px "Plus Jakarta Sans", Georgia, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(rankStr, 0, 0);
    ctx.fillText(rankStr, 0, 0);

    ctx.font = 'bold 122px Georgia, "Plus Jakarta Sans", serif';
    ctx.fillText(suitStr, 0, 120);
    ctx.restore();
  };

  drawJumboCorner(false);
  drawJumboCorner(true);

  // Draw Authentic 2-10 Pip Grid, Ace Medallion, or Royal Court Art
  drawCasinoCardInterior(ctx, card, w, h, color, isRed, rankStr, suitStr);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  cardTextureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Generates shared procedural Normal Map (12-notch compression clay mold + recessed inlay step)
 * and Roughness Map (matte chalky clay outer ring vs satin laminated center medallion) for 3D chips.
 */
function getSharedChipPBRMaps(): { normalMap: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } {
  if (chipNormalCache && chipRoughnessCache) {
    return { normalMap: chipNormalCache, roughnessMap: chipRoughnessCache };
  }

  const size = 512;
  const cx = size / 2;
  const cy = size / 2;

  const norCanvas = document.createElement('canvas');
  norCanvas.width = size;
  norCanvas.height = size;
  const nCtx = norCanvas.getContext('2d')!;
  const nImg = nCtx.createImageData(size, size);
  const nData = nImg.data;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;
  const rImg = rCtx.createImageData(size, size);
  const rData = rImg.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.hypot(dx, dy) / (size * 0.5); // 0..1 normalized radius
      const theta = Math.atan2(dy, dx);

      let nx = 0;
      let ny = 0;
      let roughVal = 185; // Default matte compression clay (~0.72 roughness)

      if (r < 0.58) {
        // Satin laminated center inlay medallion (anti-glare so overhead light doesn't wash out denomination)
        roughVal = 118; // ~0.46 roughness
        // Subtle gold filigree ring at r ≈ 0.545..0.578
        if (r > 0.545 && r < 0.578) {
          roughVal = 52; // Metallic gold ring (~0.20 roughness)
          const ringSlope = Math.sin(((r - 0.545) / 0.033) * Math.PI * 2) * 28;
          nx += Math.cos(theta) * ringSlope;
          ny += Math.sin(theta) * ringSlope;
        }
      } else if (r >= 0.58 && r <= 0.63) {
        // Recessed inlay step bevel wall
        roughVal = 135;
        const stepSlope = 52;
        nx -= Math.cos(theta) * stepSlope;
        ny -= Math.sin(theta) * stepSlope;
      } else if (r > 0.63 && r < 0.96) {
        // Outer compression-molded clay ring with 12 radial mold notches + chalky micro-grain
        const hash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const grain = (hash - Math.floor(hash) - 0.5) * 18;
        const moldNotch = Math.sin(theta * 12) * 20;
        nx += -Math.sin(theta) * moldNotch + grain;
        ny += Math.cos(theta) * moldNotch + grain;
        roughVal = 196; // Matte clay (~0.77 roughness)
      } else if (r >= 0.96) {
        // Outer chamfered lip
        nx += Math.cos(theta) * 46;
        ny += Math.sin(theta) * 46;
        roughVal = 160;
      }

      nData[idx] = Math.max(0, Math.min(255, Math.round(128 + nx)));
      nData[idx + 1] = Math.max(0, Math.min(255, Math.round(128 + ny)));
      nData[idx + 2] = 248;
      nData[idx + 3] = 255;

      rData[idx] = roughVal;
      rData[idx + 1] = roughVal;
      rData[idx + 2] = roughVal;
      rData[idx + 3] = 255;
    }
  }

  nCtx.putImageData(nImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  chipNormalCache = new THREE.CanvasTexture(norCanvas);
  chipRoughnessCache = new THREE.CanvasTexture(roughCanvas);
  chipNormalCache.anisotropy = 4;
  chipRoughnessCache.anisotropy = 4;
  return { normalMap: chipNormalCache, roughnessMap: chipRoughnessCache };
}

/**
 * Creates 512x512 authentic compression-molded clay casino chip PBR textures (Face, Edge, Normal, Roughness)
 */
export function getChipTextures(denom: ChipDenomination): {
  face: THREE.CanvasTexture;
  edge: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  if (chipTextureCache.has(denom)) {
    return chipTextureCache.get(denom)!;
  }

  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = 512;
  faceCanvas.height = 512;
  const fCtx = faceCanvas.getContext('2d')!;

  let primaryColor = '#cbd5e1';
  let stripeColor = '#1d4ed8';
  let accentTrimColor = '#60a5fa';
  let textColor = '#0f172a';
  let valueLabel = '$1';

  switch (denom) {
    case 1:
      primaryColor = '#cbd5e1';
      stripeColor = '#1d4ed8';
      accentTrimColor = '#60a5fa';
      textColor = '#0f172a';
      valueLabel = '$1';
      break;
    case 5:
      primaryColor = '#991b1b';
      stripeColor = '#e2dcd0';
      accentTrimColor = '#f87171';
      textColor = '#7f1d1d';
      valueLabel = '$5';
      break;
    case 25:
      primaryColor = '#14532d';
      stripeColor = '#ca8a04';
      accentTrimColor = '#facc15';
      textColor = '#064e3b';
      valueLabel = '$25';
      break;
    case 100:
      primaryColor = '#0f172a';
      stripeColor = '#b4821f';
      accentTrimColor = '#f3e5ab';
      textColor = '#f3e5ab';
      valueLabel = '$100';
      break;
  }

  const cx = 256;
  const cy = 256;

  // 1. Base circular compression-clay body
  fCtx.fillStyle = primaryColor;
  fCtx.beginPath();
  fCtx.arc(cx, cy, 252, 0, Math.PI * 2);
  fCtx.fill();

  // 2. 6 Two-Tone Edge Inlay Spots + 6 Recessed Clay Mold Pips
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    fCtx.save();
    fCtx.translate(cx, cy);
    fCtx.rotate(angle);
    fCtx.fillStyle = stripeColor;
    fCtx.fillRect(192, -30, 60, 60);
    fCtx.fillStyle = accentTrimColor;
    fCtx.fillRect(192, -10, 60, 20);
    fCtx.restore();

    // Recessed clay mold diamond pip between edge stripes
    const midAngle = angle + Math.PI / 6;
    fCtx.save();
    fCtx.translate(cx + Math.cos(midAngle) * 204, cy + Math.sin(midAngle) * 204);
    fCtx.rotate(midAngle + Math.PI / 4);
    fCtx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    fCtx.lineWidth = 3.5;
    fCtx.strokeRect(-10, -10, 20, 20);
    fCtx.restore();
  }

  // 3. Outer chamfered bevel shadow ring
  const outerBevelGrad = fCtx.createRadialGradient(cx, cy, 230, cx, cy, 254);
  outerBevelGrad.addColorStop(0, 'rgba(0,0,0,0)');
  outerBevelGrad.addColorStop(1, 'rgba(0,0,0,0.48)');
  fCtx.fillStyle = outerBevelGrad;
  fCtx.beginPath();
  fCtx.arc(cx, cy, 254, 0, Math.PI * 2);
  fCtx.fill();

  // 4. Recessed inner well step shadow ring (at r ≈ 156px)
  fCtx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  fCtx.lineWidth = 9;
  fCtx.beginPath();
  fCtx.arc(cx, cy, 156, 0, Math.PI * 2);
  fCtx.stroke();

  // 5. Center laminated inlay medallion disc (warm parchment stock so overhead light never blows out text)
  const inlayGrad = fCtx.createRadialGradient(cx - 24, cy - 24, 12, cx, cy, 152);
  if (denom === 100) {
    inlayGrad.addColorStop(0, '#1e293b');
    inlayGrad.addColorStop(1, '#090c12');
  } else {
    inlayGrad.addColorStop(0, '#e5dec9');
    inlayGrad.addColorStop(1, '#d3c8b0');
  }
  fCtx.fillStyle = inlayGrad;
  fCtx.beginPath();
  fCtx.arc(cx, cy, 152, 0, Math.PI * 2);
  fCtx.fill();

  // 6. Double Champagne-Gold Filigree Inlay Bezel
  fCtx.strokeStyle = '#9a6f18';
  fCtx.lineWidth = 8;
  fCtx.beginPath();
  fCtx.arc(cx, cy, 142, 0, Math.PI * 2);
  fCtx.stroke();

  fCtx.strokeStyle = 'rgba(154, 111, 24, 0.55)';
  fCtx.lineWidth = 3;
  fCtx.beginPath();
  fCtx.arc(cx, cy, 130, 0, Math.PI * 2);
  fCtx.stroke();

  // 7. Crown emblem, Denomination typography & Salon Privé subtext
  fCtx.fillStyle = denom === 100 ? '#d4af37' : '#855812';
  fCtx.font = 'bold 28px Georgia, serif';
  fCtx.textAlign = 'center';
  fCtx.textBaseline = 'middle';
  fCtx.fillText('♛', cx, cy - 68);

  fCtx.fillStyle = denom === 100 ? '#f3e5ab' : textColor;
  fCtx.font = 'bold 86px "Cinzel", "Plus Jakarta Sans", Georgia, serif';
  fCtx.fillText(valueLabel, cx, cy - 2);

  fCtx.font = 'bold 21px "Plus Jakarta Sans", sans-serif';
  fCtx.fillStyle = denom === 100 ? '#d4af37' : '#78530d';
  fCtx.fillText('MONTE-CARLO', cx, cy + 56);

  // 8. Edge canvas for cylinder sides + chamfer shadow bands
  const edgeCanvas = document.createElement('canvas');
  edgeCanvas.width = 512;
  edgeCanvas.height = 64;
  const eCtx = edgeCanvas.getContext('2d')!;

  eCtx.fillStyle = primaryColor;
  eCtx.fillRect(0, 0, 512, 64);

  const numStripes = 6;
  const stripeW = 512 / (numStripes * 2);
  for (let i = 0; i < numStripes; i++) {
    const sx = i * stripeW * 2;
    eCtx.fillStyle = stripeColor;
    eCtx.fillRect(sx, 0, stripeW, 64);
    eCtx.fillStyle = accentTrimColor;
    eCtx.fillRect(sx + stripeW * 0.33, 0, stripeW * 0.34, 64);
  }

  // Top & bottom chamfer bevel shadow gradients on edge strip so stacked chips have crisp shadow grooves
  const edgeBevelGrad = eCtx.createLinearGradient(0, 0, 0, 64);
  edgeBevelGrad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  edgeBevelGrad.addColorStop(0.16, 'rgba(255, 255, 255, 0.12)');
  edgeBevelGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  edgeBevelGrad.addColorStop(0.84, 'rgba(0, 0, 0, 0.12)');
  edgeBevelGrad.addColorStop(1, 'rgba(0, 0, 0, 0.62)');
  eCtx.fillStyle = edgeBevelGrad;
  eCtx.fillRect(0, 0, 512, 64);

  const faceTexture = new THREE.CanvasTexture(faceCanvas);
  const edgeTexture = new THREE.CanvasTexture(edgeCanvas);
  faceTexture.colorSpace = THREE.SRGBColorSpace;
  edgeTexture.colorSpace = THREE.SRGBColorSpace;
  faceTexture.anisotropy = 8;
  edgeTexture.anisotropy = 8;

  const pbrMaps = getSharedChipPBRMaps();
  const result = {
    face: faceTexture,
    edge: edgeTexture,
    normalMap: pbrMaps.normalMap,
    roughnessMap: pbrMaps.roughnessMap,
  };
  chipTextureCache.set(denom, result);
  return result;
}

/**
 * Builds the sculpted 3D compression-clay casino chip BufferGeometry matching Blender's Prototype_ClayChip:
 * - Chamfered top/bottom outer lips (creates shadow grooves between stacked chips)
 * - 12 subtle radial compression-mold relief waves on the outer clay rim
 * - 0.28mm recessed center medallion inlay well
 * - 2 material groups: Group 0 = side edge + outer chamfer (cylindrical UVs), Group 1 = top & bottom sculpted faces (planar UVs)
 */
export function createSculptedClayChipGeometry(
  radius: number = 0.022,
  height: number = 0.0045,
  segments: number = 36
): THREE.BufferGeometry {
  if (sculptedChipGeometryCache && radius === 0.022 && height === 0.0045) {
    return sculptedChipGeometryCache;
  }

  const halfH = height * 0.5;
  const bevelH = halfH - 0.00055;
  const wellH = halfH - 0.00028;

  const rOuter = radius;
  const rBevel = radius - 0.00065;
  const rWellOuter = radius * 0.64;
  const rWellInner = radius * 0.61;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const edgeIndices: number[] = [];
  const faceIndices: number[] = [];

  const pushVertex = (
    px: number,
    py: number,
    pz: number,
    nx: number,
    ny: number,
    nz: number,
    u: number,
    v: number
  ) => {
    const idx = positions.length / 3;
    positions.push(px, py, pz);
    const len = Math.hypot(nx, ny, nz) || 1;
    normals.push(nx / len, ny / len, nz / len);
    uvs.push(u, v);
    return idx;
  };

  // --- GROUP 0: Outer Cylindrical Wall + Top/Bottom Chamfer Bevels (uses sideMat / textures.edge) ---
  const sideRings: Array<{ r: number; y: number; ny: number; nr: number; v: number }> = [
    { r: rBevel, y: -halfH, ny: -0.65, nr: 0.76, v: 0.0 },
    { r: rOuter, y: -bevelH, ny: -0.15, nr: 0.98, v: 0.16 },
    { r: rOuter, y: bevelH, ny: 0.15, nr: 0.98, v: 0.84 },
    { r: rBevel, y: halfH, ny: 0.65, nr: 0.76, v: 1.0 },
  ];

  const sideRingVerts: number[][] = [];
  for (const sr of sideRings) {
    const row: number[] = [];
    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      const theta = u * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      row.push(
        pushVertex(
          cosT * sr.r,
          sr.y,
          sinT * sr.r,
          cosT * sr.nr,
          sr.ny,
          sinT * sr.nr,
          u,
          sr.v
        )
      );
    }
    sideRingVerts.push(row);
  }

  for (let r = 0; r < sideRingVerts.length - 1; r++) {
    for (let s = 0; s < segments; s++) {
      const a = sideRingVerts[r][s];
      const b = sideRingVerts[r][s + 1];
      const c = sideRingVerts[r + 1][s + 1];
      const d = sideRingVerts[r + 1][s];
      edgeIndices.push(a, c, b, a, d, c);
    }
  }

  // --- GROUP 1: Sculpted Top & Bottom Faces with Recessed Center Inlay Well (uses faceMat / textures.face) ---
  for (const sign of [1, -1]) {
    const centerIdx = pushVertex(0, sign * wellH, 0, 0, sign, 0, 0.5, 0.5);
    const faceRadii = [
      { r: rWellInner, y: sign * wellH, nr: sign * 0.25, ny: sign * 0.97, mold: false },
      { r: rWellOuter, y: sign * halfH, nr: sign * -0.35, ny: sign * 0.94, mold: true },
      { r: rBevel, y: sign * halfH, nr: sign * 0.18, ny: sign * 0.98, mold: true },
    ];

    const fRings: number[][] = [];
    for (const fr of faceRadii) {
      const row: number[] = [];
      for (let s = 0; s < segments; s++) {
        const theta = (s / segments) * Math.PI * 2;
        const moldWave = fr.mold ? 0.00007 * Math.cos(theta * 12) : 0;
        const rad = fr.r + moldWave;
        const px = Math.cos(theta) * rad;
        const pz = Math.sin(theta) * rad;
        const u = (sign > 0 ? px : -px) / (radius * 2) + 0.5;
        const v = 0.5 - pz / (radius * 2);
        row.push(
          pushVertex(
            px,
            fr.y + sign * moldWave * 0.4,
            pz,
            Math.cos(theta) * fr.nr,
            fr.ny,
            Math.sin(theta) * fr.nr,
            u,
            v
          )
        );
      }
      fRings.push(row);
    }

    for (let s = 0; s < segments; s++) {
      const nxt = (s + 1) % segments;
      if (sign > 0) {
        faceIndices.push(centerIdx, fRings[0][nxt], fRings[0][s]);
      } else {
        faceIndices.push(centerIdx, fRings[0][s], fRings[0][nxt]);
      }
      for (let r = 0; r < fRings.length - 1; r++) {
        const a = fRings[r][s];
        const b = fRings[r][nxt];
        const c = fRings[r + 1][nxt];
        const d = fRings[r + 1][s];
        if (sign > 0) {
          faceIndices.push(a, b, c, a, c, d);
        } else {
          faceIndices.push(a, c, b, a, d, c);
        }
      }
    }
  }

  const allIndices = [...edgeIndices, ...faceIndices];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(allIndices);
  geo.clearGroups();
  geo.addGroup(0, edgeIndices.length, 0);
  geo.addGroup(edgeIndices.length, faceIndices.length, 1);

  if (radius === 0.022 && height === 0.0045) {
    sculptedChipGeometryCache = geo;
  }
  return geo;
}

/**
 * Builds the poker-standard 86x122mm playing card BufferGeometry matching Blender's Prototype_PlayingCard:
 * - 3.5mm rounded corners
 * - 0.6mm longitudinal casino bridge camber arch (creates contact shadow and rolling specular highlight)
 * - 3 material groups: Group 0 = beveled perimeter edge, Group 1 = top face (front), Group 2 = bottom face (back)
 */
export function createRoundedCamberedCardGeometry(
  width: number = 0.086,
  length: number = 0.122,
  thickness: number = 0.0008,
  cornerRadius: number = 0.0035,
  camberHeight: number = 0.0006
): THREE.BufferGeometry {
  if (sculptedCardGeometryCache && width === 0.086 && length === 0.122) {
    return sculptedCardGeometryCache;
  }

  const nx = 12;
  const ny = 16;
  const halfW = width * 0.5;
  const halfL = length * 0.5;
  const halfT = thickness * 0.5;

  const clampRounded = (x: number, z: number): [number, number] => {
    const cx = Math.max(-halfW + cornerRadius, Math.min(halfW - cornerRadius, x));
    const cz = Math.max(-halfL + cornerRadius, Math.min(halfL - cornerRadius, z));
    const dx = x - cx;
    const dz = z - cz;
    const dist = Math.hypot(dx, dz);
    if (dist > cornerRadius && dist > 1e-6) {
      return [cx + (dx / dist) * cornerRadius, cz + (dz / dist) * cornerRadius];
    }
    return [x, z];
  };

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const edgeIndices: number[] = [];
  const topIndices: number[] = [];
  const botIndices: number[] = [];

  const pushVert = (
    px: number,
    py: number,
    pz: number,
    nxVal: number,
    nyVal: number,
    nzVal: number,
    u: number,
    v: number
  ) => {
    const idx = positions.length / 3;
    positions.push(px, py, pz);
    const len = Math.hypot(nxVal, nyVal, nzVal) || 1;
    normals.push(nxVal / len, nyVal / len, nzVal / len);
    uvs.push(u, v);
    return idx;
  };

  const topGrid: number[][] = [];
  const botGrid: number[][] = [];

  for (let iz = 0; iz <= ny; iz++) {
    const tz = (iz / ny) * 2 - 1;
    const rawZ = tz * halfL;
    const tRow: number[] = [];
    const bRow: number[] = [];

    for (let ix = 0; ix <= nx; ix++) {
      const tx = (ix / nx) * 2 - 1;
      const rawX = tx * halfW;
      const [px, pz] = clampRounded(rawX, rawZ);

      // Smooth 0.6mm bridge camber arch across the card belly
      const archX = Math.cos((px / halfW) * (Math.PI * 0.5));
      const archZ = Math.cos((pz / halfL) * (Math.PI * 0.35));
      const yArch = camberHeight * archX * archZ;

      // Analytical normal tilt from bridge camber
      const dArchDx =
        -camberHeight *
        (Math.PI / width) *
        Math.sin((px / halfW) * (Math.PI * 0.5)) *
        archZ;
      const dArchDz =
        -camberHeight *
        ((Math.PI * 0.7) / length) *
        archX *
        Math.sin((pz / halfL) * (Math.PI * 0.35));

      const uTop = px / width + 0.5;
      const vTop = 1.0 - (pz / length + 0.5);
      const uBot = 1.0 - uTop;
      const vBot = vTop;

      tRow.push(pushVert(px, halfT + yArch, pz, -dArchDx, 1.0, -dArchDz, uTop, vTop));
      bRow.push(pushVert(px, -halfT + yArch, pz, dArchDx, -1.0, dArchDz, uBot, vBot));
    }
    topGrid.push(tRow);
    botGrid.push(bRow);
  }

  for (let iz = 0; iz < ny; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const t00 = topGrid[iz][ix];
      const t10 = topGrid[iz][ix + 1];
      const t11 = topGrid[iz + 1][ix + 1];
      const t01 = topGrid[iz + 1][ix];
      topIndices.push(t00, t01, t11, t00, t11, t10);

      const b00 = botGrid[iz][ix];
      const b10 = botGrid[iz][ix + 1];
      const b11 = botGrid[iz + 1][ix + 1];
      const b01 = botGrid[iz + 1][ix];
      botIndices.push(b00, b11, b01, b00, b10, b11);
    }
  }

  // Beveled perimeter edge loop
  const perimCoords: Array<[number, number]> = [];
  for (let ix = 0; ix < nx; ix++) perimCoords.push([0, ix]);
  for (let iz = 0; iz < ny; iz++) perimCoords.push([iz, nx]);
  for (let ix = nx; ix > 0; ix--) perimCoords.push([ny, ix]);
  for (let iz = ny; iz > 0; iz--) perimCoords.push([iz, 0]);

  for (let i = 0; i < perimCoords.length; i++) {
    const [iz0, ix0] = perimCoords[i];
    const [iz1, ix1] = perimCoords[(i + 1) % perimCoords.length];
    const tA = topGrid[iz0][ix0];
    const tB = topGrid[iz1][ix1];
    const bA = botGrid[iz0][ix0];
    const bB = botGrid[iz1][ix1];
    edgeIndices.push(bA, tB, tA, bA, bB, tB);
  }

  const allIndices = [...edgeIndices, ...topIndices, ...botIndices];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(allIndices);
  geo.clearGroups();
  geo.addGroup(0, edgeIndices.length, 0);
  geo.addGroup(edgeIndices.length, topIndices.length, 1);
  geo.addGroup(edgeIndices.length + topIndices.length, botIndices.length, 2);

  if (width === 0.086 && length === 0.122) {
    sculptedCardGeometryCache = geo;
  }
  return geo;
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
 * Draws or updates a 3D floating status & action speech plaque for an AI player.
 * Strictly adheres to the Monochrome Obsidian (#090c12) + Warm Ivory (#f8fafc) + Single Champagne Gold (#d4af37) rule.
 */
export function drawAvatarPlaque(
  canvas: HTMLCanvasElement,
  name: string,
  chips: number,
  actionText: string,
  isTurn: boolean,
  folded: boolean,
  eliminated: boolean,
  _accentColor: string,
  isDealer: boolean,
  tellLabel?: string,
  chatBubbleText?: string,
  portraitImg?: HTMLImageElement | null,
  positionLabel?: string,
  hudStatsLabel?: string
) {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Monochrome Deep Obsidian Matte Glass Background
  ctx.fillStyle = eliminated
    ? 'rgba(9, 12, 18, 0.52)'
    : isTurn
    ? 'rgba(15, 20, 28, 0.96)'
    : 'rgba(9, 12, 18, 0.92)';
  ctx.beginPath();
  ctx.roundRect(8, 8, w - 16, h - 16, 22);
  ctx.fill();

  // Outer Frame Border (Brushed Champagne Gold on active turn, subtle Gold/Slate otherwise)
  ctx.lineWidth = isTurn ? 5 : 2.5;
  ctx.strokeStyle = isTurn
    ? '#f3e5ab'
    : eliminated || folded
    ? 'rgba(148, 163, 184, 0.25)'
    : 'rgba(212, 175, 55, 0.45)';
  ctx.stroke();

  let leftOffset = 24;

  // 2D Portrait Medallion on the left of the 3D Plaque
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
      ctx.filter = 'grayscale(88%) brightness(0.68)';
    }
    ctx.drawImage(portraitImg, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();

    // Brushed Champagne Gold circular bezel around portrait
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = isTurn ? 3.5 : 2;
    ctx.strokeStyle = isTurn ? '#f3e5ab' : '#d4af37';
    ctx.stroke();

    leftOffset = 104;
  }

  // Player Name (Warm Ivory)
  const nameStr = name.toUpperCase();
  ctx.fillStyle = eliminated || folded ? '#64748b' : '#f8fafc';
  ctx.font = 'bold 22px "Cinzel", "Plus Jakarta Sans", Georgia, serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(nameStr, leftOffset, 32);

  // Position Badge (BTN / SB / BB / UTG / CO) right next to Player Name
  if (positionLabel && !eliminated) {
    const nameWidth = ctx.measureText(nameStr).width;
    const badgeX = leftOffset + nameWidth + 10;
    const badgeW = 44;
    const badgeH = 22;
    ctx.fillStyle = isDealer ? 'rgba(212, 175, 55, 0.28)' : 'rgba(30, 41, 59, 0.85)';
    ctx.beginPath();
    ctx.roundRect(badgeX, 21, badgeW, badgeH, 6);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = isDealer ? '#f3e5ab' : 'rgba(212, 175, 55, 0.45)';
    ctx.stroke();

    ctx.fillStyle = isDealer ? '#f3e5ab' : '#cbd5e1';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(positionLabel, badgeX + badgeW / 2, 32.5);
  }

  if (tellLabel && !eliminated) {
    ctx.fillStyle = isTurn ? '#f3e5ab' : '#94a3b8';
    ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(tellLabel, isDealer ? w - 64 : w - 20, 32);
  }

  if (isDealer && !eliminated) {
    ctx.fillStyle = '#d4af37';
    ctx.beginPath();
    ctx.arc(w - 34, 32, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#090c12';
    ctx.font = 'bold 16px "Cinzel", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('D', w - 34, 33);
  }

  // Stack Readout (Brushed Champagne Gold)
  ctx.fillStyle = eliminated ? '#64748b' : '#d4af37';
  ctx.font = 'bold 24px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(eliminated ? 'OUT' : `$${chips.toLocaleString()}`, leftOffset, 72);

  // VPIP / PFR / AF Telemetry Sub-Row on 3D Plaque
  if (hudStatsLabel && !eliminated) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(hudStatsLabel, leftOffset, 105);
  }

  // Speech / Action Pill on right (Monochrome Obsidian + Champagne Gold)
  const pillX = Math.max(leftOffset + 104, 212);
  const pillW = w - pillX - 18;
  const displaySpeech = chatBubbleText ? `"${chatBubbleText}"` : actionText;
  ctx.fillStyle = isTurn
    ? 'rgba(212, 175, 55, 0.22)'
    : folded
    ? 'rgba(15, 20, 28, 0.65)'
    : 'rgba(15, 20, 28, 0.92)';
  ctx.beginPath();
  ctx.roundRect(pillX, 54, pillW, 42, 11);
  ctx.fill();

  ctx.lineWidth = 1.5;
  ctx.strokeStyle = isTurn
    ? '#f3e5ab'
    : folded
    ? 'rgba(148, 163, 184, 0.22)'
    : 'rgba(212, 175, 55, 0.38)';
  ctx.stroke();

  ctx.fillStyle = folded ? '#94a3b8' : isTurn ? '#f3e5ab' : '#f8fafc';
  ctx.font = chatBubbleText
    ? 'italic 600 14px "Plus Jakarta Sans", sans-serif'
    : 'bold 17px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  const maxChars = portraitImg ? 22 : 30;
  const truncated =
    displaySpeech.length > maxChars ? displaySpeech.slice(0, maxChars - 2) + '…"' : displaySpeech;
  ctx.fillText(truncated, pillX + pillW / 2, 75);
}

/**
 * Draws a 3D on-felt street bet pill/plaque next to a player's wagered chip stack.
 * Monochrome Obsidian surface with Brushed Champagne Gold border.
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

  ctx.fillStyle = isAllIn ? 'rgba(20, 16, 10, 0.96)' : 'rgba(9, 12, 18, 0.92)';
  ctx.beginPath();
  ctx.roundRect(6, 6, w - 12, h - 12, 24);
  ctx.fill();

  ctx.lineWidth = isAllIn ? 4.5 : 3;
  ctx.strokeStyle = isAllIn ? '#f3e5ab' : '#d4af37';
  ctx.stroke();

  // Mini gold chip icon on left
  ctx.fillStyle = '#d4af37';
  ctx.beginPath();
  ctx.arc(32, h / 2, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  ctx.fillStyle = isAllIn ? '#f3e5ab' : '#f8fafc';
  ctx.font = 'bold 25px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(isAllIn ? `ALL-IN $${amount}` : `$${amount}`, w / 2 + 12, h / 2 + 1);
}

/**
 * Draws a 3D world-anchored Spatial HUD button texture for WebXR & Desktop table rim.
 * Strictly adheres to the Monochrome Obsidian + Single Champagne Gold Accent system.
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

  const isGoldVariant = variant === 'raise' || variant === 'confirm' || variant === 'call';
  const bg = disabled
    ? 'rgba(9, 12, 18, 0.45)'
    : hovered
    ? 'rgba(212, 175, 55, 0.24)'
    : isGoldVariant
    ? 'rgba(15, 20, 28, 0.95)'
    : 'rgba(9, 12, 18, 0.92)';

  const border = disabled
    ? 'rgba(148, 163, 184, 0.2)'
    : hovered
    ? '#f3e5ab'
    : isGoldVariant
    ? '#d4af37'
    : 'rgba(148, 163, 184, 0.38)';

  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(6, 6, w - 12, h - 12, 18);
  ctx.fill();

  ctx.lineWidth = hovered && !disabled ? 5 : 3;
  ctx.strokeStyle = border;
  ctx.stroke();

  ctx.fillStyle = disabled ? '#64748b' : variant === 'raise' ? '#f3e5ab' : '#f8fafc';
  ctx.font = 'bold 26px "Cinzel", "Plus Jakarta Sans", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label.toUpperCase(), w / 2, sublabel ? h / 2 - 14 : h / 2);

  if (sublabel) {
    ctx.fillStyle = disabled ? '#475569' : '#d4af37';
    ctx.font = 'bold 19px "JetBrains Mono", monospace';
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
 * Creates a lifelike PBR skin material with warm subsurface sheen and subtle oil clearcoat.
 */
export function createRealisticSkinMaterial(hexColor: string): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: hexColor,
    roughness: 0.48,
    metalness: 0.02,
    sheen: 0.38,
    sheenRoughness: 0.65,
    sheenColor: new THREE.Color('#f59e7a'),
    clearcoat: 0.08,
    clearcoatRoughness: 0.45,
    reflectivity: 0.35,
  });
}

/**
 * Builds an articulated forearm, wrist, palm, and 5 sculpted fingers (replacing primitive sphere hands).
 * Exposes finger Group references on userData for subtle idle finger curl animations.
 */
export function buildArticulatedForearmAndHand(
  skinMat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  sleeveMat: THREE.MeshStandardMaterial,
  side: 'left' | 'right',
  role: CharacterModelRole,
  goldMat?: THREE.MeshStandardMaterial
): THREE.Group {
  const armGroup = new THREE.Group();
  const dir = side === 'left' ? -1 : 1;

  // 1. Tailored Sleeve Forearm + White Dress Cuff
  if (role !== 'elena') {
    const forearmGeo = new THREE.CapsuleGeometry(0.032, 0.14, 10, 14);
    forearmGeo.rotateX(Math.PI / 2.3);
    const forearm = new THREE.Mesh(forearmGeo, sleeveMat);
    forearm.position.set(0, 0.045, -0.085);
    armGroup.add(forearm);

    const cuffMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.38 });
    const cuffGeo = new THREE.CylinderGeometry(0.029, 0.031, 0.026, 14);
    cuffGeo.rotateX(Math.PI / 2.1);
    const cuff = new THREE.Mesh(cuffGeo, cuffMat);
    cuff.position.set(0, 0.014, -0.022);
    armGroup.add(cuff);

    // Luxury wristwatch on left wrist for Viktor, Marcus, or Dealer
    if (side === 'left' && goldMat && (role === 'viktor' || role === 'marcus' || role === 'dealer')) {
      const watchBand = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.0045, 8, 18), goldMat);
      watchBand.rotation.x = Math.PI / 2.1;
      watchBand.position.set(0, 0.009, -0.008);
      armGroup.add(watchBand);
    }
  } else {
    // Bare sculpted forearm for Elena's evening gown + gold bracelet
    const bareForearmGeo = new THREE.CapsuleGeometry(0.025, 0.13, 10, 14);
    bareForearmGeo.rotateX(Math.PI / 2.3);
    const bareForearm = new THREE.Mesh(bareForearmGeo, skinMat);
    bareForearm.position.set(0, 0.042, -0.08);
    armGroup.add(bareForearm);

    if (goldMat && side === 'right') {
      const bangle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0035, 8, 18), goldMat);
      bangle.rotation.x = Math.PI / 2.1;
      bangle.position.set(0, 0.012, -0.015);
      armGroup.add(bangle);
    }
  }

  // 2. Sculpted Wrist & Metacarpal Palm
  const handGroup = new THREE.Group();
  const palmGeo = new THREE.BoxGeometry(0.052, 0.020, 0.056);
  const palm = new THREE.Mesh(palmGeo, skinMat);
  palm.position.set(0, 0, 0.018);
  handGroup.add(palm);

  // Rounded Knuckle Bridge
  const knuckleBridgeGeo = new THREE.CapsuleGeometry(0.009, 0.038, 6, 10);
  knuckleBridgeGeo.rotateZ(Math.PI / 2);
  const knuckleBridge = new THREE.Mesh(knuckleBridgeGeo, skinMat);
  knuckleBridge.position.set(0, 0.003, 0.046);
  handGroup.add(knuckleBridge);

  // 3. Five Articulated Fingers (Thumb + Index, Middle, Ring, Pinky)
  const fingers: THREE.Group[] = [];
  const fingerSpecs = [
    { x: dir * -0.019, len: 0.034, rad: 0.0058, curl: 0.28 }, // Index
    { x: dir * -0.006, len: 0.038, rad: 0.0060, curl: 0.32 }, // Middle
    { x: dir * 0.007, len: 0.035, rad: 0.0056, curl: 0.36 },  // Ring
    { x: dir * 0.019, len: 0.028, rad: 0.0050, curl: 0.42 },  // Pinky
  ];

  fingerSpecs.forEach((spec) => {
    const fGroup = new THREE.Group();
    fGroup.position.set(spec.x, 0.002, 0.046);
    fGroup.rotation.x = spec.curl;

    // Proximal + Distal Phalanges combined in a naturally curved two-segment finger
    const proxGeo = new THREE.CapsuleGeometry(spec.rad, spec.len * 0.55, 6, 8);
    proxGeo.rotateX(Math.PI / 2);
    const prox = new THREE.Mesh(proxGeo, skinMat);
    prox.position.set(0, 0, spec.len * 0.32);
    fGroup.add(prox);

    const distGeo = new THREE.CapsuleGeometry(spec.rad * 0.86, spec.len * 0.45, 6, 8);
    distGeo.rotateX(Math.PI / 2);
    const dist = new THREE.Mesh(distGeo, skinMat);
    dist.position.set(0, -0.004, spec.len * 0.78);
    dist.rotation.x = 0.25;
    fGroup.add(dist);

    handGroup.add(fGroup);
    fingers.push(fGroup);
  });

  // Opposable Thumb
  const thumbGroup = new THREE.Group();
  thumbGroup.position.set(dir * -0.027, -0.002, 0.022);
  thumbGroup.rotation.set(0.22, dir * -0.48, dir * 0.25);
  const thumbGeo = new THREE.CapsuleGeometry(0.0065, 0.026, 6, 8);
  thumbGeo.rotateX(Math.PI / 2);
  const thumbMesh = new THREE.Mesh(thumbGeo, skinMat);
  thumbMesh.position.set(0, 0, 0.016);
  thumbGroup.add(thumbMesh);
  handGroup.add(thumbGroup);
  fingers.push(thumbGroup);

  armGroup.add(handGroup);
  armGroup.userData.handGroup = handGroup;
  armGroup.userData.fingers = fingers;
  armGroup.userData.anatomicalPartCount = 8;
  return armGroup;
}

/**
 * Populates a 3D character's torsoGroup and headGroup with sculpted 3D facial anatomy
 * (brow ridge, cheekbones, nose bridge & alae, philtrum/lips, cornea clearcoat eyes,
 * animated upper/lower eyelids, eye-gaze saccade rig, ears, hair, eyewear, beard)
 * and tailored 3D clothing details.
 */
export function populate3DCharacterHeadAndTorso(
  role: CharacterModelRole,
  torsoGroup: THREE.Group,
  headGroup: THREE.Group,
  skinMat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  suitMat: THREE.MeshStandardMaterial,
  goldMat: THREE.MeshStandardMaterial
): void {
  const r = role === 'bao' ? 0.106 : role === 'dealer' ? 0.102 : 0.095;

  // Upgrade skinMat in-place or ensure physical properties for realistic subsurface sheen
  if ('sheen' in skinMat) {
    skinMat.sheen = 0.38;
    skinMat.sheenRoughness = 0.65;
    skinMat.sheenColor = new THREE.Color('#f59e7a');
    skinMat.clearcoat = 0.08;
    skinMat.clearcoatRoughness = 0.45;
  }

  // Elongate head slightly for natural 3D cranial/jaw proportions
  headGroup.scale.set(role === 'bao' ? 1.05 : 0.95, 1.08, 0.97);

  // Cornea Clearcoat Sclera & Wet Eye Materials
  const scleraMat = new THREE.MeshPhysicalMaterial({
    color: '#f8fafc',
    roughness: 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    reflectivity: 0.9,
  });
  const pupilMat = new THREE.MeshStandardMaterial({ color: '#090c12', roughness: 0.08 });
  const catchlightMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const whiteShirtMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.38 });
  const noseMat = new THREE.MeshPhysicalMaterial({
    color: skinMat.color.clone().multiplyScalar(0.93),
    roughness: 0.38,
    sheen: 0.42,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color('#f59e7a'),
    clearcoat: 0.14,
    clearcoatRoughness: 0.35,
  });

  const irisColorMap: Record<CharacterModelRole, string> = {
    dealer: '#451a03',
    viktor: '#2563eb', // steel sapphire-blue
    elena: '#7c2d12',  // warm amber-brown
    bao: '#1e1b18',    // dark espresso
    marcus: '#78350f', // warm hazel
  };
  const irisMat = new THREE.MeshPhysicalMaterial({
    color: irisColorMap[role],
    roughness: 0.14,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
  });

  const hairColorMap: Record<CharacterModelRole, string> = {
    dealer: '#1c1917',
    viktor: '#27272a',
    elena: '#181311',
    bao: '#0f172a',
    marcus: '#291d16',
  };
  const hairMat = new THREE.MeshStandardMaterial({
    color: hairColorMap[role],
    roughness: role === 'elena' || role === 'dealer' ? 0.32 : 0.45,
    metalness: 0.08,
  });

  // 0. Sculpted 3D Lateral Deltoids & Rounded Shoulders Bridge
  const bustRadius = role === 'dealer' ? 0.152 : 0.132;
  const shoulderBustGeo = new THREE.SphereGeometry(bustRadius, 28, 20);
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

  if (role === 'elena') {
    const gownBustGeo = new THREE.SphereGeometry(0.132, 28, 18);
    gownBustGeo.scale(1.06, 0.55, 0.88);
    const gownBust = new THREE.Mesh(gownBustGeo, suitMat);
    gownBust.position.set(0, 0.33, 0.008);
    torsoGroup.add(gownBust);
  }

  // 1. Sculpted Neck, Sternocleidomastoid Contour & Jawline Chin
  const neckRadius = role === 'bao' ? 0.056 : role === 'elena' ? 0.038 : 0.045;
  const neckGeo = new THREE.CylinderGeometry(neckRadius, neckRadius * 1.18, 0.15, 20);
  const neckMesh = new THREE.Mesh(neckGeo, skinMat);
  neckMesh.position.set(0, -r * 0.88, -0.005);
  headGroup.add(neckMesh);

  const chinGeo = new THREE.SphereGeometry(r * 0.54, 20, 16);
  chinGeo.scale(role === 'elena' ? 0.86 : 1.0, 0.64, 0.82);
  const chinMesh = new THREE.Mesh(chinGeo, skinMat);
  chinMesh.position.set(0, -r * 0.52, r * 0.28);
  headGroup.add(chinMesh);

  // 1b. Anatomical Zygomatic Cheekbones & Supraorbital Brow Ridge
  const cheekboneGeo = new THREE.SphereGeometry(r * 0.34, 16, 14);
  cheekboneGeo.scale(0.95, 0.58, 0.68);
  [-1, 1].forEach((dir) => {
    const cheekbone = new THREE.Mesh(cheekboneGeo, skinMat);
    cheekbone.position.set(dir * (r * 0.48), -r * 0.06, r * 0.66);
    cheekbone.rotation.y = dir * 0.28;
    headGroup.add(cheekbone);
  });

  const browRidgeGeo = new THREE.CapsuleGeometry(r * 0.095, r * 0.62, 8, 12);
  browRidgeGeo.rotateZ(Math.PI / 2);
  const browRidge = new THREE.Mesh(browRidgeGeo, skinMat);
  browRidge.position.set(0, r * 0.25, r * 0.82);
  headGroup.add(browRidge);

  // 2. Sculpted 3D Ears (Left & Right)
  const earGeo = new THREE.SphereGeometry(r * 0.22, 14, 14);
  earGeo.scale(0.42, 0.85, 0.58);
  const leftEar = new THREE.Mesh(earGeo, skinMat);
  leftEar.position.set(-r * 0.96, -0.01, -0.01);
  const rightEar = new THREE.Mesh(earGeo, skinMat);
  rightEar.position.set(r * 0.96, -0.01, -0.01);
  headGroup.add(leftEar, rightEar);

  // 3. Sculpted 3D Nose Bridge, Rounded Tip & Left/Right Nasal Alae (Nostrils)
  const noseBridgeGeo = new THREE.CapsuleGeometry(
    role === 'bao' ? 0.0115 : role === 'elena' ? 0.0088 : 0.01,
    0.026,
    10,
    12
  );
  const noseMesh = new THREE.Mesh(noseBridgeGeo, noseMat);
  noseMesh.position.set(0, 0.004, r * 0.985);
  noseMesh.rotation.x = -0.2;
  headGroup.add(noseMesh);

  const alaGeo = new THREE.SphereGeometry(0.0072, 10, 10);
  alaGeo.scale(1.1, 0.78, 0.9);
  [-1, 1].forEach((dir) => {
    const ala = new THREE.Mesh(alaGeo, noseMat);
    ala.position.set(dir * 0.0088, -0.011, r * 0.98);
    headGroup.add(ala);
  });

  // 4. Sculpted 3D Eyes with Animated Eyelids & Gaze-Tracking Iris Rig
  const eyeX = r * 0.34;
  const eyeY = r * 0.12;
  const eyeZ = r * 0.88;
  const scleraGeo = new THREE.SphereGeometry(0.015, 16, 16);
  scleraGeo.scale(1.18, 0.85, 0.55);
  const irisGeo = new THREE.SphereGeometry(0.009, 14, 14);
  irisGeo.scale(1.0, 1.0, 0.42);
  const pupilGeo = new THREE.SphereGeometry(0.005, 12, 12);
  pupilGeo.scale(1.0, 1.0, 0.42);
  const catchlightGeo = new THREE.SphereGeometry(0.0019, 8, 8);
  const eyelidGeo = new THREE.SphereGeometry(0.0168, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52);
  eyelidGeo.scale(1.22, 0.88, 0.64);

  const eyeLids: THREE.Mesh[] = [];
  const irisGroups: THREE.Group[] = [];

  [-1, 1].forEach((dir) => {
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(dir * eyeX, eyeY, eyeZ);
    eyeGroup.rotation.y = dir * 0.16;

    const sclera = new THREE.Mesh(scleraGeo, scleraMat);

    // Gaze-tracking iris + pupil + corneal catchlight group
    const irisGroup = new THREE.Group();
    const iris = new THREE.Mesh(irisGeo, irisMat);
    iris.position.set(0, 0, 0.0072);
    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.set(0, 0, 0.0098);
    const catchlight = new THREE.Mesh(catchlightGeo, catchlightMat);
    catchlight.position.set(0.0028, 0.0028, 0.0112);
    irisGroup.add(iris, pupil, catchlight);

    const eyelid = new THREE.Mesh(eyelidGeo, skinMat);
    const baseLidRotX = role === 'viktor' ? 0.22 : 0.12;
    eyelid.rotation.x = baseLidRotX;
    eyelid.userData.baseRotX = baseLidRotX;
    eyelid.position.set(0, 0.002, 0.001);

    eyeGroup.add(sclera, irisGroup, eyelid);
    eyeLids.push(eyelid);
    irisGroups.push(irisGroup);

    if (role === 'elena') {
      const lashGeo = new THREE.CapsuleGeometry(0.0022, 0.028, 6, 8);
      lashGeo.rotateZ(Math.PI / 2);
      const lash = new THREE.Mesh(lashGeo, pupilMat);
      lash.position.set(dir * 0.002, 0.008, 0.006);
      lash.rotation.z = dir * -0.1;
      eyeGroup.add(lash);
    }
    headGroup.add(eyeGroup);
  });

  // Expose live eyelid and gaze saccade rigs on headGroup.userData for CasinoScene animation loop
  headGroup.userData.leftEyeLid = eyeLids[0];
  headGroup.userData.rightEyeLid = eyeLids[1];
  headGroup.userData.leftIrisGroup = irisGroups[0];
  headGroup.userData.rightIrisGroup = irisGroups[1];
  headGroup.userData.hasRealisticFacialRig = true;

  // 5. Sculpted 3D Eyebrows
  const browRadius = role === 'elena' ? 0.0032 : 0.0045;
  const browGeo = new THREE.CapsuleGeometry(browRadius, 0.026, 8, 10);
  browGeo.rotateZ(Math.PI / 2);
  const brows: THREE.Mesh[] = [];
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
    brows.push(brow);
    headGroup.add(brow);
  });
  headGroup.userData.brows = brows;

  // 6. Sculpted 3D Mouth / Upper & Lower Lips
  const lipColorMap: Record<CharacterModelRole, string> = {
    dealer: '#9a5b4a',
    viktor: '#8c5343',
    elena: '#be123c',
    bao: '#8f5542',
    marcus: '#8a4b38',
  };
  const lipMat = new THREE.MeshPhysicalMaterial({
    color: lipColorMap[role],
    roughness: role === 'elena' ? 0.22 : 0.38,
    clearcoat: role === 'elena' ? 0.65 : 0.18,
    clearcoatRoughness: 0.25,
  });

  if (role === 'elena') {
    const upperLipGeo = new THREE.SphereGeometry(0.013, 14, 10);
    upperLipGeo.scale(1.28, 0.34, 0.55);
    const upperLip = new THREE.Mesh(upperLipGeo, lipMat);
    upperLip.position.set(0, -r * 0.30, r * 0.955);
    const lowerLipGeo = new THREE.SphereGeometry(0.012, 14, 10);
    lowerLipGeo.scale(1.18, 0.36, 0.56);
    const lowerLip = new THREE.Mesh(lowerLipGeo, lipMat);
    lowerLip.position.set(0, -r * 0.36, r * 0.945);
    headGroup.add(upperLip, lowerLip);
  } else {
    const mouthGeo = new THREE.CapsuleGeometry(0.0042, role === 'bao' ? 0.026 : 0.024, 8, 12);
    mouthGeo.rotateZ(Math.PI / 2);
    const mouth = new THREE.Mesh(mouthGeo, lipMat);
    mouth.position.set(0, -r * 0.34, r * 0.965);
    if (role === 'marcus') {
      mouth.rotation.z = 0.1;
    }
    headGroup.add(mouth);
  }

  // 7. Role-Specific 3D Hair, Eyewear & Tailored Garments
  if (role === 'dealer') {
    const hairCapGeo = new THREE.SphereGeometry(r * 1.05, 28, 22, 0, Math.PI * 2, 0, Math.PI * 0.48);
    const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
    hairCap.position.set(0, 0.004, 0);
    hairCap.rotation.x = -0.22;
    headGroup.add(hairCap);

    const waveGeo = new THREE.SphereGeometry(r * 0.56, 20, 14);
    waveGeo.scale(1.45, 0.42, 0.78);
    const wave = new THREE.Mesh(waveGeo, hairMat);
    wave.position.set(0.01, r * 0.80, r * 0.52);
    wave.rotation.z = -0.1;
    headGroup.add(wave);

    const sideburnGeo = new THREE.CapsuleGeometry(0.007, 0.032, 6, 10);
    [-1, 1].forEach((dir) => {
      const sideburn = new THREE.Mesh(sideburnGeo, hairMat);
      sideburn.position.set(dir * (r * 0.95), 0.0, r * 0.22);
      headGroup.add(sideburn);
    });

    const stacheWingGeo = new THREE.CapsuleGeometry(0.0052, 0.018, 6, 10);
    stacheWingGeo.rotateZ(Math.PI / 2);
    [-1, 1].forEach((dir) => {
      const wing = new THREE.Mesh(stacheWingGeo, hairMat);
      wing.position.set(dir * 0.011, -r * 0.23, r * 0.975);
      wing.rotation.z = dir * -0.18;
      headGroup.add(wing);
    });

    const goateeGeo = new THREE.SphereGeometry(r * 0.28, 16, 14);
    goateeGeo.scale(1.05, 0.78, 0.65);
    const goatee = new THREE.Mesh(goateeGeo, hairMat);
    goatee.position.set(0, -r * 0.58, r * 0.82);
    headGroup.add(goatee);

    const shirtPanelGeo = new THREE.BoxGeometry(0.095, 0.19, 0.024);
    const shirtPanel = new THREE.Mesh(shirtPanelGeo, whiteShirtMat);
    shirtPanel.position.set(0, 0.38, 0.132);
    shirtPanel.rotation.x = -0.14;
    torsoGroup.add(shirtPanel);

    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.013, 12, 12), goldMat);
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
      const btnGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.008, 12);
      btnGeo.rotateX(Math.PI / 2);
      const btn = new THREE.Mesh(btnGeo, goldMat);
      btn.position.set(0, yPos, 0.152);
      torsoGroup.add(btn);
    });
  } else if (role === 'viktor') {
    const hairCapGeo = new THREE.SphereGeometry(r * 1.05, 28, 22, 0, Math.PI * 2, 0, Math.PI * 0.48);
    const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
    hairCap.position.set(0, 0.004, 0);
    hairCap.rotation.x = -0.22;
    headGroup.add(hairCap);

    const pompadourGeo = new THREE.SphereGeometry(r * 0.58, 20, 14);
    pompadourGeo.scale(1.38, 0.44, 0.84);
    const pompadour = new THREE.Mesh(pompadourGeo, hairMat);
    pompadour.position.set(0, r * 0.82, r * 0.44);
    headGroup.add(pompadour);

    const silverMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.35, metalness: 0.15 });
    const templeGeo = new THREE.SphereGeometry(r * 0.36, 14, 14);
    templeGeo.scale(0.26, 0.72, 0.85);
    [-1, 1].forEach((dir) => {
      const temple = new THREE.Mesh(templeGeo, silverMat);
      temple.position.set(dir * (r * 0.92), r * 0.22, 0.01);
      headGroup.add(temple);
    });

    const shirtPanelGeo = new THREE.BoxGeometry(0.082, 0.19, 0.024);
    const shirtPanel = new THREE.Mesh(shirtPanelGeo, whiteShirtMat);
    shirtPanel.position.set(0, 0.35, 0.118);
    shirtPanel.rotation.x = -0.12;
    torsoGroup.add(shirtPanel);

    const tieMat = new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.28, metalness: 0.25 });
    const tieKnot = new THREE.Mesh(new THREE.SphereGeometry(0.013, 10, 10), tieMat);
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

    const pocketMat = new THREE.MeshStandardMaterial({ color: '#d4af37', roughness: 0.3 });
    const pocketSquare = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.016, 0.012), pocketMat);
    pocketSquare.position.set(0.076, 0.34, 0.126);
    pocketSquare.rotation.set(-0.12, 0.2, -0.1);
    torsoGroup.add(pocketSquare);
  } else if (role === 'elena') {
    const hairCapGeo = new THREE.SphereGeometry(r * 1.05, 28, 22, 0, Math.PI * 2, 0, Math.PI * 0.48);
    const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
    hairCap.position.set(0, 0.004, 0);
    hairCap.rotation.x = -0.22;
    headGroup.add(hairCap);

    const crownGeo = new THREE.SphereGeometry(r * 0.62, 20, 14);
    crownGeo.scale(1.34, 0.44, 0.82);
    const crown = new THREE.Mesh(crownGeo, hairMat);
    crown.position.set(0, r * 0.80, r * 0.38);
    headGroup.add(crown);

    const bunGeo = new THREE.SphereGeometry(0.056, 16, 16);
    bunGeo.scale(1.06, 0.88, 1.0);
    const bun = new THREE.Mesh(bunGeo, hairMat);
    bun.position.set(0, r * 1.02, -0.032);
    headGroup.add(bun);

    const bunCuffGeo = new THREE.TorusGeometry(0.042, 0.0055, 10, 22);
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

    const necklaceGeo = new THREE.TorusGeometry(0.058, 0.0045, 10, 24);
    necklaceGeo.rotateX(Math.PI / 2 - 0.18);
    const necklace = new THREE.Mesh(necklaceGeo, goldMat);
    necklace.position.set(0, 0.445, 0.015);
    const pendant = new THREE.Mesh(new THREE.OctahedronGeometry(0.013, 0), rubyMat);
    pendant.position.set(0, 0.425, 0.082);
    torsoGroup.add(necklace, pendant);
  } else if (role === 'bao') {
    const cheekGeo = new THREE.SphereGeometry(0.042, 14, 14);
    [-1, 1].forEach((dir) => {
      const cheek = new THREE.Mesh(cheekGeo, skinMat);
      cheek.position.set(dir * 0.054, -0.022, 0.060);
      headGroup.add(cheek);
    });

    const hairCapGeo = new THREE.SphereGeometry(r * 1.05, 28, 22, 0, Math.PI * 2, 0, Math.PI * 0.44);
    const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
    hairCap.position.set(0, 0.006, 0);
    hairCap.rotation.x = -0.22;
    headGroup.add(hairCap);

    const frameMat = new THREE.MeshStandardMaterial({ color: '#0f172a', metalness: 0.75, roughness: 0.22 });
    const lensMat = new THREE.MeshPhysicalMaterial({
      color: '#cbd5e1',
      emissive: '#38bdf8',
      emissiveIntensity: 0.22,
      roughness: 0.06,
      metalness: 0.15,
      transparent: true,
      opacity: 0.28,
      clearcoat: 1.0,
    });

    [-1, 1].forEach((dir) => {
      const topRim = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.004, 0.005), frameMat);
      topRim.position.set(dir * 0.036, eyeY + 0.011, r * 0.97);
      const botRim = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.0035, 0.005), frameMat);
      botRim.position.set(dir * 0.036, eyeY - 0.011, r * 0.97);
      const sideRim = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.024, 0.005), frameMat);
      sideRim.position.set(dir * 0.055, eyeY, r * 0.97);
      const lensPane = new THREE.Mesh(new THREE.PlaneGeometry(0.038, 0.020), lensMat);
      lensPane.position.set(dir * 0.036, eyeY, r * 0.975);
      headGroup.add(topRim, botRim, sideRim, lensPane);
    });

    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.004, 0.005), frameMat);
    bridge.position.set(0, eyeY + 0.004, r * 0.98);
    headGroup.add(bridge);

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
    const hairCapGeo = new THREE.SphereGeometry(r * 1.05, 28, 22, 0, Math.PI * 2, 0, Math.PI * 0.48);
    const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
    hairCap.position.set(0, 0.004, 0);
    hairCap.rotation.x = -0.22;
    headGroup.add(hairCap);

    const quiffGeo = new THREE.SphereGeometry(r * 0.62, 20, 14);
    quiffGeo.scale(1.36, 0.56, 0.88);
    const quiff = new THREE.Mesh(quiffGeo, hairMat);
    quiff.position.set(0, r * 0.90, r * 0.44);
    quiff.rotation.x = 0.16;
    headGroup.add(quiff);

    const aviatorLensMat = new THREE.MeshPhysicalMaterial({
      color: '#451a03',
      emissive: '#78350f',
      emissiveIntensity: 0.22,
      metalness: 0.35,
      roughness: 0.08,
      transparent: true,
      opacity: 0.72,
      clearcoat: 1.0,
    });

    [-1, 1].forEach((dir) => {
      const bezelGeo = new THREE.TorusGeometry(0.021, 0.0028, 8, 20);
      bezelGeo.scale(1.18, 0.92, 1);
      const bezel = new THREE.Mesh(bezelGeo, goldMat);
      bezel.position.set(dir * 0.036, eyeY, r * 0.96);

      const lensGeo = new THREE.CircleGeometry(0.020, 20);
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

    const blackSilkMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.25, metalness: 0.25 });
    const shirtPanel = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.19, 0.024), blackSilkMat);
    shirtPanel.position.set(0, 0.34, 0.120);
    shirtPanel.rotation.x = -0.12;
    torsoGroup.add(shirtPanel);

    const goldChainGeo = new THREE.TorusGeometry(0.036, 0.0045, 8, 20, Math.PI);
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




