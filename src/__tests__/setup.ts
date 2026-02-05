/**
 * Vitest Setup File
 * 
 * Global mocks and setup for all tests
 */

import { vi } from 'vitest';

// Mock siyuan module globally
vi.mock('siyuan', () => ({
    Menu: vi.fn().mockImplementation(() => ({
        addItem: vi.fn(),
        addSeparator: vi.fn(),
        open: vi.fn(),
    })),
    openTab: vi.fn(),
    openWindow: vi.fn(),
    showMessage: vi.fn(),
    confirm: vi.fn(),
    Dialog: vi.fn().mockImplementation(() => ({
        element: document.createElement('div'),
        destroy: vi.fn(),
    })),
}));
