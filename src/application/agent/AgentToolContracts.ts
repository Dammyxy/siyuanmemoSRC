export const AGENT_TOOL_NAMES = ['memo_query', 'memo_card', 'memo_review', 'memo_ui'] as const;

export type AgentToolName = typeof AGENT_TOOL_NAMES[number];

export const SIYUAN_AGENT_SAFE_ACTIONS = [
  'get',
  'list',
  'read',
  'search',
  'status',
  'query',
  'open',
  'close',
] as const;

export const MEMO_QUERY_SAFE_ACTIONS = ['status', 'query'] as const;
export const MEMO_CARD_SAFE_ACTIONS = ['get', 'query', 'search'] as const;
export const MEMO_CARD_MUTATING_ACTIONS = ['create', 'save', 'suspend', 'resume'] as const;
export const MEMO_REVIEW_SAFE_ACTIONS = ['get', 'status', 'query', 'search'] as const;
export const MEMO_REVIEW_BLOCKED_ACTIONS = ['answer', 'grade', 'feedback', 'submit', 'commit'] as const;
export const MEMO_UI_SAFE_ACTIONS = ['open', 'get', 'status'] as const;
export const MEMO_UI_MUTATING_ACTIONS = ['focus'] as const;

export type MemoQueryAction = typeof MEMO_QUERY_SAFE_ACTIONS[number];
export type MemoCardAction =
  | typeof MEMO_CARD_SAFE_ACTIONS[number]
  | typeof MEMO_CARD_MUTATING_ACTIONS[number]
  | 'draft';
export type MemoReviewAction = typeof MEMO_REVIEW_SAFE_ACTIONS[number];
export type MemoUiAction =
  | typeof MEMO_UI_SAFE_ACTIONS[number]
  | typeof MEMO_UI_MUTATING_ACTIONS[number];

export type AgentErrorCode =
  | 'AGENT_API_UNAVAILABLE'
  | 'BACKEND_UNAVAILABLE'
  | 'FRONTEND_CONTEXT_UNAVAILABLE'
  | 'MCP_UNAVAILABLE'
  | 'READ_MODEL_UNAVAILABLE'
  | 'UNSUPPORTED_OPERATION'
  | 'VALIDATION_ERROR'
  | 'WRITER_RELAY_UNAVAILABLE';

export type AgentResultStatus =
  | 'success'
  | 'unavailable'
  | 'validation-error'
  | 'unsupported-operation';

export interface AgentToolError {
  code: AgentErrorCode;
  message: string;
}

export interface AgentToolSuccessResult<TData = unknown> {
  ok: true;
  status: 'success';
  data: TData;
  meta?: {
    truncated?: boolean;
    returnedItemCount?: number;
    totalItemCount?: number;
    followUpAction?: string;
  };
}

export interface AgentToolErrorResult {
  ok: false;
  status: Exclude<AgentResultStatus, 'success'>;
  error: AgentToolError;
}

export type AgentToolResult<TData = unknown> =
  | AgentToolSuccessResult<TData>
  | AgentToolErrorResult;

export interface AgentCapabilityResult {
  available: boolean;
  reason: string | null;
  checkedAt?: number;
}

export type AgentToolActionValidation =
  | { ok: true; action: string; safe: boolean; mutating: boolean }
  | AgentToolErrorResult;

type AgentToolSchemaProperty = {
  type?: string;
  description?: string;
  enum?: readonly string[];
  items?: AgentToolSchemaProperty;
  properties?: Record<string, AgentToolSchemaProperty>;
  required?: string[];
};

export interface AgentToolSchema {
  type: 'object';
  properties: Record<string, AgentToolSchemaProperty>;
  required: string[];
}

type RegisterToolFn = (
  name: string,
  config: {
    title?: string;
    description: string;
    inputSchema: AgentToolSchema;
    outputSchema?: AgentToolSchema;
  },
  handler: (args: Record<string, unknown>) => Promise<unknown>,
) => Promise<unknown>;

type UnregisterToolFn = (name: string) => Promise<void>;

export interface SiyuanMcpApi {
  registerTool: RegisterToolFn;
  unregisterTool?: UnregisterToolFn;
}

export type PluginAgentActionHandler = (
  args: Record<string, unknown>,
  app: unknown,
) => Promise<{ result?: string; error?: string }>;

export interface PluginAgentActionApi {
  addAgentAction: (options: {
    name: string;
    description: string;
    handler: PluginAgentActionHandler;
  }) => string;
}

export function buildAgentCapabilityAvailableResult(checkedAt = Date.now()): AgentCapabilityResult {
  return { available: true, reason: null, checkedAt };
}

export function buildAgentCapabilityUnavailableResult(reason: string, checkedAt = Date.now()): AgentCapabilityResult {
  return { available: false, reason, checkedAt };
}

export function buildAgentSuccessResult<TData>(
  data: TData,
  meta?: AgentToolSuccessResult<TData>['meta'],
): AgentToolSuccessResult<TData> {
  return meta ? { ok: true, status: 'success', data, meta } : { ok: true, status: 'success', data };
}

export function buildAgentUnavailableResult(code: AgentErrorCode, message: string): AgentToolErrorResult {
  return {
    ok: false,
    status: 'unavailable',
    error: { code, message },
  };
}

export function buildAgentValidationErrorResult(message: string): AgentToolErrorResult {
  return {
    ok: false,
    status: 'validation-error',
    error: { code: 'VALIDATION_ERROR', message },
  };
}

export function buildAgentUnsupportedResult(message: string): AgentToolErrorResult {
  return {
    ok: false,
    status: 'unsupported-operation',
    error: { code: 'UNSUPPORTED_OPERATION', message },
  };
}

function actionSchema(actions: readonly string[], description: string): AgentToolSchema {
  return {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: actions,
        description,
      },
    },
    required: ['action'],
  };
}

export function buildMemoQueryInputSchema(): AgentToolSchema {
  return actionSchema(MEMO_QUERY_SAFE_ACTIONS, 'SiYuanMemo learning overview read action.');
}

export function buildMemoCardInputSchema(): AgentToolSchema {
  return actionSchema(
    [...MEMO_CARD_SAFE_ACTIONS, 'draft', ...MEMO_CARD_MUTATING_ACTIONS],
    'SiYuanMemo card inspect, draft, or controlled mutation action.',
  );
}

export function buildMemoReviewInputSchema(): AgentToolSchema {
  return actionSchema(MEMO_REVIEW_SAFE_ACTIONS, 'SiYuanMemo review assistance read action.');
}

export function buildMemoUiInputSchema(): AgentToolSchema {
  return actionSchema(
    [...MEMO_UI_SAFE_ACTIONS, ...MEMO_UI_MUTATING_ACTIONS],
    'SiYuanMemo frontend navigation or focus action.',
  );
}

export function buildMemoToolInputSchema(tool: AgentToolName): AgentToolSchema {
  switch (tool) {
    case 'memo_query':
      return buildMemoQueryInputSchema();
    case 'memo_card':
      return buildMemoCardInputSchema();
    case 'memo_review':
      return buildMemoReviewInputSchema();
    case 'memo_ui':
      return buildMemoUiInputSchema();
  }
}

export function isSiyuanSafeAgentAction(action: string): boolean {
  return (SIYUAN_AGENT_SAFE_ACTIONS as readonly string[]).includes(action);
}

export function isAgentToolName(value: unknown): value is AgentToolName {
  return (AGENT_TOOL_NAMES as readonly string[]).includes(String(value || '').trim());
}

function normalizeAction(action: unknown): string {
  return String(action ?? '').trim();
}

function isAllowedAction(action: string, allowed: readonly string[]): boolean {
  return allowed.includes(action);
}

function isMutatingAgentToolAction(tool: AgentToolName, action: string): boolean {
  const mutatingByTool: Record<AgentToolName, readonly string[]> = {
    memo_query: [],
    memo_card: MEMO_CARD_MUTATING_ACTIONS,
    memo_review: [],
    memo_ui: MEMO_UI_MUTATING_ACTIONS,
  };
  return mutatingByTool[tool].includes(action);
}

export function validateAgentToolAction(tool: AgentToolName, action: unknown): AgentToolActionValidation {
  const normalized = normalizeAction(action);
  if (!normalized) {
    return buildAgentValidationErrorResult(`${tool} requires non-empty action`);
  }

  if (
    tool === 'memo_review'
    && isAllowedAction(normalized, MEMO_REVIEW_BLOCKED_ACTIONS)
  ) {
    return buildAgentUnsupportedResult('memo_review cannot submit feedback, grade, answer, or commit scheduler decisions');
  }

  const allowedByTool: Record<AgentToolName, readonly string[]> = {
    memo_query: MEMO_QUERY_SAFE_ACTIONS,
    memo_card: [...MEMO_CARD_SAFE_ACTIONS, 'draft', ...MEMO_CARD_MUTATING_ACTIONS],
    memo_review: MEMO_REVIEW_SAFE_ACTIONS,
    memo_ui: [...MEMO_UI_SAFE_ACTIONS, ...MEMO_UI_MUTATING_ACTIONS],
  };

  if (!isAllowedAction(normalized, allowedByTool[tool])) {
    return buildAgentUnsupportedResult(`${tool} action is unsupported: ${normalized}`);
  }

  const safe = isSiyuanSafeAgentAction(normalized);
  return {
    ok: true,
    action: normalized,
    safe,
    mutating: isMutatingAgentToolAction(tool, normalized),
  };
}

export function hasSiyuanMcpApi(value: unknown): value is { siyuan: { mcp: SiyuanMcpApi } } {
  const candidate = value as { siyuan?: { mcp?: Partial<SiyuanMcpApi> } } | null | undefined;
  return typeof candidate?.siyuan?.mcp?.registerTool === 'function';
}

export function hasSiyuanMcpUnregisterApi(value: unknown): value is { siyuan: { mcp: Required<SiyuanMcpApi> } } {
  const candidate = value as { siyuan?: { mcp?: Partial<SiyuanMcpApi> } } | null | undefined;
  return typeof candidate?.siyuan?.mcp?.unregisterTool === 'function';
}

export function hasPluginAgentActionApi(value: unknown): value is PluginAgentActionApi {
  const candidate = value as Partial<PluginAgentActionApi> | null | undefined;
  return typeof candidate?.addAgentAction === 'function';
}
