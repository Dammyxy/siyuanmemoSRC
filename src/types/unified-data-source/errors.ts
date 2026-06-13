export class DataSourceError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'DataSourceError';
  }
}

export class ModeError extends DataSourceError {
  constructor(message: string) {
    super(message, 'MODE_ERROR');
  }
}

export class QueueError extends DataSourceError {
  constructor(message: string) {
    super(message, 'QUEUE_ERROR');
  }
}

export class QueueProjectionNotReadyError extends DataSourceError {
  constructor(message: string) {
    super(message, 'QUEUE_PROJECTION_NOT_READY');
  }
}

export class SyncError extends DataSourceError {
  constructor(message: string) {
    super(message, 'SYNC_ERROR');
  }
}
