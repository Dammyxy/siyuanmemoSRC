import { mount } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import BrowserSemanticNavigator from '../BrowserSemanticNavigator.vue';
import type { BrowserSemanticReadModel } from '../types';
import type { SemanticCandidate, SemanticNode, SemanticSessionSnapshot, SemanticStation } from '@/core/semantic/semanticActivationTypes';
import type { SemanticNodePresentation } from '@/core/semantic/SemanticActivationPresentation';

function node(nodeId: string, title = nodeId, nodeType: SemanticNode['nodeType'] = 'implicit-knowledge'): SemanticNode {
  return {
    nodeId,
    nodeType,
    title,
    preview: `${title} preview`,
    location: {
      blockId: nodeId,
      breadcrumb: ['Notebook', title],
    },
  };
}

function candidate(candidateId: string, lens: SemanticCandidate['lens'], title = candidateId): SemanticCandidate {
  return {
    candidateId,
    lens,
    node: node(candidateId, title),
    score: 0.7,
    reasons: [{ code: 'memory-projection', weight: 0.7 }],
  };
}

function session(): SemanticSessionSnapshot {
  return {
    sessionId: 'session-1',
    rootFocusNodeId: 'root',
    currentNodeId: 'current',
    activeLens: 'assimilation',
    narrativePath: [
      { nodeId: 'root', lens: 'assimilation', eventId: 'event-root', visitedAt: 1 },
      { nodeId: 'current', lens: 'free', eventId: 'event-current', visitedAt: 2 },
    ],
    startedAt: 1,
    endedAt: null,
  };
}

function presentation(raw: SemanticNode, overrides: Partial<SemanticNodePresentation> = {}): SemanticNodePresentation {
  const isReviewCard = raw.nodeType === 'real-review-card';
  const isImplicitKnowledge = raw.nodeType === 'implicit-knowledge';
  const isConceptNode = raw.nodeType === 'concept';
  return {
    nodeId: raw.nodeId,
    nodeType: raw.nodeType,
    title: raw.title,
    preview: raw.preview,
    breadcrumb: raw.location.breadcrumb ?? [],
    backlinkBlockIds: raw.location.backlinkBlockIds ?? [],
    blockId: raw.location.blockId,
    cardId: raw.location.cardId ?? null,
    isReviewCard,
    isImplicitKnowledge,
    isConceptNode,
    readOnly: isImplicitKnowledge,
    canReveal: isReviewCard,
    canGrade: isReviewCard,
    canSchedule: isReviewCard,
    canAutoCreateCard: false,
    actions: [],
    ...overrides,
  };
}

function model(overrides: Partial<BrowserSemanticReadModel> = {}): BrowserSemanticReadModel {
  const nodeStation: SemanticStation = {
    stationId: 'station-node',
    sessionId: 'session-1',
    type: 'node',
    nodeId: 'current',
    createdAt: 3,
  };
  const pathStation: SemanticStation = {
    stationId: 'station-path',
    sessionId: 'session-1',
    type: 'path',
    path: session().narrativePath,
    createdAt: 4,
  };
  return {
    status: 'ready',
    session: session(),
    rootNode: presentation(node('root', 'Root Concept', 'concept')),
    currentNode: presentation(node('current', 'Implicit Current', 'implicit-knowledge')),
    path: session().narrativePath,
    candidates: {
      assimilation: [candidate('old-node', 'assimilation', 'Old explains new')],
      accommodation: [candidate('tense-old', 'accommodation', 'New rewrites old')],
      free: [candidate('nearby-node', 'free', 'Nearby idea')],
    },
    candidateState: 'ready',
    emptyReason: null,
    nodeStations: [{
      station: nodeStation,
      title: 'Implicit Current',
      pathSummary: 'Implicit Current preview',
      isCurrentNode: true,
      isCurrentPath: false,
    }],
    pathStations: [{
      station: pathStation,
      title: 'Root Concept -> Implicit Current',
      pathSummary: 'Root Concept -> Implicit Current',
      isCurrentNode: false,
      isCurrentPath: true,
    }],
    ...overrides,
  };
}

describe('BrowserSemanticNavigator', () => {
  it('renders path, three lens columns, preview evidence, and station management', async () => {
    const wrapper = mount(BrowserSemanticNavigator, {
      props: { model: model() },
    });

    expect(wrapper.text()).toContain('Browser Semantic Workbench');
    expect(wrapper.text()).toContain('Old Knowledge Explains New');
    expect(wrapper.text()).toContain('New Knowledge Reinterprets Old');
    expect(wrapper.text()).toContain('Free Association');
    expect(wrapper.text()).toContain('Old explains new');
    expect(wrapper.text()).toContain('Root Concept -> Implicit Current');
    expect(wrapper.text()).toContain('Preview / Evidence');

    await wrapper.get('.browser-semantic-navigator__candidate').trigger('click');
    expect(wrapper.emitted('follow')?.[0]).toEqual(['old-node', 'assimilation']);

    await wrapper.findAll('.browser-semantic-navigator__station-open')[1].trigger('click');
    expect(wrapper.emitted('restore-path-station')?.[0]).toEqual(['station-path']);

    await wrapper.find('.browser-semantic-navigator__station-archive').trigger('click');
    expect(wrapper.emitted('archive-station')?.[0]).toEqual(['station-node']);
  });

  it('keeps implicit nodes read-only and does not render Review grading controls', () => {
    const wrapper = mount(BrowserSemanticNavigator, {
      props: { model: model() },
    });

    expect(wrapper.text()).toContain('Implicit knowledge is read-only here');
    expect(wrapper.text()).not.toContain('Again');
    expect(wrapper.text()).not.toContain('Hard');
    expect(wrapper.text()).not.toContain('Good');
    expect(wrapper.text()).not.toContain('Easy');
  });

  it('keeps real review-card nodes free of Browser-native grading controls', () => {
    const wrapper = mount(BrowserSemanticNavigator, {
      props: {
        model: model({
          currentNode: presentation(node('review-card', 'Review Card Node', 'real-review-card')),
        }),
      },
    });

    expect(wrapper.text()).toContain('Review Card');
    expect(wrapper.text()).not.toContain('Again');
    expect(wrapper.text()).not.toContain('Hard');
    expect(wrapper.text()).not.toContain('Good');
    expect(wrapper.text()).not.toContain('Easy');
  });

  it('keeps all three lens sets reachable in the responsive one-column layout', () => {
    const wrapper = mount(BrowserSemanticNavigator, {
      props: { model: model() },
    });

    const source = readFileSync(resolve(process.cwd(), 'src/ui/browser/semantic/BrowserSemanticNavigator.vue'), 'utf8');

    expect(source).toContain('@media (max-width: 960px)');
    expect(source).toContain('grid-template-columns: 1fr');
    expect(wrapper.findAll('.browser-semantic-navigator__lens')).toHaveLength(3);
    expect(wrapper.text()).toContain('Old Knowledge Explains New');
    expect(wrapper.text()).toContain('New Knowledge Reinterprets Old');
    expect(wrapper.text()).toContain('Free Association');
  });

  it('disables Semantic actions while pending and renders writer-unavailable failure state', async () => {
    const wrapper = mount(BrowserSemanticNavigator, {
      props: {
        model: model(),
        pending: true,
        unavailable: {
          status: 'unavailable',
          reason: 'writer-unavailable',
          message: 'WRITER_UNAVAILABLE: writer lease is unavailable',
        },
      },
    });

    expect(wrapper.classes()).toContain('browser-semantic-navigator--pending');
    expect(wrapper.text()).toContain('writer-unavailable');
    expect(wrapper.text()).toContain('WRITER_UNAVAILABLE');
    expect(wrapper.find('.browser-semantic-navigator__unavailable').attributes('role')).toBe('alert');

    await wrapper.get('.browser-semantic-navigator__candidate').trigger('click');
    expect(wrapper.emitted('follow')).toBeUndefined();
    expect(wrapper.find('.browser-semantic-navigator__candidate').attributes('disabled')).toBeDefined();
    expect(wrapper.find('.browser-semantic-navigator__station-open').attributes('disabled')).toBeDefined();
  });

  it('shows empty candidate success separately from unavailable state', () => {
    const wrapper = mount(BrowserSemanticNavigator, {
      props: {
        model: model({
          candidates: { assimilation: [], accommodation: [], free: [] },
          candidateState: 'empty',
          emptyReason: 'No candidates in current root',
        }),
      },
    });

    expect(wrapper.text()).toContain('No candidates in current root');
    expect(wrapper.text()).not.toContain('unavailable');
  });
});
