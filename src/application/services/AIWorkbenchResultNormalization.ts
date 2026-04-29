import {
  normalizeSelfTestCandidateCard,
  normalizeSelfTestCreationMode,
} from '@/application/services/AISelfTestDraftSupport';
import type {
  AIChatRegisteredSkillDescriptor,
  AIResolvedSkillSectionDescriptor,
} from '@/application/services/AIChatSkillRegistry';
import type {
  AICdfAnchor,
  AICdfAnchorResolution,
  AICdfDefinitionCandidate,
  AICdfDescriptorGroup,
  AICdfDescriptorItem,
  AICdfStructure,
  AIChatNormalizationDiagnostic,
  AIConceptCoachCandidateCard,
  AIConceptCoachIntegratedUnderstanding,
  AIConceptCoachNormalizationDiagnostic,
  AIConceptCoachPerspectiveSection,
  AIConceptCoachPerspectives,
  AIConceptCoachRealWorldTriggers,
  AIConceptCoachResult,
  AIConceptCoachSelfTestCreationMode,
  AIConceptCoachSelfTestCards,
  AIConceptCoachTabResult,
  AIExplainResult,
  AISkillTabId,
  AIUserSkillStructuredCard,
  AIUserSkillStructuredKeyValue,
  AIUserSkillStructuredResult,
  AIUserSkillStructuredSectionResult,
} from '@/types/ai';

const EMPTY_CONTEXT_KEY = '__empty_context__';
const PERSPECTIVE_SECTION_META = {
  traits: {
    title: '特性和倾向',
    aliases: ['traits', 'trait', 'features', 'feature', 'characteristics', 'tendencies'],
  },
  contrasts: {
    title: '辨析异同',
    aliases: ['contrasts', 'contrast', 'compare', 'comparison', 'differences', 'difference', 'distinctions'],
  },
  partsAndWhole: {
    title: '部分和整体',
    aliases: ['partsAndWhole', 'partWhole', 'partsWhole', 'structure', 'composition'],
  },
  causality: {
    title: '因果关系',
    aliases: ['causality', 'causeEffect', 'causes', 'effects', 'mechanism'],
  },
  significance: {
    title: '意义和影响',
    aliases: ['significance', 'meaning', 'impact', 'importance', 'implication'],
  },
} as const satisfies Record<keyof AIConceptCoachPerspectives, { title: string; aliases: string[] }>;
const INTEGRATED_FIELD_LABELS = {
  essence: '本质压缩',
  notWhat: '它不是什么',
  capabilities: '学会后能做到',
} as const;

export type ConceptCoachNormalizationState = {
  result: AIConceptCoachResult;
  diagnostics: Partial<Record<AISkillTabId, AIConceptCoachNormalizationDiagnostic | null>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeString(entry)).filter(Boolean);
  }
  const text = normalizeString(value);
  return text ? [text] : [];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((entry) => normalizeString(entry)).filter(Boolean)));
}

function createEntryId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeAliasKey(value: string): string {
  return String(value || '').replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '').toLowerCase();
}

function readAliasedValue(raw: Record<string, unknown>, aliases: string[]): unknown {
  const normalizedAliases = new Set(aliases.map((alias) => normalizeAliasKey(alias)));
  for (const [key, value] of Object.entries(raw)) {
    if (normalizedAliases.has(normalizeAliasKey(key))) {
      return value;
    }
  }
  return undefined;
}

function collectStringLeaves(
  value: unknown,
  options?: { depth?: number; excludeKeys?: string[] },
): string[] {
  const depth = options?.depth ?? 0;
  if (depth > 3 || value === null || value === undefined) {
    return [];
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value).trim();
    return text ? [text] : [];
  }
  if (Array.isArray(value)) {
    return uniqueStrings(value.flatMap((entry) => collectStringLeaves(entry, { ...options, depth: depth + 1 })));
  }
  if (isRecord(value)) {
    const excluded = new Set((options?.excludeKeys || []).map((key) => normalizeAliasKey(key)));
    return uniqueStrings(Object.entries(value)
      .filter(([key]) => !excluded.has(normalizeAliasKey(key)))
      .flatMap(([, entry]) => collectStringLeaves(entry, { ...options, depth: depth + 1 })));
  }
  return [];
}

function normalizeFlexibleStringArray(value: unknown, excludeKeys: string[] = []): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(value.flatMap((entry) => collectStringLeaves(entry, { excludeKeys })));
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return normalizeStringArray(value);
  }
  if (isRecord(value)) {
    return collectStringLeaves(value, { excludeKeys });
  }
  return [];
}

function describeRawShape(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `array(${value.length})`;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).slice(0, 8);
    return `object:${keys.length ? keys.join(',') : '<empty>'}`;
  }
  if (typeof value === 'string') {
    return value.trim() ? 'string' : 'empty-string';
  }
  return typeof value;
}
function emptyPerspectiveSection(title: string): AIConceptCoachPerspectiveSection {
  return { title, keyPoints: [] };
}

function emptyPerspectives(): AIConceptCoachPerspectives {
  return {
    traits: emptyPerspectiveSection('特性和倾向'),
    contrasts: emptyPerspectiveSection('辨析异同'),
    partsAndWhole: emptyPerspectiveSection('部分和整体'),
    causality: emptyPerspectiveSection('因果关系'),
    significance: emptyPerspectiveSection('意义和影响'),
  };
}

export function normalizeContextKey(value: string | null | undefined): string {
  return normalizeString(value) || EMPTY_CONTEXT_KEY;
}

export function emptyCdfStructure(): AICdfStructure {
  return {
    anchors: [],
  };
}

function normalizeCdfDefinitionCandidate(value: unknown, index: number): AICdfDefinitionCandidate | null {
  if (!isRecord(value)) {
    const text = normalizeString(value);
    return text
      ? {
        id: createEntryId(`ai-cdf-def-${index}`),
        text,
        selected: true,
      }
      : null;
  }
  const text = normalizeString(readAliasedValue(value, ['text', 'definition', 'content', 'value']));
  if (!text) {
    return null;
  }
  return {
    id: normalizeString(value.id) || createEntryId(`ai-cdf-def-${index}`),
    text,
    selected: value.selected !== false,
  };
}

function normalizeCdfDescriptorItem(value: unknown, index: number): AICdfDescriptorItem | null {
  if (!isRecord(value)) {
    const text = normalizeString(value);
    return text
      ? {
        id: createEntryId(`ai-cdf-item-${index}`),
        text,
        selected: true,
      }
      : null;
  }
  const text = normalizeString(readAliasedValue(value, ['text', 'item', 'content', 'value']));
  if (!text) {
    return null;
  }
  return {
    id: normalizeString(value.id) || createEntryId(`ai-cdf-item-${index}`),
    text,
    selected: value.selected !== false,
  };
}

function normalizeCdfDescriptorGroup(value: unknown, index: number): AICdfDescriptorGroup | null {
  if (!isRecord(value)) {
    const title = normalizeString(value);
    return title
      ? {
        id: createEntryId(`ai-cdf-group-${index}`),
        title,
        selected: true,
        items: [],
      }
      : null;
  }
  const title = normalizeString(readAliasedValue(value, ['title', 'name', 'descriptor', 'dimension']));
  const itemsRaw = readAliasedValue(value, ['items', 'descriptors', 'entries', 'points']);
  const itemsSource = Array.isArray(itemsRaw) ? itemsRaw : normalizeFlexibleStringArray(itemsRaw);
  const items = itemsSource
    .map((item, itemIndex) => normalizeCdfDescriptorItem(item, itemIndex))
    .filter((item): item is AICdfDescriptorItem => Boolean(item));
  if (!title && items.length === 0) {
    return null;
  }
  return {
    id: normalizeString(value.id) || createEntryId(`ai-cdf-group-${index}`),
    title: title || `描述维度 ${index + 1}`,
    selected: value.selected !== false,
    items,
  };
}

function normalizeCdfAnchorResolution(value: unknown): AICdfAnchorResolution | null {
  if (!isRecord(value)) {
    return null;
  }
  const status = value.status === 'resolved-context'
    || value.status === 'resolved-notebook'
    || value.status === 'resolved-manual'
    || value.status === 'unresolved'
    ? value.status
    : null;
  if (!status) {
    return null;
  }
  return {
    status,
    conceptBlockId: normalizeString(value.conceptBlockId) || null,
    conceptTitle: normalizeString(value.conceptTitle),
    reason: normalizeString(value.reason) || null,
    notebookId: normalizeString(value.notebookId) || null,
  };
}

function normalizeCdfAnchor(value: unknown, index: number): AICdfAnchor | null {
  if (!isRecord(value)) {
    const conceptName = normalizeString(value);
    return conceptName
      ? {
        id: createEntryId(`ai-cdf-anchor-${index}`),
        conceptName,
        selected: true,
        definitionCandidates: [],
        descriptorGroups: [],
        resolution: null,
        warnings: [],
      }
      : null;
  }
  const conceptName = normalizeString(readAliasedValue(value, ['conceptName', 'concept', 'title', 'name']));
  const definitionsRaw = readAliasedValue(value, ['definitionCandidates', 'definitions', 'definition', 'workingDefinitions']);
  const definitionSource = Array.isArray(definitionsRaw) ? definitionsRaw : normalizeFlexibleStringArray(definitionsRaw);
  const descriptorGroupsRaw = readAliasedValue(value, ['descriptorGroups', 'descriptorGroup', 'groups', 'descriptors']);
  const groupSource = Array.isArray(descriptorGroupsRaw) ? descriptorGroupsRaw : [];
  const definitionCandidates = definitionSource
    .map((item, itemIndex) => normalizeCdfDefinitionCandidate(item, itemIndex))
    .filter((item): item is AICdfDefinitionCandidate => Boolean(item));
  const descriptorGroups = groupSource
    .map((group, groupIndex) => normalizeCdfDescriptorGroup(group, groupIndex))
    .filter((group): group is AICdfDescriptorGroup => Boolean(group));
  if (!conceptName && definitionCandidates.length === 0 && descriptorGroups.length === 0) {
    return null;
  }
  return {
    id: normalizeString(value.id) || createEntryId(`ai-cdf-anchor-${index}`),
    conceptName: conceptName || `概念 ${index + 1}`,
    selected: value.selected !== false,
    definitionCandidates,
    descriptorGroups,
    resolution: normalizeCdfAnchorResolution(value.resolution),
    warnings: normalizeStringArray(value.warnings),
  };
}

export function normalizeCdfStructure(value: unknown): AICdfStructure {
  const raw = isRecord(value) ? value : {};
  const anchorsSource = Array.isArray(readAliasedValue(raw, ['anchors', 'concepts', 'items']))
    ? readAliasedValue(raw, ['anchors', 'concepts', 'items']) as unknown[]
    : Array.isArray(value)
      ? value
      : [];
  return {
    anchors: anchorsSource
      .map((anchor, index) => normalizeCdfAnchor(anchor, index))
      .filter((anchor): anchor is AICdfAnchor => Boolean(anchor)),
  };
}

function hasCdfStructureContent(value: AICdfStructure | null): boolean {
  return Boolean(value && value.anchors.some((anchor) => (
    normalizeString(anchor.conceptName)
    || anchor.definitionCandidates.length > 0
    || anchor.descriptorGroups.some((group) => normalizeString(group.title) || group.items.length > 0)
  )));
}

function emptyConceptCoachResult(rawContent = ''): AIConceptCoachResult {
  return {
    workingDefinition: '',
    perspectives: emptyPerspectives(),
    integratedUnderstanding: { essence: '', notWhat: [], capabilities: [] },
    selfTestCards: { creationMode: 'list-item', cards: [] },
    cdfStructure: emptyCdfStructure(),
    realWorldTriggers: { triggers: [] },
    rawContent,
  };
}

function normalizePerspectiveComparisons(value: unknown): AIConceptCoachPerspectiveSection['comparisons'] {
  const entries = Array.isArray(value)
    ? value
    : isRecord(value)
      ? Object.values(value)
      : [];
  return entries.map((entry) => isRecord(entry) ? {
    concept: normalizeString(readAliasedValue(entry, ['concept', 'name', 'item'])),
    similarity: normalizeString(readAliasedValue(entry, ['similarity', 'same', 'shared'])),
    difference: normalizeString(readAliasedValue(entry, ['difference', 'different', 'contrast'])),
    clue: normalizeString(readAliasedValue(entry, ['clue', 'hint', 'signal'])),
  } : null).filter((entry): entry is { concept: string; similarity: string; difference: string; clue: string } => (
    Boolean(entry?.concept || entry?.similarity || entry?.difference || entry?.clue)
  ));
}

function hasPerspectiveSectionContent(section: AIConceptCoachPerspectiveSection): boolean {
  return (
    section.keyPoints.length > 0
    || (section.easyMisjudgments?.length || 0) > 0
    || (section.examples?.length || 0) > 0
    || (section.comparisons?.length || 0) > 0
    || (section.subConcepts?.length || 0) > 0
    || (section.parentConcepts?.length || 0) > 0
    || Boolean(section.metaphor)
    || (section.reasons?.length || 0) > 0
    || (section.applicableScenarios?.length || 0) > 0
    || (section.nonApplicableScenarios?.length || 0) > 0
    || Boolean(section.commonMisuse)
    || Boolean(section.importance)
    || Boolean(section.behaviorChange)
    || Boolean(section.triggerScenario)
  );
}

function normalizePerspectiveSection(value: unknown, title: string): AIConceptCoachPerspectiveSection {
  if (!isRecord(value)) {
    return {
      title,
      keyPoints: normalizeFlexibleStringArray(value),
    };
  }

  const raw = value;
  const knownFieldAliases = [
    'title',
    'label',
    'name',
    'keyPoints',
    'points',
    'features',
    'feature',
    'traits',
    'roles',
    'items',
    'bullets',
    'highlights',
    'summary',
    'easyMisjudgments',
    'misjudgments',
    'misunderstandings',
    'examples',
    'example',
    'comparisons',
    'comparison',
    'compare',
    'differences',
    'subConcepts',
    'parts',
    'components',
    'parentConcepts',
    'whole',
    'context',
    'metaphor',
    'reasons',
    'causes',
    'applicableScenarios',
    'applicable',
    'useCases',
    'applications',
    'nonApplicableScenarios',
    'nonApplicable',
    'limits',
    'commonMisuse',
    'misuse',
    'importance',
    'impact',
    'behaviorChange',
    'action',
    'triggerScenario',
    'trigger',
  ];

  const section: AIConceptCoachPerspectiveSection = {
    title: normalizeString(readAliasedValue(raw, ['title', 'label', 'name'])) || title,
    keyPoints: normalizeFlexibleStringArray(readAliasedValue(raw, ['keyPoints', 'points', 'features', 'feature', 'traits', 'roles', 'items', 'bullets', 'highlights', 'summary'])),
    easyMisjudgments: normalizeFlexibleStringArray(readAliasedValue(raw, ['easyMisjudgments', 'misjudgments', 'misunderstandings', 'commonErrors'])),
    examples: normalizeFlexibleStringArray(readAliasedValue(raw, ['examples', 'example', 'instances'])),
    comparisons: normalizePerspectiveComparisons(readAliasedValue(raw, ['comparisons', 'comparison', 'compare'])),
    subConcepts: normalizeFlexibleStringArray(readAliasedValue(raw, ['subConcepts', 'parts', 'components', 'elements'])),
    parentConcepts: normalizeFlexibleStringArray(readAliasedValue(raw, ['parentConcepts', 'whole', 'context', 'supersets'])),
    metaphor: normalizeString(readAliasedValue(raw, ['metaphor', 'analogy'])),
    reasons: normalizeFlexibleStringArray(readAliasedValue(raw, ['reasons', 'causes', 'why'])),
    applicableScenarios: normalizeFlexibleStringArray(readAliasedValue(raw, ['applicableScenarios', 'applicable', 'useCases', 'applications', 'scenarios'])),
    nonApplicableScenarios: normalizeFlexibleStringArray(readAliasedValue(raw, ['nonApplicableScenarios', 'nonApplicable', 'limits', 'nonExamples'])),
    commonMisuse: normalizeString(readAliasedValue(raw, ['commonMisuse', 'misuse', 'pitfall'])),
    importance: normalizeString(readAliasedValue(raw, ['importance', 'impact', 'meaning'])),
    behaviorChange: normalizeString(readAliasedValue(raw, ['behaviorChange', 'action', 'whatChanges', 'changes'])),
    triggerScenario: normalizeString(readAliasedValue(raw, ['triggerScenario', 'trigger', 'cue'])),
  };

  if (!hasPerspectiveSectionContent(section)) {
    section.keyPoints = collectStringLeaves(raw, { excludeKeys: knownFieldAliases });
  }

  return section;
}

function buildNormalizationDiagnostic(
  status: AIConceptCoachNormalizationDiagnostic['status'],
  missingSections: string[],
  rawShape: string,
): AIConceptCoachNormalizationDiagnostic | null {
  return status === 'full'
    ? null
    : {
      status,
      missingSections,
      rawShape,
    };
}

function normalizePerspectivesWithDiagnostic(value: unknown): {
  value: AIConceptCoachPerspectives;
  diagnostic: AIConceptCoachNormalizationDiagnostic | null;
} {
  const rawShape = describeRawShape(value);
  const container = isRecord(value)
    ? (isRecord(readAliasedValue(value, ['perspectives', 'perspective', 'multiPerspective', 'multiPerspectives']))
      ? readAliasedValue(value, ['perspectives', 'perspective', 'multiPerspective', 'multiPerspectives']) as Record<string, unknown>
      : value)
    : null;

  const hasRecognizedSection = container
    ? (Object.keys(PERSPECTIVE_SECTION_META) as Array<keyof AIConceptCoachPerspectives>)
      .some((sectionKey) => readAliasedValue(container, [sectionKey, ...PERSPECTIVE_SECTION_META[sectionKey].aliases]) !== undefined)
    : false;

  const perspectives = {
    traits: normalizePerspectiveSection(
      container
        ? readAliasedValue(container, ['traits', ...PERSPECTIVE_SECTION_META.traits.aliases]) ?? (!hasRecognizedSection ? container : undefined)
        : value,
      PERSPECTIVE_SECTION_META.traits.title,
    ),
    contrasts: normalizePerspectiveSection(
      container ? readAliasedValue(container, ['contrasts', ...PERSPECTIVE_SECTION_META.contrasts.aliases]) : undefined,
      PERSPECTIVE_SECTION_META.contrasts.title,
    ),
    partsAndWhole: normalizePerspectiveSection(
      container ? readAliasedValue(container, ['partsAndWhole', ...PERSPECTIVE_SECTION_META.partsAndWhole.aliases]) : undefined,
      PERSPECTIVE_SECTION_META.partsAndWhole.title,
    ),
    causality: normalizePerspectiveSection(
      container ? readAliasedValue(container, ['causality', ...PERSPECTIVE_SECTION_META.causality.aliases]) : undefined,
      PERSPECTIVE_SECTION_META.causality.title,
    ),
    significance: normalizePerspectiveSection(
      container ? readAliasedValue(container, ['significance', ...PERSPECTIVE_SECTION_META.significance.aliases]) : undefined,
      PERSPECTIVE_SECTION_META.significance.title,
    ),
  } satisfies AIConceptCoachPerspectives;

  const missingSections = (Object.keys(perspectives) as Array<keyof AIConceptCoachPerspectives>)
    .filter((sectionKey) => !hasPerspectiveSectionContent(perspectives[sectionKey]))
    .map((sectionKey) => sectionKey as string);
  const status = missingSections.length === 0
    ? 'full'
    : missingSections.length === 5
      ? 'empty'
      : 'partial';

  return {
    value: perspectives,
    diagnostic: buildNormalizationDiagnostic(status, missingSections, rawShape),
  };
}

export function normalizeSelfTestCards(
  value: unknown,
  fallbackMode: AIConceptCoachSelfTestCreationMode = 'list-item',
): AIConceptCoachSelfTestCards {
  const raw = isRecord(value) ? value : {};
  const cards = Array.isArray(readAliasedValue(raw, ['cards', 'candidateCards', 'items']))
    ? readAliasedValue(raw, ['cards', 'candidateCards', 'items']) as unknown[]
    : Array.isArray(value)
      ? value
      : [];
  const declaredMode = normalizeSelfTestCreationMode(readAliasedValue(raw, ['creationMode', 'mode']), fallbackMode);
  const normalizedCards = cards
    .map((entry, index) => normalizeSelfTestCandidateCard(entry, index, declaredMode))
    .filter((card): card is AIConceptCoachCandidateCard => Boolean(card));
  return {
    creationMode: declaredMode,
    cards: normalizedCards,
  };
}

function normalizeRealWorldTriggers(value: unknown): AIConceptCoachRealWorldTriggers {
  const raw = isRecord(value) ? value : {};
  return {
    triggers: normalizeFlexibleStringArray(readAliasedValue(raw, ['triggers', 'triggerScenarios', 'scenarios']) ?? value),
  };
}

function normalizeIntegratedUnderstandingWithDiagnostic(value: unknown): {
  value: AIConceptCoachIntegratedUnderstanding;
  diagnostic: AIConceptCoachNormalizationDiagnostic | null;
} {
  const rawShape = describeRawShape(value);
  if (!isRecord(value)) {
    const essence = normalizeString(value);
    const missingSections = essence ? ['notWhat', 'capabilities'] : ['essence', 'notWhat', 'capabilities'];
    return {
      value: {
        essence,
        notWhat: [],
        capabilities: [],
      },
      diagnostic: buildNormalizationDiagnostic(
        essence ? 'partial' : 'empty',
        missingSections,
        rawShape,
      ),
    };
  }

  const raw = isRecord(readAliasedValue(value, ['integratedUnderstanding', 'integrated', 'integratedSummary']))
    ? readAliasedValue(value, ['integratedUnderstanding', 'integrated', 'integratedSummary']) as Record<string, unknown>
    : value;
  const fallbackLeaves = collectStringLeaves(raw, {
    excludeKeys: ['essence', 'whatItIs', 'summary', 'gist', 'notWhat', 'not', 'notThis', 'capabilities', 'canDo', 'applications'],
  });
  const essence = normalizeString(readAliasedValue(raw, ['essence', 'whatItIs', 'summary', 'gist']))
    || fallbackLeaves[0]
    || '';
  const capabilities = normalizeFlexibleStringArray(readAliasedValue(raw, ['capabilities', 'canDo', 'applications', 'apply', 'skills']));
  const notWhat = normalizeFlexibleStringArray(readAliasedValue(raw, ['notWhat', 'not', 'notThis', 'isNot']));
  const missingSections = (Object.keys(INTEGRATED_FIELD_LABELS) as Array<keyof AIConceptCoachIntegratedUnderstanding>)
    .filter((key) => key === 'essence' ? !essence : (key === 'notWhat' ? notWhat.length === 0 : capabilities.length === 0))
    .map((key) => key as string);
  const status = missingSections.length === 0
    ? 'full'
    : missingSections.length === 3
      ? 'empty'
      : 'partial';

  return {
    value: {
      essence,
      notWhat,
      capabilities,
    },
    diagnostic: buildNormalizationDiagnostic(status, missingSections, rawShape),
  };
}

function normalizeWorkingDefinition(value: unknown): string {
  if (isRecord(value)) {
    return normalizeString(readAliasedValue(value, ['workingDefinition', 'workDefinition', 'definition', 'summary']));
  }
  return normalizeString(value);
}

function resolveTabPayload(raw: Record<string, unknown>, tabId: AISkillTabId, fallback: unknown): unknown {
  switch (tabId) {
    case 'working-definition':
      return readAliasedValue(raw, ['workingDefinition', 'workDefinition', 'definition']) ?? fallback;
    case 'perspectives':
      return readAliasedValue(raw, ['perspectives', 'perspective', 'multiPerspective', 'multiPerspectives']) ?? fallback;
    case 'integrated-understanding':
      return readAliasedValue(raw, ['integratedUnderstanding', 'integrated', 'integratedSummary']) ?? fallback;
    case 'self-test-cards':
      return readAliasedValue(raw, ['selfTestCards', 'candidateCards', 'cards']) ?? fallback;
    case 'cdf-structure':
      return readAliasedValue(raw, ['cdfStructure', 'cdf', 'conceptDescriptorFramework']) ?? fallback;
    case 'real-world-triggers':
      return readAliasedValue(raw, ['realWorldTriggers', 'triggers', 'triggerScenarios']) ?? fallback;
    default:
      return fallback;
  }
}

export function normalizeConceptCoachState(
  payload: unknown,
  rawContent: string,
  selfTestCreationMode: AIConceptCoachSelfTestCreationMode = 'list-item',
): ConceptCoachNormalizationState {
  const raw = isRecord(payload) ? payload : {};
  const perspectives = normalizePerspectivesWithDiagnostic(resolveTabPayload(raw, 'perspectives', raw.perspectives));
  const integratedUnderstanding = normalizeIntegratedUnderstandingWithDiagnostic(
    resolveTabPayload(raw, 'integrated-understanding', raw.integratedUnderstanding),
  );

  return {
    result: {
      workingDefinition: normalizeWorkingDefinition(resolveTabPayload(raw, 'working-definition', raw)),
      perspectives: perspectives.value,
      integratedUnderstanding: integratedUnderstanding.value,
      selfTestCards: normalizeSelfTestCards(
        resolveTabPayload(raw, 'self-test-cards', raw.selfTestCards),
        selfTestCreationMode,
      ),
      cdfStructure: normalizeCdfStructure(resolveTabPayload(raw, 'cdf-structure', raw.cdfStructure)),
      realWorldTriggers: normalizeRealWorldTriggers(resolveTabPayload(raw, 'real-world-triggers', raw.realWorldTriggers)),
      rawContent,
    },
    diagnostics: {
      perspectives: perspectives.diagnostic,
      'integrated-understanding': integratedUnderstanding.diagnostic,
    },
  };
}

export function normalizeConceptCoachResult(
  payload: unknown,
  rawContent: string,
  selfTestCreationMode: AIConceptCoachSelfTestCreationMode = 'list-item',
): AIConceptCoachResult {
  return normalizeConceptCoachState(payload, rawContent, selfTestCreationMode).result;
}

function stringifyGenericValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    return collectStringLeaves(value).join('\n');
  }
  if (isRecord(value)) {
    const summary = collectStringLeaves(value).join('\n');
    return summary || JSON.stringify(value, null, 2);
  }
  return '';
}

function normalizeGenericCards(value: unknown): AIUserSkillStructuredCard[] {
  const entries = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(readAliasedValue(value, ['cards', 'items', 'questions']))
      ? readAliasedValue(value, ['cards', 'items', 'questions']) as unknown[]
      : [];
  return entries.map((entry, index): AIUserSkillStructuredCard | null => {
    if (!isRecord(entry)) {
      const text = normalizeString(entry);
      return text ? {
        id: createEntryId(`ai-user-card-${index}`),
        question: text,
        answer: '',
        selected: true,
      } : null;
    }
    const question = normalizeString(readAliasedValue(entry, ['question', 'q', 'front', 'title']));
    const answer = normalizeString(readAliasedValue(entry, ['answer', 'a', 'back', 'body', 'content']));
    if (!question && !answer) {
      return null;
    }
    return {
      id: normalizeString(entry.id) || createEntryId(`ai-user-card-${index}`),
      question,
      answer,
      kind: normalizeString(entry.kind ?? entry.type) || undefined,
      selected: entry.selected !== false,
    };
  }).filter((card): card is AIUserSkillStructuredCard => Boolean(card));
}

function normalizeGenericKeyValues(value: unknown): AIUserSkillStructuredKeyValue[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index): AIUserSkillStructuredKeyValue[] => {
      if (isRecord(entry)) {
        const explicitKey = normalizeString(readAliasedValue(entry, ['key', 'name', 'title']));
        const explicitValue = stringifyGenericValue(readAliasedValue(entry, ['value', 'content', 'text']));
        if (explicitKey || explicitValue) {
          return [{ key: explicitKey || `Item ${index + 1}`, value: explicitValue }];
        }
        return Object.entries(entry)
          .map(([key, nestedValue]) => ({ key, value: stringifyGenericValue(nestedValue) }))
          .filter((item) => item.value);
      }
      const text = stringifyGenericValue(entry);
      return text ? [{ key: `Item ${index + 1}`, value: text }] : [];
    });
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, entry]) => ({ key, value: stringifyGenericValue(entry) }))
      .filter((item) => item.key && item.value);
  }
  const text = stringifyGenericValue(value);
  return text ? [{ key: '内容', value: text }] : [];
}

function normalizeGenericSectionResult(
  section: AIResolvedSkillSectionDescriptor,
  value: unknown,
): AIUserSkillStructuredSectionResult {
  const text = section.renderer === 'markdown'
    ? stringifyGenericValue(value)
    : '';
  const items = section.renderer === 'list'
    ? normalizeFlexibleStringArray(value)
    : [];
  const cards = section.renderer === 'cards'
    ? normalizeGenericCards(value)
    : [];
  const keyValues = section.renderer === 'keyValue'
    ? normalizeGenericKeyValues(value)
    : [];
  return {
    id: section.id,
    responseKey: section.responseKey,
    title: section.title,
    renderer: section.renderer,
    value,
    text,
    items,
    cards,
    keyValues,
  };
}

export function hasGenericSectionContent(section: AIUserSkillStructuredSectionResult): boolean {
  return Boolean(
    normalizeString(section.text)
    || section.items.length > 0
    || section.cards.length > 0
    || section.keyValues.length > 0,
  );
}

export function normalizeGenericStructuredResult(
  skill: AIChatRegisteredSkillDescriptor,
  payload: unknown,
  rawContent: string,
  onlyTabId?: AISkillTabId,
): {
  result: AIUserSkillStructuredResult;
  diagnostic: AIChatNormalizationDiagnostic | null;
} {
  const raw = isRecord(payload) ? payload : {};
  const sections = (skill.sections || [])
    .filter((section) => !onlyTabId || section.id === onlyTabId)
    .map((section) => normalizeGenericSectionResult(
      section,
      readAliasedValue(raw, [section.responseKey, section.sourceId, section.id, section.title]) ?? (onlyTabId ? payload : undefined),
    ));
  const requiredSections = (skill.sections || [])
    .filter((section) => section.required && (!onlyTabId || section.id === onlyTabId));
  const missingSections = requiredSections
    .filter((section) => !sections.some((result) => result.id === section.id && hasGenericSectionContent(result)))
    .map((section) => section.title || section.responseKey);
  const hasAnyContent = sections.some(hasGenericSectionContent);
  const status: AIChatNormalizationDiagnostic['status'] = !hasAnyContent
    ? 'empty'
    : missingSections.length > 0
      ? 'partial'
      : 'full';
  return {
    result: {
      skillId: skill.id,
      sections,
      rawContent,
    },
    diagnostic: status === 'full'
      ? null
      : {
        status,
        missingSections,
        rawShape: describeRawShape(payload),
        renderer: sections[0]?.renderer || 'markdown',
      },
  };
}

export function cloneConceptCoachResult(result: AIConceptCoachResult): AIConceptCoachResult {
  return JSON.parse(JSON.stringify(result)) as AIConceptCoachResult;
}

export function hasTabResultContent(tabId: AISkillTabId, value: AIConceptCoachTabResult | null): boolean {
  if (value === null) {
    return false;
  }
  switch (tabId) {
    case 'working-definition':
      return typeof value === 'string' && value.trim().length > 0;
    case 'perspectives':
      return (Object.values(value as AIConceptCoachPerspectives) as AIConceptCoachPerspectiveSection[])
        .some((section) => hasPerspectiveSectionContent(section));
    case 'integrated-understanding': {
      const result = value as AIConceptCoachIntegratedUnderstanding;
      return Boolean(result.essence || result.notWhat.length > 0 || result.capabilities.length > 0);
    }
    case 'self-test-cards':
      return ((value as AIConceptCoachSelfTestCards).cards || []).length > 0;
    case 'cdf-structure':
      return hasCdfStructureContent(value as AICdfStructure);
    case 'real-world-triggers':
      return ((value as AIConceptCoachRealWorldTriggers).triggers || []).length > 0;
    default:
      return false;
  }
}

export function normalizeNormalizationDiagnostic(value: unknown): AIConceptCoachNormalizationDiagnostic | null {
  if (!isRecord(value)) {
    return null;
  }
  const status = value.status === 'full' || value.status === 'partial' || value.status === 'empty'
    ? value.status
    : null;
  if (!status) {
    return null;
  }
  return {
    status,
    missingSections: Array.isArray(value.missingSections)
      ? value.missingSections.map((entry) => normalizeString(entry)).filter(Boolean)
      : [],
    rawShape: normalizeString(value.rawShape) || 'persisted-result',
  };
}

export function deriveTabNormalizationDiagnostic(
  tabId: AISkillTabId,
  value: AIConceptCoachTabResult | null,
  rawShape = 'persisted-result',
): AIConceptCoachNormalizationDiagnostic | null {
  switch (tabId) {
    case 'perspectives': {
      const perspectives = value as AIConceptCoachPerspectives | null;
      if (!perspectives) {
        return buildNormalizationDiagnostic('empty', Object.keys(PERSPECTIVE_SECTION_META), rawShape);
      }
      const missingSections = (Object.keys(perspectives) as Array<keyof AIConceptCoachPerspectives>)
        .filter((sectionKey) => !hasPerspectiveSectionContent(perspectives[sectionKey]))
        .map((sectionKey) => sectionKey as string);
      const status = missingSections.length === 0
        ? 'full'
        : missingSections.length === 5
          ? 'empty'
          : 'partial';
      return buildNormalizationDiagnostic(status, missingSections, rawShape);
    }
    case 'integrated-understanding': {
      const understanding = value as AIConceptCoachIntegratedUnderstanding | null;
      const missingSections = [
        !understanding?.essence ? 'essence' : '',
        !understanding || understanding.notWhat.length === 0 ? 'notWhat' : '',
        !understanding || understanding.capabilities.length === 0 ? 'capabilities' : '',
      ].filter(Boolean);
      const status = missingSections.length === 0
        ? 'full'
        : missingSections.length === 3
          ? 'empty'
          : 'partial';
      return buildNormalizationDiagnostic(status, missingSections, rawShape);
    }
    case 'cdf-structure': {
      const cdf = value as AICdfStructure | null;
      return buildNormalizationDiagnostic(
        hasCdfStructureContent(cdf) ? 'full' : 'empty',
        hasCdfStructureContent(cdf) ? [] : ['anchors'],
        rawShape,
      );
    }
    default:
      return null;
  }
}

export function tabResultFromConceptCoach(result: AIConceptCoachResult | null, tabId: AISkillTabId): AIConceptCoachTabResult | null {
  if (!result) {
    return null;
  }
  switch (tabId) {
    case 'working-definition':
      return result.workingDefinition;
    case 'perspectives':
      return result.perspectives;
    case 'integrated-understanding':
      return result.integratedUnderstanding;
    case 'self-test-cards':
      return result.selfTestCards;
    case 'cdf-structure':
      return result.cdfStructure;
    case 'real-world-triggers':
      return result.realWorldTriggers;
    default:
      return null;
  }
}

export function normalizeTabResultValue(
  tabId: AISkillTabId,
  value: unknown,
  conceptCoachResult: AIConceptCoachResult | null,
): AIConceptCoachTabResult | null {
  if (value === null || value === undefined) {
    return tabResultFromConceptCoach(conceptCoachResult, tabId);
  }
  switch (tabId) {
    case 'working-definition':
      return normalizeWorkingDefinition(value);
    case 'perspectives':
      return normalizePerspectivesWithDiagnostic(value).value;
    case 'integrated-understanding':
      return normalizeIntegratedUnderstandingWithDiagnostic(value).value;
    case 'self-test-cards':
      return normalizeSelfTestCards(value, conceptCoachResult?.selfTestCards.creationMode || 'list-item');
    case 'cdf-structure':
      return normalizeCdfStructure(value);
    case 'real-world-triggers':
      return normalizeRealWorldTriggers(value);
    default:
      return tabResultFromConceptCoach(conceptCoachResult, tabId);
  }
}

export function mergeTabResult(
  current: AIConceptCoachResult | null,
  tabId: AISkillTabId,
  payload: unknown,
  rawContent: string,
  selfTestCreationMode: AIConceptCoachSelfTestCreationMode = 'list-item',
): ConceptCoachNormalizationState {
  const next = current ? cloneConceptCoachResult(current) : emptyConceptCoachResult(rawContent);
  const raw = isRecord(payload) ? payload : {};
  const resolvedPayload = resolveTabPayload(raw, tabId, payload);
  const diagnostics: ConceptCoachNormalizationState['diagnostics'] = {};
  next.rawContent = rawContent;
  switch (tabId) {
    case 'working-definition':
      next.workingDefinition = normalizeWorkingDefinition(resolvedPayload);
      break;
    case 'perspectives': {
      const normalized = normalizePerspectivesWithDiagnostic(resolvedPayload);
      next.perspectives = normalized.value;
      diagnostics.perspectives = normalized.diagnostic;
      break;
    }
    case 'integrated-understanding': {
      const normalized = normalizeIntegratedUnderstandingWithDiagnostic(resolvedPayload);
      next.integratedUnderstanding = normalized.value;
      diagnostics['integrated-understanding'] = normalized.diagnostic;
      break;
    }
    case 'self-test-cards':
      next.selfTestCards = normalizeSelfTestCards(resolvedPayload, selfTestCreationMode);
      break;
    case 'cdf-structure':
      next.cdfStructure = normalizeCdfStructure(resolvedPayload);
      break;
    case 'real-world-triggers':
      next.realWorldTriggers = normalizeRealWorldTriggers(resolvedPayload);
      break;
  }
  return {
    result: next,
    diagnostics,
  };
}

export function explainResultFromConceptCoach(result: AIConceptCoachResult | null): AIExplainResult | null {
  if (!result) {
    return null;
  }
  return {
    workingDefinition: result.workingDefinition,
    whatItTests: result.integratedUnderstanding.essence,
    whyItsTricky: result.perspectives.contrasts.keyPoints.join('\n'),
    connections: [
      ...result.perspectives.partsAndWhole.keyPoints,
      ...result.integratedUnderstanding.capabilities,
    ].filter(Boolean),
    triggers: result.realWorldTriggers.triggers,
    cardIdeas: result.selfTestCards.cards.map((card) => (
      `${card.summary || card.prompt || card.question || '草稿'} -> ${card.answer || ''}`
    )),
    rawContent: result.rawContent,
  };
}

