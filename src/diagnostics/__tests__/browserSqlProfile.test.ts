import * as path from 'path';
import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { runBrowserSqlProfileFromBytes } from '../browserSqlProfile';

async function createProfileDbBytes(): Promise<Uint8Array> {
    const SQL = await initSqlJs({
        locateFile: file => path.resolve(process.cwd(), 'node_modules/sql.js/dist', file),
    });
    const database = new SQL.Database();
    database.run(`
        CREATE TABLE cards (
            id TEXT PRIMARY KEY,
            block_id TEXT,
            xiuyuan_id TEXT,
            type TEXT,
            state INTEGER,
            due INTEGER,
            priority INTEGER,
            scheduler_type TEXT,
            updated_at INTEGER,
            deck_id TEXT,
            root_id TEXT,
            content_text TEXT,
            tags TEXT,
            suspended INTEGER,
            lapses INTEGER,
            reps INTEGER,
            last_review INTEGER,
            created_at INTEGER,
            scheduled_days INTEGER,
            stability REAL,
            difficulty REAL,
            a_factor REAL,
            search_text TEXT,
            card_type_marker TEXT,
            source_exists INTEGER,
            source_checked_at INTEGER,
            source_missing_at INTEGER,
            payload_json TEXT NOT NULL,
            dto_json TEXT
        )
    `);
    database.run('CREATE INDEX idx_cards_source_checked ON cards(source_checked_at)');
    database.run('CREATE INDEX idx_cards_search_text ON cards(search_text)');
    database.run('CREATE TABLE xiuyuans (id TEXT PRIMARY KEY, updated_at INTEGER NOT NULL, payload_json TEXT NOT NULL)');
    database.run('CREATE TABLE tombstones (kind TEXT NOT NULL, id TEXT NOT NULL, deleted_at INTEGER NOT NULL, deleted_by TEXT, payload_json TEXT NOT NULL, PRIMARY KEY (kind, id))');
    database.run(`CREATE TABLE queue_projection_generations (
        queue_type TEXT PRIMARY KEY,
        policy_hash TEXT NOT NULL,
        generation INTEGER NOT NULL,
        status TEXT NOT NULL,
        rebuild_reason TEXT,
        updated_at INTEGER NOT NULL,
        metadata_json TEXT NOT NULL
    )`);
    database.run(`CREATE TABLE queue_projection_rows (
        queue_type TEXT NOT NULL,
        row_id TEXT NOT NULL,
        card_id TEXT NOT NULL,
        block_id TEXT,
        deck_id TEXT,
        membership_reason TEXT NOT NULL,
        due_at INTEGER,
        due_bucket TEXT NOT NULL,
        priority_score REAL NOT NULL,
        sort_key TEXT NOT NULL,
        queue_index_hint INTEGER,
        policy_hash TEXT NOT NULL,
        source_generation INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (queue_type, row_id, policy_hash)
    )`);
    database.run('CREATE INDEX idx_queue_projection_rows_order ON queue_projection_rows(queue_type, policy_hash, source_generation, sort_key, queue_index_hint, row_id)');
    database.run(`CREATE TABLE queue_projection_counters (
        queue_type TEXT NOT NULL,
        policy_hash TEXT NOT NULL,
        generation INTEGER NOT NULL,
        version INTEGER NOT NULL,
        remaining INTEGER NOT NULL,
        due INTEGER NOT NULL,
        total INTEGER NOT NULL,
        buckets_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (queue_type, policy_hash)
    )`);
    database.run(`CREATE TABLE review_events (
        id TEXT PRIMARY KEY,
        card_id TEXT,
        attempt_id TEXT,
        rating INTEGER,
        reviewed_at INTEGER NOT NULL,
        commit_idempotency_key TEXT,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL
    )`);
    database.run('CREATE INDEX idx_review_events_commit_idempotency ON review_events(commit_idempotency_key)');
    const insert = `
        INSERT INTO cards (
            id, block_id, xiuyuan_id, type, state, due, priority, scheduler_type, updated_at,
            deck_id, root_id, content_text, tags, suspended, lapses, reps, last_review, created_at,
            scheduled_days, stability, difficulty, a_factor, search_text, card_type_marker,
            source_exists, source_checked_at, source_missing_at, payload_json, dto_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    for (let index = 0; index < 2; index += 1) {
        const id = `card-${index}`;
        const blockId = `block-${index}`;
        const payload = JSON.stringify({
            id,
            blockId,
            type: 'item',
            state: index,
            due: 1_700_000_000_000 + index,
            priority: 10 + index,
            meta: {
                rootId: 'doc-a',
                deckId: 'deck-a',
                content: `Alpha profile source ${index}`,
            },
        });
        database.run(insert, [
            id,
            blockId,
            `xy-${index}`,
            'item',
            index,
            1_700_000_000_000 + index,
            10 + index,
            'fsrs-v6',
            1_700_000_000_000 + index,
            'deck-a',
            'doc-a',
            `Alpha profile source ${index}`,
            '\nalpha\n',
            0,
            0,
            0,
            1_700_000_000_000,
            1_700_000_000_000,
            1,
            1,
            5,
            null,
            `alpha profile source ${index}`,
            null,
            null,
            null,
            null,
            payload,
            payload,
        ]);
        database.run(
            'INSERT INTO xiuyuans (id, updated_at, payload_json) VALUES (?, ?, ?)',
            [`xy-${index}`, 1_700_000_000_000 + index, JSON.stringify({ id: `xy-${index}`, blockIDs: [blockId], fields: [], templateID: 'basic' })],
        );
        database.run(
            `INSERT INTO queue_projection_rows
             (queue_type, row_id, card_id, block_id, deck_id, membership_reason, due_at, due_bucket,
              priority_score, sort_key, queue_index_hint, policy_hash, source_generation, payload_json, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                'retrieval-practice',
                `row-${index}`,
                id,
                blockId,
                'deck-a',
                'due',
                1_700_000_000_000 + index,
                'due',
                10 + index,
                `000${index}`,
                index,
                'policy-a',
                1,
                JSON.stringify({ fsrsCardId: id }),
                1_700_000_000_000 + index,
            ],
        );
    }
    database.run(
        `INSERT INTO queue_projection_generations
         (queue_type, policy_hash, generation, status, rebuild_reason, updated_at, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['retrieval-practice', 'policy-a', 1, 'ready', null, 1_700_000_000_000, '{}'],
    );
    database.run(
        `INSERT INTO queue_projection_counters
         (queue_type, policy_hash, generation, version, remaining, due, total, buckets_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['retrieval-practice', 'policy-a', 1, 1, 2, 2, 2, '{"all":2}', 1_700_000_000_000],
    );
    const bytes = database.export();
    database.close();
    return bytes;
}

describe('browser SQL profile diagnostic', () => {
    it('profiles real and expanded in-memory scenarios without failing budgets', async () => {
        const bytes = await createProfileDbBytes();

        const result = await runBrowserSqlProfileFromBytes({
            bytes,
            targets: [6],
            runs: 1,
            warmupRuns: 0,
            pageSize: 2,
        });

        expect(result.readonly).toBe(true);
        expect(result.pass).toBe(true);
        expect(result.scenarios.map((scenario) => scenario.rowCount)).toEqual([2, 6]);
        expect(result.scenarios[1]?.expandedRows).toBe(4);
        expect(result.scenarios[1]?.timings.map((timing) => timing.metric)).toEqual([
            'stats',
            'page',
            'matchedIds',
            'likeSearch',
            'sourceSummary',
            'sourceCandidateUpdate',
        ]);
        expect(result.scenarios[1]?.sections.browser.pass).toBe(true);
        expect(result.scenarios[1]?.sections.browserReadModel.timings.map((timing) => timing.metric)).toEqual([
            'browserReadModelSnapshot',
            'browserReadModelMatchedIds',
            'browserReadModelPageHydration',
            'browserReadModelRowsByIds',
            'browserReadModelActionTargets',
            'browserHierarchyDocumentCounts',
        ]);
        expect(result.scenarios[1]?.sections.queueProjection.timings.map((timing) => timing.metric)).toEqual([
            'queueCounters',
            'queueSnapshot',
            'queueRowsByIds',
            'queueProjectionDocumentCounts',
            'queueProjectionWarmupReadiness',
        ]);
        expect(result.scenarios[1]?.sections.reviewFeedback.timings.map((timing) => timing.metric)).toEqual([
            'reviewFeedbackTransaction',
        ]);
        expect(result.scenarios[1]?.sections.xiuyuan.timings.map((timing) => timing.metric)).toEqual([
            'xiuyuanFindById',
            'xiuyuanFindByBlockId',
        ]);
        expect(result.scenarios[1]?.sections.browserReadModel.queryPlans.map((plan) => plan.name)).toEqual([
            'browser-read-model-snapshot',
            'browser-read-model-matched-ids',
            'browser-read-model-page-hydration',
            'browser-read-model-rows-by-ids',
            'browser-read-model-action-targets',
            'browser-hierarchy-document-counts',
        ]);
        expect(result.scenarios[1]?.sections.browserReadModel.diagnostics).toMatchObject({
            hierarchyCountPath: 'count-only',
            rowsHydratedForHierarchy: 0,
        });
        expect(result.scenarios[1]?.sections.queueProjection.queryPlans.map((plan) => plan.name)).toContain('queue-projection-document-counts');
        expect(result.scenarios[1]?.sections.queueProjection.queryPlans.map((plan) => plan.name)).toContain('queue-projection-warmup-readiness');
        expect(result.scenarios[1]?.sections.queueProjection.diagnostics).toMatchObject({
            hierarchyCountPath: 'projection-count-only',
            rowsHydratedForHierarchy: 0,
            projectionWarmup: {
                status: 'ready',
                queueType: 'retrieval-practice',
                retryCount: 0,
                selectionWaitedOnReadiness: false,
            },
        });
        expect(result.scenarios[1]?.sections.xiuyuan.queryPlans.length).toBeGreaterThan(0);
        expect(result.scenarios[1]?.sourceSummaryBefore).toEqual(
            result.scenarios[1]?.sourceSummaryAfterSimulation,
        );
    });

    it('repairs legacy review event idempotency schema in the in-memory profile copy', async () => {
        const bytes = await createProfileDbBytes();
        const SQL = await initSqlJs({
            locateFile: file => path.resolve(process.cwd(), 'node_modules/sql.js/dist', file),
        });
        const legacyDatabase = new SQL.Database(bytes);
        legacyDatabase.run('DROP INDEX IF EXISTS idx_review_events_commit_idempotency');
        legacyDatabase.run('ALTER TABLE review_events RENAME TO review_events_old');
        legacyDatabase.run(`CREATE TABLE review_events (
            id TEXT PRIMARY KEY,
            card_id TEXT,
            attempt_id TEXT,
            rating INTEGER,
            reviewed_at INTEGER NOT NULL,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            payload_json TEXT NOT NULL
        )`);
        legacyDatabase.run(`INSERT INTO review_events
            (id, card_id, attempt_id, rating, reviewed_at, year, month, event_type, payload_json)
            SELECT id, card_id, attempt_id, rating, reviewed_at, year, month, event_type, payload_json
            FROM review_events_old`);
        legacyDatabase.run('DROP TABLE review_events_old');
        const legacyBytes = legacyDatabase.export();
        legacyDatabase.close();

        const result = await runBrowserSqlProfileFromBytes({
            bytes: legacyBytes,
            targets: [],
            runs: 1,
            warmupRuns: 0,
            pageSize: 2,
        });

        const duplicatePlan = result.scenarios[0]?.sections.reviewFeedback.queryPlans
            .find((plan) => plan.name === 'review-feedback-duplicate-check');
        expect(duplicatePlan?.detail.join('\n')).not.toContain('commit_idempotency_key column missing');
    });
});
