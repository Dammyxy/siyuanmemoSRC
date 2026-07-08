export type CdfSourceBlockId = string;
export type CdfConceptBlockId = string;
export type CdfLiveRelationKey = string;

export type CdfRelationKind =
  | 'definition-forward'
  | 'definition-reverse'
  | 'descriptor-forward'
  | 'descriptor-reverse';

export type CdfRelationFamily = 'definition' | 'descriptor';

export type CdfRelationStatus =
  | 'active-live'
  | 'orphaned-by-live-relation'
  | 'duplicate-live-relation'
  | 'legacy-relation-unavailable';

export type CdfLiveContentStatus = 'content-complete' | 'content-incomplete';

export type CdfIssueSeverity = 'blocking' | 'warning';

export type CdfLiveRelationIssueCode =
  | 'missing-concept-ref'
  | 'missing-descriptor-concept-binding'
  | 'descriptor-concept-conflict'
  | 'invalid-concept-ref'
  | 'missing-concept-target'
  | 'missing-source-block'
  | 'invalid-source-grammar'
  | 'ambiguous-structure'
  | 'empty-source'
  | 'duplicate-ref'
  | 'non-doc-ref-warning';

export interface CdfLiveRelationIssue {
  code: CdfLiveRelationIssueCode;
  severity: CdfIssueSeverity;
  sourceBlockId?: CdfSourceBlockId;
  conceptBlockId?: CdfConceptBlockId;
  detail?: string;
}

export interface CdfConceptBinding {
  conceptBlockId: CdfConceptBlockId;
  displayText?: string;
  order: number;
  evidenceKind?: CdfDescriptorConceptBindingEvidenceKind;
}

export type CdfDescriptorConceptBindingEvidenceKind =
  | 'inline-ref'
  | 'list-parent-ref'
  | 'list-backlink'
  | 'body-heading'
  | 'body-document';

export interface CdfConceptResolution {
  bindings: CdfConceptBinding[];
  issues: CdfLiveRelationIssue[];
}

export interface CdfDescriptorConceptBindingEvidence {
  conceptBlockId: CdfConceptBlockId;
  displayText?: string;
  order?: number;
  evidenceKind?: CdfDescriptorConceptBindingEvidenceKind;
}

export interface CdfLiveRelationSourceSnapshot {
  sourceBlockId: CdfSourceBlockId;
  markdown: string;
  breadcrumb: string[];
}

export interface CdfLiveRelationConceptSnapshot {
  conceptBlockId: CdfConceptBlockId;
  displayText?: string;
  order: number;
}

export interface CdfLiveRelationContentFields {
  cue?: string;
  answer?: string;
  definition?: string;
  question?: string;
}

export type CdfContentShape =
  | 'definition'
  | 'item'
  | 'descriptor-explicit'
  | 'descriptor-group-plain'
  | 'descriptor-group-arrow';

export interface CdfLiveRelationCandidate {
  sourceBlockId: CdfSourceBlockId;
  conceptBlockId: CdfConceptBlockId;
  relationKind: CdfRelationKind;
  relationKey: CdfLiveRelationKey;
  relationStatus: CdfRelationStatus;
  contentStatus: CdfLiveContentStatus;
  issues: CdfLiveRelationIssue[];
  sourceSnapshot: CdfLiveRelationSourceSnapshot;
  conceptSnapshot: CdfLiveRelationConceptSnapshot;
  contentShape: CdfContentShape;
  content: CdfLiveRelationContentFields;
  fieldMappingSnapshot: Record<string, string>;
  descriptorConceptBindingEvidenceKind?: CdfDescriptorConceptBindingEvidenceKind;
}

export interface CdfLiveBlockNode {
  id: string;
  type?: string;
  subtype?: string;
  markdown?: string;
  content?: string;
  children?: CdfLiveBlockNode[];
}

export interface CdfConceptTarget {
  id: string;
  type: string | null;
  title?: string;
}

export interface CdfLiveDeriveOptions {
  conceptTargets?: Record<string, CdfConceptTarget | string | null | undefined>;
  descriptorConceptEvidence?: Record<
    string,
    | CdfConceptBlockId
    | CdfDescriptorConceptBindingEvidence
    | Array<CdfConceptBlockId | CdfDescriptorConceptBindingEvidence>
    | null
    | undefined
  >;
}

export interface CdfSourceIssue {
  sourceBlockId: CdfSourceBlockId;
  issue: CdfLiveRelationIssue;
}

export interface CdfLiveDeriveResult {
  relations: CdfLiveRelationCandidate[];
  issues: CdfSourceIssue[];
}
