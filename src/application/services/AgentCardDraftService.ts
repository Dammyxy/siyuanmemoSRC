import {
  buildAgentSuccessResult,
  buildAgentUnavailableResult,
  buildAgentValidationErrorResult,
  type AgentToolResult,
} from '@/application/agent/AgentToolContracts';
import type { AISiyuanPort } from '@/application/ports/AISiyuanPort';
import { LLMError, type LLMPort } from '@/application/ports/LLMPort';
import {
  normalizeAISettings,
  type AIProviderConfig,
  type AISettings,
} from '@/types/settings';

export const AGENT_CARD_DRAFT_DEFAULT_COUNT = 5;
export const AGENT_CARD_DRAFT_MAX_COUNT = 20;
export const AGENT_CARD_DRAFT_MAX_SOURCE_BLOCKS = 8;
export const AGENT_CARD_DRAFT_MAX_CHARS_PER_SOURCE = 4_000;
export const AGENT_CARD_DRAFT_MAX_TOTAL_SOURCE_CHARS = 12_000;
export const AGENT_CARD_DRAFT_SUPPORTED_TYPES = ['qa', 'cloze', 'concept', 'descriptor'] as const;

export type AgentCardDraftCandidateType = typeof AGENT_CARD_DRAFT_SUPPORTED_TYPES[number];

export interface AgentCardDraftSourceRef {
  blockId?: string;
  docId?: string;
  title?: string;
}

export interface AgentCardDraftSourcePacket {
  id: string;
  text: string;
  sourceRef: AgentCardDraftSourceRef;
  truncated: boolean;
}

export interface AgentCardDraftCandidate {
  draftId: string;
  type: AgentCardDraftCandidateType;
  front: string;
  back: string;
  sourceRefs: AgentCardDraftSourceRef[];
  validationWarnings: string[];
  persisted: false;
  rationale?: string;
  difficulty?: string;
  missingContext?: string;
  confidence?: number;
}

export interface AgentCardDraftResultData {
  candidates: AgentCardDraftCandidate[];
  sourceSummary: {
    sourceCount: number;
    totalChars: number;
    truncated: boolean;
    sourceRefs: AgentCardDraftSourceRef[];
  };
  supportedTypes: AgentCardDraftCandidateType[];
  defaultCount: number;
  maxCount: number;
  persisted: false;
  warnings: string[];
  checkedAt: number;
}

export interface AgentCardDraftServiceDeps {
  getAISettings: () => AISettings;
  llmPort?: LLMPort | null;
  siyuanPort?: Pick<AISiyuanPort, 'getBlockText'> | null;
  idFactory?: (seed: string, index: number) => string;
  now?: () => number;
}

type SourceResolutionResult =
  | { ok: true; sources: AgentCardDraftSourcePacket[]; warnings: string[] }
  | { ok: false; result: AgentToolResult };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeNumber(value: unknown): number | null {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? number : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.map(normalizeString).filter(Boolean)));
}

function normalizeCount(value: unknown): number | AgentToolResult {
  if (value === undefined || value === null || value === '') {
    return AGENT_CARD_DRAFT_DEFAULT_COUNT;
  }
  const count = normalizeNumber(value);
  if (count === null || count <= 0) {
    return buildAgentValidationErrorResult('memo_card draft count must be a positive number');
  }
  if (count > AGENT_CARD_DRAFT_MAX_COUNT) {
    return buildAgentValidationErrorResult(`memo_card draft count exceeds ${AGENT_CARD_DRAFT_MAX_COUNT}`);
  }
  return count;
}

function resolveDefaultProvider(settings: AISettings): AIProviderConfig {
  const matched = settings.providers.find((provider) => (
    provider.models.some((model) => model.id === settings.defaultModelId || model.id === settings.model)
  ));
  return matched || settings.providers[0];
}

function tryParseJson(candidate: string): { ok: true; value: unknown } | { ok: false } {
  const normalized = candidate.trim().replace(/^json\s*[\r\n]+/i, '');
  if (!normalized) {
    return { ok: false };
  }
  try {
    return { ok: true, value: JSON.parse(normalized) };
  } catch {
    return { ok: false };
  }
}

function extractJsonPayload(raw: string): unknown {
  const direct = raw.trim();
  if (!direct) {
    throw new Error('AI returned empty content');
  }
  const directParsed = tryParseJson(direct);
  if (directParsed.ok) {
    return directParsed.value;
  }
  for (const match of direct.matchAll(/```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/g)) {
    const parsed = tryParseJson(match[1] || '');
    if (parsed.ok) {
      return parsed.value;
    }
  }
  const objectStart = direct.indexOf('{');
  const objectEnd = direct.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    const parsed = tryParseJson(direct.slice(objectStart, objectEnd + 1));
    if (parsed.ok) {
      return parsed.value;
    }
  }
  throw new Error('AI response is not valid JSON');
}

function normalizeSourceRef(value: unknown): AgentCardDraftSourceRef {
  const source = isRecord(value) ? value : {};
  return {
    blockId: normalizeString(source.blockId) || undefined,
    docId: normalizeString(source.docId) || undefined,
    title: normalizeString(source.title) || undefined,
  };
}

function normalizeWarnings(value: unknown): string[] {
  return normalizeStringArray(value).slice(0, 8);
}

function normalizeCandidateType(value: unknown): AgentCardDraftCandidateType | null {
  const normalized = normalizeString(value) as AgentCardDraftCandidateType;
  return AGENT_CARD_DRAFT_SUPPORTED_TYPES.includes(normalized) ? normalized : null;
}

function firstSourceSeed(sources: AgentCardDraftSourcePacket[]): string {
  const first = sources[0];
  return first?.sourceRef.blockId || first?.sourceRef.docId || first?.id || 'agent-source';
}

function compactText(value: unknown, limit = 2_000): string {
  const text = normalizeString(value);
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function toSourceRefs(sources: AgentCardDraftSourcePacket[]): AgentCardDraftSourceRef[] {
  return sources.map((source) => source.sourceRef).filter((ref) => (
    Boolean(ref.blockId || ref.docId || ref.title)
  ));
}

function normalizeAICandidates(input: {
  payload: unknown;
  count: number;
  sources: AgentCardDraftSourcePacket[];
  idFactory: (seed: string, index: number) => string;
}): { candidates: AgentCardDraftCandidate[]; warnings: string[]; total: number } {
  const rawCandidates = Array.isArray(input.payload)
    ? input.payload
    : isRecord(input.payload) && Array.isArray(input.payload.candidates)
      ? input.payload.candidates
      : [];
  const warnings: string[] = [];
  if (rawCandidates.length === 0) {
    return { candidates: [], warnings: ['AI response did not include candidates[]'], total: 0 };
  }

  const sourceRefs = toSourceRefs(input.sources);
  const seed = firstSourceSeed(input.sources);
  const candidates: AgentCardDraftCandidate[] = [];

  for (const rawCandidate of rawCandidates) {
    if (!isRecord(rawCandidate)) {
      warnings.push('AI candidate omitted: candidate is not an object');
      continue;
    }
    const type = normalizeCandidateType(rawCandidate.type);
    if (!type) {
      warnings.push(`AI candidate omitted: unsupported type "${normalizeString(rawCandidate.type) || '<empty>'}"`);
      continue;
    }
    const front = compactText(rawCandidate.front);
    const back = compactText(rawCandidate.back);
    if (!front || !back) {
      warnings.push(`AI candidate omitted: ${type} candidate requires non-empty front and back`);
      continue;
    }
    const candidateRefs = Array.isArray(rawCandidate.sourceRefs)
      ? rawCandidate.sourceRefs.map(normalizeSourceRef).filter((ref) => ref.blockId || ref.docId || ref.title)
      : [];
    const confidence = Number(rawCandidate.confidence);
    candidates.push({
      draftId: normalizeString(rawCandidate.draftId) || input.idFactory(seed, candidates.length),
      type,
      front,
      back,
      sourceRefs: candidateRefs.length > 0 ? candidateRefs : sourceRefs,
      validationWarnings: normalizeWarnings(rawCandidate.validationWarnings),
      persisted: false,
      ...(normalizeString(rawCandidate.rationale) ? { rationale: compactText(rawCandidate.rationale, 600) } : {}),
      ...(normalizeString(rawCandidate.difficulty) ? { difficulty: compactText(rawCandidate.difficulty, 80) } : {}),
      ...(normalizeString(rawCandidate.missingContext) ? { missingContext: compactText(rawCandidate.missingContext, 300) } : {}),
      ...(Number.isFinite(confidence) ? { confidence: Math.max(0, Math.min(1, confidence)) } : {}),
    });
  }

  if (candidates.length > input.count) {
    warnings.push(`AI returned ${candidates.length} candidates; truncated to requested count ${input.count}`);
  }

  return {
    candidates: candidates.slice(0, input.count),
    warnings,
    total: candidates.length,
  };
}

export class AgentCardDraftService {
  constructor(private readonly deps: AgentCardDraftServiceDeps) {}

  async draft(args: Record<string, unknown>): Promise<AgentToolResult<AgentCardDraftResultData>> {
    const count = normalizeCount(args.count ?? args.limit);
    if (typeof count !== 'number') {
      return count;
    }

    const sourceResult = await this.resolveSources(args);
    if (!sourceResult.ok) {
      return sourceResult.result;
    }

    const settings = normalizeAISettings(this.deps.getAISettings());
    const availability = this.resolveAIAvailability(settings);
    if (!availability.ok) {
      return availability.result;
    }

    let payload: unknown;
    try {
      const response = await availability.llmPort.chat({
        baseUrl: availability.baseUrl,
        apiKey: availability.apiKey,
        model: availability.model,
        provider: availability.provider,
        protocol: availability.provider.protocol,
        modelRef: {
          providerId: availability.provider.id,
          modelId: availability.model,
        },
        timeoutMs: settings.timeoutMs,
        temperature: settings.temperature,
        responseFormat: 'json_object',
        messages: this.buildMessages({
          args,
          count,
          settings,
          sources: sourceResult.sources,
          warnings: sourceResult.warnings,
        }),
      });
      payload = extractJsonPayload(response.content);
    } catch (error) {
      if (error instanceof LLMError) {
        return buildAgentUnavailableResult('BACKEND_UNAVAILABLE', `AI draft runtime unavailable: ${error.message}`);
      }
      return buildAgentValidationErrorResult(
        `memo_card draft AI output invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const normalized = normalizeAICandidates({
      payload,
      count,
      sources: sourceResult.sources,
      idFactory: this.deps.idFactory ?? ((seed, index) => `draft-${seed}-${index}`),
    });
    if (normalized.candidates.length === 0) {
      return buildAgentValidationErrorResult(
        `memo_card draft produced no valid candidates: ${normalized.warnings.join('; ') || 'empty AI response'}`,
      );
    }

    const warnings = [...sourceResult.warnings, ...normalized.warnings];
    const sourceRefs = toSourceRefs(sourceResult.sources);
    const totalChars = sourceResult.sources.reduce((sum, source) => sum + source.text.length, 0);
    return buildAgentSuccessResult({
      candidates: normalized.candidates,
      sourceSummary: {
        sourceCount: sourceResult.sources.length,
        totalChars,
        truncated: sourceResult.sources.some((source) => source.truncated),
        sourceRefs,
      },
      supportedTypes: [...AGENT_CARD_DRAFT_SUPPORTED_TYPES],
      defaultCount: AGENT_CARD_DRAFT_DEFAULT_COUNT,
      maxCount: AGENT_CARD_DRAFT_MAX_COUNT,
      persisted: false,
      warnings,
      checkedAt: this.now(),
    }, {
      returnedItemCount: normalized.candidates.length,
      totalItemCount: normalized.total,
      followUpAction: 'memo_card action=save selectedDraftIds=[...] drafts=[...]',
      truncated: warnings.some((warning) => warning.includes('truncated')),
    });
  }

  private async resolveSources(args: Record<string, unknown>): Promise<SourceResolutionResult> {
    const explicitContent = normalizeString(args.sourceContent || args.content);
    if (explicitContent) {
      const sourceRef = this.sourceRefFromArgs(args);
      return {
        ok: true,
        sources: [this.boundSource({
          id: sourceRef.blockId || sourceRef.docId || 'explicit-source',
          text: explicitContent,
          sourceRef,
        })],
        warnings: explicitContent.length > AGENT_CARD_DRAFT_MAX_CHARS_PER_SOURCE
          ? [`source explicit-source truncated to ${AGENT_CARD_DRAFT_MAX_CHARS_PER_SOURCE} chars`]
          : [],
      };
    }

    const blockIds = this.resolveBlockIds(args);
    if (blockIds.length === 0) {
      return {
        ok: false,
        result: buildAgentValidationErrorResult('memo_card draft requires sourceContent, blockId, sourceBlockId, or editorContext selected/focused block ids'),
      };
    }
    if (!this.deps.siyuanPort?.getBlockText) {
      return {
        ok: false,
        result: buildAgentUnavailableResult('READ_MODEL_UNAVAILABLE', 'memo_card draft requires SiYuan block read owner for block sources'),
      };
    }

    const warnings: string[] = [];
    const boundedBlockIds = blockIds.slice(0, AGENT_CARD_DRAFT_MAX_SOURCE_BLOCKS);
    if (blockIds.length > boundedBlockIds.length) {
      warnings.push(`source block selection truncated to ${AGENT_CARD_DRAFT_MAX_SOURCE_BLOCKS} blocks`);
    }

    const sources: AgentCardDraftSourcePacket[] = [];
    for (const blockId of boundedBlockIds) {
      try {
        const text = normalizeString(await this.deps.siyuanPort.getBlockText(blockId));
        if (!text) {
          warnings.push(`source block ${blockId} returned empty text`);
          continue;
        }
        const source = this.boundSource({
          id: blockId,
          text,
          sourceRef: {
            ...this.sourceRefFromArgs(args),
            blockId,
          },
        });
        if (source.truncated) {
          warnings.push(`source block ${blockId} truncated to ${AGENT_CARD_DRAFT_MAX_CHARS_PER_SOURCE} chars`);
        }
        sources.push(source);
      } catch (error) {
        return {
          ok: false,
          result: buildAgentUnavailableResult(
            'READ_MODEL_UNAVAILABLE',
            `memo_card draft source block read failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
        };
      }
    }

    const boundedSources = this.boundTotalSources(sources, warnings);
    if (boundedSources.length === 0) {
      return {
        ok: false,
        result: buildAgentValidationErrorResult('memo_card draft found no usable source text'),
      };
    }

    return { ok: true, sources: boundedSources, warnings };
  }

  private resolveAIAvailability(settings: AISettings):
    | {
      ok: true;
      llmPort: LLMPort;
      provider: AIProviderConfig;
      baseUrl: string;
      apiKey: string;
      model: string;
    }
    | { ok: false; result: AgentToolResult } {
    const llmPort = this.deps.llmPort;
    if (!llmPort?.chat) {
      return {
        ok: false,
        result: buildAgentUnavailableResult('AGENT_API_UNAVAILABLE', 'AI draft runtime unavailable: LLMPort.chat missing'),
      };
    }
    if (!settings.enabled) {
      return {
        ok: false,
        result: buildAgentUnavailableResult('AGENT_API_UNAVAILABLE', 'AI draft runtime unavailable: AI settings disabled'),
      };
    }
    const provider = resolveDefaultProvider(settings);
    const baseUrl = normalizeString(provider?.baseUrl || settings.baseUrl);
    const apiKey = normalizeString(provider?.apiKey || settings.apiKey);
    const model = normalizeString(settings.defaultModelId || settings.model);
    if (!baseUrl || !apiKey || !model) {
      return {
        ok: false,
        result: buildAgentUnavailableResult('AGENT_API_UNAVAILABLE', 'AI draft runtime unavailable: baseUrl, apiKey, or model missing'),
      };
    }
    return { ok: true, llmPort, provider, baseUrl, apiKey, model };
  }

  private buildMessages(input: {
    args: Record<string, unknown>;
    count: number;
    settings: AISettings;
    sources: AgentCardDraftSourcePacket[];
    warnings: string[];
  }) {
    const requestedTypes = normalizeStringArray(input.args.types);
    const singleType = normalizeString(input.args.type);
    const types = (requestedTypes.length > 0 ? requestedTypes : [singleType])
      .map(normalizeCandidateType)
      .filter((type): type is AgentCardDraftCandidateType => type !== null);
    const targetTypes = types.length > 0 ? Array.from(new Set(types)) : [...AGENT_CARD_DRAFT_SUPPORTED_TYPES];
    return [
      {
        role: 'system' as const,
        content: [
          'You draft study cards for SiYuanMemo using RemNote-style learning quality.',
          'Return only JSON with shape: {"candidates":[{"type":"qa|cloze|concept|descriptor","front":"...","back":"...","validationWarnings":[],"rationale":"","difficulty":"","confidence":0.0}]}',
          'Use atomic prompts, test one idea per card, avoid trivia, preserve source meaning, and do not invent unsupported facts.',
          'Never claim cards are saved. Draft output is preview-only.',
        ].join('\n'),
      },
      {
        role: 'user' as const,
        content: JSON.stringify({
          language: input.settings.defaultOutputLanguage,
          count: input.count,
          targetTypes,
          sourceBounds: {
            maxSourceBlocks: AGENT_CARD_DRAFT_MAX_SOURCE_BLOCKS,
            maxCharsPerSource: AGENT_CARD_DRAFT_MAX_CHARS_PER_SOURCE,
            maxTotalSourceChars: AGENT_CARD_DRAFT_MAX_TOTAL_SOURCE_CHARS,
          },
          warnings: input.warnings,
          sources: input.sources.map((source) => ({
            id: source.id,
            text: source.text,
            sourceRef: source.sourceRef,
            truncated: source.truncated,
          })),
        }, null, 2),
      },
    ];
  }

  private sourceRefFromArgs(args: Record<string, unknown>): AgentCardDraftSourceRef {
    const editorContext = isRecord(args.editorContext) ? args.editorContext : {};
    return {
      blockId: normalizeString(args.sourceBlockId || args.blockId) || undefined,
      docId: normalizeString(args.sourceDocId || args.docId || editorContext.activeDocId || editorContext.docId || editorContext.rootId) || undefined,
      title: normalizeString(args.sourceTitle || args.title || editorContext.activeDocTitle || editorContext.docTitle || editorContext.title) || undefined,
    };
  }

  private resolveBlockIds(args: Record<string, unknown>): string[] {
    const editorContext = isRecord(args.editorContext) ? args.editorContext : {};
    return Array.from(new Set([
      normalizeString(args.sourceBlockId || args.blockId),
      normalizeString(editorContext.focusedBlockID || editorContext.focusedBlockId),
      ...normalizeStringArray(editorContext.selectedBlockIDs || editorContext.selectedBlockIds),
    ].filter(Boolean)));
  }

  private boundSource(input: {
    id: string;
    text: string;
    sourceRef: AgentCardDraftSourceRef;
  }): AgentCardDraftSourcePacket {
    const text = normalizeString(input.text);
    const truncated = text.length > AGENT_CARD_DRAFT_MAX_CHARS_PER_SOURCE;
    return {
      id: input.id,
      text: truncated ? text.slice(0, AGENT_CARD_DRAFT_MAX_CHARS_PER_SOURCE) : text,
      sourceRef: input.sourceRef,
      truncated,
    };
  }

  private boundTotalSources(
    sources: AgentCardDraftSourcePacket[],
    warnings: string[],
  ): AgentCardDraftSourcePacket[] {
    let remaining = AGENT_CARD_DRAFT_MAX_TOTAL_SOURCE_CHARS;
    const bounded: AgentCardDraftSourcePacket[] = [];
    for (const source of sources) {
      if (remaining <= 0) {
        warnings.push(`source ${source.id} omitted after total source char limit`);
        continue;
      }
      if (source.text.length <= remaining) {
        bounded.push(source);
        remaining -= source.text.length;
        continue;
      }
      bounded.push({
        ...source,
        text: source.text.slice(0, remaining),
        truncated: true,
      });
      warnings.push(`source ${source.id} truncated by total source char limit`);
      remaining = 0;
    }
    return bounded;
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }
}
