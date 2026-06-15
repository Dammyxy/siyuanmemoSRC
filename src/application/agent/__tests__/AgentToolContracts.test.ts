import { describe, expect, it } from 'vitest';
import {
  AGENT_TOOL_NAMES,
  MEMO_CARD_MUTATING_ACTIONS,
  MEMO_QUERY_SAFE_ACTIONS,
  MEMO_REVIEW_BLOCKED_ACTIONS,
  buildAgentUnavailableResult,
  buildMemoCardInputSchema,
  buildMemoQueryInputSchema,
  buildMemoReviewInputSchema,
  buildMemoUiInputSchema,
  validateAgentToolAction,
} from '../AgentToolContracts';

describe('Agent tool contracts', () => {
  it('requires action in every MCP input schema', () => {
    const schemas = [
      buildMemoQueryInputSchema(),
      buildMemoCardInputSchema(),
      buildMemoReviewInputSchema(),
      buildMemoUiInputSchema(),
    ];

    for (const schema of schemas) {
      expect(schema.required).toContain('action');
      expect(schema.properties.action).toMatchObject({
        type: 'string',
      });
    }
  });

  it('separates safe read actions from mutating actions', () => {
    expect(AGENT_TOOL_NAMES).toEqual(['memo_query', 'memo_card', 'memo_review', 'memo_ui']);
    expect(MEMO_QUERY_SAFE_ACTIONS).toEqual(expect.arrayContaining(['status', 'query']));
    expect(MEMO_CARD_MUTATING_ACTIONS).toEqual(expect.arrayContaining(['create', 'save', 'suspend', 'resume']));

    for (const action of MEMO_CARD_MUTATING_ACTIONS) {
      expect(['get', 'list', 'read', 'search', 'status', 'query', 'open', 'close']).not.toContain(action);
    }

    expect(buildMemoCardInputSchema().properties.action.enum).not.toContain('draft');
    expect(validateAgentToolAction('memo_card', 'draft')).toMatchObject({
      ok: false,
      error: { code: 'UNSUPPORTED_OPERATION' },
    });
    expect(validateAgentToolAction('memo_card', 'save')).toMatchObject({
      ok: true,
      safe: false,
      mutating: true,
    });
  });

  it('rejects missing, empty, unknown, and blocked review feedback actions', () => {
    expect(validateAgentToolAction('memo_query', undefined)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(validateAgentToolAction('memo_query', '   ')).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(validateAgentToolAction('memo_card', 'drop_all')).toMatchObject({
      ok: false,
      error: { code: 'UNSUPPORTED_OPERATION' },
    });

    for (const action of MEMO_REVIEW_BLOCKED_ACTIONS) {
      expect(validateAgentToolAction('memo_review', action)).toMatchObject({
        ok: false,
        error: { code: 'UNSUPPORTED_OPERATION' },
      });
    }
  });

  it('returns explicit unavailable envelopes without fake fallback state', () => {
    expect(buildAgentUnavailableResult('MCP_UNAVAILABLE', 'siyuan.mcp.registerTool missing')).toEqual({
      ok: false,
      status: 'unavailable',
      error: {
        code: 'MCP_UNAVAILABLE',
        message: 'siyuan.mcp.registerTool missing',
      },
    });
  });
});
