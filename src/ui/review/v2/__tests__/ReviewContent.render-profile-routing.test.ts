import { describe, expect, it } from 'vitest';
import { resolveRenderProfile } from '@/core/card/render-profile/RenderProfileResolver';

describe('Review render profile routing', () => {
  it('prefers explicit renderProfile in card meta', () => {
    const profile = resolveRenderProfile({
      id: 'card-1',
      meta: {
        renderProfile: 'descriptor',
      },
    } as never);

    expect(profile).toBe('descriptor');
  });

  it('falls back to clozeRenderMode for historical cards', () => {
    const profile = resolveRenderProfile({
      id: 'card-1',
      meta: {
        clozeRenderMode: 'inline-formula-cloze',
      },
    } as never);

    expect(profile).toBe('quick-inline-formula');
  });

  it('keeps default clozeRenderMode on the native render path', () => {
    const profile = resolveRenderProfile({
      id: 'card-1',
      meta: {
        clozeRenderMode: 'default',
      },
    } as never);

    expect(profile).toBeNull();
  });

  it('returns null for unknown render profile metadata', () => {
    const profile = resolveRenderProfile({
      id: 'card-1',
      meta: {
        renderProfile: 'unknown-profile',
      },
    } as never);

    expect(profile).toBeNull();
  });
});
