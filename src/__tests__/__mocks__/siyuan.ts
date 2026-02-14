/**
 * Mock for siyuan module
 * 
 * Provides mock implementations of siyuan API for testing
 */

import { vi } from 'vitest';

export class Menu {
    addItem = vi.fn();
    addSeparator = vi.fn();
    open = vi.fn();
}

export const openTab = vi.fn();
export const openWindow = vi.fn();
export const showMessage = vi.fn();
export const confirm = vi.fn();

export class Dialog {
    element = document.createElement('div');
    destroy = vi.fn();
}

export class Plugin {
    // Add any plugin methods needed for testing
}

// Add any other siyuan exports that are used in the codebase
