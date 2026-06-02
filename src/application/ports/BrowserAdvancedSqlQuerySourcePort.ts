export interface BrowserAdvancedSqlQuerySourcePort {
  matchedIds(statement: string): Promise<string[]>;
}
