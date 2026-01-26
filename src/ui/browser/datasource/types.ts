
import type { BrowserCard } from '../types';

export interface SortModel {
    colId: string;
    sort: 'asc' | 'desc';
}

export interface FilterModel {
    [key: string]: any;
}

export interface CardBrowserAction {
    id: string;
    label: string;
    icon?: string;
    shortcut?: string;
    danger?: boolean; // Show in red or with confirm
    keepSelection?: boolean; // If true, don't clear selection after action
    submenu?: CardBrowserAction[]; // 支持子菜单
}

/**
 * Using the Adapter Pattern to unify different data sources (Deck, Queue, Query).
 * This allows the CardBrowser to be unaware of whether it's showing Riff cards or a Queue.
 */
export interface ICardDataSource {
    // Unique Identity
    id: string;
    label: string;

    /**
     * Fetch data for the grid.
     * Supports server-side sorting/filtering if the source allows.
     */
    fetchRows(params: {
        sortModel: SortModel[];
        filterModel: FilterModel;
        startRow?: number;
        endRow?: number;
    }): Promise<{ rows: BrowserCard[]; totalCount: number }>;

    /**
     * Returns actions available for this specific data source.
     * e.g. QueueDataSource might have "Remove from Queue", DeckDataSource has "Suspend".
     */
    getSupportedActions(): CardBrowserAction[];

    /**
     * Execute an action on selected rows.
     */
    performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<void>;

    /**
     * Optional: Get stats or summary for the status bar
     */
    getStats?(): Promise<string>;
}
