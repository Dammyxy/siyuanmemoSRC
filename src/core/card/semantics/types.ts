import type { FSRSCard } from '@/types/card';
import { CardType } from '@/types/card';

export type SrsCardSemanticKind =
  | CardType.Item
  | CardType.Topic
  | CardType.Concept
  | CardType.Descriptor;

export type SrsCardSemanticConfidence = 'deterministic' | 'ambiguous' | 'insufficient';

export type SrsCardSemanticEvidenceSource =
  | 'creation-receipt'
  | 'template'
  | 'card-marker'
  | 'symbol-source'
  | 'progressive'
  | 'raw-type'
  | 'block-attr'
  | 'structure';

export type SrsCardSemanticEvidenceStrength = 'deterministic' | 'diagnostic';

export interface SrsCardCreationReceipt {
  version: 1;
  semanticKind: SrsCardSemanticKind;
  templateID?: string;
  sourceBlockIds: string[];
  cardIds: string[];
  creationFamily: string;
  createdAt: number;
  details?: Record<string, unknown>;
}

export interface SrsCardSemanticEvidence {
  source: SrsCardSemanticEvidenceSource;
  kind: SrsCardSemanticKind | null;
  path: string;
  value: unknown;
  strength: SrsCardSemanticEvidenceStrength;
  valid?: boolean;
  reason?: string;
}

export interface SrsCardSemanticDiagnostic {
  code:
    | 'semantic-evidence-conflict'
    | 'semantic-evidence-missing'
    | 'semantic-raw-type-mismatch'
    | 'semantic-marker-mismatch'
    | 'semantic-receipt-invalid';
  message: string;
  evidence?: SrsCardSemanticEvidence[];
}

export interface SrsCardSemanticPatch {
  type?: SrsCardSemanticKind;
  cardTypeMarker?: FSRSCard['cardTypeMarker'] | null;
  metaPatch?: Record<string, unknown>;
  metaDelete?: string[];
}

export interface SrsCardSemanticResolution {
  cardId: string;
  persistedKind: SrsCardSemanticKind | null;
  effectiveKind: SrsCardSemanticKind | null;
  confidence: SrsCardSemanticConfidence;
  evidence: SrsCardSemanticEvidence[];
  diagnostics: SrsCardSemanticDiagnostic[];
  patch: SrsCardSemanticPatch | null;
}

export interface SrsCardSemanticResolverInput {
  card: FSRSCard;
  blockAttrs?: Record<string, unknown> | null;
  structure?: {
    detectedKind?: SrsCardSemanticKind | null;
    reason?: string;
  } | null;
}

export type SrsCardSemanticRepairStatus =
  | 'safe-repair'
  | 'noop'
  | 'ambiguous'
  | 'insufficient';

export interface SrsCardSemanticRepairPlan {
  cardId: string;
  status: SrsCardSemanticRepairStatus;
  beforeKind: SrsCardSemanticKind | null;
  afterKind: SrsCardSemanticKind | null;
  resolution: SrsCardSemanticResolution;
  patch: SrsCardSemanticPatch | null;
}

export interface SrsCardSemanticAuditResult {
  resolution: SrsCardSemanticResolution;
  repairPlan: SrsCardSemanticRepairPlan;
}

export function isSrsCardSemanticKind(value: unknown): value is SrsCardSemanticKind {
  return value === CardType.Item
    || value === CardType.Topic
    || value === CardType.Concept
    || value === CardType.Descriptor;
}
