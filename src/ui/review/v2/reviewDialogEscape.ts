import type { ReviewEditorState } from './reviewEditorState';

export type ReviewDialogEscapeDecision = 'ignore' | 'exit-editor' | 'consume-latched';

export function resolveReviewDialogEscapeKeydown(input: {
  isDialogMode: boolean;
  key: string;
  repeat: boolean;
  escRepeatLatch: boolean;
  editorState: ReviewEditorState;
}): ReviewDialogEscapeDecision {
  if (!input.isDialogMode || input.key !== 'Escape') {
    return 'ignore';
  }

  if (input.escRepeatLatch) {
    return 'consume-latched';
  }

  if (input.repeat && input.editorState.supportsNativeEdit && input.editorState.isEditing) {
    return 'exit-editor';
  }

  return 'ignore';
}

export function shouldResetReviewDialogEscapeLatch(input: {
  key: string;
  escRepeatLatch: boolean;
}): boolean {
  return input.escRepeatLatch && input.key === 'Escape';
}
