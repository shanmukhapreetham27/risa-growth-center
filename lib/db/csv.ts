import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";

/** Parse a CSV file into a header and string rows (RFC 4180 quoting via csv-parse). */
export function readCsv(path: string): { header: string[]; rows: string[][] } {
  const text = readFileSync(path, "utf8");
  const records: string[][] = parse(text, { bom: true, skip_empty_lines: true, relax_column_count: false });
  if (records.length === 0) throw new Error(`${path}: empty CSV`);
  const [header, ...rows] = records;
  return { header, rows };
}

/** Postgres data_type values (information_schema.columns) the loader converts to. */
export type PgType = "text" | "integer" | "boolean" | "timestamp with time zone" | "date" | "numeric" | "jsonb" | "ARRAY";

const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Convert one raw CSV cell to the column's type (CONTEXT §6.2): IDs stay text, empty strings
 * become null, True/False become booleans, integers stay integers. Anything that does not fit
 * the column type throws, so a bad file fails the reset instead of loading silently.
 */
export function convertCell(raw: string, type: string, where: string): string | number | boolean | null {
  if (raw === "") return null;
  switch (type) {
    case "text":
      return raw;
    case "integer": {
      if (!/^-?\d+$/.test(raw)) throw new Error(`${where}: "${raw}" is not an integer`);
      return Number(raw);
    }
    case "numeric": {
      if (!/^-?\d+(\.\d+)?$/.test(raw)) throw new Error(`${where}: "${raw}" is not a number`);
      return raw;
    }
    case "boolean": {
      const v = raw.toLowerCase();
      if (v === "true") return true;
      if (v === "false") return false;
      throw new Error(`${where}: "${raw}" is not True/False`);
    }
    case "timestamp with time zone": {
      if (!ISO_TS.test(raw)) throw new Error(`${where}: "${raw}" is not an ISO timestamp with offset`);
      return raw;
    }
    case "date": {
      if (!ISO_DATE.test(raw)) throw new Error(`${where}: "${raw}" is not a YYYY-MM-DD date`);
      return raw;
    }
    default:
      throw new Error(`${where}: no CSV conversion for column type ${type}`);
  }
}
