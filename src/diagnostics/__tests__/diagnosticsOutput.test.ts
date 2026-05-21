import { describe, expect, it } from 'vitest';
import { formatDiagnosticsOutputPart } from '../utils/output';

describe('diagnostics output formatting', () => {
    it('renders Error messages explicitly', () => {
        expect(formatDiagnosticsOutputPart(new Error('Missing required --db <path> argument')))
            .toContain('Missing required --db <path> argument');
    });
});
