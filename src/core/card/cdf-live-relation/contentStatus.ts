import type { CdfContentShape, CdfLiveContentStatus, CdfLiveRelationContentFields } from './types';

export interface CdfContentCompletenessInput {
  shape: CdfContentShape;
  content: CdfLiveRelationContentFields;
}

function hasText(value: string | null | undefined): boolean {
  return String(value || '').trim().length > 0;
}

export function evaluateCdfContentStatus(input: CdfContentCompletenessInput): CdfLiveContentStatus {
  switch (input.shape) {
    case 'definition':
      return hasText(input.content.definition) ? 'content-complete' : 'content-incomplete';
    case 'item':
      return hasText(input.content.question) && hasText(input.content.answer)
        ? 'content-complete'
        : 'content-incomplete';
    case 'descriptor-explicit':
    case 'descriptor-group-arrow':
      return hasText(input.content.cue) && hasText(input.content.answer)
        ? 'content-complete'
        : 'content-incomplete';
    case 'descriptor-group-plain':
      return hasText(input.content.answer) ? 'content-complete' : 'content-incomplete';
    default:
      return 'content-incomplete';
  }
}
