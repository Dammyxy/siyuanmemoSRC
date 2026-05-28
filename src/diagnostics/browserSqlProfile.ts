import * as fs from 'fs';
import * as path from 'path';
import { performance } from 'node:perf_hooks';
import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from 'sql.js';
import { diagnosticsOutput, type DiagnosticsOutputPort } from './utils/output';
import {
    activeCardSourceStatusSql,
    missingCardSourceStatusSql,
} from '@/infrastructure/persistence/sqlite/cardAdmissionSql';

type RowValue = SqlValue;
type SqlRow = Record<string, RowValue>;

const CARD_STATE_NEW = 0;
const CARD_STATE_LEARNING = 1;
const CARD_STATE_REVIEW = 2;
const DEFAULT_TARGETS = [1000, 5000] as const;
const DEFAULT_RUNS = 5;
const DEFAULT_WARMUP_RUNS = 1;
const DEFAULT_PAGE_SIZE = 50;
const SOURCE_UPDATE_LIMIT = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_SOURCE_STATUS_SQL = activeCardSourceStatusSql('cards');
const MISSING_SOURCE_STATUS_SQL = missingCardSourceStatusSql('cards');

const BUDGETS_MS = {
    stats: 150,
    page: 150,
    sourceSummary: 150,
    matchedIds: 300,
    likeSearch: 300,
    sourceCandidateUpdate: 500,
    browserReadModelSnapshot: 150,
    browserReadModelMatchedIds: 300,
    browserReadModelPageHydration: 300,
    browserReadModelRowsByIds: 300,
    browserReadModelActionTargets: 150,
    browserHierarchyDocumentCounts: 150,
    queueSnapshot: 150,
    queueRowsByIds: 300,
    queueCounters: 50,
    queueProjectionDocumentCounts: 150,
    queueProjectionWarmupReadiness: 150,
    reviewFeedbackTransaction: 250,
    xiuyuanFindById: 50,
    xiuyuanFindByBlockId: 100,
} as const;

type MetricName = keyof typeof BUDGETS_MS;

interface TimingSummary {
    metric: MetricName;
    budgetMs: number;
    runs: number;
    minMs: number;
    maxMs: number;
    avgMs: number;
    pass: boolean;
}

interface SourceSummary {
    unknown: number;
    stale: number;
    missing: number;
}

interface QueryPlanSummary {
    name: string;
    detail: string[];
}

interface RuntimeSqlProfileSection {
    rowCount: number;
    timings: TimingSummary[];
    queryPlans: QueryPlanSummary[];
    pass: boolean;
    skippedReason?: string;
    diagnostics?: Record<string, unknown>;
}

interface BrowserSqlProfileScenario {
    label: string;
    targetRows: number;
    rowCount: number;
    expandedRows: number;
    sourceSummaryBefore: SourceSummary;
    sourceSummaryAfterSimulation: SourceSummary;
    timings: TimingSummary[];
    sections: {
        browser: RuntimeSqlProfileSection;
        browserReadModel: RuntimeSqlProfileSection;
        queueProjection: RuntimeSqlProfileSection;
        reviewFeedback: RuntimeSqlProfileSection;
        xiuyuan: RuntimeSqlProfileSection;
    };
    pass: boolean;
}

export interface BrowserSqlProfileResult {
    dbPath: string;
    byteLength: number;
    readonly: true;
    source: 'sqlite-file';
    targets: number[];
    scenarios: BrowserSqlProfileScenario[];
    budgetsMs: typeof BUDGETS_MS;
    pass: boolean;
}

export async function runBrowserSqlProfileCommand(options: {
    dbPath?: string;
    output?: DiagnosticsOutputPort;
}): Promise<BrowserSqlProfileResult> {
    const output = options.output ?? diagnosticsOutput;
    if (!options.dbPath) {
        throw new Error('Missing required --db <path> argument');
    }

    const dbPath = path.resolve(options.dbPath);
    const bytes = fs.readFileSync(dbPath);
    const result = await runBrowserSqlProfileFromBytes({
        bytes,
        dbPath,
    });
    output.printJson(result);
    return result;
}

export async function runRuntimeSqlProfileCommand(options: {
    dbPath?: string;
    output?: DiagnosticsOutputPort;
}): Promise<BrowserSqlProfileResult> {
    return runBrowserSqlProfileCommand(options);
}

export async function runBrowserSqlProfileFromBytes(options: {
    bytes: Uint8Array;
    dbPath?: string;
    targets?: number[];
    runs?: number;
    warmupRuns?: number;
    pageSize?: number;
}): Promise<BrowserSqlProfileResult> {
    const SQL = await initSqlJs({
        locateFile: file => path.resolve(process.cwd(), 'node_modules/sql.js/dist', file),
    });
    const baseCount = withDatabase(SQL, options.bytes, database => countCards(database));
    const targets = resolveTargets(baseCount, options.targets);
    const scenarios = targets.map((targetRows) => profileScenario(SQL, options.bytes, {
        targetRows,
        runs: options.runs ?? DEFAULT_RUNS,
        warmupRuns: options.warmupRuns ?? DEFAULT_WARMUP_RUNS,
        pageSize: options.pageSize ?? DEFAULT_PAGE_SIZE,
    }));

    const result: BrowserSqlProfileResult = {
        dbPath: options.dbPath ? path.resolve(options.dbPath) : '<memory>',
        byteLength: options.bytes.byteLength,
        readonly: true,
        source: 'sqlite-file',
        targets,
        scenarios,
        budgetsMs: BUDGETS_MS,
        pass: scenarios.every((scenario) => scenario.pass),
    };
    return result;
}

function resolveTargets(baseCount: number, requestedTargets?: number[]): number[] {
    const targets = new Set<number>([baseCount]);
    for (const target of requestedTargets ?? DEFAULT_TARGETS) {
        const normalized = Math.floor(Number(target) || 0);
        if (normalized > baseCount) {
            targets.add(normalized);
        }
    }
    return Array.from(targets).sort((a, b) => a - b);
}

function withDatabase<T>(SQL: SqlJsStatic, bytes: Uint8Array, callback: (database: Database) => T): T {
    const database = new SQL.Database(new Uint8Array(bytes));
    try {
        return callback(database);
    } finally {
        database.close();
    }
}

function profileScenario(
    SQL: SqlJsStatic,
    bytes: Uint8Array,
    options: { targetRows: number; runs: number; warmupRuns: number; pageSize: number },
): BrowserSqlProfileScenario {
    return withDatabase(SQL, bytes, (database) => {
        applyRuntimeProfileSchemaRepair(database);
        const beforeCount = countCards(database);
        expandCards(database, options.targetRows);
        const rowCount = countCards(database);
        const staleBefore = Date.now() - DAY_MS;
        const sourceSummaryBefore = getSourceExistenceSummary(database, staleBefore);
        const browserTimings: TimingSummary[] = [
            measureMetric('stats', options, () => {
                getBrowserStats(database);
            }),
            measureMetric('page', options, () => {
                queryDeckPage(database, options.pageSize);
            }),
            measureMetric('matchedIds', options, () => {
                queryDeckMatchedIds(database);
            }),
            measureMetric('likeSearch', options, () => {
                queryLikeSearch(database);
            }),
            measureMetric('sourceSummary', options, () => {
                getSourceExistenceSummary(database, staleBefore);
            }),
            measureMetric('sourceCandidateUpdate', options, () => {
                simulateSourceCandidateUpdate(database, staleBefore, SOURCE_UPDATE_LIMIT);
            }),
        ];
        const browserSection: RuntimeSqlProfileSection = {
            rowCount,
            timings: browserTimings,
            queryPlans: [
                explainQuery(database, 'browser-page', `SELECT id, payload_json FROM cards WHERE ${ACTIVE_SOURCE_STATUS_SQL} ORDER BY due ASC, priority ASC, id ASC LIMIT ? OFFSET ?`, [options.pageSize, 0]),
                explainQuery(database, 'browser-matched-ids', `SELECT id FROM cards WHERE ${ACTIVE_SOURCE_STATUS_SQL} ORDER BY due ASC, priority ASC, id ASC`),
                explainQuery(database, 'browser-like-search', `SELECT id FROM cards WHERE (${ACTIVE_SOURCE_STATUS_SQL}) AND search_text LIKE ? ESCAPE '\\' ORDER BY due ASC, priority ASC, id ASC`, ['%profile%']),
            ],
            pass: browserTimings.every((timing) => timing.pass),
        };
        const browserReadModelSection = profileBrowserReadModel(database, options);
        const queueProjectionSection = profileQueueProjection(database, options);
        const reviewFeedbackSection = profileReviewFeedback(database, options);
        const xiuyuanSection = profileXiuyuan(database, options);
        const sourceSummaryAfterSimulation = getSourceExistenceSummary(database, staleBefore);
        const sections = {
            browser: browserSection,
            browserReadModel: browserReadModelSection,
            queueProjection: queueProjectionSection,
            reviewFeedback: reviewFeedbackSection,
            xiuyuan: xiuyuanSection,
        };
        return {
            label: rowCount === beforeCount ? 'real-db' : `expanded-${rowCount}`,
            targetRows: options.targetRows,
            rowCount,
            expandedRows: Math.max(0, rowCount - beforeCount),
            sourceSummaryBefore,
            sourceSummaryAfterSimulation,
            timings: browserTimings,
            sections,
            pass: Object.values(sections).every((section) => section.pass),
        };
    });
}

function measureMetric(
    metric: MetricName,
    options: { runs: number; warmupRuns: number },
    callback: () => void,
): TimingSummary {
    for (let index = 0; index < options.warmupRuns; index += 1) {
        callback();
    }
    const runs = Math.max(1, Math.floor(options.runs));
    const timings: number[] = [];
    for (let index = 0; index < runs; index += 1) {
        const startedAt = performance.now();
        callback();
        timings.push(performance.now() - startedAt);
    }
    const minMs = Math.min(...timings);
    const maxMs = Math.max(...timings);
    const avgMs = timings.reduce((sum, value) => sum + value, 0) / timings.length;
    const budgetMs = BUDGETS_MS[metric];
    return {
        metric,
        budgetMs,
        runs,
        minMs: roundMs(minMs),
        maxMs: roundMs(maxMs),
        avgMs: roundMs(avgMs),
        pass: maxMs <= budgetMs,
    };
}

function roundMs(value: number): number {
    return Math.round(value * 1000) / 1000;
}

function countCards(database: Database): number {
    return Number(getOne(database, 'SELECT COUNT(*) AS count FROM cards')?.count) || 0;
}

function getBrowserStats(database: Database): void {
    getOne(database,
        `SELECT
          COALESCE(SUM(CASE WHEN ${ACTIVE_SOURCE_STATUS_SQL} THEN 1 ELSE 0 END), 0) AS totalCards,
          COALESCE(SUM(CASE WHEN ${ACTIVE_SOURCE_STATUS_SQL} AND due <= ? AND suspended = 0 THEN 1 ELSE 0 END), 0) AS dueCards,
          COALESCE(SUM(CASE WHEN ${ACTIVE_SOURCE_STATUS_SQL} AND state = ? THEN 1 ELSE 0 END), 0) AS newCards,
          COALESCE(SUM(CASE WHEN ${ACTIVE_SOURCE_STATUS_SQL} AND state = ? THEN 1 ELSE 0 END), 0) AS learningCards,
          COALESCE(SUM(CASE WHEN ${ACTIVE_SOURCE_STATUS_SQL} AND state = ? THEN 1 ELSE 0 END), 0) AS reviewCards,
          COALESCE(SUM(CASE WHEN ${ACTIVE_SOURCE_STATUS_SQL} AND suspended = 1 THEN 1 ELSE 0 END), 0) AS suspendedCards,
          COALESCE(SUM(CASE WHEN ${MISSING_SOURCE_STATUS_SQL} THEN 1 ELSE 0 END), 0) AS lostCards
         FROM cards`,
        [Date.now(), CARD_STATE_NEW, CARD_STATE_LEARNING, CARD_STATE_REVIEW],
    );
}

function queryDeckPage(database: Database, pageSize: number): void {
    getOne(database, `SELECT COUNT(*) AS count FROM cards WHERE ${ACTIVE_SOURCE_STATUS_SQL}`);
    const rows = getAll(database,
        `SELECT id, payload_json
         FROM cards
         WHERE ${ACTIVE_SOURCE_STATUS_SQL}
         ORDER BY due ASC, priority ASC, id ASC
         LIMIT ? OFFSET ?`,
        [Math.max(1, pageSize), 0],
    );
    for (const row of rows) {
        if (typeof row.payload_json === 'string') {
            JSON.parse(row.payload_json);
        }
    }
    loadAlgorithmStateRows(database, rows.map((row) => String(row.id || '')).filter(Boolean));
}

function queryDeckMatchedIds(database: Database): void {
    getAll(database,
        `SELECT id
         FROM cards
         WHERE ${ACTIVE_SOURCE_STATUS_SQL}
         ORDER BY due ASC, priority ASC, id ASC`,
    );
}

function queryLikeSearch(database: Database): void {
    getAll(database,
        `SELECT id
         FROM cards
         WHERE (${ACTIVE_SOURCE_STATUS_SQL})
           AND search_text LIKE ? ESCAPE '\\'
         ORDER BY due ASC, priority ASC, id ASC`,
        ['%profile%'],
    );
}

function getBrowserReadModelSampleIds(database: Database, pageSize: number): string[] {
    return getAll(database, browserReadModelPageHydrationSql(), [Math.max(1, pageSize), 0])
        .map((row) => String(row.id || ''))
        .filter(Boolean);
}

function queryBrowserReadModelSnapshot(database: Database, pageSize: number): void {
    getOne(database, `SELECT COUNT(*) AS count FROM cards WHERE ${ACTIVE_SOURCE_STATUS_SQL}`);
    getAll(database, browserReadModelSnapshotSql(), [Math.max(1, pageSize), 0]);
}

function queryBrowserReadModelMatchedIds(database: Database): void {
    getAll(database, browserReadModelMatchedIdsSql());
}

function queryBrowserReadModelPageHydration(database: Database, pageSize: number): void {
    const ids = getBrowserReadModelSampleIds(database, pageSize);
    queryBrowserReadModelRowsByIds(database, ids);
}

function queryBrowserReadModelRowsByIds(database: Database, ids: string[]): void {
    if (ids.length === 0) {
        return;
    }
    const rows = getAll(database, browserReadModelRowsByIdsSql(ids.length), ids);
    const byId = new Map<string, SqlRow>();
    for (const row of rows) {
        const id = String(row.id || '');
        if (id) {
            byId.set(id, row);
        }
    }
    const orderedRows = ids.map((id) => byId.get(id)).filter((row): row is SqlRow => Boolean(row));
    for (const row of orderedRows) {
        if (typeof row.payload_json === 'string') {
            JSON.parse(row.payload_json);
        }
    }
    loadAlgorithmStateRows(database, ids);
}

function queryBrowserReadModelActionTargets(database: Database, ids: string[]): void {
    if (ids.length === 0) {
        return;
    }
    getAll(database, browserReadModelActionTargetsSql(ids.length), ids);
}

function queryBrowserHierarchyDocumentCounts(database: Database): void {
    getAll(database, browserHierarchyDocumentCountsSql());
}

function getSourceExistenceSummary(database: Database, staleBefore: number): SourceSummary {
    const row = getOne(database,
        `SELECT
          COALESCE(SUM(CASE WHEN source_checked_at IS NULL THEN 1 ELSE 0 END), 0) AS unknown,
          COALESCE(SUM(CASE WHEN source_checked_at IS NOT NULL AND source_checked_at < ? THEN 1 ELSE 0 END), 0) AS stale,
         COALESCE(SUM(CASE WHEN ${MISSING_SOURCE_STATUS_SQL} THEN 1 ELSE 0 END), 0) AS missing
         FROM cards`,
        [staleBefore],
    );
    return {
        unknown: Math.max(0, Number(row?.unknown) || 0),
        stale: Math.max(0, Number(row?.stale) || 0),
        missing: Math.max(0, Number(row?.missing) || 0),
    };
}

function simulateSourceCandidateUpdate(database: Database, staleBefore: number, limit: number): void {
    const candidates = getAll(database,
        `SELECT id, block_id, source_exists, source_checked_at
         FROM cards
         WHERE block_id IS NOT NULL
           AND block_id != ''
           AND (source_checked_at IS NULL OR source_checked_at < ?)
         ORDER BY source_checked_at IS NOT NULL ASC, source_checked_at ASC, id ASC
         LIMIT ?`,
        [staleBefore, limit],
    );
    database.run('BEGIN');
    try {
        const checkedAt = Date.now();
        for (let index = 0; index < candidates.length; index += 1) {
            const row = candidates[index];
            const exists = index % 11 === 0 ? 0 : 1;
            database.run(
                `UPDATE cards
                 SET source_exists = ?, source_checked_at = ?, source_missing_at = ?
                 WHERE id = ? AND block_id = ?`,
                [exists, checkedAt, exists ? null : checkedAt, row.id, row.block_id],
            );
        }
        database.run('ROLLBACK');
    } catch (error) {
        try {
            database.run('ROLLBACK');
        } catch {
            // Ignore rollback errors in a profiler-only simulation.
        }
        throw error;
    }
}

function applyRuntimeProfileSchemaRepair(database: Database): void {
    if (!tableExists(database, 'review_events')) {
        return;
    }
    if (!tableColumnExists(database, 'review_events', 'commit_idempotency_key')) {
        database.run('ALTER TABLE review_events ADD COLUMN commit_idempotency_key TEXT');
    }
    database.run(
        `CREATE INDEX IF NOT EXISTS idx_review_events_commit_idempotency
         ON review_events(commit_idempotency_key)`,
    );
}

function profileBrowserReadModel(
    database: Database,
    options: { runs: number; warmupRuns: number; pageSize: number },
): RuntimeSqlProfileSection {
    const rowCount = countCards(database);
    const sampleIds = getBrowserReadModelSampleIds(database, options.pageSize);
    const timings: TimingSummary[] = [
        measureMetric('browserReadModelSnapshot', options, () => {
            queryBrowserReadModelSnapshot(database, options.pageSize);
        }),
        measureMetric('browserReadModelMatchedIds', options, () => {
            queryBrowserReadModelMatchedIds(database);
        }),
        measureMetric('browserReadModelPageHydration', options, () => {
            queryBrowserReadModelPageHydration(database, options.pageSize);
        }),
        measureMetric('browserReadModelRowsByIds', options, () => {
            queryBrowserReadModelRowsByIds(database, sampleIds);
        }),
        measureMetric('browserReadModelActionTargets', options, () => {
            queryBrowserReadModelActionTargets(database, sampleIds);
        }),
        measureMetric('browserHierarchyDocumentCounts', options, () => {
            queryBrowserHierarchyDocumentCounts(database);
        }),
    ];
    const rowsByIdsSql = browserReadModelRowsByIdsSql(Math.max(1, sampleIds.length));
    const actionTargetsSql = browserReadModelActionTargetsSql(Math.max(1, sampleIds.length));
    const planIds = sampleIds.length > 0 ? sampleIds : [''];
    return {
        rowCount,
        timings,
        queryPlans: [
            explainQuery(database, 'browser-read-model-snapshot', browserReadModelSnapshotSql(), [options.pageSize, 0]),
            explainQuery(database, 'browser-read-model-matched-ids', browserReadModelMatchedIdsSql()),
            explainQuery(database, 'browser-read-model-page-hydration', browserReadModelPageHydrationSql(), [options.pageSize, 0]),
            explainQuery(database, 'browser-read-model-rows-by-ids', rowsByIdsSql, planIds),
            explainQuery(database, 'browser-read-model-action-targets', actionTargetsSql, planIds),
            explainQuery(database, 'browser-hierarchy-document-counts', browserHierarchyDocumentCountsSql()),
        ],
        diagnostics: {
            hierarchyCountPath: 'count-only',
            rowsHydratedForHierarchy: 0,
        },
        pass: timings.every((timing) => timing.pass),
    };
}

function profileQueueProjection(
    database: Database,
    options: { runs: number; warmupRuns: number },
): RuntimeSqlProfileSection {
    if (!tableExists(database, 'queue_projection_rows') || !tableExists(database, 'queue_projection_generations')) {
        return skippedSection('queue projection tables unavailable');
    }
    const generation = getOne(database,
        `SELECT queue_type, policy_hash, generation, status
         FROM queue_projection_generations
         ORDER BY updated_at DESC
         LIMIT 1`,
    );
    const queueType = String(generation?.queue_type || '');
    const policyHash = String(generation?.policy_hash || '');
    const sourceGeneration = Number(generation?.generation) || 0;
    const readinessStatus = String(generation?.status || 'unavailable');
    const readinessDiagnostics = {
        status: readinessStatus,
        queueType,
        policyHash,
        generation: sourceGeneration || null,
        retryCount: readinessStatus === 'ready' ? 0 : 1,
        selectionWaitedOnReadiness: readinessStatus !== 'ready',
    };
    const rowCount = queueType
        ? Number(getOne(database, 'SELECT COUNT(*) AS count FROM queue_projection_rows WHERE queue_type = ?', [queueType])?.count) || 0
        : 0;
    const ids = queueType
        ? getAll(database,
            `SELECT row_id
             FROM queue_projection_rows
             WHERE queue_type = ?
             ORDER BY sort_key ASC, COALESCE(queue_index_hint, 2147483647) ASC, row_id ASC
             LIMIT 20`,
            [queueType],
        ).map((row) => String(row.row_id || '')).filter(Boolean)
        : [];
    const timings: TimingSummary[] = [
        measureMetric('queueCounters', options, () => {
            queryQueueCounters(database, queueType, policyHash);
        }),
        measureMetric('queueSnapshot', options, () => {
            queryQueueProjectionSnapshot(database, queueType, policyHash, sourceGeneration);
        }),
        measureMetric('queueRowsByIds', options, () => {
            queryQueueProjectionRowsByIds(database, queueType, policyHash, sourceGeneration, ids);
        }),
        measureMetric('queueProjectionDocumentCounts', options, () => {
            queryQueueProjectionDocumentCounts(database, queueType, policyHash, sourceGeneration);
        }),
        measureMetric('queueProjectionWarmupReadiness', options, () => {
            queryQueueProjectionWarmupReadiness(database, queueType);
        }),
    ];
    return {
        rowCount,
        timings,
        queryPlans: [
            explainQuery(database, 'queue-snapshot', queueSnapshotSql(), [queueType, policyHash, sourceGeneration, 50, 0]),
            explainQuery(database, 'queue-rows-by-ids-read-all', queueRowsByIdsSql(), [queueType, policyHash, sourceGeneration, 5000]),
            explainQuery(database, 'queue-counters', queueCountersSql(), [queueType, policyHash]),
            explainQuery(database, 'queue-projection-document-counts', queueProjectionDocumentCountsSql(), [queueType, policyHash, sourceGeneration]),
            explainQuery(database, 'queue-projection-warmup-readiness', queueProjectionWarmupReadinessSql(), [queueType]),
        ],
        diagnostics: {
            hierarchyCountPath: 'projection-count-only',
            rowsHydratedForHierarchy: 0,
            projectionWarmup: readinessDiagnostics,
        },
        pass: timings.every((timing) => timing.pass),
    };
}

function profileReviewFeedback(
    database: Database,
    options: { runs: number; warmupRuns: number },
): RuntimeSqlProfileSection {
    if (!tableExists(database, 'review_events')) {
        return skippedSection('review_events table unavailable');
    }
    const row = getOne(database, 'SELECT id, payload_json FROM cards ORDER BY due ASC, id ASC LIMIT 1');
    if (!row?.id) {
        return skippedSection('no cards available for review feedback simulation');
    }
    const cardId = String(row.id);
    const timings = [
        measureMetric('reviewFeedbackTransaction', options, () => {
            simulateReviewFeedbackTransaction(database, cardId);
        }),
    ];
    const hasIdempotencyColumn = tableColumnExists(database, 'review_events', 'commit_idempotency_key');
    return {
        rowCount: countCards(database),
        timings,
        queryPlans: [
            explainQuery(database, 'review-feedback-card-load', 'SELECT payload_json, dto_json FROM cards WHERE id = ?', [cardId]),
            hasIdempotencyColumn
                ? explainQuery(database, 'review-feedback-duplicate-check', 'SELECT id, card_id, rating, reviewed_at, event_type, payload_json FROM review_events WHERE commit_idempotency_key = ? ORDER BY reviewed_at, id LIMIT 1', [`profile:${cardId}`])
                : { name: 'review-feedback-duplicate-check', detail: ['unavailable: review_events.commit_idempotency_key column missing'] },
        ],
        pass: timings.every((timing) => timing.pass),
    };
}

function profileXiuyuan(
    database: Database,
    options: { runs: number; warmupRuns: number },
): RuntimeSqlProfileSection {
    if (!tableExists(database, 'xiuyuans')) {
        return skippedSection('xiuyuans table unavailable');
    }
    const xiuyuan = getOne(database, 'SELECT id FROM xiuyuans ORDER BY id LIMIT 1');
    const block = getOne(database, "SELECT block_id FROM cards WHERE block_id IS NOT NULL AND block_id != '' ORDER BY id LIMIT 1");
    const xiuyuanId = String(xiuyuan?.id || '');
    const blockId = String(block?.block_id || '');
    const timings: TimingSummary[] = [
        measureMetric('xiuyuanFindById', options, () => {
            queryXiuyuanById(database, xiuyuanId);
        }),
        measureMetric('xiuyuanFindByBlockId', options, () => {
            queryXiuyuanByBlockId(database, blockId);
        }),
    ];
    return {
        rowCount: Number(getOne(database, 'SELECT COUNT(*) AS count FROM xiuyuans')?.count) || 0,
        timings,
        queryPlans: [
            explainQuery(database, 'xiuyuan-find-by-id', xiuyuanByIdSql(), [xiuyuanId]),
            explainQuery(database, 'xiuyuan-find-by-block-id', xiuyuanByBlockIdSql(), [blockId]),
        ],
        pass: timings.every((timing) => timing.pass),
    };
}

function skippedSection(reason: string): RuntimeSqlProfileSection {
    return {
        rowCount: 0,
        timings: [],
        queryPlans: [],
        pass: true,
        skippedReason: reason,
    };
}

function queryQueueCounters(database: Database, queueType: string, policyHash: string): void {
    if (!queueType) return;
    getOne(database, queueCountersSql(), [queueType, policyHash]);
}

function queryQueueProjectionSnapshot(database: Database, queueType: string, policyHash: string, generation: number): void {
    if (!queueType) return;
    const rows = getAll(database, queueSnapshotSql(), [queueType, policyHash, generation, 50, 0]);
    getCardsByIds(database, rows.map((row) => String(row.card_id || '')).filter(Boolean));
}

function queryQueueProjectionRowsByIds(
    database: Database,
    queueType: string,
    policyHash: string,
    generation: number,
    ids: string[],
): void {
    if (!queueType || ids.length === 0) return;
    const projectionRows = getAll(database, queueRowsByIdsSql(), [queueType, policyHash, generation, 5000]);
    const byId = new Map<string, SqlRow>();
    for (const row of projectionRows) {
        for (const key of ['row_id', 'card_id', 'block_id']) {
            const value = String(row[key] || '');
            if (value) byId.set(value, row);
        }
    }
    const orderedRows = ids.map((id) => byId.get(id)).filter((row): row is SqlRow => Boolean(row));
    getCardsByIds(database, orderedRows.map((row) => String(row.card_id || '')).filter(Boolean));
}

function queryQueueProjectionDocumentCounts(
    database: Database,
    queueType: string,
    policyHash: string,
    generation: number,
): void {
    if (!queueType) return;
    getAll(database, queueProjectionDocumentCountsSql(), [queueType, policyHash, generation]);
}

function queryQueueProjectionWarmupReadiness(database: Database, queueType: string): void {
    if (!queueType) return;
    getOne(database, queueProjectionWarmupReadinessSql(), [queueType]);
}

function simulateReviewFeedbackTransaction(database: Database, cardId: string): void {
    database.run('BEGIN');
    try {
        const now = Date.now();
        const hasIdempotencyColumn = tableColumnExists(database, 'review_events', 'commit_idempotency_key');
        database.run('UPDATE cards SET due = due + ?, reps = COALESCE(reps, 0) + 1, last_review = ?, updated_at = ? WHERE id = ?', [
            60_000,
            now,
            now,
            cardId,
        ]);
        const columns = [
            'id',
            'card_id',
            'attempt_id',
            'rating',
            'reviewed_at',
            ...(hasIdempotencyColumn ? ['commit_idempotency_key'] : []),
            'year',
            'month',
            'event_type',
            'payload_json',
        ];
        const values = [
            `profile-review:${cardId}`,
            cardId,
            `profile-attempt:${cardId}`,
            3,
            now,
            ...(hasIdempotencyColumn ? [`profile:${cardId}`] : []),
            new Date(now).getFullYear(),
            new Date(now).getMonth() + 1,
            'review-v2',
            JSON.stringify({ cardId, rating: 3, reviewedAt: now }),
        ];
        database.run(
            `INSERT OR REPLACE INTO review_events (${columns.join(', ')})
             VALUES (${columns.map(() => '?').join(', ')})`,
            values,
        );
        database.run('ROLLBACK');
    } catch (error) {
        try {
            database.run('ROLLBACK');
        } catch {
            // Ignore rollback errors in a profiler-only simulation.
        }
        throw error;
    }
}

function queryXiuyuanById(database: Database, xiuyuanId: string): void {
    if (!xiuyuanId) return;
    getOne(database, xiuyuanByIdSql(), [xiuyuanId]);
}

function queryXiuyuanByBlockId(database: Database, blockId: string): void {
    if (!blockId) return;
    getAll(database, xiuyuanByBlockIdSql(), [blockId]);
}

function loadAlgorithmStateRows(database: Database, cardIds: string[]): void {
    if (cardIds.length === 0 || !tableExists(database, 'algorithm_card_state')) {
        return;
    }
    const placeholders = cardIds.map(() => '?').join(', ');
    getAll(database,
        `SELECT card_id, algorithm_id, state_json
         FROM algorithm_card_state
         WHERE card_id IN (${placeholders})
           AND algorithm_id IN (?, ?)`,
        [...cardIds, 'fsrs-v6', 'a-factor-v2'],
    );
}

function expandCards(database: Database, targetRows: number): void {
    const currentRows = getAll(database, 'SELECT * FROM cards ORDER BY id');
    if (currentRows.length === 0 || currentRows.length >= targetRows) {
        return;
    }
    const columns = tableColumns(database, 'cards');
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT INTO cards (${columns.join(', ')}) VALUES (${placeholders})`;
    database.run('BEGIN');
    try {
        for (let index = currentRows.length; index < targetRows; index += 1) {
            const source = currentRows[index % currentRows.length];
            const clone = createProfileCardRow(source, index);
            database.run(sql, columns.map((column) => clone[column] ?? null));
        }
        database.run('COMMIT');
    } catch (error) {
        try {
            database.run('ROLLBACK');
        } catch {
            // Ignore rollback errors in a profiler-only expansion.
        }
        throw error;
    }
}

function createProfileCardRow(source: SqlRow, index: number): SqlRow {
    const clone: SqlRow = { ...source };
    const suffix = `__profile_${index}`;
    const id = `${String(source.id || 'card')}${suffix}`;
    const sourceBlockId = String(source.block_id || source.id || 'block');
    const blockId = `${sourceBlockId}${suffix}`;
    const rootId = `profile-doc-${index % 50}`;
    const deckId = `profile-deck-${index % 10}`;
    const contentText = `${String(source.content_text || 'profile card')} profile needle ${index % 17}`;

    clone.id = id;
    clone.block_id = blockId;
    clone.xiuyuan_id = `${String(source.xiuyuan_id || 'xy')}${suffix}`;
    clone.root_id = rootId;
    clone.deck_id = deckId;
    clone.content_text = contentText;
    clone.search_text = contentText.toLowerCase();
    clone.priority = index % 100;
    clone.due = Number(source.due) + (index % 365) * 60_000;
    clone.updated_at = Date.now() + index;
    clone.source_exists = null;
    clone.source_checked_at = null;
    clone.source_missing_at = null;
    clone.payload_json = rewriteCardJson(source.payload_json, { id, blockId, rootId, deckId, contentText });
    clone.dto_json = source.dto_json == null
        ? null
        : rewriteCardJson(source.dto_json, { id, blockId, rootId, deckId, contentText });
    return clone;
}

function rewriteCardJson(value: RowValue, replacements: {
    id: string;
    blockId: string;
    rootId: string;
    deckId: string;
    contentText: string;
}): string {
    if (typeof value !== 'string') {
        return JSON.stringify({
            id: replacements.id,
            blockId: replacements.blockId,
            meta: {
                rootId: replacements.rootId,
                deckId: replacements.deckId,
                content: replacements.contentText,
            },
        });
    }
    try {
        const parsed = JSON.parse(value) as Record<string, unknown>;
        parsed.id = replacements.id;
        parsed.blockId = replacements.blockId;
        parsed.blockID = replacements.blockId;
        parsed.xiuyuanID = `${String(parsed.xiuyuanID || 'xy')}_${replacements.id}`;
        parsed.frontBlockIDs = [replacements.blockId];
        parsed.backBlockIDs = Array.isArray(parsed.backBlockIDs) ? parsed.backBlockIDs : [];
        parsed.meta = {
            ...(typeof parsed.meta === 'object' && parsed.meta !== null ? parsed.meta as Record<string, unknown> : {}),
            rootId: replacements.rootId,
            deckId: replacements.deckId,
            content: replacements.contentText,
        };
        return JSON.stringify(parsed);
    } catch {
        return value;
    }
}

function tableColumns(database: Database, tableName: string): string[] {
    return getAll(database, `PRAGMA table_info(${tableName})`)
        .map((row) => String(row.name || ''))
        .filter(Boolean);
}

function tableExists(database: Database, tableName: string): boolean {
    const row = getOne(database, 'SELECT name FROM sqlite_master WHERE type = ? AND name = ?', ['table', tableName]);
    return Boolean(row?.name);
}

function tableColumnExists(database: Database, tableName: string, columnName: string): boolean {
    return tableColumns(database, tableName).includes(columnName);
}

function browserReadModelSnapshotSql(): string {
    return `SELECT id, block_id, type, priority
            FROM cards
            WHERE ${ACTIVE_SOURCE_STATUS_SQL}
            ORDER BY due ASC, priority ASC, id ASC
            LIMIT ? OFFSET ?`;
}

function browserReadModelMatchedIdsSql(): string {
    return `SELECT id
            FROM cards
            WHERE ${ACTIVE_SOURCE_STATUS_SQL}
            ORDER BY due ASC, priority ASC, id ASC`;
}

function browserReadModelPageHydrationSql(): string {
    return `SELECT id
            FROM cards
            WHERE ${ACTIVE_SOURCE_STATUS_SQL}
            ORDER BY due ASC, priority ASC, id ASC
            LIMIT ? OFFSET ?`;
}

function browserReadModelRowsByIdsSql(count: number): string {
    const placeholders = Array.from({ length: Math.max(1, count) }, () => '?').join(', ');
    return `SELECT id, block_id, type, priority, payload_json
            FROM cards
            WHERE id IN (${placeholders})`;
}

function browserReadModelActionTargetsSql(count: number): string {
    const placeholders = Array.from({ length: Math.max(1, count) }, () => '?').join(', ');
    return `SELECT id, block_id, type, priority
            FROM cards
            WHERE id IN (${placeholders})`;
}

function browserHierarchyDocumentCountsSql(): string {
    return `SELECT root_id, COUNT(*) AS count
            FROM cards
            WHERE ${ACTIVE_SOURCE_STATUS_SQL}
              AND root_id IS NOT NULL
              AND root_id != ''
            GROUP BY root_id
            ORDER BY root_id ASC`;
}

function queueSnapshotSql(): string {
    return `SELECT queue_type, row_id, card_id, block_id, deck_id, membership_reason, due_at, due_bucket,
                   priority_score, sort_key, queue_index_hint, policy_hash, source_generation, payload_json, updated_at
            FROM queue_projection_rows
            WHERE queue_type = ?
              AND policy_hash = ?
              AND source_generation = ?
            ORDER BY sort_key ASC, COALESCE(queue_index_hint, 2147483647) ASC, row_id ASC
            LIMIT ? OFFSET ?`;
}

function queueRowsByIdsSql(): string {
    return `SELECT queue_type, row_id, card_id, block_id, deck_id, membership_reason, due_at, due_bucket,
                   priority_score, sort_key, queue_index_hint, policy_hash, source_generation, payload_json, updated_at
            FROM queue_projection_rows
            WHERE queue_type = ?
              AND policy_hash = ?
              AND source_generation = ?
            ORDER BY sort_key ASC, COALESCE(queue_index_hint, 2147483647) ASC, row_id ASC
            LIMIT ?`;
}

function queueCountersSql(): string {
    return `SELECT queue_type, policy_hash, generation, version, remaining, due, total, buckets_json, updated_at
            FROM queue_projection_counters
            WHERE queue_type = ? AND policy_hash = ?
            ORDER BY generation DESC, version DESC
            LIMIT 1`;
}

function queueProjectionDocumentCountsSql(): string {
    return `SELECT cards.root_id AS root_id, COUNT(*) AS count
            FROM queue_projection_rows projection
            INNER JOIN cards ON cards.id = projection.card_id
            WHERE projection.queue_type = ?
              AND projection.policy_hash = ?
              AND projection.source_generation = ?
              AND ${ACTIVE_SOURCE_STATUS_SQL}
              AND cards.root_id IS NOT NULL
              AND cards.root_id != ''
            GROUP BY cards.root_id
            ORDER BY cards.root_id ASC`;
}

function queueProjectionWarmupReadinessSql(): string {
    return `SELECT queue_type, policy_hash, generation, status, rebuild_reason, updated_at
            FROM queue_projection_generations
            WHERE queue_type = ?
            LIMIT 1`;
}

function xiuyuanByIdSql(): string {
    return `SELECT payload_json FROM xiuyuans
            WHERE id = ?
              AND NOT EXISTS (
                SELECT 1 FROM tombstones t
                WHERE t.kind = 'xiuyuan' AND t.id = xiuyuans.id
              )`;
}

function xiuyuanByBlockIdSql(): string {
    return `SELECT DISTINCT xiuyuans.payload_json
            FROM cards
            INNER JOIN xiuyuans ON xiuyuans.id = cards.xiuyuan_id
            WHERE cards.block_id = ?
              AND cards.xiuyuan_id IS NOT NULL
              AND cards.xiuyuan_id != ''
              AND NOT EXISTS (
                SELECT 1 FROM tombstones t
        WHERE t.kind = 'card' AND t.id = cards.id
              )
              AND NOT EXISTS (
                SELECT 1 FROM tombstones t
                WHERE t.kind = 'xiuyuan' AND t.id = xiuyuans.id
              )
            ORDER BY xiuyuans.id ASC`;
}

function getCardsByIds(database: Database, cardIds: string[]): SqlRow[] {
    if (cardIds.length === 0) {
        return [];
    }
    const placeholders = cardIds.map(() => '?').join(', ');
    return getAll(database, `SELECT id, payload_json FROM cards WHERE id IN (${placeholders})`, cardIds);
}

function explainQuery(database: Database, name: string, sql: string, params?: RowValue[]): QueryPlanSummary {
    try {
        return {
            name,
            detail: getAll(database, `EXPLAIN QUERY PLAN ${sql}`, expandRepeatedParams(sql, params || []))
                .map((row) => String(row.detail || '')),
        };
    } catch (error) {
        return {
            name,
            detail: [`unavailable: ${error instanceof Error ? error.message : String(error)}`],
        };
    }
}

function expandRepeatedParams(sql: string, params: RowValue[]): RowValue[] {
    const expected = (sql.match(/\?/g) || []).length;
    if (params.length === expected) {
        return params;
    }
    if (params.length === 0) {
        return params;
    }
    const expanded: RowValue[] = [];
    for (let index = 0; index < expected; index += 1) {
        expanded.push(params[Math.min(index, params.length - 1)]);
    }
    return expanded;
}

function getOne(database: Database, sql: string, params?: RowValue[]): SqlRow | null {
    const rows = getAll(database, sql, params);
    return rows[0] ?? null;
}

function getAll(database: Database, sql: string, params?: RowValue[]): SqlRow[] {
    const stmt = database.prepare(sql);
    const rows: SqlRow[] = [];
    try {
        if (params) {
            stmt.bind(params);
        }
        while (stmt.step()) {
            rows.push(stmt.getAsObject() as SqlRow);
        }
        return rows;
    } finally {
        stmt.free();
    }
}
