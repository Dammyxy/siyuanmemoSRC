export function formatNextDue(diffMs: number): string {
  if (diffMs < 60 * 1000) {
    return '< 1 min';
  }
  if (diffMs < 60 * 60 * 1000) {
    const minutes = Math.round(diffMs / (60 * 1000));
    return `${minutes} min`;
  }
  if (diffMs < 24 * 60 * 60 * 1000) {
    const hours = Math.round(diffMs / (60 * 60 * 1000));
    return `${hours} h`;
  }
  const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
  return `${days} d`;
}
