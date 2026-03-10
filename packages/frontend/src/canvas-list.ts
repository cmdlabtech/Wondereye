import { Landmark } from './types';
import { DISPLAY_WIDTH, HEADER_HEIGHT, FOOTER_HEIGHT, VISIBLE_LANDMARKS } from './constants';

// SDK ImageContainerProperty hard limit: height 20-100px.
// Exceeding 100px causes delayed firmware crash on idle.
export const CONTENT_HEIGHT = 100;
const ROW_H = Math.floor(CONTENT_HEIGHT / VISIBLE_LANDMARKS); // 20px
const ICON_SIZE = 14;
const ICON_PAD = 4;
const TEXT_X = ICON_PAD + ICON_SIZE + 6;
const BORDER_MARGIN = 1;
const FONT_SIZE = 13;
const SELECTION_RADIUS = 4;

// --- Icon drawing functions ---

function drawCastle(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  // Tower body
  ctx.fillRect(x + s * 0.15, y + s * 0.38, s * 0.7, s * 0.62);
  // Three merlons (crenellations)
  ctx.fillRect(x + s * 0.08, y + s * 0.08, s * 0.22, s * 0.34);
  ctx.fillRect(x + s * 0.39, y + s * 0.08, s * 0.22, s * 0.34);
  ctx.fillRect(x + s * 0.70, y + s * 0.08, s * 0.22, s * 0.34);
  // Arrow slit
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillRect(x + s * 0.42, y + s * 0.52, s * 0.16, s * 0.28);
  ctx.restore();
}

function drawCross(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.fillRect(x + s * 0.42, y + s * 0.05, s * 0.16, s * 0.9);
  ctx.fillRect(x + s * 0.1, y + s * 0.28, s * 0.8, s * 0.16);
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const cx = x + s / 2, cy = y + s / 2, r = s * 0.44, ri = s * 0.2;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const oa = (i * 2 * Math.PI) / 5 - Math.PI / 2;
    const ia = oa + Math.PI / 5;
    if (i === 0) ctx.moveTo(cx + r * Math.cos(oa), cy + r * Math.sin(oa));
    else ctx.lineTo(cx + r * Math.cos(oa), cy + r * Math.sin(oa));
    ctx.lineTo(cx + ri * Math.cos(ia), cy + ri * Math.sin(ia));
  }
  ctx.closePath();
  ctx.fill();
}

function drawMuseum(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  // Pediment (triangle roof)
  ctx.beginPath();
  ctx.moveTo(x + s * 0.5, y + s * 0.05);
  ctx.lineTo(x + s * 0.05, y + s * 0.38);
  ctx.lineTo(x + s * 0.95, y + s * 0.38);
  ctx.closePath();
  ctx.fill();
  // Building body
  ctx.fillRect(x + s * 0.1, y + s * 0.38, s * 0.8, s * 0.57);
  // Column gaps (3 columns)
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillRect(x + s * 0.19, y + s * 0.41, s * 0.13, s * 0.5);
  ctx.fillRect(x + s * 0.44, y + s * 0.41, s * 0.12, s * 0.5);
  ctx.fillRect(x + s * 0.68, y + s * 0.41, s * 0.13, s * 0.5);
  ctx.restore();
}

function drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x + s * 0.5, y + s * 0.05);
  ctx.lineTo(x + s * 0.95, y + s * 0.5);
  ctx.lineTo(x + s * 0.5, y + s * 0.95);
  ctx.lineTo(x + s * 0.05, y + s * 0.5);
  ctx.closePath();
  ctx.fill();
}

function drawPillar(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.fillRect(x + s * 0.1, y + s * 0.05, s * 0.8, s * 0.12); // capital
  ctx.fillRect(x + s * 0.35, y + s * 0.17, s * 0.3, s * 0.66); // shaft
  ctx.fillRect(x + s * 0.1, y + s * 0.83, s * 0.8, s * 0.12); // base
}

function drawWave(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.lineWidth = Math.max(1.5, s * 0.09);
  for (let i = 0; i < 3; i++) {
    const ly = y + s * (0.22 + i * 0.27);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.05, ly);
    ctx.bezierCurveTo(x + s * 0.3, ly - s * 0.1, x + s * 0.7, ly + s * 0.1, x + s * 0.95, ly);
    ctx.stroke();
  }
}

function drawCircleOutline(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.lineWidth = Math.max(2, s * 0.13);
  ctx.beginPath();
  ctx.arc(x + s / 2, y + s / 2, s * 0.4, 0, Math.PI * 2);
  ctx.stroke();
  // small dot in center
  ctx.beginPath();
  ctx.arc(x + s / 2, y + s / 2, s * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

function drawLines(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.lineWidth = Math.max(1.5, s * 0.1);
  for (let i = 0; i < 3; i++) {
    const ly = y + s * (0.22 + i * 0.28);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.08, ly);
    ctx.lineTo(x + s * 0.92, ly);
    ctx.stroke();
  }
}

function drawBullseye(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.lineWidth = Math.max(1.5, s * 0.1);
  ctx.beginPath();
  ctx.arc(x + s / 2, y + s / 2, s * 0.42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + s / 2, y + s / 2, s * 0.16, 0, Math.PI * 2);
  ctx.fill();
}

type DrawFn = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number) => void;

const ICON_FNS: Record<string, DrawFn> = {
  castle:              drawCastle,
  cathedral:           drawCross,
  church:              drawCross,
  place_of_worship:    drawCross,
  mosque:              drawCross,
  temple:              drawCross,
  synagogue:           drawStar,
  museum:              drawMuseum,
  gallery:             drawDiamond,
  artwork:             drawDiamond,
  monument:            drawPillar,
  memorial:            drawPillar,
  archaeological_site: drawWave,
  theatre:             drawCircleOutline,
  library:             drawLines,
  viewpoint:           drawBullseye,
  attraction:          drawStar,
};

// --- Text helpers ---

function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '...').width > maxW) t = t.slice(0, -1);
  return t + '...';
}

// --- Main canvas render ---

export function renderListToCanvas(landmarks: Landmark[], selectedIndex: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = DISPLAY_WIDTH;
  canvas.height = CONTENT_HEIGHT;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, DISPLAY_WIDTH, CONTENT_HEIGHT);

  const start = Math.max(0, selectedIndex - (VISIBLE_LANDMARKS - 1));
  const end = Math.min(landmarks.length, start + VISIBLE_LANDMARKS);

  for (let i = start; i < end; i++) {
    const rowIndex = i - start;
    const rowY = rowIndex * ROW_H;
    const isSelected = i === selectedIndex;
    const textY = rowY + Math.round(ROW_H * 0.67);
    const iconY = rowY + Math.round((ROW_H - ICON_SIZE) / 2);

    const fg = isSelected ? '#ffffff' : '#707070';

    if (isSelected) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(
        BORDER_MARGIN,
        rowY + BORDER_MARGIN,
        DISPLAY_WIDTH - BORDER_MARGIN * 2,
        ROW_H - BORDER_MARGIN * 2,
        SELECTION_RADIUS,
      );
      ctx.stroke();
    }

    ctx.fillStyle = fg;
    ctx.strokeStyle = fg;
    const iconFn = ICON_FNS[landmarks[i].type] ?? drawDiamond;
    iconFn(ctx, ICON_PAD, iconY, ICON_SIZE);

    ctx.font = `${FONT_SIZE}px monospace`;
    ctx.fillStyle = fg;
    const maxW = DISPLAY_WIDTH - TEXT_X - 8;
    ctx.fillText(truncateToWidth(ctx, landmarks[i].name, maxW), TEXT_X, textY);
  }

  return canvas;
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('canvas.toBlob failed')); return; }
      blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
    }, 'image/png');
  });
}
