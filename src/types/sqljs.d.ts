declare module 'sql.js' {
  export type SqlValue = number | string | Uint8Array | null;
  export type ParamsObject = Record<string, SqlValue>;
  export type ParamsCallback = (obj: unknown) => unknown;

  export interface Statement {
    bind(values?: SqlValue[] | ParamsObject): boolean;
    step(): boolean;
    get(): SqlValue[];
    getAsObject(values?: SqlValue[] | ParamsObject): Record<string, SqlValue>;
    free(): boolean;
  }

  export interface QueryExecResult {
    columns: string[];
    values: SqlValue[][];
  }

  export interface Database {
    run(sql: string, params?: SqlValue[] | ParamsObject): Database;
    exec(sql: string, params?: SqlValue[] | ParamsObject): QueryExecResult[];
    prepare(sql: string, params?: SqlValue[] | ParamsObject): Statement;
    export(): Uint8Array;
    close(): void;
  }

  export interface SqlJsStatic {
    Database: new (data?: Uint8Array) => Database;
  }

  export default function initSqlJs(config?: {
    locateFile?: (file: string) => string;
  }): Promise<SqlJsStatic>;
}

declare module 'sql.js/dist/sql-wasm.wasm?url' {
  const url: string;
  export default url;
}
