export type ReviewEditorRenderer = 'main-protyle' | 'special' | 'html' | 'empty';

export type ReviewEditorState = {
  renderer: ReviewEditorRenderer;
  supportsNativeEdit: boolean;
  isEditing: boolean;
};

export function createReviewEditorState(
  renderer: ReviewEditorRenderer = 'empty',
  options?: Partial<Pick<ReviewEditorState, 'supportsNativeEdit' | 'isEditing'>>
): ReviewEditorState {
  return {
    renderer,
    supportsNativeEdit: options?.supportsNativeEdit ?? false,
    isEditing: options?.isEditing ?? false,
  };
}
