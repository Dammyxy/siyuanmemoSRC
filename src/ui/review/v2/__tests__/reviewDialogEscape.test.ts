import { describe, expect, it } from 'vitest';
import { resolveReviewDialogEscapeKeydown, shouldResetReviewDialogEscapeLatch } from '../reviewDialogEscape';
import { createReviewEditorState } from '../reviewEditorState';

describe('reviewDialogEscape', () => {
  it('exits editor only for repeated Escape while native editing is active', () => {
    expect(resolveReviewDialogEscapeKeydown({
      key: 'Escape',
      repeat: true,
      escRepeatLatch: false,
      editorState: createReviewEditorState('main-protyle', {
        supportsNativeEdit: true,
        isEditing: true,
      }),
    })).toBe('exit-editor');

    expect(resolveReviewDialogEscapeKeydown({
      key: 'Enter',
      repeat: true,
      escRepeatLatch: false,
      editorState: createReviewEditorState('main-protyle', {
        supportsNativeEdit: true,
        isEditing: true,
      }),
    })).toBe('ignore');

    expect(resolveReviewDialogEscapeKeydown({
      key: 'Escape',
      repeat: false,
      escRepeatLatch: false,
      editorState: createReviewEditorState('main-protyle', {
        supportsNativeEdit: true,
        isEditing: true,
      }),
    })).toBe('ignore');
  });

  it('consumes repeated Escape while the latch is active until keyup', () => {
    expect(resolveReviewDialogEscapeKeydown({
      key: 'Escape',
      repeat: true,
      escRepeatLatch: true,
      editorState: createReviewEditorState('main-protyle', {
        supportsNativeEdit: true,
        isEditing: false,
      }),
    })).toBe('consume-latched');

    expect(shouldResetReviewDialogEscapeLatch({
      key: 'Escape',
      escRepeatLatch: true,
    })).toBe(true);

    expect(shouldResetReviewDialogEscapeLatch({
      key: 'Enter',
      escRepeatLatch: true,
    })).toBe(false);

    expect(shouldResetReviewDialogEscapeLatch({
      key: 'Escape',
      escRepeatLatch: false,
    })).toBe(false);
  });
});
