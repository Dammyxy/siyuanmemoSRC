import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SemanticReviewSidebar from '../SemanticReviewSidebar.vue';
import type { BackendSemanticCommandRequest } from '../../../../../../packages/contracts/src/backend-rpc';

function okModel(bindingState: { type: 'follow-current'; rootFocusNodeId: string } | { type: 'pinned-session'; sessionId: string }) {
  const node = {
    nodeId: 'node-1',
    nodeType: 'real-review-card',
    title: 'Raw title',
    preview: 'Raw summary',
    presentation: {
      displayTitle: 'Readable node',
      summary: 'Readable summary',
      nodeKind: 'block',
      breadcrumb: [],
      availability: { status: 'available', reason: null, message: null },
      sourceBlockId: 'node-1',
      cardId: null,
      debugId: 'node-1',
    },
    location: { blockId: 'node-1', cardId: null, deckId: null, breadcrumb: [], backlinkBlockIds: [] },
  };
  return {
    status: 'ok',
    requestId: 'sidebar-1',
    model: {
      bindingState,
      session: {
        sessionId: bindingState.type === 'pinned-session' ? bindingState.sessionId : 'session-1',
        rootFocusNodeId: 'root-1',
        currentNodeId: 'node-1',
        activeLens: 'assimilation',
        narrativePath: [],
        startedAt: 1,
        endedAt: null,
      },
      currentNode: node,
      activePath: [],
      activePathNodes: [node],
      branches: [{ branchId: 'branch-1', rootNodeId: 'node-1', activeCursorNodeId: 'node-1', edges: [], recentActivityAt: 1 }],
      candidates: {
        assimilation: [{ candidateId: 'candidate-1', node, score: 1, lens: 'assimilation', reasons: [] }],
        accommodation: [],
        free: [],
      },
      edgeExplanations: [{
        fromNodeId: 'root-1',
        toNodeId: 'node-1',
        lens: 'assimilation',
        primaryExplanation: 'Root explains node.',
        reasonTags: ['memory'],
        evidence: [],
        createdBy: { kind: 'system' },
        createdAt: 1,
      }],
      later: [{ entryId: 'later-1', sessionId: 'session-1', nodeId: 'node-1', createdAt: 1, removedAt: null }],
      suggestions: [{ suggestionId: 'suggestion-1', sessionId: 'session-1', source: 'ai', summary: 'Readable suggestion', status: 'active', createdAt: 1, updatedAt: 1 }],
      nodes: [node],
    },
    diagnosticEventId: 'diag-sidebar',
  };
}

describe('SemanticReviewSidebar', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads follow-current binding from the current Review node', async () => {
    const readSidebar = vi.fn(async () => okModel({ type: 'follow-current', rootFocusNodeId: 'block-1' }));

    const wrapper = mount(SemanticReviewSidebar, {
      props: {
        readClient: { readSidebar },
        currentNodeId: 'block-1',
      },
    });
    await flushPromises();

    expect(readSidebar).toHaveBeenCalledWith(expect.objectContaining({
      method: 'semantic.sidebar.read',
      bindingMode: 'follow-current',
      currentNodeId: 'block-1',
    }));
    expect(wrapper.text()).toContain('Follow current node');
    expect(wrapper.text()).toContain('Readable node');
    expect(wrapper.text()).toContain('Assimilate');
    expect(wrapper.text()).toContain('Readable suggestion');
  });

  it('reads pinned-session binding and can emit unpin', async () => {
    const readSidebar = vi.fn(async () => okModel({ type: 'pinned-session', sessionId: 'session-1' }));

    const wrapper = mount(SemanticReviewSidebar, {
      props: {
        readClient: { readSidebar },
        currentNodeId: 'block-1',
        pinnedSessionId: 'session-1',
      },
    });
    await flushPromises();
    await wrapper.get('.semantic-review-sidebar__unpin').trigger('click');

    expect(readSidebar).toHaveBeenCalledWith(expect.objectContaining({
      bindingMode: 'pinned-session',
      sessionId: 'session-1',
    }));
    expect(wrapper.text()).toContain('Pinned session');
    expect(wrapper.emitted('unpin')).toHaveLength(1);
  });

  it('shows current-node unavailable without creating fake sidebar state', async () => {
    const readSidebar = vi.fn(async () => ({
      status: 'ok',
      requestId: 'sidebar-1',
      model: {
        bindingState: { type: 'current-node-unavailable', reason: 'missing-root' },
        session: null,
        currentNode: null,
        activePath: [],
        activePathNodes: [],
        branches: [],
        candidates: { assimilation: [], accommodation: [], free: [] },
        edgeExplanations: [],
        later: [],
        suggestions: [],
        nodes: [],
      },
      diagnosticEventId: 'diag-sidebar',
    }));

    const wrapper = mount(SemanticReviewSidebar, {
      props: {
        readClient: { readSidebar },
        currentNodeId: null,
      },
    });
    await flushPromises();

    expect(readSidebar).toHaveBeenCalledWith(expect.objectContaining({
      bindingMode: 'follow-current',
      currentNodeId: null,
    }));
    expect(wrapper.text()).toContain('Current node unavailable');
  });

  it('shows restore actions for the most recent ended session', async () => {
    const readSidebar = vi.fn(async () => ({
      status: 'ok',
      requestId: 'sidebar-1',
      model: {
        bindingState: { type: 'follow-current', rootFocusNodeId: 'root-1' },
        session: null,
        recentEndedSession: {
          sessionId: 'ended-session-1',
          rootFocusNodeId: 'root-1',
          currentNodeId: 'root-1',
          activeLens: 'assimilation',
          narrativePath: [],
          startedAt: 1,
          endedAt: 2,
        },
        currentNode: null,
        activePath: [],
        activePathNodes: [],
        branches: [],
        candidates: { assimilation: [], accommodation: [], free: [] },
        edgeExplanations: [],
        later: [],
        suggestions: [],
        nodes: [],
      },
      diagnosticEventId: 'diag-sidebar',
    }));

    const wrapper = mount(SemanticReviewSidebar, {
      props: {
        readClient: { readSidebar },
        currentNodeId: 'root-1',
      },
    });
    await flushPromises();
    await wrapper.findAll('button').find((button) => button.text() === 'View Review')!.trigger('click');
    await wrapper.findAll('button').find((button) => button.text() === 'Continue From Here')!.trigger('click');

    expect(wrapper.text()).toContain('Ended session available');
    expect(wrapper.emitted('view-ended-session')?.[0]).toEqual(['ended-session-1']);
    expect(wrapper.emitted('continue-ended-session')?.[0]).toEqual(['ended-session-1']);
  });

  it('shows start exploration for a new root without creating a session', async () => {
    const readSidebar = vi.fn(async () => ({
      status: 'ok',
      requestId: 'sidebar-1',
      model: {
        bindingState: { type: 'follow-current', rootFocusNodeId: 'root-1' },
        session: null,
        recentEndedSession: null,
        currentNode: null,
        activePath: [],
        activePathNodes: [],
        branches: [],
        candidates: { assimilation: [], accommodation: [], free: [] },
        edgeExplanations: [],
        later: [],
        suggestions: [],
        nodes: [],
      },
      diagnosticEventId: 'diag-sidebar',
    }));

    const wrapper = mount(SemanticReviewSidebar, {
      props: {
        readClient: { readSidebar },
        currentNodeId: 'root-1',
      },
    });
    await flushPromises();
    await wrapper.get('.semantic-review-sidebar__start').trigger('click');

    expect(wrapper.text()).toContain('No Semantic session for this Review item yet.');
    expect(wrapper.emitted('start-exploration')).toHaveLength(1);
  });

  it('routes candidate, path, branch, and new-path interactions through Semantic commands', async () => {
    vi.useFakeTimers();
    const readSidebar = vi.fn(async () => okModel({ type: 'pinned-session', sessionId: 'session-1' }));
    const execute = vi.fn(async (request: BackendSemanticCommandRequest) => ({
      status: 'ok',
      commandId: request.requestId,
      writerInstanceId: 'writer-1',
      changed: { semanticSessionIds: ['session-1'] },
      diagnosticEventId: `semantic-command:${request.requestId}`,
    }));

    const wrapper = mount(SemanticReviewSidebar, {
      props: {
        readClient: { readSidebar },
        commandClient: { execute },
        currentNodeId: 'block-1',
        pinnedSessionId: 'session-1',
      },
    });
    await flushPromises();

    await wrapper.get('.semantic-review-sidebar__list-item .semantic-review-sidebar__text-button').trigger('click');
    await vi.advanceTimersByTimeAsync(200);
    await flushPromises();
    await wrapper.get('.semantic-review-sidebar__path .semantic-review-sidebar__text-button').trigger('click');
    await vi.advanceTimersByTimeAsync(200);
    await flushPromises();
    await wrapper.findAll('button').find((button) => button.text() === 'Archive branch')!.trigger('click');
    await flushPromises();
    await wrapper.findAll('button').find((button) => button.text() === 'New path')!.trigger('click');
    await flushPromises();

    expect(execute).toHaveBeenNthCalledWith(1, expect.objectContaining({
      callerIntent: 'semantic.review-sidebar.follow-candidate',
      command: expect.objectContaining({
        type: 'follow-candidate',
        sessionId: 'session-1',
        candidateId: 'candidate-1',
      }),
    }));
    expect(execute).toHaveBeenNthCalledWith(2, expect.objectContaining({
      callerIntent: 'semantic.review-sidebar.move-active-cursor',
      command: expect.objectContaining({
        type: 'move-active-cursor',
        sessionId: 'session-1',
        nodeId: 'node-1',
      }),
    }));
    expect(execute).toHaveBeenNthCalledWith(3, expect.objectContaining({
      callerIntent: 'semantic.review-sidebar.archive-branch',
      command: expect.objectContaining({
        type: 'archive-branch',
        branchId: 'branch-1',
      }),
    }));
    expect(execute).toHaveBeenNthCalledWith(4, expect.objectContaining({
      callerIntent: 'semantic.review-sidebar.create-branch-edge',
      command: expect.objectContaining({
        type: 'create-branch-edge',
        fromNodeId: 'node-1',
        toNodeId: 'node-1',
      }),
    }));
  });

  it('double-click follows once and emits one temporary view request', async () => {
    const readSidebar = vi.fn(async () => okModel({ type: 'pinned-session', sessionId: 'session-1' }));
    const execute = vi.fn(async (request: BackendSemanticCommandRequest) => ({
      status: 'ok',
      commandId: request.requestId,
      writerInstanceId: 'writer-1',
      changed: { semanticSessionIds: ['session-1'] },
      diagnosticEventId: `semantic-command:${request.requestId}`,
    }));

    const wrapper = mount(SemanticReviewSidebar, {
      props: {
        readClient: { readSidebar },
        commandClient: { execute },
        currentNodeId: 'block-1',
        pinnedSessionId: 'session-1',
      },
    });
    await flushPromises();
    await wrapper.get('.semantic-review-sidebar__list-item .semantic-review-sidebar__text-button').trigger('dblclick');
    await flushPromises();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      command: expect.objectContaining({ type: 'follow-candidate' }),
    }));
    expect(wrapper.emitted('view-node')).toEqual([['node-1', 'Readable node', 'node-1']]);
  });

  it('analyzes the active path by creating an AI suggestion without mutating the path', async () => {
    const readSidebar = vi.fn(async () => okModel({ type: 'pinned-session', sessionId: 'session-1' }));
    const execute = vi.fn(async (request: BackendSemanticCommandRequest) => ({
      status: 'ok',
      commandId: request.requestId,
      writerInstanceId: 'writer-1',
      changed: { semanticSessionIds: ['session-1'] },
      diagnosticEventId: `semantic-command:${request.requestId}`,
    }));

    const wrapper = mount(SemanticReviewSidebar, {
      props: {
        readClient: { readSidebar },
        commandClient: { execute },
        currentNodeId: 'block-1',
        pinnedSessionId: 'session-1',
      },
    });
    await flushPromises();
    await wrapper.findAll('button').find((button) => button.text() === 'Analyze Path')!.trigger('click');
    await flushPromises();

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      callerIntent: 'semantic.review-sidebar.analyze-path-suggestion',
      command: expect.objectContaining({
        type: 'create-suggestion',
        sessionId: 'session-1',
        source: 'ai',
        summary: 'AI path analysis suggestion for Readable node',
        targetNodeId: 'node-1',
      }),
    }));
    expect(execute).not.toHaveBeenCalledWith(expect.objectContaining({
      command: expect.objectContaining({ type: 'follow-candidate' }),
    }));
    expect(wrapper.emitted('analyze-path')?.[0]?.[0]).toMatchObject({
      session: { sessionId: 'session-1' },
      currentNode: { nodeId: 'node-1' },
      edgeExplanations: [{ primaryExplanation: 'Root explains node.' }],
      later: [{ nodeId: 'node-1' }],
    });
  });

  it('routes suggestion ignore, bind, and materialize through suggestion lifecycle commands only', async () => {
    const readSidebar = vi.fn(async () => okModel({ type: 'pinned-session', sessionId: 'session-1' }));
    const execute = vi.fn(async (request: BackendSemanticCommandRequest) => ({
      status: 'ok',
      commandId: request.requestId,
      writerInstanceId: 'writer-1',
      changed: { semanticSessionIds: ['session-1'] },
      diagnosticEventId: `semantic-command:${request.requestId}`,
    }));

    const wrapper = mount(SemanticReviewSidebar, {
      props: {
        readClient: { readSidebar },
        commandClient: { execute },
        currentNodeId: 'block-1',
        pinnedSessionId: 'session-1',
      },
    });
    await flushPromises();
    await wrapper.findAll('button').find((button) => button.text() === 'Ignore')!.trigger('click');
    await flushPromises();
    await wrapper.findAll('button').find((button) => button.text() === 'Bind current')!.trigger('click');
    await flushPromises();
    await wrapper.findAll('button').find((button) => button.text() === 'Materialize current')!.trigger('click');
    await flushPromises();

    expect(execute).toHaveBeenNthCalledWith(1, expect.objectContaining({
      command: expect.objectContaining({
        type: 'ignore-suggestion',
        suggestionId: 'suggestion-1',
      }),
    }));
    expect(execute).toHaveBeenNthCalledWith(2, expect.objectContaining({
      command: expect.objectContaining({
        type: 'bind-suggestion',
        suggestionId: 'suggestion-1',
        nodeId: 'node-1',
      }),
    }));
    expect(execute).toHaveBeenNthCalledWith(3, expect.objectContaining({
      command: expect.objectContaining({
        type: 'materialize-suggestion',
        suggestionId: 'suggestion-1',
        blockId: 'node-1',
      }),
    }));
    expect(execute).not.toHaveBeenCalledWith(expect.objectContaining({
      command: expect.objectContaining({ type: 'follow-candidate' }),
    }));
  });
});
