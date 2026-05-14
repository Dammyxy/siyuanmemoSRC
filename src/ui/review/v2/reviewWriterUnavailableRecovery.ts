type ReviewActionErrorReason = 'grade' | 'skip' | 'custom';

export type ReviewWriterUnavailableRecoveryKind =
  | 'writer-relay-unavailable'
  | 'writer-unavailable'
  | 'backend-unavailable'
  | 'generic-error';

export interface ReviewWriterUnavailableRecoveryInput {
  reason: ReviewActionErrorReason;
  error: unknown;
  t?: (key: string, fallback: string) => string;
}

export interface ReviewWriterUnavailableRecoveryNotice {
  kind: ReviewWriterUnavailableRecoveryKind;
  title: string;
  message: string;
  detail: string;
  retryLabel: string;
  reopenLabel: string;
  dismissLabel: string;
}

function translate(
  t: ReviewWriterUnavailableRecoveryInput['t'],
  key: string,
  fallback: string,
): string {
  return typeof t === 'function' ? t(key, fallback) : fallback;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error.trim();
  }
  return String(error || '').trim();
}

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function classifyReviewWriterUnavailableError(error: unknown): ReviewWriterUnavailableRecoveryKind {
  const message = getErrorMessage(error).toLowerCase();
  if (!message) {
    return 'generic-error';
  }

  if (includesAny(message, [
    'writer relay unavailable',
    'relay is unavailable in follower mode',
    'writer command unavailable',
    'writer command failed',
  ])) {
    return 'writer-relay-unavailable';
  }

  if (includesAny(message, [
    'writer-unavailable',
    'writer unavailable',
    'writer lease',
    'active writer',
    'not active writer',
    'follower-only',
    'never eligible',
  ])) {
    return 'writer-unavailable';
  }

  if (includesAny(message, [
    'backend_unavailable',
    'backend unavailable',
    'backend-unavailable',
    'backend worker unavailable',
    'backend worker',
    'kernel_sidecar_unavailable',
    'kernel sidecar unavailable',
    'kernel-sidecar-unavailable',
    'review not ready',
  ])) {
    return 'backend-unavailable';
  }

  return 'generic-error';
}

export function resolveReviewWriterUnavailableRecovery(
  input: ReviewWriterUnavailableRecoveryInput,
): ReviewWriterUnavailableRecoveryNotice {
  const kind = classifyReviewWriterUnavailableError(input.error);
  const detail = getErrorMessage(input.error);
  const common = {
    kind,
    detail,
    retryLabel: translate(input.t, 'reviewWriterRecoveryRetry', '重试当前操作'),
    reopenLabel: translate(input.t, 'reviewWriterRecoveryReload', '刷新复习面'),
    dismissLabel: translate(input.t, 'reviewWriterRecoveryDismiss', '关闭'),
  };

  if (kind === 'writer-relay-unavailable') {
    return {
      ...common,
      title: translate(input.t, 'reviewWriterRelayUnavailableTitle', '写入窗口不可用'),
      message: translate(input.t, 'reviewWriterRelayUnavailableMessage', '当前复习动作没有到达写入窗口。请打开或聚焦一个可写窗口后重试。'),
    };
  }

  if (kind === 'writer-unavailable') {
    return {
      ...common,
      title: translate(input.t, 'reviewWriterUnavailableTitle', '没有可用写入窗口'),
      message: translate(input.t, 'reviewWriterUnavailableMessage', '请打开或聚焦一个可写窗口，再重试当前复习动作。'),
    };
  }

  if (kind === 'backend-unavailable') {
    return {
      ...common,
      title: translate(input.t, 'reviewBackendUnavailableTitle', '后端暂不可用'),
      message: translate(input.t, 'reviewBackendUnavailableMessage', '后端写入服务暂不可用。当前卡片已保留，请稍后重试。'),
    };
  }

  return {
    ...common,
    title: '',
    message: '',
  };
}
