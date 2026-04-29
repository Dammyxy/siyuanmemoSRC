import { describe, expect, it } from 'vitest';
import type { AIChatRegisteredSkillDescriptor } from '@/application/services/AIChatSkillRegistry';
import {
  deriveTabNormalizationDiagnostic,
  hasGenericSectionContent,
  mergeTabResult,
  normalizeConceptCoachState,
  normalizeGenericStructuredResult,
  normalizeSelfTestCards,
  tabResultFromConceptCoach,
} from '../AIWorkbenchResultNormalization';

const structuredSkill = {
  id: 'user:outline',
  title: 'Outline',
  brief: 'Outline skill',
  mode: 'structured',
  primaryActionLabel: 'Run',
  defaultUserPrompt: '',
  defaultToolGroups: [],
  sections: [
    {
      id: 'user:outline:summary',
      sourceId: 'summary',
      responseKey: 'summary',
      title: 'Summary',
      renderer: 'list',
      required: true,
    },
    {
      id: 'user:outline:cards',
      sourceId: 'cards',
      responseKey: 'cards',
      title: 'Cards',
      renderer: 'cards',
      required: false,
    },
  ],
} as AIChatRegisteredSkillDescriptor;

describe('AIWorkbenchResultNormalization', () => {
  it('normalizes concept-coach CDF anchors and tab diagnostics from flexible payloads', () => {
    const normalized = normalizeConceptCoachState({
      definition: 'Working definition',
      perspectives: {
        traits: ['stable', 'active'],
      },
      integratedSummary: {
        essence: 'Core essence',
      },
      cdf: {
        concepts: [{
          concept: 'Concept A',
          definitions: ['Definition A'],
          descriptors: [{
            dimension: 'Signals',
            points: ['Signal 1'],
          }],
        }],
      },
    }, '{"raw":true}');

    expect(normalized.result.workingDefinition).toBe('Working definition');
    expect(normalized.result.cdfStructure.anchors[0]).toMatchObject({
      conceptName: 'Concept A',
      selected: true,
    });
    expect(normalized.result.cdfStructure.anchors[0]?.definitionCandidates[0]?.text).toBe('Definition A');
    expect(normalized.result.cdfStructure.anchors[0]?.descriptorGroups[0]?.items[0]?.text).toBe('Signal 1');
    expect(normalized.diagnostics.perspectives?.status).toBe('partial');
    expect(normalized.diagnostics['integrated-understanding']?.missingSections).toEqual(['notWhat', 'capabilities']);
  });

  it('merges tab results without dropping existing concept-coach state', () => {
    const initial = normalizeConceptCoachState({
      workingDefinition: 'Old definition',
      integratedUnderstanding: {
        essence: 'Old essence',
        notWhat: ['Not B'],
        capabilities: ['Do A'],
      },
    }, 'raw').result;

    const merged = mergeTabResult(initial, 'cdf-structure', {
      anchors: ['Concept B'],
    }, 'raw-next');

    expect(merged.result.workingDefinition).toBe('Old definition');
    expect(merged.result.integratedUnderstanding.essence).toBe('Old essence');
    expect(tabResultFromConceptCoach(merged.result, 'cdf-structure')).toMatchObject({
      anchors: [{ conceptName: 'Concept B' }],
    });
    expect(deriveTabNormalizationDiagnostic('cdf-structure', merged.result.cdfStructure)).toBeNull();
  });

  it('normalizes generic structured skill sections and missing required diagnostics', () => {
    const normalized = normalizeGenericStructuredResult(structuredSkill, {
      summary: ['Point A', 'Point B'],
      cards: [{ question: 'Q1', answer: 'A1' }],
    }, 'raw');

    expect(normalized.diagnostic).toBeNull();
    expect(normalized.result.sections[0]?.items).toEqual(['Point A', 'Point B']);
    expect(normalized.result.sections[1]?.cards[0]).toMatchObject({
      question: 'Q1',
      answer: 'A1',
      selected: true,
    });
    expect(hasGenericSectionContent(normalized.result.sections[0]!)).toBe(true);

    const missing = normalizeGenericStructuredResult(structuredSkill, { cards: [] }, 'raw');
    expect(missing.diagnostic).toMatchObject({
      status: 'empty',
      missingSections: ['Summary'],
    });
  });

  it('keeps self-test card normalization available for service-side edits', () => {
    const cards = normalizeSelfTestCards({
      creationMode: 'list-item',
      cards: [{ prompt: 'P', answer: 'A' }],
    });

    expect(cards.creationMode).toBe('list-item');
    expect(cards.cards[0]).toMatchObject({
      prompt: 'P',
      answer: 'A',
      selected: true,
    });
  });
});
