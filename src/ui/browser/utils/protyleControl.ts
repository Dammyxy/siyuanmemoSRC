export interface ProtyleReadonlyController {
  protyle?: unknown;
  disable?: () => void;
  enable?: () => void;
}

function isProtyleReadonlyController(value: unknown): value is ProtyleReadonlyController {
  return typeof value === 'object' && value !== null;
}

function hasProtyleInstance(
  protyle: unknown,
): protyle is ProtyleReadonlyController & { protyle: unknown } {
  return isProtyleReadonlyController(protyle) && Boolean(protyle.protyle);
}

export function applyProtyleReadonly(
  protyle: unknown,
  readonly: boolean,
): void {
  if (!hasProtyleInstance(protyle)) return;

  if (readonly) {
    protyle.disable?.();
    return;
  }
  protyle.enable?.();
}
