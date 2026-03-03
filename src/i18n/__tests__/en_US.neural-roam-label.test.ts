import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';

describe('en_US neural roam labels', () => {
  it('uses "Neural Roam" for practice menu entry', () => {
    expect(enUS.practiceNeural).toBe('Neural Roam');
  });

  it('uses "Neural Roam" for legacy neuralWanderingQueue key', () => {
    expect(enUS.neuralWanderingQueue).toBe('Neural Roam');
  });
});
