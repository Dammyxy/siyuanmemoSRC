export interface NormalizedMaskRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function normalizeRectFromPixels(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  width: number,
  height: number,
  minPx = 6,
): NormalizedMaskRect | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const left = clamp(Math.min(startX, endX), 0, width);
  const top = clamp(Math.min(startY, endY), 0, height);
  const right = clamp(Math.max(startX, endX), 0, width);
  const bottom = clamp(Math.max(startY, endY), 0, height);
  const rectWidth = Math.max(0, right - left);
  const rectHeight = Math.max(0, bottom - top);
  const threshold = Number.isFinite(minPx) ? Math.max(0, minPx) : 0;

  if (rectWidth < threshold || rectHeight < threshold) {
    return null;
  }

  return {
    x: clamp01(left / width),
    y: clamp01(top / height),
    w: clamp01(rectWidth / width),
    h: clamp01(rectHeight / height),
  };
}

export function toPercentMaskStyle(rect: Pick<NormalizedMaskRect, 'x' | 'y' | 'w' | 'h'>): Record<string, string> {
  return {
    left: `${clamp01(rect.x) * 100}%`,
    top: `${clamp01(rect.y) * 100}%`,
    width: `${clamp01(rect.w) * 100}%`,
    height: `${clamp01(rect.h) * 100}%`,
  };
}

export function computeScaledSize(naturalWidth: number, naturalHeight: number, scale: number): { width: number; height: number } {
  if (!Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight) || naturalWidth <= 0 || naturalHeight <= 0) {
    return { width: 0, height: 0 };
  }

  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    width: Math.max(1, naturalWidth * safeScale),
    height: Math.max(1, naturalHeight * safeScale),
  };
}

export function computeFitWidthScale(naturalWidth: number, maxWidth: number, allowUpscale = false): number {
  if (!Number.isFinite(naturalWidth) || naturalWidth <= 0) {
    return 1;
  }
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) {
    return 1;
  }

  const rawScale = maxWidth / naturalWidth;
  if (!Number.isFinite(rawScale) || rawScale <= 0) {
    return 1;
  }

  return allowUpscale ? rawScale : Math.min(1, rawScale);
}
