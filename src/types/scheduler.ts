export interface RescheduleLog {
    ts: number;
    action: 'advance' | 'postpone' | 'dilute' | 'reschedule-absolute' | 'reschedule-relative' | 'spread';
    source: string; // 'browser' | 'queue' | 'command' | 'unknown'
    targets: string[]; // IDs
    result: {
        updated: number;
        skipped: number;
    };
    sample: Array<{
        cardId?: string;
        blockId?: string;
        oldDue?: string;
        newDue: string;
    }>;
    error?: {
        code: string;
        message: string;
    };
}

export interface RescheduleResult {
    updated: Array<{
        cardId: string;
        blockId?: string;
        oldDue?: string;
        newDue: string;
    }>;
    skipped: Array<{
        reason: 'no-id' | 'jit-failed' | 'safety-lock' | 'invalid-input' | 'api-failed';
        blockId?: string;
        cardId?: string;
    }>;
    errors?: Array<{
        message: string;
        context?: unknown;
    }>;
}

export interface ActionMeta {
    source: string; // e.g. 'browser', 'queue', 'command'
    force?: boolean; // bypass safety checks if needed
}
