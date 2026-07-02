export type NativeRiffSrsAction =
  | 'ordinary-siyuanmemo-owned-srs'
  | 'explicit-native-riff-compatibility';

export interface NativeRiffCompatibilityDecision {
  enabled: boolean;
  reason: NativeRiffSrsAction;
}

export function resolveNativeRiffCompatibilityDecision(input: {
  action?: NativeRiffSrsAction;
} = {}): NativeRiffCompatibilityDecision {
  const action = input.action === 'explicit-native-riff-compatibility'
    ? 'explicit-native-riff-compatibility'
    : 'ordinary-siyuanmemo-owned-srs';
  return {
    enabled: action === 'explicit-native-riff-compatibility',
    reason: action,
  };
}
