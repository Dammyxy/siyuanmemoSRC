import { describe, expect, it } from 'vitest';
import {
  resolveNativeRiffCompatibilityDecision,
} from '../NativeRiffCompatibilityPolicy';

describe('NativeRiffCompatibilityPolicy', () => {
  it('treats native Riff as explicit compatibility instead of ordinary SRS default', () => {
    expect(resolveNativeRiffCompatibilityDecision({ action: 'ordinary-siyuanmemo-owned-srs' })).toEqual({
      enabled: false,
      reason: 'ordinary-siyuanmemo-owned-srs',
    });
    expect(resolveNativeRiffCompatibilityDecision({ action: 'explicit-native-riff-compatibility' })).toEqual({
      enabled: true,
      reason: 'explicit-native-riff-compatibility',
    });
  });
});
