declare module "sql.js" {
  interface Database {
    run(sql: string, params?: unknown[]): Database;
    exec(sql: string, params?: unknown[]): unknown[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
    getRowsModified(): number;
  }

  interface Statement {
    bind(params?: unknown[]): boolean;
    step(): boolean;
    get(params?: unknown[]): unknown[] | null;
    getColumnNames(): string[];
    free(): boolean;
    reset(): boolean;
  }

  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer) => Database;
  }

  export type { Database, Statement, SqlJsStatic };
  export default function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<SqlJsStatic>;
}
