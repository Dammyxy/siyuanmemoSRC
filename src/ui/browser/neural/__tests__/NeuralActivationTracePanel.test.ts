import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import NeuralActivationTracePanel from '../NeuralActivationTracePanel.vue';
import type { NeuralActivationTraceViewModel } from '../types';

const i18n = {
  activationTrace: 'Wake',
  activationTraceEmpty: 'No wake is available.',
  activationTraceLegacy: 'Legacy trace warning',
  currentNodeTag: 'Current',
  anchoredTag: 'Anchored',
  directActivator: 'Direct Activator',
  directConductor: 'Direct Conductor',
  branchRoot: 'Current Orbit Center',
  primaryActivationSource: 'Primary Activation Source',
  traceUnavailableForLegacy: 'Unavailable',
  traceBadgePrimarySource: 'Primary Activation Source',
  traceBadgeCurrentOrbitCenter: 'Current Orbit Center',
  traceStepSyntheticRoot: 'Synthetic Root',
  wakeOrbitSubtitle: 'Shows orbit activation.',
  wakeHyperspaceSubtitle: 'Shows spreading activation.',
};

function createOrbitTrace(overrides: Partial<NeuralActivationTraceViewModel> = {}): NeuralActivationTraceViewModel {
  return {
    targetEventId: 'event-target',
    targetNodeId: 'node-target',
    branchRootNodeId: 'node-root',
    isExact: true,
    degradedReason: null,
    engineMode: 'orbit',
    targetTitle: 'Target Node',
    directActivatorTitle: 'Source Node',
    directRelationLabel: 'Backlink',
    directRelationBadges: [
      { key: 'relation:backlink', label: 'Backlink', tone: 'soft' },
    ],
    branchRootTitle: 'Root Node',
    steps: [
      {
        eventId: 'event-root',
        nodeId: 'node-root',
        nodePreview: 'Root Node',
        isVirtual: false,
        associationType: 'focus',
        reason: 'Orbit center node',
        activationKind: 'focus-root',
        visitedAt: 100,
        focusId: 'node-root',
        engineMode: 'orbit',
        sourceRole: 'orbit-center',
        sourceNodeId: null,
        sourceEventId: null,
        branchRootNodeId: 'node-root',
        traceQuality: 'exact',
        depth: 0,
        conductionScore: 1,
        isSyntheticRoot: false,
        relationLabel: 'Orbit Center Node',
        activationLabel: 'Orbit Center Node',
        displayBadges: [
          { key: 'root-role', label: 'Current Orbit Center', tone: 'root' },
        ],
        previewable: true,
        jumpable: true,
        isRoot: true,
        isTarget: false,
        isCurrent: false,
        isSelected: false,
      },
      {
        eventId: 'event-target',
        nodeId: 'node-target',
        nodePreview: 'Target Node',
        isVirtual: false,
        associationType: 'backlink',
        reason: 'Backlink',
        activationKind: 'graph-edge',
        visitedAt: 200,
        focusId: 'node-root',
        engineMode: 'orbit',
        sourceRole: null,
        sourceNodeId: 'node-root',
        sourceEventId: 'event-root',
        branchRootNodeId: 'node-root',
        traceQuality: 'exact',
        depth: 1,
        conductionScore: 0.78,
        isSyntheticRoot: false,
        relationLabel: 'Backlink',
        activationLabel: 'Graph Edge',
        displayBadges: [
          { key: 'relation:backlink', label: 'Backlink', tone: 'soft' },
          { key: 'current', label: 'Current', tone: 'current' },
        ],
        previewable: true,
        jumpable: true,
        isRoot: false,
        isTarget: true,
        isCurrent: true,
        isSelected: true,
      },
    ],
    ...overrides,
  };
}

function createHyperspaceTrace(): NeuralActivationTraceViewModel {
  return {
    ...createOrbitTrace({
      engineMode: 'hyperspace',
      directActivatorTitle: 'Conductor Node',
      directRelationLabel: 'Concept Link',
      directRelationBadges: [
        { key: 'relation:element-link', label: 'Block Link', tone: 'soft' },
        { key: 'origin:backlink', label: 'Backlink', tone: 'soft' },
      ],
      branchRootTitle: 'Lead Source',
      targetTitle: 'Target Node',
      branchRootNodeId: 'source-root',
      targetEventId: 'event-target',
      targetNodeId: 'node-target',
    }),
    steps: [
      {
        eventId: 'event-root',
        nodeId: 'source-root',
        nodePreview: 'Lead Source',
        isVirtual: false,
        associationType: 'source',
        reason: 'Activation source',
        activationKind: 'source-root',
        visitedAt: 100,
        focusId: 'source-root',
        engineMode: 'hyperspace',
        sourceRole: 'activation-source',
        sourceNodeId: null,
        sourceEventId: null,
        branchRootNodeId: 'source-root',
        traceQuality: 'exact',
        depth: 0,
        conductionScore: 1,
        isSyntheticRoot: false,
        relationLabel: 'Activation Source',
        activationLabel: 'Activation Source',
        displayBadges: [
          { key: 'root-role', label: 'Primary Activation Source', tone: 'root' },
        ],
        previewable: true,
        jumpable: true,
        isRoot: true,
        isTarget: false,
        isCurrent: false,
        isSelected: false,
      },
      {
        eventId: 'event-target',
        nodeId: 'node-target',
        nodePreview: 'Target Node',
        isVirtual: false,
        associationType: 'concept-link',
        reason: 'Concept Link',
        activationKind: 'graph-edge',
        visitedAt: 200,
        focusId: 'source-root',
        engineMode: 'hyperspace',
        sourceRole: null,
        sourceNodeId: 'source-root',
        sourceEventId: 'event-root',
        branchRootNodeId: 'source-root',
        traceQuality: 'exact',
        depth: 1,
        conductionScore: 0.82,
        isSyntheticRoot: false,
        relationLabel: 'Concept Link',
        activationLabel: 'Graph Edge',
        displayBadges: [
          { key: 'relation:concept-link', label: 'Concept Link', tone: 'soft' },
          { key: 'current', label: 'Current', tone: 'current' },
        ],
        previewable: true,
        jumpable: true,
        isRoot: false,
        isTarget: true,
        isCurrent: true,
        isSelected: true,
      },
    ],
  };
}

describe('NeuralActivationTracePanel', () => {
  it('renders exact activation trace summary and steps', () => {
    const wrapper = mount(NeuralActivationTracePanel, {
      props: {
        i18n,
        trace: createOrbitTrace(),
        currentNodeId: 'node-target',
        anchorNodeIds: ['node-target'],
      },
    });

    expect(wrapper.text()).toContain('Wake');
    expect(wrapper.text()).toContain('Target Node');
    expect(wrapper.text()).toContain('Source Node');
    expect(wrapper.text()).toContain('Root Node');
    expect(wrapper.text()).toContain('Backlink');
    expect(wrapper.text()).toContain('Current Orbit Center');
    expect(wrapper.find('.neural-trace-panel__summary-pane').exists()).toBe(true);
    expect(wrapper.find('.neural-trace-panel__steps-wrap').exists()).toBe(true);
    expect(wrapper.findAll('.neural-trace-panel__step')).toHaveLength(2);
    expect(wrapper.find('.neural-trace-panel__step--selected').exists()).toBe(true);
  });

  it('dedupes hyperspace root source badge and emits preview/jump events', async () => {
    const wrapper = mount(NeuralActivationTracePanel, {
      props: {
        i18n,
        trace: createHyperspaceTrace(),
      },
    });

    const firstStep = wrapper.findAll('.neural-trace-panel__step-card')[0];
    const rootBadges = firstStep.findAll('.neural-trace-panel__pill').map((node) => node.text());
    expect(rootBadges.filter((label) => label === 'Primary Activation Source')).toHaveLength(1);
    const directSummaryBadges = wrapper.findAll('.neural-trace-panel__card')[1]
      .findAll('.neural-trace-panel__pill')
      .map((node) => node.text());
    expect(directSummaryBadges).toEqual(['Block Link', 'Backlink']);

    await firstStep.trigger('click');
    await firstStep.trigger('dblclick');

    expect(wrapper.emitted('select-step')?.[0]).toEqual(['event-root']);
    expect(wrapper.emitted('preview')?.[0]).toEqual(['source-root']);
    expect(wrapper.emitted('jump')?.[0]).toEqual(['source-root']);
  });

  it('emits preview and jump from summary cards', async () => {
    const wrapper = mount(NeuralActivationTracePanel, {
      props: {
        i18n,
        trace: createOrbitTrace(),
      },
    });

    const summaryCards = wrapper.findAll('.neural-trace-panel__card');
    await summaryCards[0].trigger('click');
    await summaryCards[1].trigger('dblclick');

    expect(wrapper.emitted('preview')?.[0]).toEqual(['node-target']);
    expect(wrapper.emitted('jump')?.[0]).toEqual(['node-root']);
  });

  it('shows legacy banner for degraded traces', () => {
    const wrapper = mount(NeuralActivationTracePanel, {
      props: {
        i18n,
        trace: createOrbitTrace({
          isExact: false,
          degradedReason: 'legacy',
        }),
      },
    });

    expect(wrapper.find('.neural-trace-panel__banner--warning').exists()).toBe(true);
  });

  it('renders empty state without trace', () => {
    const wrapper = mount(NeuralActivationTracePanel, {
      props: {
        i18n,
        trace: null,
      },
    });

    expect(wrapper.find('.neural-trace-panel__empty').exists()).toBe(true);
  });

  it('resets steps scroll position when trace target changes', async () => {
    const wrapper = mount(NeuralActivationTracePanel, {
      props: {
        i18n,
        trace: createOrbitTrace(),
      },
    });

    const stepsWrap = wrapper.get('.neural-trace-panel__steps-wrap').element as HTMLDivElement;
    stepsWrap.scrollTop = 180;

    await wrapper.setProps({
      trace: createOrbitTrace({
        targetEventId: 'event-next',
      }),
    });
    await nextTick();

    expect(stepsWrap.scrollTop).toBe(0);
  });
});
