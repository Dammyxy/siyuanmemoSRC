import { resolveSelfTestCandidateDraftMarkdown } from '@/application/services/AISelfTestDraftSupport';
import type {
  AICdfAnchor,
  AICdfStructure,
  AIConceptCoachIntegratedUnderstanding,
  AIConceptCoachPerspectiveSection,
  AIConceptCoachPerspectives,
  AIConceptCoachRealWorldTriggers,
  AIConceptCoachSelfTestCards,
  AIConceptCoachSelfTestCreationMode,
  AIConceptCoachTabResult,
  AIWorkbenchAssistantResultMessage,
  AISkillTabId,
} from '@/types/ai';

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeListText(value: unknown): string {
  return normalizeString(value).replace(/\s*\r?\n\s*/g, ' ');
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => normalizeString(value)).filter(Boolean)));
}

function bulletLine(text: string, indent = 0): string {
  return `${'  '.repeat(indent)}* ${normalizeListText(text)}`;
}

function isPunctuationHeavy(text: string): boolean {
  return /[。！？；：,.!?;:]/.test(text);
}

function looksLikeLooseGroupLabel(text: string): boolean {
  const normalized = normalizeString(text);
  if (!normalized) {
    return false;
  }
  if (normalized.length > 12) {
    return false;
  }
  if (isPunctuationHeavy(normalized)) {
    return false;
  }
  return true;
}

type LooseMarkdownGroup = {
  title: string | null;
  items: string[];
};

function groupLoosePerspectiveItems(items: string[]): LooseMarkdownGroup[] {
  const normalizedItems = uniqueStrings(items);
  const groups: LooseMarkdownGroup[] = [];
  let index = 0;
  while (index < normalizedItems.length) {
    const current = normalizedItems[index]!;
    const next = normalizedItems[index + 1] || '';
    if (looksLikeLooseGroupLabel(current) && normalizeString(next)) {
      const childItems: string[] = [];
      let cursor = index + 1;
      while (cursor < normalizedItems.length && !looksLikeLooseGroupLabel(normalizedItems[cursor]!)) {
        childItems.push(normalizedItems[cursor]!);
        cursor += 1;
      }
      groups.push({
        title: current,
        items: childItems.length > 0 ? childItems : [current],
      });
      index = cursor;
      continue;
    }
    groups.push({
      title: null,
      items: [current],
    });
    index += 1;
  }
  return groups;
}

function linesFromMaybeGroupedItems(label: string, items: string[]): string[] {
  const groups = groupLoosePerspectiveItems(items);
  if (groups.some((group) => Boolean(group.title))) {
    return groups.flatMap((group) => {
      if (!group.title) {
        return group.items.map((item) => bulletLine(item));
      }
      return [
        bulletLine(group.title),
        ...group.items.map((item) => bulletLine(item, 1)),
      ];
    });
  }
  const normalizedItems = uniqueStrings(items);
  if (normalizedItems.length === 0) {
    return [];
  }
  return [
    bulletLine(label),
    ...normalizedItems.map((item) => bulletLine(item, 1)),
  ];
}

function linesFromFlatGroup(label: string, items: string[]): string[] {
  const normalizedItems = uniqueStrings(items);
  if (normalizedItems.length === 0) {
    return [];
  }
  return [
    bulletLine(label),
    ...normalizedItems.map((item) => bulletLine(item, 1)),
  ];
}

function linesFromComparisons(comparisons: AIConceptCoachPerspectiveSection['comparisons']): string[] {
  if (!comparisons || comparisons.length === 0) {
    return [];
  }
  return comparisons.flatMap((comparison) => {
    const title = normalizeString(comparison.concept) || '对比对象';
    const details = [
      normalizeString(comparison.similarity) ? `相似点：${normalizeListText(comparison.similarity)}` : '',
      normalizeString(comparison.difference) ? `差异点：${normalizeListText(comparison.difference)}` : '',
      normalizeString(comparison.clue) ? `识别线索：${normalizeListText(comparison.clue)}` : '',
    ].filter(Boolean);
    return [
      bulletLine(title),
      ...details.map((detail) => bulletLine(detail, 1)),
    ];
  });
}

function linesFromSingleItem(label: string, value: unknown): string[] {
  const normalized = normalizeString(value);
  if (!normalized) {
    return [];
  }
  return [
    bulletLine(label),
    bulletLine(normalized, 1),
  ];
}

export function formatConceptCoachPerspectiveSectionMarkdown(section: AIConceptCoachPerspectiveSection): string {
  const lines = [
    ...linesFromMaybeGroupedItems('要点', section.keyPoints),
    ...linesFromFlatGroup('易误判特性', section.easyMisjudgments || []),
    ...linesFromFlatGroup('具体例子', section.examples || []),
    ...linesFromComparisons(section.comparisons),
    ...linesFromFlatGroup('组成部分', section.subConcepts || []),
    ...linesFromFlatGroup('所属整体', section.parentConcepts || []),
    ...linesFromSingleItem('比喻理解', section.metaphor),
    ...linesFromFlatGroup('原因', section.reasons || []),
    ...linesFromFlatGroup('适用场景', section.applicableScenarios || []),
    ...linesFromFlatGroup('不适用场景', section.nonApplicableScenarios || []),
    ...linesFromSingleItem('常见误用', section.commonMisuse),
    ...linesFromSingleItem('意义', section.importance),
    ...linesFromSingleItem('行为改变', section.behaviorChange),
    ...linesFromSingleItem('触发场景', section.triggerScenario),
  ];
  return lines.join('\n').trim();
}

function nonEmptyPerspectiveSections(value: AIConceptCoachPerspectives): Array<{ title: string; markdown: string }> {
  const sections = [
    value.traits,
    value.contrasts,
    value.partsAndWhole,
    value.causality,
    value.significance,
  ];
  return sections
    .map((section) => ({
      title: normalizeString(section.title),
      markdown: formatConceptCoachPerspectiveSectionMarkdown(section),
    }))
    .filter((section) => Boolean(section.markdown));
}

function formatIntegratedUnderstandingMarkdown(value: AIConceptCoachIntegratedUnderstanding | null): string {
  if (!value) {
    return '';
  }
  const lines = [
    ...linesFromSingleItem('本质压缩', value.essence),
    ...linesFromFlatGroup('它不是什么', value.notWhat),
    ...linesFromFlatGroup('学会后能做到', value.capabilities),
  ];
  return lines.join('\n').trim();
}

function formatRealWorldTriggersMarkdown(value: AIConceptCoachRealWorldTriggers | null): string {
  if (!value) {
    return '';
  }
  return uniqueStrings(value.triggers || []).map((trigger) => bulletLine(trigger)).join('\n').trim();
}

function formatSelfTestCardsMarkdown(
  value: AIConceptCoachSelfTestCards | null,
  selfTestCreationMode: AIConceptCoachSelfTestCreationMode,
): string {
  if (!value) {
    return '';
  }
  return value.cards
    .filter((card) => card.selected !== false)
    .map((card) => normalizeString(resolveSelfTestCandidateDraftMarkdown(card, selfTestCreationMode, { allowFallback: true })))
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function formatCdfAnchorMarkdown(anchor: AICdfAnchor): string {
  if (anchor.selected === false) {
    return '';
  }
  const conceptName = normalizeString(anchor.conceptName);
  const selectedDefinitions = anchor.definitionCandidates
    .filter((definition) => definition.selected !== false)
    .map((definition) => normalizeListText(definition.text))
    .filter(Boolean);
  const selectedDescriptorGroups = anchor.descriptorGroups
    .filter((group) => group.selected !== false)
    .map((group) => ({
      title: normalizeString(group.title),
      items: group.items
        .filter((item) => item.selected !== false)
        .map((item) => normalizeListText(item.text))
        .filter(Boolean),
    }))
    .filter((group) => group.title && group.items.length > 0);

  const blocks: string[] = [];
  if (conceptName && selectedDefinitions.length > 0) {
    blocks.push([
      bulletLine(`${conceptName}:::`),
      ...selectedDefinitions.map((definition) => bulletLine(definition, 1)),
    ].join('\n'));
  }
  if (conceptName) {
    for (const group of selectedDescriptorGroups) {
      blocks.push([
        bulletLine(conceptName),
        bulletLine(`${group.title};;;`, 1),
        ...group.items.map((item) => bulletLine(item, 2)),
      ].join('\n'));
    }
  }
  return blocks.join('\n\n').trim();
}

function formatCdfStructureMarkdown(value: AICdfStructure | null): string {
  if (!value) {
    return '';
  }
  return value.anchors
    .map((anchor) => formatCdfAnchorMarkdown(anchor))
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function getConceptCoachTabResult(
  message: AIWorkbenchAssistantResultMessage,
): AIConceptCoachTabResult | null {
  if (message.tabResult) {
    return message.tabResult;
  }
  const result = message.conceptCoachResult;
  if (!result) {
    return null;
  }
  switch (message.tabId) {
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

export function getConceptCoachTabTitle(tabId: AISkillTabId): string {
  switch (tabId) {
    case 'working-definition':
      return '工作定义';
    case 'perspectives':
      return '多视角理解';
    case 'integrated-understanding':
      return '整合理解';
    case 'self-test-cards':
      return '自测卡片';
    case 'cdf-structure':
      return 'CDF 语义卡';
    case 'real-world-triggers':
      return '现实触发器';
    default:
      return normalizeString(tabId);
  }
}

export function formatConceptCoachTabMarkdown(
  tabId: AISkillTabId,
  value: AIConceptCoachTabResult | null,
  options?: { selfTestCreationMode?: AIConceptCoachSelfTestCreationMode },
): string {
  switch (tabId) {
    case 'working-definition':
      return normalizeString(value);
    case 'perspectives':
      return nonEmptyPerspectiveSections(value as AIConceptCoachPerspectives).map((section) => (
        `### ${section.title}\n\n${section.markdown}`
      )).join('\n\n').trim();
    case 'integrated-understanding':
      return formatIntegratedUnderstandingMarkdown(value as AIConceptCoachIntegratedUnderstanding | null);
    case 'self-test-cards':
      return formatSelfTestCardsMarkdown(
        value as AIConceptCoachSelfTestCards | null,
        options?.selfTestCreationMode || 'list-item',
      );
    case 'cdf-structure':
      return formatCdfStructureMarkdown(value as AICdfStructure | null);
    case 'real-world-triggers':
      return formatRealWorldTriggersMarkdown(value as AIConceptCoachRealWorldTriggers | null);
    default:
      return '';
  }
}

export function formatConceptCoachAssistantResultMarkdown(
  message: AIWorkbenchAssistantResultMessage,
  options?: { selfTestCreationMode?: AIConceptCoachSelfTestCreationMode },
): string {
  return formatConceptCoachTabMarkdown(
    message.tabId,
    getConceptCoachTabResult(message),
    options,
  );
}

export function buildAiWorkbenchSectionMarkdown(sectionTitle: string, bodyMarkdown: string, createdAt: number): string {
  const date = new Date(createdAt);
  const pad = (value: number) => String(value).padStart(2, '0');
  const timestamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return [
    `## AI 工作台 · ${sectionTitle} · ${timestamp}`,
    '',
    bodyMarkdown.trim(),
  ].join('\n').trim();
}
