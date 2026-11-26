import postgres from "postgres";

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;
/** Either a pool or an open transaction: write helpers accept both. */
export type Queryable = Sql | Tx;

/**
 * postgres.js client with the project's type rules:
 * - `date` columns come back as 'YYYY-MM-DD' strings (the default would build a Date at local
 *   midnight, which shifts the day when the machine is not in IST).
 * - `timestamptz` comes back as a JS Date (an exact instant; the engine converts to epoch ms).
 * - prepare: false so the same client works through Neon's pooled (PgBouncer) endpoint.
 */
export function makeSql(url: string, opts: { max?: number } = {}): Sql {
  return postgres(url, {
    max: opts.max ?? 5,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 30,
    onnotice: () => {},
    types: {
      date: {
        to: 1082,
        from: [1082],
        serialize: (x: string) => x,
        parse: (x: string) => x,
      },
    },
  });
}

/** Host without credentials, for logs and reports. */
export function dbHost(url: string): string {
  return new URL(url).hostname;
}
