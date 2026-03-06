import { describe, expect, it } from 'vitest';
import {
  clamp01,
  computeFitWidthScale,
  computeScaledSize,
  normalizeRectFromPixels,
  toPercentMaskStyle,
} from '../imageOcclusionGeometry';

describe('imageOcclusionGeometry', () => {
  it('clamps value to [0, 1]', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(2)).toBe(1);
  });

  it('normalizes and clamps dragged pixels into rect percentages', () => {
    const normalized = normalizeRectFromPixels(120, 130, 20, 30, 100, 100, 6);
    expect(normalized).toEqual({
      x: 0.2,
      y: 0.3,
      w: 0.8,
      h: 0.7,
    });
  });

  it('returns null when normalized rect is smaller than threshold', () => {
    const normalized = normalizeRectFromPixels(0, 0, 5, 20, 100, 100, 6);
    expect(normalized).toBeNull();
  });

  it('converts normalized rect to percent-based style', () => {
    expect(toPercentMaskStyle({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 })).toEqual({
      left: '10%',
      top: '20%',
      width: '30%',
      height: '40%',
    });
  });

  it('computes scaled size with guard rails for invalid inputs', () => {
    expect(computeScaledSize(1000, 2000, 0.5)).toEqual({ width: 500, height: 1000 });
    expect(computeScaledSize(1000, 2000, -1)).toEqual({ width: 1000, height: 2000 });
    expect(computeScaledSize(0, 2000, 1)).toEqual({ width: 0, height: 0 });
  });

  it('computes fit width scale and prevents upscaling by default', () => {
    expect(computeFitWidthScale(1000, 500)).toBe(0.5);
    expect(computeFitWidthScale(1000, 2000)).toBe(1);
    expect(computeFitWidthScale(1000, 2000, true)).toBe(2);
    expect(computeFitWidthScale(0, 2000)).toBe(1);
  });
});
