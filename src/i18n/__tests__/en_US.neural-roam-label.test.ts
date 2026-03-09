import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';

describe('en_US neural roam labels', () => {
  it('keeps neural roam as the top-level queue name', () => {
    expect(enUS.practiceNeural).toBe('Neural Roam');
    expect(enUS.neuralWanderingQueue).toBe('Neural Roam');
  });

  it('separates engine labels from neutral navigation and subview labels', () => {
    expect(enUS.navModeFollow).toBe('Follow Path');
    expect(enUS.navModeExplore).toBe('Free Explore');
    expect(enUS.lockAsFocus).toBe('Set as Start Point');
    expect(enUS.roamSeeds).toBe('Start Points');
    expect(enUS.roamHistory).toBe('Paths');
    expect(enUS.worldlineAnchors).toBe('Anchors');
    expect(enUS.engineOrbit).toBe('Orbit');
    expect(enUS.engineHyperspace).toBe('Hyperspace Expedition');
    expect(enUS.engineOrbitIntro).toBe('Roam locally around orbit centers, concept cards, and nearby anchors.');
    expect(enUS.engineOrbitIntroLong).toContain('backlinks');
    expect(enUS.engineHyperspaceIntro).toBe('Propagate outward layer by layer from activation sources through links and optional tree relations.');
    expect(enUS.engineHyperspaceIntroLong).toContain('block links');
    expect(enUS.activationTrace).toBe('Wake');
  });

  it('uses block-link wording for hyperspace edge labels', () => {
    expect(enUS.relationElementLink).toBe('Block Link');
    expect(enUS.relationOriginBacklink).toBe('Backlink');
    expect(enUS.relationOriginDirectRef).toBe('Direct Reference');
  });
});
