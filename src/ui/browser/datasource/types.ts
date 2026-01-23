import type { BrowserCard } from '../types';

export type CardRow = BrowserCard & { originalItem?: any };

export interface CardBrowserAction {
  id: string;
  label: string;
  icon?: string;
  keepSelection?: boolean;
  danger?: boolean;
}

export interface FetchRowsParams {
  queryText?: string;
}

export interface ICardDataSource {
  id: string;
  label: string;
  fetchRows(params?: FetchRowsParams): Promise<CardRow[]>;
  getSupportedActions(): CardBrowserAction[];
  performAction(actionId: string, rows: CardRow[], payload?: any): Promise<{ refresh?: boolean } | void>;
}

