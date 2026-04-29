import * as fs from 'fs';
import * as path from 'path';
import { performance } from 'node:perf_hooks';
import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from 'sql.js';
import { diagnosticsOutput, type DiagnosticsOutputPort } from './utils/output';

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

const BUDGETS_MS = {
    stats: 150,
    page: 150,
    sourceSummary: 150,
    matchedIds: 300,
    likeSearch: 300,
    sourceCandidateUpdate: 500,
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

interface BrowserSqlProfileScenario {
    label: string;
    targetRows: number;
    rowCount: number;
    expandedRows: number;
    sourceSummaryBefore: SourceSummary;
    sourceSummaryAfterSimulation: SourceSummary;
    timings: TimingSummary[];
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
    const database = new SQL.Database(bytes);
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
        const beforeCount = countCards(database);
        expandCards(database, options.targetRows);
        const rowCount = countCards(database);
        const staleBefore = Date.now() - DAY_MS;
        const sourceSummaryBefore = getSourceExistenceSummary(database, staleBefore);
        const timings: TimingSummary[] = [
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
        const sourceSummaryAfterSimulation = getSourceExistenceSummary(database, staleBefore);
        return {
            label: rowCount === beforeCount ? 'real-db' : `expanded-${rowCount}`,
            targetRows: options.targetRows,
            rowCount,
            expandedRows: Math.max(0, rowCount - beforeCount),
            sourceSummaryBefore,
            sourceSummaryAfterSimulation,
            timings,
            pass: timings.every((timing) => timing.pass),
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
          COALESCE(SUM(CASE WHEN source_exists IS NULL OR source_exists = 1 THEN 1 ELSE 0 END), 0) AS totalCards,
          COALESCE(SUM(CASE WHEN (source_exists IS NULL OR source_exists = 1) AND due <= ? AND suspended = 0 THEN 1 ELSE 0 END), 0) AS dueCards,
          COALESCE(SUM(CASE WHEN (source_exists IS NULL OR source_exists = 1) AND state = ? THEN 1 ELSE 0 END), 0) AS newCards,
          COALESCE(SUM(CASE WHEN (source_exists IS NULL OR source_exists = 1) AND state = ? THEN 1 ELSE 0 END), 0) AS learningCards,
          COALESCE(SUM(CASE WHEN (source_exists IS NULL OR source_exists = 1) AND state = ? THEN 1 ELSE 0 END), 0) AS reviewCards,
          COALESCE(SUM(CASE WHEN (source_exists IS NULL OR source_exists = 1) AND suspended = 1 THEN 1 ELSE 0 END), 0) AS suspendedCards,
          COALESCE(SUM(CASE WHEN source_exists = 0 THEN 1 ELSE 0 END), 0) AS lostCards
         FROM cards`,
        [Date.now(), CARD_STATE_NEW, CARD_STATE_LEARNING, CARD_STATE_REVIEW],
    );
}

function queryDeckPage(database: Database, pageSize: number): void {
    getOne(database, 'SELECT COUNT(*) AS count FROM cards WHERE source_exists IS NULL OR source_exists = 1');
    const rows = getAll(database,
        `SELECT id, payload_json
         FROM cards
         WHERE source_exists IS NULL OR source_exists = 1
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
         WHERE source_exists IS NULL OR source_exists = 1
         ORDER BY due ASC, priority ASC, id ASC`,
    );
}

function queryLikeSearch(database: Database): void {
    getAll(database,
        `SELECT id
         FROM cards
         WHERE (source_exists IS NULL OR source_exists = 1)
           AND search_text LIKE ? ESCAPE '\\'
         ORDER BY due ASC, priority ASC, id ASC`,
        ['%profile%'],
    );
}

function getSourceExistenceSummary(database: Database, staleBefore: number): SourceSummary {
    const row = getOne(database,
        `SELECT
          COALESCE(SUM(CASE WHEN source_checked_at IS NULL THEN 1 ELSE 0 END), 0) AS unknown,
          COALESCE(SUM(CASE WHEN source_checked_at IS NOT NULL AND source_checked_at < ? THEN 1 ELSE 0 END), 0) AS stale,
          COALESCE(SUM(CASE WHEN source_exists = 0 THEN 1 ELSE 0 END), 0) AS missing
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
