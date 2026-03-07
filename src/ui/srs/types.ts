import type { EditableCardType } from '@/application/services/card-editor/applyCardTypeTransition';
import type { EditableRenderTarget } from '@/application/services/card-editor/applyRenderTargetTransition';

export type SrsEditorFieldId = 'cardType' | 'render' | 'nextReview' | 'priority';

export type SrsEditorFieldKind = 'card-type' | 'render-target' | 'schedule-date' | 'priority';

export type SrsEditorCommitMode = 'immediate' | 'dialog';

export interface SrsEditorFieldDefinition {
  id: SrsEditorFieldId;
  label: string;
  kind: SrsEditorFieldKind;
  commitMode: SrsEditorCommitMode;
  editable: boolean;
  value: string;
  helperText?: string;
  loadingKey?: string;
}

export type { EditableCardType, EditableRenderTarget };
