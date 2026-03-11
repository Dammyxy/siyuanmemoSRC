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
  directConductor: 'Immediate Conductor',
  branchRoot: 'Current Orbit Center',
  primaryActivationSource: 'Primary Activation Source',
  traceUnavailableForLegacy: 'Unavailable',
  traceBadgePrimarySource: 'Primary Activation Source',
  traceBadgeCurrentOrbitCenter: 'Current Orbit Center',
  traceStepSyntheticRoot: 'Inferred',
  convergentNode: 'Convergent Node',
  repeatedHit: 'Repeated Hit',
  otherSources: 'Other Sources',
  currentRoute: 'Current Route',
  viewWakeDetails: 'Route details',
  hideWakeDetails: 'Hide details',
  loadingWakeDetails: 'Loading route details...',
  nMoreSources: '{count} more sources',
  nMoreHistoricalHits: '{count} more historical hits',
  totalHitCount: 'Hit {count} times',
  hitCount: 'Hit {count} times',
  historicalHitUnresolved: 'Historical hit (path not fully recoverable)',
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
    directActivatorEventId: 'event-root',
    directRelationLabel: 'Backlink',
    directRelationBadges: [
      { key: 'relation:backlink', label: 'Backlink', tone: 'soft' },
    ],
    branchRootTitle: 'Root Node',
    branchRootEventId: 'event-root',
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

function createHyperspaceTrace(overrides: Partial<NeuralActivationTraceViewModel> = {}): NeuralActivationTraceViewModel {
  return {
    ...createOrbitTrace({
      engineMode: 'hyperspace',
      directActivatorTitle: 'Lead Source',
      directActivatorEventId: 'event-root',
      directRelationLabel: 'Concept Link',
      directRelationBadges: [
        { key: 'relation:element-link', label: 'Block Link', tone: 'soft' },
        { key: 'origin:backlink', label: 'Backlink', tone: 'soft' },
      ],
      branchRootTitle: 'Lead Source',
      branchRootEventId: 'event-root',
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
    ...overrides,
  };
}

function createDegradedHyperspaceTrace(): NeuralActivationTraceViewModel {
  return {
    targetEventId: 'event-target',
    targetNodeId: 'node-target',
    branchRootNodeId: 'source-root',
    isExact: false,
    degradedReason: 'legacy',
    engineMode: 'hyperspace',
    targetTitle: 'Target Node',
    directActivatorTitle: 'Conductor Node',
    directActivatorEventId: 'event-direct',
    directRelationLabel: 'Block Link',
    directRelationBadges: [
      { key: 'relation:element-link', label: 'Block Link', tone: 'soft' },
      { key: 'origin:backlink', label: 'Backlink', tone: 'soft' },
    ],
    branchRootTitle: 'Lead Source',
    branchRootEventId: 'event-root',
    steps: [
      {
        eventId: 'event-synthetic',
        nodeId: 'node-synthetic',
        nodePreview: 'Ghost Source',
        isVirtual: false,
        associationType: 'source',
        reason: 'Synthetic fallback source',
        activationKind: 'source-root',
        visitedAt: 80,
        focusId: 'source-root',
        engineMode: 'hyperspace',
        sourceRole: 'activation-source',
        sourceNodeId: null,
        sourceEventId: null,
        branchRootNodeId: 'source-root',
        traceQuality: 'legacy',
        depth: 0,
        conductionScore: 0.1,
        isSyntheticRoot: true,
        relationLabel: 'Activation Source',
        activationLabel: 'Activation Source',
        displayBadges: [
          { key: 'relation:source', label: 'Activation Source', tone: 'soft' },
          { key: 'synthetic-root', label: 'Inferred', tone: 'soft' },
        ],
        previewable: true,
        jumpable: true,
        isRoot: false,
        isTarget: false,
        isCurrent: false,
        isSelected: false,
      },
      {
        eventId: 'event-root',
        nodeId: 'source-root',
        nodePreview: 'Lead Source',
        isVirtual: false,
        associationType: 'source',
        reason: 'Primary activation source',
        activationKind: 'source-root',
        visitedAt: 100,
        focusId: 'source-root',
        engineMode: 'hyperspace',
        sourceRole: 'activation-source',
        sourceNodeId: null,
        sourceEventId: null,
        branchRootNodeId: 'source-root',
        traceQuality: 'legacy',
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
        eventId: 'event-direct',
        nodeId: 'node-direct',
        nodePreview: 'Conductor Node',
        isVirtual: false,
        associationType: 'element-link',
        reason: 'Immediate conduction into the target',
        activationKind: 'graph-edge',
        visitedAt: 160,
        focusId: 'source-root',
        engineMode: 'hyperspace',
        sourceRole: null,
        sourceNodeId: 'source-root',
        sourceEventId: 'event-root',
        branchRootNodeId: 'source-root',
        traceQuality: 'legacy',
        depth: 1,
        conductionScore: 0.72,
        isSyntheticRoot: true,
        relationLabel: 'Block Link',
        activationLabel: 'Graph Edge',
        displayBadges: [
          { key: 'relation:element-link', label: 'Block Link', tone: 'soft' },
          { key: 'origin:backlink', label: 'Backlink', tone: 'soft' },
          { key: 'direct-role', label: 'Immediate Conductor', tone: 'default' },
          { key: 'synthetic-root', label: 'Inferred', tone: 'soft' },
        ],
        previewable: true,
        jumpable: true,
        isRoot: false,
        isTarget: false,
        isCurrent: false,
        isSelected: false,
      },
      {
        eventId: 'event-target',
        nodeId: 'node-target',
        nodePreview: 'Target Node',
        isVirtual: false,
        associationType: 'element-link',
        reason: 'Block link',
        activationKind: 'graph-edge',
        visitedAt: 220,
        focusId: 'source-root',
        engineMode: 'hyperspace',
        sourceRole: null,
        sourceNodeId: 'node-direct',
        sourceEventId: 'event-direct',
        branchRootNodeId: 'source-root',
        traceQuality: 'legacy',
        depth: 2,
        conductionScore: 0.88,
        isSyntheticRoot: false,
        relationLabel: 'Block Link',
        activationLabel: 'Graph Edge',
        displayBadges: [
          { key: 'relation:element-link', label: 'Block Link', tone: 'soft' },
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

function createConvergentHyperspaceTrace(): NeuralActivationTraceViewModel {
  const trace = createHyperspaceTrace();
  const variants = [
    {
      representativeEventId: 'event-target',
      latestVisitedAt: 200,
      hitCount: 1,
      isPrimary: true,
      traceQuality: 'exact' as const,
      branchRootTitle: 'Lead Source',
      directActivatorTitle: 'Lead Source',
      directRelationLabel: 'Block Link',
      directRelationBadges: [
        { key: 'relation:element-link', label: 'Block Link', tone: 'soft' as const },
        { key: 'origin:backlink', label: 'Backlink', tone: 'soft' as const },
      ],
      inferred: false,
    },
    {
      representativeEventId: 'event-target-alt',
      latestVisitedAt: 240,
      hitCount: 2,
      isPrimary: false,
      traceQuality: 'legacy' as const,
      branchRootTitle: 'Archive Source',
      directActivatorTitle: 'Archive Relay',
      directRelationLabel: 'Concept Link',
      directRelationBadges: [
        { key: 'relation:concept-link', label: 'Concept Link', tone: 'soft' as const },
      ],
      inferred: true,
    },
  ];

  return {
    ...trace,
    steps: trace.steps.map((step, index) => {
      if (index !== trace.steps.length - 1) {
        return step;
      }
      return {
        ...step,
        repeatHitCount: 3,
        convergenceStatus: 'ready',
        displayBadges: [
          { key: 'relation:concept-link', label: 'Concept Link', tone: 'soft' },
          { key: 'synthetic-root', label: 'Inferred', tone: 'soft' },
        ],
        convergence: {
          kind: 'multi-route',
          totalEventCount: 3,
          distinctRouteCount: 2,
          alternateRouteCount: 1,
          variants,
        },
      };
    }),
  };
}

function createLazyConvergenceTrace(): NeuralActivationTraceViewModel {
  const trace = createConvergentHyperspaceTrace();
  return {
    ...trace,
    steps: trace.steps.map((step, index) => {
      if (index === 0) {
        return {
          ...step,
          isSelected: true,
          repeatHitCount: 2,
          convergenceStatus: 'idle',
          convergence: null,
        };
      }
      if (index === trace.steps.length - 1) {
        return {
          ...step,
          isSelected: false,
        };
      }
      return step;
    }),
  };
}

function createLoadingConvergenceTrace(): NeuralActivationTraceViewModel {
  const trace = createHyperspaceTrace();
  return {
    ...trace,
    steps: trace.steps.map((step, index) => {
      if (index === 0) {
        return {
          ...step,
          isSelected: true,
          repeatHitCount: 2,
          convergenceStatus: 'loading',
          convergence: null,
        };
      }
      return step;
    }),
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

  it('renders degraded hyperspace wake summary by explicit roles and keeps inferred as a secondary badge', () => {
    const wrapper = mount(NeuralActivationTracePanel, {
      props: {
        i18n,
        trace: createDegradedHyperspaceTrace(),
      },
    });

    const summaryCards = wrapper.findAll('.neural-trace-panel__card');
    expect(summaryCards[0].text()).toContain('Current');
    expect(summaryCards[1].text()).toContain('Immediate Conductor');
    expect(summaryCards[1].text()).toContain('Conductor Node');
    expect(summaryCards[1].text()).toContain('Block Link');
    expect(summaryCards[1].text()).toContain('Backlink');
    expect(summaryCards[1].text()).toContain('Inferred');
    expect(summaryCards[2].text()).toContain('Primary Activation Source');
    expect(summaryCards[2].text()).toContain('Lead Source');
    expect(summaryCards[2].text()).not.toContain('Ghost Source');

    const stepCards = wrapper.findAll('.neural-trace-panel__step-card');
    const syntheticFallbackBadges = stepCards[0].findAll('.neural-trace-panel__pill').map((node) => node.text());
    const rootBadges = stepCards[1].findAll('.neural-trace-panel__pill').map((node) => node.text());
    const directBadges = stepCards[2].findAll('.neural-trace-panel__pill').map((node) => node.text());

    expect(syntheticFallbackBadges).toEqual(['Activation Source', 'Inferred']);
    expect(rootBadges).toEqual(['Primary Activation Source']);
    expect(directBadges).toEqual(['Block Link', 'Backlink', 'Immediate Conductor', 'Inferred']);
  });

  it('allows direct activator and primary source summaries to point to the same wake step', () => {
    const wrapper = mount(NeuralActivationTracePanel, {
      props: {
        i18n,
        trace: createHyperspaceTrace({
          directActivatorTitle: 'Lead Source',
          directActivatorEventId: 'event-root',
          branchRootTitle: 'Lead Source',
          branchRootEventId: 'event-root',
        }),
      },
    });

    const summaryCards = wrapper.findAll('.neural-trace-panel__card');
    expect(summaryCards[1].text()).toContain('Immediate Conductor');
    expect(summaryCards[1].text()).toContain('Lead Source');
    expect(summaryCards[2].text()).toContain('Primary Activation Source');
    expect(summaryCards[2].text()).toContain('Lead Source');
  });

  it('shows convergent target summary, expands route details, and emits switch-trace-event', async () => {
    const wrapper = mount(NeuralActivationTracePanel, {
      props: {
        i18n,
        trace: createConvergentHyperspaceTrace(),
      },
    });

    const summaryCards = wrapper.findAll('.neural-trace-panel__card');
    expect(summaryCards[0].text()).toContain('Convergent Node');
    expect(summaryCards[0].text()).toContain('2 more historical hits');

    const targetStep = wrapper.findAll('.neural-trace-panel__step-card')[1];
    const targetBadges = targetStep.findAll('.neural-trace-panel__pill').map((node) => node.text());
    expect(targetBadges).toContain('Convergent Node');
    expect(targetBadges.indexOf('Convergent Node')).toBeLessThan(targetBadges.indexOf('Inferred'));

    await wrapper.get('.neural-trace-panel__convergence-toggle').trigger('click');

    expect(wrapper.text()).toContain('Historical hit (path not fully recoverable)');
    expect(wrapper.text()).toContain('Archive Source');
    expect(wrapper.text()).toContain('Archive Relay');

    const routeCards = wrapper.findAll('.neural-trace-panel__route-card');
    expect(routeCards).toHaveLength(2);
    await routeCards[1].trigger('click');

    expect(wrapper.emitted('switch-trace-event')?.[0]).toEqual(['event-target-alt']);
  });

  it('requests lazy convergence details for repeated selected steps that are still idle', async () => {
    const wrapper = mount(NeuralActivationTracePanel, {
      props: {
        i18n,
        trace: createLazyConvergenceTrace(),
      },
    });

    const convergenceSections = wrapper.findAll('.neural-trace-panel__convergence');
    expect(convergenceSections).toHaveLength(2);
    expect(wrapper.find('.neural-trace-panel__route-card').exists()).toBe(false);

    await convergenceSections[0].get('.neural-trace-panel__convergence-toggle').trigger('click');

    expect(wrapper.text()).toContain('Loading route details...');
    expect(wrapper.emitted('request-convergence-details')?.[0]).toEqual(['event-root']);
  });

  it('shows a loading placeholder while a repeated step is resolving convergence details', async () => {
    const wrapper = mount(NeuralActivationTracePanel, {
      props: {
        i18n,
        trace: createLoadingConvergenceTrace(),
      },
    });

    await wrapper.get('.neural-trace-panel__convergence-toggle').trigger('click');

    expect(wrapper.text()).toContain('Loading route details...');
    expect(wrapper.find('.neural-trace-panel__route-card').exists()).toBe(false);
    expect(wrapper.emitted('request-convergence-details')).toBeUndefined();
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
