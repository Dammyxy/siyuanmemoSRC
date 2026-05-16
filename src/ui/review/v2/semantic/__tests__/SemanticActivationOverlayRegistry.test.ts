import { describe, expect, it } from 'vitest';
import { OVERLAY_REGISTRY } from '../../overlays';
import SemanticActivationSurface from '../SemanticActivationSurface.vue';

describe('SemanticActivation overlay registry', () => {
  it('registers the Semantic Activation surface for ReviewContent overlays', () => {
    expect(OVERLAY_REGISTRY.SemanticActivationSurface).toBe(SemanticActivationSurface);
  });
});
