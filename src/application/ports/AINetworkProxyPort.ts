import type { KernelAiStreamEvent } from '../../../packages/contracts/src/kernel-rpc';

export interface AINetworkProxyRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  redactionKeys?: string[];
  stream?: boolean;
  streamId?: string;
  sessionId?: string;
  jobId?: string;
  onStreamEvent?: (event: KernelAiStreamEvent) => void;
}

export interface AINetworkProxyResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface AINetworkProxyPort {
  execute(request: AINetworkProxyRequest): Promise<AINetworkProxyResponse>;
  subscribeStream?(
    streamId: string,
    handlers: {
      onEvent(event: KernelAiStreamEvent): void;
      onError?(error: Error): void;
      onClose?(): void;
    },
  ): { close(): void };
}
