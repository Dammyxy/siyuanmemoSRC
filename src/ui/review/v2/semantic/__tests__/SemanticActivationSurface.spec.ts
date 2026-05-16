import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SemanticActivationSurface from '../SemanticActivationSurface.vue';
import { buildSemanticSurfaceModel } from '@/core/semantic/SemanticActivationPresentation';
import type { SemanticCandidateColumns, SemanticNode, SemanticSessionSnapshot } from '@/core/semantic/semanticActivationTypes';

function semanticNode(nodeId: string, nodeType: SemanticNode['nodeType']): SemanticNode {
  return {
    nodeId,
    nodeType,
    title: `${nodeId} title`,
    preview: `${nodeId} preview`,
    location: {
      blockId: nodeId,
      cardId: nodeType === 'real-review-card' ? `card-${nodeId}` : null,
      breadcrumb: ['Notebook', 'Doc'],
      backlinkBlockIds: ['backlink-1'],
    },
  };
}

function semanticSession(overrides: Partial<SemanticSessionSnapshot> = {}): SemanticSessionSnapshot {
  return {
    sessionId: 'semantic-session-1',
    rootFocusNodeId: 'root',
    currentNodeId: 'implicit-current',
    activeLens: 'assimilation',
    narrativePath: [{ nodeId: 'root', lens: 'assimilation', eventId: 'event-root', visitedAt: 1 }],
    startedAt: 1,
    endedAt: null,
    ...overrides,
  };
}

function semanticCandidates(): SemanticCandidateColumns {
  return {
    assimilation: [{
      candidateId: 'candidate-a',
      node: semanticNode('candidate-a', 'implicit-knowledge'),
      score: 0.8,
      lens: 'assimilation',
      reasons: [{ code: 'current-node-relation', weight: 0.8 }],
      explanation: { current: 0.8 },
    }],
    accommodation: [{
      candidateId: 'candidate-b',
      node: semanticNode('candidate-b', 'concept'),
      score: 0.7,
      lens: 'accommodation',
      reasons: [{ code: 'tension', weight: 0.7 }],
    }],
    free: [],
  };
}

describe('SemanticActivationSurface', () => {
  it('renders implicit knowledge as read-only without Review grading controls', () => {
    const wrapper = mount(SemanticActivationSurface, {
      props: {
        model: buildSemanticSurfaceModel({
          session: semanticSession(),
          currentNode: semanticNode('implicit-current', 'implicit-knowledge'),
          candidates: semanticCandidates(),
        }),
      },
    });

    expect(wrapper.text()).toContain('Implicit knowledge is read-only');
    expect(wrapper.text()).not.toContain('Again');
    expect(wrapper.text()).not.toContain('Good');
    expect(wrapper.text()).toContain('Old Knowledge Explains New');
    expect(wrapper.text()).toContain('New Knowledge Reinterprets Old');
    expect(wrapper.text()).toContain('Free Association');
  });

  it('emits lens-aware follow and station actions', async () => {
    const wrapper = mount(SemanticActivationSurface, {
      props: {
        model: buildSemanticSurfaceModel({
          session: semanticSession(),
          currentNode: semanticNode('implicit-current', 'implicit-knowledge'),
          candidates: semanticCandidates(),
        }),
      },
    });

    await wrapper.get('.semantic-activation-surface__candidate').trigger('click');
    await wrapper.findAll('button').find((button) => button.text() === 'Path Station')!.trigger('click');

    expect(wrapper.emitted('follow')?.[0]).toEqual(['candidate-a', 'assimilation']);
    expect(wrapper.emitted('create-station')?.[0]).toEqual(['path']);
  });

  it('renders AI relation decisions and keeps ignore as an explicit UI action', async () => {
    const wrapper = mount(SemanticActivationSurface, {
      props: {
        model: buildSemanticSurfaceModel({
          session: semanticSession(),
          currentNode: semanticNode('review-current', 'real-review-card'),
          candidates: semanticCandidates(),
        }),
        aiRelations: [{
          relationId: 'relation-1',
          fromNodeId: 'root',
          toNodeId: 'candidate-a',
          reason: 'path relation',
        }],
      },
    });

    await wrapper.findAll('button').find((button) => button.text() === 'Ignore')!.trigger('click');

    expect(wrapper.text()).toContain('Review Card');
    expect(wrapper.emitted('relation-decision')?.[0]).toEqual(['relation-1', 'ignored']);
  });
});
