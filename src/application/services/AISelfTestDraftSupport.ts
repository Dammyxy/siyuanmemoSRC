import type {
  AIConceptCoachCandidateCard,
  AIConceptCoachCardKind,
  AIConceptCoachSelfTestCreationMode,
  AIStoredConceptCoachSelfTestCreationMode,
} from '@/types/ai';

const PLUGIN_SELF_TEST_CREATION_MODES = new Set<AIConceptCoachSelfTestCreationMode>();

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeLineText(value: unknown): string {
  return normalizeString(value).replace(/\s*\r?\n\s*/g, ' ');
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeLineText(entry)).filter(Boolean);
  }
  const text = normalizeString(value);
  if (!text) {
    return [];
  }
  return text
    .split(/\r?\n+/)
    .map((entry) => normalizeLineText(entry))
    .filter(Boolean);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => normalizeLineText(value)).filter(Boolean)));
}

function normalizeStoredSelfTestCreationMode(
  value: unknown,
  fallback: AIStoredConceptCoachSelfTestCreationMode = 'list-item',
): AIStoredConceptCoachSelfTestCreationMode {
  return value === 'mark'
    || value === 'heading'
    || value === 'super-block'
    || value === 'multi-mark'
    || value === 'cdf-multiline'
    || value === 'list-item'
    ? value
    : fallback;
}

function normalizeModeDrafts(value: unknown): Partial<Record<AIStoredConceptCoachSelfTestCreationMode, string>> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([mode, draft]) => {
      const normalizedMode = normalizeStoredSelfTestCreationMode(mode, '' as AIStoredConceptCoachSelfTestCreationMode);
      const normalizedDraft = normalizeString(draft);
      if (!normalizedMode || !normalizedDraft) {
        return null;
      }
      return [normalizedMode, normalizedDraft] as const;
    })
    .filter((entry): entry is readonly [AIStoredConceptCoachSelfTestCreationMode, string] => Boolean(entry));
  return entries.length > 0
    ? Object.fromEntries(entries) as Partial<Record<AIStoredConceptCoachSelfTestCreationMode, string>>
    : undefined;
}

export function normalizeSelfTestCreationMode(
  value: unknown,
  fallback: AIConceptCoachSelfTestCreationMode = 'list-item',
): AIConceptCoachSelfTestCreationMode {
  return value === 'mark'
    || value === 'heading'
    || value === 'super-block'
    || value === 'list-item'
    ? value
    : fallback;
}

export function normalizeSelfTestCardKind(value: unknown): AIConceptCoachCardKind {
  switch (normalizeString(value)) {
    case '辨析':
    case '因果':
    case '应用':
    case '反例':
    case '触发':
    case '定义':
    case '边界':
      return normalizeString(value) as AIConceptCoachCardKind;
    default:
      return '其他';
  }
}

export function isPluginSelfTestCreationMode(mode: AIConceptCoachSelfTestCreationMode): boolean {
  return PLUGIN_SELF_TEST_CREATION_MODES.has(mode);
}

export function extractSelfTestClozeTargets(content: string): string[] {
  const targets = Array.from(String(content || '').matchAll(/==([\s\S]+?)==/g))
    .map((match) => normalizeLineText(match[1] || ''))
    .filter(Boolean);
  return uniqueStrings(targets);
}

export function buildLegacySelfTestDraftMarkdown(question: string, answer: string): string {
  return `* ${normalizeLineText(question)}\n\n  * ${normalizeLineText(answer)}`;
}

function summarizeDraftMarkdown(draftMarkdown: string, fallback = ''): string {
  const firstLine = String(draftMarkdown || '')
    .split(/\r?\n/)
    .map((line) => normalizeString(line))
    .find(Boolean) || '';
  const normalized = normalizeString(
    firstLine
      .replace(/^\{\{\{row\s+/, '')
      .replace(/^#+\s+/, '')
      .replace(/^[-*+]\s+/, '')
      .replace(/:::+$/, '')
      .replace(/;;;+$/, '')
      .replace(/==/g, '')
      .replace(/\}\}\}$/, ''),
  );
  return normalized || fallback || '未命名草稿';
}

function listItemsFromDraft(draftMarkdown: string): Array<{ indent: number; text: string }> {
  return String(draftMarkdown || '')
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^(\s*)[*+-]\s+(.*)$/);
      if (!match) {
        return null;
      }
      return {
        indent: Math.floor((match[1] || '').replace(/\t/g, '  ').length / 2),
        text: normalizeLineText(match[2] || ''),
      };
    })
    .filter((entry): entry is { indent: number; text: string } => Boolean(entry?.text));
}

function parseListItemDraft(draftMarkdown: string): Pick<AIConceptCoachCandidateCard, 'prompt' | 'answer' | 'details'> {
  const items = listItemsFromDraft(draftMarkdown);
  const prompt = items.find((item) => item.indent === 0)?.text || '';
  const childItems = items.filter((item) => item.indent > 0).map((item) => item.text);
  return {
    prompt,
    answer: childItems[0] || '',
    details: childItems.slice(1),
  };
}

function parseHeadingDraft(draftMarkdown: string): Pick<AIConceptCoachCandidateCard, 'prompt' | 'answer' | 'details'> {
  const lines = String(draftMarkdown || '')
    .split(/\r?\n/)
    .map((line) => normalizeString(line))
    .filter(Boolean);
  const promptLine = lines.find((line) => /^#+\s+/.test(line)) || '';
  const prompt = normalizeString(promptLine.replace(/^#+\s+/, ''));
  const body = lines.filter((line) => line !== promptLine);
  return {
    prompt,
    answer: body[0] || '',
    details: body.slice(1),
  };
}

function parseSuperBlockDraft(draftMarkdown: string): Pick<AIConceptCoachCandidateCard, 'prompt' | 'answer' | 'details'> {
  const normalized = String(draftMarkdown || '')
    .replace(/^\s*\{\{\{row\s*/, '')
    .replace(/\}\}\}\s*$/, '');
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => normalizeLineText(line))
    .filter(Boolean);
  return {
    prompt: lines[0] || '',
    answer: lines[1] || '',
    details: lines.slice(2),
  };
}

function parseMarkLikeDraft(draftMarkdown: string): Pick<AIConceptCoachCandidateCard, 'prompt' | 'answer' | 'details' | 'clozeTargets'> {
  const normalized = normalizeString(draftMarkdown);
  const clozeTargets = extractSelfTestClozeTargets(normalized);
  const prompt = normalizeString(normalized.replace(/==([\s\S]+?)==/g, '____'));
  const answer = clozeTargets[0] || '';
  return {
    prompt,
    answer,
    details: clozeTargets.slice(1),
    clozeTargets,
  };
}

function parseCdfDraft(draftMarkdown: string): Pick<AIConceptCoachCandidateCard, 'prompt' | 'answer' | 'details'> {
  const items = listItemsFromDraft(draftMarkdown);
  const parentWithMarker = items.find((item) => item.text.endsWith(':::') || item.text.endsWith(';;;')) || null;
  if (!parentWithMarker) {
    return parseListItemDraft(draftMarkdown);
  }
  const prompt = normalizeString(parentWithMarker.text.replace(/(:::+|;;;+)$/, ''));
  const body = items
    .filter((item) => item.indent > parentWithMarker.indent)
    .map((item) => item.text);
  return {
    prompt,
    answer: body[0] || '',
    details: body.slice(1),
  };
}

function parseDraftByMode(
  mode: AIStoredConceptCoachSelfTestCreationMode,
  draftMarkdown: string,
): Pick<AIConceptCoachCandidateCard, 'prompt' | 'answer' | 'details' | 'clozeTargets'> {
  switch (mode) {
    case 'heading':
      return {
        ...parseHeadingDraft(draftMarkdown),
        clozeTargets: extractSelfTestClozeTargets(draftMarkdown),
      };
    case 'super-block':
      return {
        ...parseSuperBlockDraft(draftMarkdown),
        clozeTargets: extractSelfTestClozeTargets(draftMarkdown),
      };
    case 'mark':
    case 'multi-mark':
      return parseMarkLikeDraft(draftMarkdown);
    case 'cdf-multiline':
      return {
        ...parseCdfDraft(draftMarkdown),
        clozeTargets: extractSelfTestClozeTargets(draftMarkdown),
      };
    case 'list-item':
    default:
      return {
        ...parseListItemDraft(draftMarkdown),
        clozeTargets: extractSelfTestClozeTargets(draftMarkdown),
      };
  }
}

function hasCardContent(card: Pick<AIConceptCoachCandidateCard, 'prompt' | 'answer' | 'details' | 'clozeTargets'>): boolean {
  return Boolean(
    normalizeString(card.prompt)
    || normalizeString(card.answer)
    || card.details.some((item) => normalizeString(item))
    || card.clozeTargets.some((item) => normalizeString(item))
  );
}

export function summarizeSelfTestCandidateCard(
  card: Pick<AIConceptCoachCandidateCard, 'summary' | 'prompt' | 'question' | 'answer' | 'clozeTargets'>,
): string {
  return normalizeString(card.summary)
    || normalizeString(card.prompt)
    || normalizeString(card.question)
    || normalizeString(card.answer)
    || normalizeString(card.clozeTargets[0])
    || '候选草稿';
}

export function normalizeSelfTestCandidateCard(
  value: unknown,
  index: number,
  fallbackMode: AIConceptCoachSelfTestCreationMode,
): AIConceptCoachCandidateCard | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const mode = normalizeStoredSelfTestCreationMode(raw.mode, fallbackMode);
  const draftMarkdown = normalizeString(raw.draftMarkdown ?? raw.content);
  const normalizedModeDrafts = normalizeModeDrafts(raw.modeDrafts);
  const explicitPrompt = normalizeLineText(raw.prompt ?? raw.question ?? raw.q ?? raw.front ?? raw.title ?? raw.legacyQuestion);
  const explicitAnswer = normalizeLineText(raw.answer ?? raw.a ?? raw.back ?? raw.legacyAnswer);
  const explicitDetails = normalizeStringList(raw.details);
  const explicitClozeTargets = normalizeStringList(raw.clozeTargets ?? raw.clozes);
  const parsed = draftMarkdown
    ? parseDraftByMode(mode, draftMarkdown)
    : { prompt: '', answer: '', details: [] as string[], clozeTargets: [] as string[] };
  const prompt = explicitPrompt || parsed.prompt;
  const answer = explicitAnswer || parsed.answer;
  const details = uniqueStrings(explicitDetails.length > 0 ? explicitDetails : parsed.details);
  const clozeTargets = uniqueStrings(explicitClozeTargets.length > 0 ? explicitClozeTargets : parsed.clozeTargets);
  const modeDrafts = {
    ...(normalizedModeDrafts || {}),
    ...((draftMarkdown && mode) ? { [mode]: draftMarkdown } : {}),
  } as Partial<Record<AIStoredConceptCoachSelfTestCreationMode, string>>;
  const nextCard: AIConceptCoachCandidateCard = {
    id: normalizeString(raw.id) || `ai-card-${index}`,
    kind: normalizeSelfTestCardKind(raw.kind),
    selected: raw.selected !== false,
    summary: normalizeString(raw.summary) || summarizeDraftMarkdown(draftMarkdown, prompt || answer),
    prompt,
    answer,
    details,
    clozeTargets,
    modeDrafts: Object.keys(modeDrafts).length > 0 ? modeDrafts : undefined,
    legacyQuestion: explicitPrompt || undefined,
    legacyAnswer: explicitAnswer || undefined,
    question: prompt || undefined,
    draftMarkdown: draftMarkdown || undefined,
    mode,
  };
  nextCard.summary = summarizeSelfTestCandidateCard(nextCard);
  return hasCardContent(nextCard) ? nextCard : null;
}

function buildListMarkdown(prompt: string, lines: string[]): string {
  if (lines.length === 0) {
    return `* ${normalizeLineText(prompt)}`;
  }
  return [
    `* ${normalizeLineText(prompt)}`,
    '',
    ...lines.map((line) => `  * ${normalizeLineText(line)}`),
  ].join('\n');
}

function buildHeadingMarkdown(prompt: string, lines: string[]): string {
  const body = lines.map((line, index) => (
    index === 0 ? normalizeLineText(line) : `- ${normalizeLineText(line)}`
  ));
  return [`## ${normalizeLineText(prompt)}`, '', ...body].filter(Boolean).join('\n');
}

function buildSuperBlockMarkdown(prompt: string, lines: string[]): string {
  return [`{{{row ${normalizeLineText(prompt)}`, ...lines.map((line) => normalizeLineText(line)), '}}}']
    .filter(Boolean)
    .join('\n');
}

function buildMarkLikeMarkdown(
  card: Pick<AIConceptCoachCandidateCard, 'prompt' | 'answer' | 'details' | 'clozeTargets'>,
): string {
  const prompt = normalizeString(card.prompt) || '请回忆关键内容';
  const targets = uniqueStrings([
    ...card.clozeTargets,
    normalizeLineText(card.answer),
  ]);
  const markedTargets = targets.length > 0 ? targets : ['待补充答案'];
  const primaryTarget = markedTargets[0] || '待补充答案';
  if (prompt.includes('____')) {
    const replaced = prompt.replace('____', `==${primaryTarget}==`);
    if (markedTargets.length === 1) {
      return replaced;
    }
    return `${replaced} 关键点：${markedTargets.slice(1).map((item) => `==${item}==`).join('；')}`;
  }
  return [`题干：${prompt}`, `答案：==${primaryTarget}==`].join(' ');
}

export function renderSelfTestCandidateDraftMarkdown(
  card: Pick<AIConceptCoachCandidateCard, 'prompt' | 'question' | 'answer' | 'details' | 'clozeTargets'>,
  mode: AIConceptCoachSelfTestCreationMode,
): string {
  const details = Array.isArray(card.details) ? card.details : [];
  const clozeTargets = Array.isArray(card.clozeTargets) ? card.clozeTargets : [];
  const prompt = normalizeString(card.prompt) || normalizeString(card.question) || summarizeSelfTestCandidateCard({
    summary: '',
    prompt: '',
    question: '',
    answer: card.answer,
    clozeTargets,
  });
  const lines = [normalizeString(card.answer), ...details.map((item) => normalizeString(item))].filter(Boolean);
  switch (mode) {
    case 'heading':
      return buildHeadingMarkdown(prompt, lines);
    case 'super-block':
      return buildSuperBlockMarkdown(prompt, lines);
    case 'mark':
      return buildMarkLikeMarkdown({ ...card, details, clozeTargets });
    case 'list-item':
    default:
      return buildListMarkdown(prompt, lines.length > 0 ? lines : ['待补充答案']);
  }
}

export function resolveSelfTestCandidateDraftMarkdown(
  card: Pick<AIConceptCoachCandidateCard, 'prompt' | 'question' | 'answer' | 'details' | 'clozeTargets' | 'modeDrafts'>,
  mode: AIConceptCoachSelfTestCreationMode,
  options?: { allowFallback?: boolean },
): string {
  const cachedDraft = normalizeString(card.modeDrafts?.[mode]);
  if (cachedDraft) {
    return cachedDraft;
  }
  if (isPluginSelfTestCreationMode(mode) && options?.allowFallback === false) {
    return '';
  }
  return renderSelfTestCandidateDraftMarkdown(card, mode);
}
