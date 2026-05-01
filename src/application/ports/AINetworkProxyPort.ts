export interface AINetworkProxyRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  redactionKeys?: string[];
}

export interface AINetworkProxyResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface AINetworkProxyPort {
  execute(request: AINetworkProxyRequest): Promise<AINetworkProxyResponse>;
}
