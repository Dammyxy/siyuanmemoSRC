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
    }
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
        expect(result.scenarios[1]?.sourceSummaryBefore).toEqual(
            result.scenarios[1]?.sourceSummaryAfterSimulation,
        );
    });
});
