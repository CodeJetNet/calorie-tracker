export type Row = Record<string, unknown>;
export interface Db {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  all<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  tx<T>(fn: () => Promise<T>): Promise<T>;
}
