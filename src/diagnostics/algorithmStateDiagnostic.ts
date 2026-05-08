import * as fs from 'fs';
import * as path from 'path';
import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import { diagnosticsOutput, type DiagnosticsOutputPort } from './utils/output';

const ACTIVE_ALGORITHM_IDS = ['fsrs-v6', 'a-factor-v2'] as const;
type ActiveAlgorithmId = typeof ACTIVE_ALGORITHM_IDS[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_A_FACTOR = 2.5;
const MIN_A_FACTOR = 1.2;
const MAX_A_FACTOR = 6.0;
const MAX_A_FACTOR_HISTORY = 30;
const DEFAULT_DIFFICULTY = 5;
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 10;
const MIN_RELIABLE_HISTORICAL_INTERVAL_DAYS = 7;
const LOW_REVIEW_MEMORY_DAYS = 1;
const CARD_STATE_REVIEW = 2;
const CARD_STATE_RELEARNING = 3;
const PERSISTENT_META_SCHEDULING_KEYS = new Set([
    'nextDues',
    'stability',
    'difficulty',
    'aFactor',
    'a_factor',
    'scheduledDays',
    'scheduled_days',
]);

interface CardRow {
    id: string;
    payload_json: string;
    dto_json?: string | null;
}

interface StateRow {
    card_id: string;
    algorithm_id: string;
    state_json: string;
}

interface AlgorithmCardStateCommon {
    due: number;
    state: number;
    reps: number;
    lapses: number;
    lastReview: number;
    elapsedDays: number;
    scheduledDays: number;
    learning_step?: number;
}

interface AlgorithmCardStateJson {
    schemaVersion: 1;
    schedulerType: ActiveAlgorithmId;
    common: AlgorithmCardStateCommon;
    fsrs?: {
        stability: number;
        difficulty: number;
    };
    topic?: {
        aFactor: number;
        schedulerMeta?: Record<string, unknown>;
    };
}

interface DiagnosticCard {
    id: string;
    type?: string;
    schedulerType?: string;
    due?: unknown;
    state?: unknown;
    reps?: unknown;
    lapses?: unknown;
    lastReview?: unknown;
    elapsedDays?: unknown;
    scheduledDays?: unknown;
    learning_step?: unknown;
    stability?: unknown;
    difficulty?: unknown;
    aFactor?: unknown;
    schedulerMeta?: unknown;
    meta?: unknown;
    nextDues?: unknown;
    [key: string]: unknown;
}

export interface AlgorithmCardStateDiagnosticSummary {
    total: number;
    dirty: number;
    missingStateRows: number;
    invalidStateRows: number;
    cardStateMismatches: number;
    orphanStateRows: number;
    reasons: Record<string, number>;
}

export interface AlgorithmCardStateBackfillSimulationSummary extends AlgorithmCardStateDiagnosticSummary {
    backfilled: number;
    repaired: number;
    afterDirty: number;
}

export interface AlgorithmStateDiagnosticResult {
    dbPath: string;
    byteLength: number;
    readonly: true;
    source: 'sqlite-file';
    diagnostic: AlgorithmCardStateDiagnosticSummary;
    simulatedBackfill: AlgorithmCardStateBackfillSimulationSummary;
    clean: boolean;
}

export async function runAlgorithmStateDiagnosticCommand(options: {
    dbPath?: string;
    output?: DiagnosticsOutputPort;
}): Promise<AlgorithmStateDiagnosticResult> {
    const output = options.output ?? diagnosticsOutput;
    if (!options.dbPath) {
        throw new Error('Missing required --db <path> argument');
    }

    const dbPath = path.resolve(options.dbPath);
    const bytes = fs.readFileSync(dbPath);
    const SQL = await initSqlJs({
        locateFile: file => path.resolve(process.cwd(), 'node_modules/sql.js/dist', file),
    });
    const database = new SQL.Database(bytes);
    try {
        const diagnostic = getAlgorithmCardStateDiagnostic(database);
        const simulatedBackfill = simulateAlgorithmCardStateBackfill(database, diagnostic);
        const clean = diagnostic.dirty === 0
            && diagnostic.orphanStateRows === 0
            && simulatedBackfill.afterDirty === 0
            && simulatedBackfill.orphanStateRows === 0;
        const result: AlgorithmStateDiagnosticResult = {
            dbPath,
            byteLength: bytes.byteLength,
            readonly: true,
            source: 'sqlite-file',
            diagnostic,
            simulatedBackfill,
            clean,
        };
        output.printJson(result);
        return result;
    } finally {
        database.close();
    }
}

function getAlgorithmCardStateDiagnostic(database: Database): AlgorithmCardStateDiagnosticSummary {
    const rows = getAll<CardRow>(database, 'SELECT id, payload_json, dto_json FROM cards ORDER BY id');
    const stateRows = loadAlgorithmStateRowMap(database, rows.map(row => row.id));
    const summary: AlgorithmCardStateDiagnosticSummary = {
        total: 0,
        dirty: 0,
        missingStateRows: 0,
        invalidStateRows: 0,
        cardStateMismatches: 0,
        orphanStateRows: countOrphanActiveAlgorithmRows(database),
        reasons: {},
    };

    for (const row of rows) {
        const baseCard = parseBaseCardRow(row);
        if (!baseCard?.id) {
            continue;
        }
        summary.total += 1;
        let dirtyCard = false;

        const rawCard = parseJson<DiagnosticCard | null>(row.payload_json, null);
        if (rawCard?.id) {
            const cleanResult = canonicalizeSchedulingState(rawCard);
            if (cleanResult.changed) {
                dirtyCard = true;
                for (const reason of cleanResult.reasons) {
                    addReason(summary, reason);
                }
            }
        }

        const diagnostic = diagnoseAlgorithmCardStateRow(baseCard, getStateRowForCard(baseCard, stateRows));
        if (diagnostic.missing) {
            summary.missingStateRows += 1;
            dirtyCard = true;
        }
        if (diagnostic.invalid) {
            summary.invalidStateRows += 1;
            dirtyCard = true;
        }
        if (diagnostic.mismatch) {
            summary.cardStateMismatches += 1;
            dirtyCard = true;
        }
        for (const reason of diagnostic.reasons) {
            addReason(summary, reason);
        }
        if (dirtyCard) {
            summary.dirty += 1;
        }
    }

    return summary;
}

function simulateAlgorithmCardStateBackfill(
    database: Database,
    before: AlgorithmCardStateDiagnosticSummary,
): AlgorithmCardStateBackfillSimulationSummary {
    const rows = getAll<CardRow>(database, 'SELECT id, payload_json, dto_json FROM cards ORDER BY id');
    const stateRows = loadAlgorithmStateRowMap(database, rows.map(row => row.id));
    const now = Date.now();

    database.run('BEGIN');
    try {
        for (const row of rows) {
            const baseCard = parseBaseCardRow(row);
            if (!baseCard?.id) {
                continue;
            }
            const hydrated = applyAlgorithmCardState(baseCard, getStateRowForCard(baseCard, stateRows)).card;
            const derived = deriveAlgorithmCardState(hydrated);
            database.run(
                `UPDATE cards
                 SET payload_json = ?,
                     scheduler_type = ?,
                     due = ?,
                     state = ?,
                     updated_at = ?
                 WHERE id = ?`,
                [
                    JSON.stringify(derived.card),
                    derived.algorithmId,
                    numberOr(derived.card.due, 0),
                    numberOr(derived.card.state, 0),
                    now,
                    derived.card.id,
                ],
            );
            database.run(
                `INSERT OR REPLACE INTO algorithm_card_state
                   (card_id, algorithm_id, state_json, updated_at)
                 VALUES (?, ?, ?, ?)`,
                [derived.card.id, derived.algorithmId, JSON.stringify(derived.state), now],
            );
        }
        database.run(
            `DELETE FROM algorithm_card_state
             WHERE algorithm_id IN (?, ?)
               AND card_id NOT IN (SELECT id FROM cards)`,
            [...ACTIVE_ALGORITHM_IDS],
        );
        database.run('COMMIT');
    } catch (error) {
        database.run('ROLLBACK');
        throw error;
    }

    const after = getAlgorithmCardStateDiagnostic(database);
    return {
        ...after,
        backfilled: before.missingStateRows,
        repaired: before.dirty,
        afterDirty: after.dirty,
    };
}

function diagnoseAlgorithmCardStateRow(card: DiagnosticCard, row?: StateRow | null): {
    missing: boolean;
    invalid: boolean;
    mismatch: boolean;
    reasons: string[];
} {
    const derived = deriveAlgorithmCardState(card);
    if (!row) {
        return {
            missing: true,
            invalid: false,
            mismatch: false,
            reasons: ['algorithmState.missing'],
        };
    }

    const parsed = parseAlgorithmCardState(row.state_json, derived.algorithmId);
    if (!parsed.ok) {
        return {
            missing: false,
            invalid: true,
            mismatch: false,
            reasons: parsed.reasons,
        };
    }

    const applied = applyAlgorithmCardState(card, row);
    const rowState = deriveAlgorithmCardState(applied.card);
    return {
        missing: false,
        invalid: applied.invalidStateRow,
        mismatch: !sameJson(derived.state, rowState.state),
        reasons: applied.reasons,
    };
}

function applyAlgorithmCardState(card: DiagnosticCard, row?: StateRow | null): {
    card: DiagnosticCard;
    invalidStateRow: boolean;
    reasons: string[];
} {
    const derived = deriveAlgorithmCardState(card);
    if (!row) {
        return {
            card: derived.card,
            invalidStateRow: false,
            reasons: ['algorithmState.missing'],
        };
    }

    const parsed = parseAlgorithmCardState(row.state_json, derived.algorithmId);
    if (!parsed.ok) {
        return {
            card: derived.card,
            invalidStateRow: true,
            reasons: parsed.reasons,
        };
    }

    const overlaid = overlayState(card, parsed.state);
    const cleanResult = canonicalizeSchedulingState(overlaid);
    const normalizedFromRow = deriveAlgorithmCardState(cleanResult.card);
    const rowRepaired = !sameJson(normalizedFromRow.state, parsed.state);

    return {
        card: cleanResult.card,
        invalidStateRow: rowRepaired,
        reasons: rowRepaired
            ? Array.from(new Set(['algorithmState.repaired', ...cleanResult.reasons, ...normalizedFromRow.reasons]))
            : [],
    };
}

function deriveAlgorithmCardState(card: DiagnosticCard): {
    card: DiagnosticCard;
    algorithmId: ActiveAlgorithmId;
    state: AlgorithmCardStateJson;
} {
    let clean = canonicalizeSchedulingState(card).card;
    const activeAlgorithmId = resolveActiveAlgorithmId(clean);
    if (clean.schedulerType !== activeAlgorithmId) {
        clean = canonicalizeSchedulingState({ ...clean, schedulerType: activeAlgorithmId }).card;
    }

    const common: AlgorithmCardStateCommon = {
        due: numberOr(clean.due, 0),
        state: numberOr(clean.state, 0),
        reps: numberOr(clean.reps, 0),
        lapses: numberOr(clean.lapses, 0),
        lastReview: numberOr(clean.lastReview, 0),
        elapsedDays: numberOr(clean.elapsedDays, 0),
        scheduledDays: numberOr(clean.scheduledDays, 0),
    };
    if (isFiniteNumber(clean.learning_step)) {
        common.learning_step = clean.learning_step;
    }

    const state: AlgorithmCardStateJson = {
        schemaVersion: 1,
        schedulerType: activeAlgorithmId,
        common,
    };
    if (activeAlgorithmId === 'a-factor-v2') {
        state.topic = {
            aFactor: numberOr(clean.aFactor, DEFAULT_A_FACTOR),
            schedulerMeta: isObjectRecord(clean.schedulerMeta) && isObjectRecord(clean.schedulerMeta.topic)
                ? { topic: clean.schedulerMeta.topic }
                : undefined,
        };
    } else {
        state.fsrs = {
            stability: numberOr(clean.stability, 1),
            difficulty: numberOr(clean.difficulty, 5),
        };
    }

    return { card: clean, algorithmId: activeAlgorithmId, state };
}

function canonicalizeSchedulingState(value: DiagnosticCard): {
    card: DiagnosticCard;
    changed: boolean;
    reasons: string[];
} {
    let card: DiagnosticCard = { ...value };
    const reasons: string[] = [];

    if (Object.prototype.hasOwnProperty.call(card, 'nextDues')) {
        delete card.nextDues;
        reasons.push('nextDues');
    }

    const metaResult = cleanPersistentMeta(card.meta);
    if (metaResult.changed) {
        if (metaResult.meta && Object.keys(metaResult.meta).length > 0) {
            card.meta = metaResult.meta;
        } else {
            delete card.meta;
        }
        reasons.push(...metaResult.reasons);
    }

    const schedulerType = resolveCanonicalSchedulerType(card);
    if (card.schedulerType !== schedulerType) {
        card.schedulerType = schedulerType;
        reasons.push('schedulerType');
    }

    if (schedulerType === 'a-factor-v2') {
        card = canonicalizeTopicScheduling(card, reasons);
    } else {
        card = canonicalizeFsrsScheduling(card, reasons);
    }

    const uniqueReasons = Array.from(new Set(reasons));
    return {
        card,
        changed: uniqueReasons.length > 0,
        reasons: uniqueReasons,
    };
}

function canonicalizeFsrsScheduling(card: DiagnosticCard, reasons: string[]): DiagnosticCard {
    if (card.aFactor !== undefined) {
        delete card.aFactor;
        reasons.push('aFactor');
    }
    if (card.schedulerMeta !== undefined) {
        delete card.schedulerMeta;
        reasons.push('schedulerMeta');
    }

    const repaired = repairFsrsReviewState(card);
    if (!repaired.repaired) {
        return card;
    }
    reasons.push(...repaired.reasons);
    return repaired.card;
}

function canonicalizeTopicScheduling(card: DiagnosticCard, reasons: string[]): DiagnosticCard {
    const currentMeta = isObjectRecord(card.schedulerMeta) ? card.schedulerMeta : undefined;
    const currentTopicMeta = isObjectRecord(currentMeta?.topic) ? currentMeta.topic : undefined;
    const aFactor = clampAFactor(
        readFiniteNumber(card.aFactor)
        ?? readFiniteNumber(currentTopicMeta?.of)
        ?? DEFAULT_A_FACTOR,
    );
    const topicMeta = {
        afs: normalizeAfs(currentTopicMeta?.afs, aFactor),
        of: aFactor,
        optimalInterval: normalizePositiveInteger(
            currentTopicMeta?.optimalInterval,
            normalizePositiveInteger(card.scheduledDays, 1),
        ),
    };
    const schedulerMeta = { topic: topicMeta };

    if (card.aFactor !== aFactor) {
        card.aFactor = aFactor;
        reasons.push('aFactor');
    }
    if (!sameJson(card.schedulerMeta, schedulerMeta)) {
        card.schedulerMeta = schedulerMeta;
        reasons.push('schedulerMeta');
    }

    return card;
}

function repairFsrsReviewState(card: DiagnosticCard): {
    card: DiagnosticCard;
    repaired: boolean;
    reasons: string[];
} {
    if (!isReviewLikeState(card.state)) {
        return { card, repaired: false, reasons: [] };
    }

    const now = Date.now();
    const reasons: string[] = [];
    const repairedCard: DiagnosticCard = { ...card };

    const originalDue = toPositiveTimestamp(repairedCard.due, 0);
    let due = originalDue > 0 ? originalDue : now;
    if (due !== repairedCard.due) {
        reasons.push('due');
    }

    let lastReview = toPositiveTimestamp(repairedCard.lastReview, 0);
    if (lastReview !== repairedCard.lastReview) {
        reasons.push('lastReview');
    }

    let elapsedDays = toNonNegativeInteger(repairedCard.elapsedDays, 0);
    if (elapsedDays !== repairedCard.elapsedDays) {
        reasons.push('elapsedDays');
    }

    let scheduledDays = toNonNegativeInteger(repairedCard.scheduledDays, 0);
    if (scheduledDays !== repairedCard.scheduledDays) {
        reasons.push('scheduledDays');
    }

    const intervalDays = deriveIntervalDays(originalDue, lastReview);
    const historicalIntervalDays = Math.max(scheduledDays, intervalDays);
    const hasReliableHistoricalInterval = historicalIntervalDays >= MIN_RELIABLE_HISTORICAL_INTERVAL_DAYS;
    const derivedDays = Math.max(1, historicalIntervalDays);

    const rawStability = Number(repairedCard.stability);
    const hadInvalidStability = !Number.isFinite(rawStability) || rawStability <= 0;
    const hasImplausiblyLowStability =
        hasReliableHistoricalInterval && Number.isFinite(rawStability) && rawStability <= LOW_REVIEW_MEMORY_DAYS;
    let stability = toFiniteNumber(repairedCard.stability, 0);
    if (hadInvalidStability || hasImplausiblyLowStability) {
        stability = derivedDays;
        reasons.push('stability');
    }

    const hasImplausiblyLowScheduledDays =
        hasReliableHistoricalInterval && scheduledDays <= LOW_REVIEW_MEMORY_DAYS;
    if (
        (scheduledDays <= 0 || hasImplausiblyLowScheduledDays)
        && (card.state === CARD_STATE_REVIEW || hadInvalidStability || intervalDays > 0)
    ) {
        scheduledDays = Math.max(1, intervalDays, Math.ceil(stability));
        reasons.push('scheduledDays');
    }

    if (lastReview <= 0 && (card.state === CARD_STATE_REVIEW || hadInvalidStability)) {
        lastReview = Math.max(0, due - scheduledDays * DAY_MS);
        reasons.push('lastReview');
    }

    if (due <= 0) {
        due = now + scheduledDays * DAY_MS;
        reasons.push('due');
    }

    if (lastReview > 0) {
        const actualElapsedDays = Math.max(0, Math.floor((now - lastReview) / DAY_MS));
        if (elapsedDays !== actualElapsedDays) {
            elapsedDays = actualElapsedDays;
            reasons.push('elapsedDays');
        }
    }

    const difficulty = clampDifficulty(repairedCard.difficulty);
    if (difficulty !== repairedCard.difficulty) {
        reasons.push('difficulty');
    }

    const uniqueReasons = Array.from(new Set(reasons));
    if (uniqueReasons.length === 0) {
        return { card, repaired: false, reasons: [] };
    }

    return {
        card: {
            ...repairedCard,
            due,
            stability,
            difficulty,
            lastReview,
            elapsedDays,
            scheduledDays,
        },
        repaired: true,
        reasons: uniqueReasons,
    };
}

function parseAlgorithmCardState(
    stateJson: string,
    expectedAlgorithmId: ActiveAlgorithmId,
): { ok: true; state: AlgorithmCardStateJson } | { ok: false; reasons: string[] } {
    let value: unknown;
    try {
        value = JSON.parse(stateJson);
    } catch {
        return { ok: false, reasons: ['algorithmState.invalidJson'] };
    }

    if (!isObjectRecord(value)) {
        return { ok: false, reasons: ['algorithmState.invalidShape'] };
    }
    if (value.schemaVersion !== 1) {
        return { ok: false, reasons: ['algorithmState.schemaVersion'] };
    }
    if (!isActiveAlgorithmId(value.schedulerType)) {
        return { ok: false, reasons: ['algorithmState.schedulerType'] };
    }
    if (value.schedulerType !== expectedAlgorithmId) {
        return { ok: false, reasons: ['algorithmState.algorithmMismatch'] };
    }
    if (!isObjectRecord(value.common)) {
        return { ok: false, reasons: ['algorithmState.common'] };
    }
    const common = readCommon(value.common);
    if (!common) {
        return { ok: false, reasons: ['algorithmState.common'] };
    }

    if (value.schedulerType === 'fsrs-v6') {
        if (!isObjectRecord(value.fsrs)) {
            return { ok: false, reasons: ['algorithmState.fsrs'] };
        }
        const stability = numberOrInvalid(value.fsrs.stability);
        const difficulty = numberOrInvalid(value.fsrs.difficulty);
        const isReviewLike = common.state === CARD_STATE_REVIEW || common.state === CARD_STATE_RELEARNING;
        if (stability === null || stability < 0 || (isReviewLike && stability <= 0)) {
            return { ok: false, reasons: ['algorithmState.stability'] };
        }
        if (difficulty === null || difficulty < 0 || difficulty > 10 || (isReviewLike && difficulty < 1)) {
            return { ok: false, reasons: ['algorithmState.difficulty'] };
        }
        return {
            ok: true,
            state: {
                schemaVersion: 1,
                schedulerType: 'fsrs-v6',
                common,
                fsrs: { stability, difficulty },
            },
        };
    }

    if (!isObjectRecord(value.topic)) {
        return { ok: false, reasons: ['algorithmState.topic'] };
    }
    const aFactor = numberOrInvalid(value.topic.aFactor);
    if (aFactor === null || aFactor < MIN_A_FACTOR || aFactor > MAX_A_FACTOR) {
        return { ok: false, reasons: ['algorithmState.aFactor'] };
    }

    const schedulerMeta = isObjectRecord(value.topic.schedulerMeta)
        && isObjectRecord(value.topic.schedulerMeta.topic)
        ? { topic: value.topic.schedulerMeta.topic }
        : undefined;
    return {
        ok: true,
        state: {
            schemaVersion: 1,
            schedulerType: 'a-factor-v2',
            common,
            topic: {
                aFactor,
                schedulerMeta,
            },
        },
    };
}

function overlayState(card: DiagnosticCard, state: AlgorithmCardStateJson): DiagnosticCard {
    const common = state.common;
    const next: DiagnosticCard = {
        ...card,
        schedulerType: state.schedulerType,
        due: common.due,
        state: common.state,
        reps: common.reps,
        lapses: common.lapses,
        lastReview: common.lastReview,
        elapsedDays: common.elapsedDays,
        scheduledDays: common.scheduledDays,
        learning_step: common.learning_step,
    };

    if (state.schedulerType === 'a-factor-v2') {
        next.aFactor = state.topic?.aFactor ?? DEFAULT_A_FACTOR;
        next.schedulerMeta = state.topic?.schedulerMeta;
    } else {
        next.stability = state.fsrs?.stability ?? next.stability;
        next.difficulty = state.fsrs?.difficulty ?? next.difficulty;
        delete next.aFactor;
        delete next.schedulerMeta;
    }

    return next;
}

function parseBaseCardRow(row: CardRow): DiagnosticCard | null {
    const card = parseJson<DiagnosticCard | null>(row.payload_json, null);
    return card?.id ? card : null;
}

function loadAlgorithmStateRowMap(database: Database, cardIds: string[]): Map<string, StateRow> {
    const normalizedIds = cardIds.map(id => String(id || '').trim()).filter(Boolean);
    const result = new Map<string, StateRow>();
    if (normalizedIds.length === 0) {
        return result;
    }

    const chunkSize = 400;
    for (let index = 0; index < normalizedIds.length; index += chunkSize) {
        const chunk = normalizedIds.slice(index, index + chunkSize);
        const placeholders = chunk.map(() => '?').join(', ');
        const rows = getAll<StateRow>(
            database,
            `SELECT card_id, algorithm_id, state_json
             FROM algorithm_card_state
             WHERE card_id IN (${placeholders})
               AND algorithm_id IN (?, ?)`,
            [...chunk, ...ACTIVE_ALGORITHM_IDS],
        );
        for (const row of rows) {
            result.set(stateRowKey(row.card_id, row.algorithm_id), row);
        }
    }
    return result;
}

function getStateRowForCard(card: Pick<DiagnosticCard, 'id' | 'type'>, stateRows: Map<string, StateRow>): StateRow | null {
    return stateRows.get(stateRowKey(card.id, resolveActiveAlgorithmId(card))) || null;
}

function countOrphanActiveAlgorithmRows(database: Database): number {
    const row = getOne<{ count: number }>(
        database,
        `SELECT COUNT(*) AS count
         FROM algorithm_card_state state
         LEFT JOIN cards card ON card.id = state.card_id
         WHERE card.id IS NULL
           AND state.algorithm_id IN (?, ?)`,
        [...ACTIVE_ALGORITHM_IDS],
    );
    return Math.max(0, Number(row?.count) || 0);
}

function getOne<T extends Record<string, SqlValue>>(database: Database, sql: string, params?: SqlValue[]): T | null {
    const rows = getAll<T>(database, sql, params);
    return rows[0] ?? null;
}

function getAll<T extends Record<string, SqlValue>>(database: Database, sql: string, params?: SqlValue[]): T[] {
    const stmt = database.prepare(sql);
    const rows: T[] = [];
    try {
        if (params) {
            stmt.bind(params);
        }
        while (stmt.step()) {
            rows.push(stmt.getAsObject() as T);
        }
        return rows;
    } finally {
        stmt.free();
    }
}

function resolveActiveAlgorithmId(card: Pick<DiagnosticCard, 'type'>): ActiveAlgorithmId {
    return card.type === 'topic' || card.type === 'concept' ? 'a-factor-v2' : 'fsrs-v6';
}

function resolveCanonicalSchedulerType(card: Pick<DiagnosticCard, 'type' | 'schedulerType'>): ActiveAlgorithmId {
    const preferred = resolveActiveAlgorithmId(card);
    if (preferred) {
        return preferred;
    }
    return card.schedulerType === 'a-factor-v2' ? 'a-factor-v2' : 'fsrs-v6';
}

function readCommon(value: Record<string, unknown>): AlgorithmCardStateCommon | null {
    const due = numberOrInvalid(value.due);
    const state = numberOrInvalid(value.state);
    const reps = numberOrInvalid(value.reps);
    const lapses = numberOrInvalid(value.lapses);
    const lastReview = numberOrInvalid(value.lastReview);
    const elapsedDays = numberOrInvalid(value.elapsedDays);
    const scheduledDays = numberOrInvalid(value.scheduledDays);
    if (
        due === null
        || state === null
        || reps === null
        || lapses === null
        || lastReview === null
        || elapsedDays === null
        || scheduledDays === null
    ) {
        return null;
    }
    const common: AlgorithmCardStateCommon = {
        due,
        state,
        reps,
        lapses,
        lastReview,
        elapsedDays,
        scheduledDays,
    };
    const learningStep = numberOrInvalid(value.learning_step);
    if (learningStep !== null) {
        common.learning_step = learningStep;
    }
    return common;
}

function cleanPersistentMeta(meta: unknown): {
    meta?: Record<string, unknown>;
    changed: boolean;
    reasons: string[];
} {
    if (meta === undefined) {
        return { meta: undefined, changed: false, reasons: [] };
    }
    if (!isObjectRecord(meta)) {
        return { meta: undefined, changed: true, reasons: ['meta'] };
    }

    const next: Record<string, unknown> = { ...meta };
    const reasons: string[] = [];
    for (const key of PERSISTENT_META_SCHEDULING_KEYS) {
        if (Object.prototype.hasOwnProperty.call(next, key)) {
            delete next[key];
            reasons.push(`meta.${key}`);
        }
    }

    return {
        meta: next,
        changed: reasons.length > 0,
        reasons,
    };
}

function normalizeAfs(value: unknown, fallback: number): number[] {
    const values = Array.isArray(value)
        ? value.map(item => readFiniteNumber(item)).filter((item): item is number => item !== undefined)
        : [];
    const normalized = values
        .map(clampAFactor)
        .slice(-MAX_A_FACTOR_HISTORY);
    return normalized.length > 0 ? normalized : [fallback];
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
    const num = readFiniteNumber(value);
    if (num === undefined || num <= 0) {
        return fallback;
    }
    return Math.max(1, Math.floor(num));
}

function clampAFactor(value: number): number {
    return Math.min(MAX_A_FACTOR, Math.max(MIN_A_FACTOR, value));
}

function clampDifficulty(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
        return DEFAULT_DIFFICULTY;
    }
    return Math.min(Math.max(num, MIN_DIFFICULTY), MAX_DIFFICULTY);
}

function deriveIntervalDays(due: number, lastReview: number): number {
    if (due <= 0 || lastReview <= 0 || due <= lastReview) {
        return 0;
    }

    return Math.max(1, Math.floor((due - lastReview) / DAY_MS));
}

function isReviewLikeState(state: unknown): boolean {
    return state === CARD_STATE_REVIEW || state === CARD_STATE_RELEARNING;
}

function isActiveAlgorithmId(value: unknown): value is ActiveAlgorithmId {
    return value === 'fsrs-v6' || value === 'a-factor-v2';
}

function numberOr(value: unknown, fallback: number): number {
    return isFiniteNumber(value) ? value : fallback;
}

function numberOrInvalid(value: unknown): number | null {
    return isFiniteNumber(value) ? value : null;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function readFiniteNumber(value: unknown): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function toFiniteNumber(value: unknown, fallback: number): number {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function toPositiveTimestamp(value: unknown, fallback: number): number {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : fallback;
}

function toNonNegativeInteger(value: unknown, fallback: number): number {
    const num = Number(value);
    return Number.isFinite(num) && num >= 0 ? Math.floor(num) : fallback;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameJson(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

function parseJson<T>(value: string, fallback: T): T {
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

function addReason(summary: Pick<AlgorithmCardStateDiagnosticSummary, 'reasons'>, reason: string): void {
    summary.reasons[reason] = (summary.reasons[reason] ?? 0) + 1;
}

function stateRowKey(cardId: string, algorithmId: string): string {
    return `${cardId}::${algorithmId}`;
}
