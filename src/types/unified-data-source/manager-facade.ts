import type {
  BackendNeuralRoamCommandRequest,
  BackendNeuralRoamCommandResult,
  BackendNeuralRoamViewStateRequest,
  BackendNeuralRoamViewStateResult,
} from '../../../packages/contracts/src/backend-rpc';
import type { QueueProjectionLiveIdentityListener } from '@/types/queue-projection-live-identity';
import type { FSRSCard } from '@/types/card';
import type { CardFilter } from './browser-contracts';
import type {
  BatchCardDeleteResult,
  BatchCardMutationResult,
  CardMutationOptions,
  IDataSourceObserver,
  IReviewQueue,
  QueueBulkAddInput,
  QueueBulkMutationResult,
  QueueAddSource,
  QueueType,
} from './queue-core';
import type {
  QueueProjectionReadRequest,
  QueueProjectionReadResult,
  QueueProjectionRepairCommand,
  QueueProjectionRepairReceipt,
  QueueProjectionRolloutDiagnostic,
} from './queue-projection';

export interface IUnifiedDataSourceManagerFacade {
  getCard(cardId: string, options?: { silent?: boolean }): Promise<FSRSCard>;
  getCards(filter?: CardFilter): Promise<FSRSCard[]>;
  updateCard(card: FSRSCard, options?: CardMutationOptions): Promise<void>;
  batchUpdateCards?(cards: FSRSCard[], options?: CardMutationOptions): Promise<BatchCardMutationResult>;
  deleteCard?(cardId: string): Promise<void>;
  batchDeleteCards?(cardIds: string[], options?: { blockIds?: string[] }): Promise<BatchCardDeleteResult>;
  onCardsCreated?(cards: FSRSCard[]): Promise<void>;
  onCardsDeleted?(cardIds: string[], blockIds?: string[]): Promise<void>;
  getQueue(type: QueueType): IReviewQueue;
  batchAddToQueue?(type: QueueType, cards: QueueBulkAddInput[], source?: QueueAddSource): Promise<QueueBulkMutationResult>;
  batchRemoveFromQueue?(type: QueueType, cardIdsOrBlockIds: string[]): Promise<QueueBulkMutationResult>;
  getQueueProjectionRolloutDiagnostics?(queueType?: QueueType): QueueProjectionRolloutDiagnostic[];
  readQueueProjection?(request: QueueProjectionReadRequest): Promise<QueueProjectionReadResult>;
  repairQueueProjection?(command: QueueProjectionRepairCommand): Promise<QueueProjectionRepairReceipt>;
  observeQueueProjection?(listener: QueueProjectionLiveIdentityListener): () => void;
  readNeuralRoamViewState?(request?: BackendNeuralRoamViewStateRequest): Promise<BackendNeuralRoamViewStateResult>;
  neuralRoamCommand?(request: BackendNeuralRoamCommandRequest): Promise<BackendNeuralRoamCommandResult>;
  getAvailableQueueTypes(): QueueType[];
  registerObserver(observer: IDataSourceObserver): void;
  unregisterObserver(observer: IDataSourceObserver): void;
  getI18n?(key: string): string | undefined;
}
