import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';

describe('en_US neural roam labels', () => {
  it('keeps neural roam as the top-level queue name', () => {
    expect(enUS.practiceNeural).toBe('Neural Roam');
    expect(enUS.neuralWanderingQueue).toBe('Neural Roam');
  });

  it('separates engine labels from neutral navigation and subview labels', () => {
    expect(enUS.navModeFollow).toBe('Follow Path');
    expect(enUS.navModeExplore).toBe('Free Roam');
    expect(enUS.lockAsFocus).toBe('Set as Current Center');
    expect(enUS.neuralFocusMenu).toBe('View Source List');
    expect(enUS.viewSourceList).toBe('View Source List');
    expect(enUS.roamSeeds).toBe('Centers');
    expect(enUS.engineHistory).toBe('Trajectory Path');
    expect(enUS.viewEngineHistory).toBe('View Trajectory Path');
    expect(enUS.roamHistory).toBe('Route Log');
    expect(enUS.viewHistory).toBe('View Route Log');
    expect(enUS.neuralHistoryMenu).toBe('View Route Log');
    expect(enUS.worldlineAnchors).toBe('Stations');
    expect(enUS.engineOrbit).toBe('Orbit');
    expect(enUS.engineHyperspace).toBe('Hyperspace Expedition');
    expect(enUS.engineOrbitFull).toBe('Orbit Mode');
    expect(enUS.engineHyperspaceFull).toBe('Hyperspace Expedition Mode');
    expect(enUS.engineOrbitIntro).toBe('Roam locally around orbit centers, concept cards, and nearby stations.');
    expect(enUS.engineOrbitIntroLong).toContain('stations');
    expect(enUS.engineHyperspaceIntro).toBe('Propagate outward layer by layer from activation sources through links and optional tree relations.');
    expect(enUS.engineHyperspaceIntroLong).toContain('block links');
    expect(enUS.activationTrace).toBe('Wake');
    expect(enUS.returnToBookmark).toBe('Return to Station');
    expect(enUS.addAnchor).toBe('Build Station');
    expect(enUS.removeAnchor).toBe('Remove Station');
    expect(enUS.viewOrbitCenterList).toBe('View Orbit Center List');
    expect(enUS.viewActivationSourceList).toBe('View Activation Source List');
    expect(enUS.stationBuiltAndSetOrbitCenter).toBe('Built station and switched to current orbit center');
    expect(enUS.stationBuiltAndSetPrimaryActivationSource).toBe('Built station and switched to current primary activation source');
    expect(enUS.buildStationAndSetOrbitCenterFailed).toBe('Failed to build station and switch orbit center');
    expect(enUS.buildStationAndSetPrimaryActivationSourceFailed).toBe('Failed to build station and switch primary activation source');
  });

  it('uses block-link wording for hyperspace edge labels', () => {
    expect(enUS.relationElementLink).toBe('Block Link');
    expect(enUS.relationOriginBacklink).toBe('Backlink');
    expect(enUS.relationOriginDirectRef).toBe('Direct Reference');
    expect(enUS.directConductor).toBe('Immediate Conductor');
    expect(enUS.traceStepSyntheticRoot).toBe('Inferred');
    expect(enUS.convergentNode).toBe('Convergent Node');
    expect(enUS.otherSources).toBe('Other Sources');
    expect(enUS.loadingWakeDetails).toBe('Loading route details...');
  });
});
