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

  // Betting ring guide lines
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.4)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(canvas.width / 2, canvas.height / 2, 380, 240, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Subtle Center Watermark
  ctx.save();
  ctx.font = 'bold 44px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = 'rgba(212, 175, 55, 0.22)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ROYAL MONTE CARLO', canvas.width / 2, canvas.height / 2 - 20);
  ctx.font = '22px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('HIGH ROLLER VIP LOUNGE • NO LIMIT HOLD\'EM', canvas.width / 2, canvas.height / 2 + 30);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  feltTextureCache = texture;
  return texture;
}
