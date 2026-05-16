import type { BackendSemanticCommandResult } from '../../../../packages/contracts/src/backend-rpc';
import type { BrowserCard } from '../types';
import type {
  SemanticCandidateColumns,
  SemanticNode,
  SemanticSessionSnapshot,
  SemanticStation,
  SemanticUnavailableReason,
} from '@/core/semantic/semanticActivationTypes';
import type { SemanticNodePresentation } from '@/core/semantic/SemanticActivationPresentation';

export interface BrowserSemanticFocus {
  rootFocusNodeId: string;
  title: string;
  sourceCard: BrowserCard;
}

export type BrowserSemanticUnavailable = {
  status: 'unavailable';
  reason: SemanticUnavailableReason;
  message: string;
};

export interface BrowserSemanticStationSummary {
  station: SemanticStation;
  title: string;
  pathSummary: string;
  isCurrentNode: boolean;
  isCurrentPath: boolean;
}

export interface BrowserSemanticReadModel {
  status: 'ready';
  session: SemanticSessionSnapshot;
  rootNode: SemanticNodePresentation;
  currentNode: SemanticNodePresentation;
  path: SemanticSessionSnapshot['narrativePath'];
  candidates: SemanticCandidateColumns;
  candidateState: 'ready' | 'empty';
  emptyReason?: string | null;
  nodeStations: BrowserSemanticStationSummary[];
  pathStations: BrowserSemanticStationSummary[];
}

export type BrowserSemanticReadModelResult = BrowserSemanticReadModel | BrowserSemanticUnavailable;

export type BrowserSemanticStartResult =
  | {
      status: 'ready';
      focus: BrowserSemanticFocus;
      restored: boolean;
      commandResult: BackendSemanticCommandResult | null;
      model: BrowserSemanticReadModel;
    }
  | BrowserSemanticUnavailable;

export type BrowserSemanticCommandUiResult =
  | {
      status: 'ok';
      commandResult: BackendSemanticCommandResult;
      model?: BrowserSemanticReadModel | null;
    }
  | BrowserSemanticUnavailable;
