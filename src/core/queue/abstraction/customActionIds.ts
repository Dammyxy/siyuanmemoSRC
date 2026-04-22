export const HIDE_CURRENT_IN_SCOPE_COMMAND_ID = 'hide-current-in-scope';

export function isHideCurrentInScopeCommandId(value: unknown): value is typeof HIDE_CURRENT_IN_SCOPE_COMMAND_ID {
  return String(value || '').trim() === HIDE_CURRENT_IN_SCOPE_COMMAND_ID;
}
