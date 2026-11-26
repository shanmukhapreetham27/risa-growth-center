/** CLAUDE.md rule 3: the guard refuses a test URL that names the demo database in any form. */
import { describe, expect, it } from "vitest";
import { assertTestDatabase, dbIdentity } from "../lib/db/guard";

const main = "postgresql://u:p@ep-main-123-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const mainDirect = "postgresql://u:p@ep-main-123.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const test = "postgresql://u:p@ep-test-456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

describe("test database guard", () => {
  it("pooled and direct strings of one branch have the same endpoint id", () => {
    expect(dbIdentity(main).endpoint).toBe("ep-main-123");
    expect(dbIdentity(mainDirect).key).toBe(dbIdentity(main).key);
  });
  it("accepts a different endpoint", () => {
    expect(assertTestDatabase({ DATABASE_URL: main, DATABASE_URL_UNPOOLED: mainDirect, DATABASE_URL_TEST: test }).endpoint).toBe("ep-test-456");
  });
  it("aborts when DATABASE_URL_TEST equals DATABASE_URL", () => {
    expect(() => assertTestDatabase({ DATABASE_URL: main, DATABASE_URL_TEST: main })).toThrow(/ABORT/);
  });
  it("aborts when DATABASE_URL_TEST is the demo branch's other string (pooled vs direct)", () => {
    expect(() => assertTestDatabase({ DATABASE_URL: main, DATABASE_URL_TEST: mainDirect })).toThrow(/same endpoint/);
  });
  it("aborts when DATABASE_URL_TEST or DATABASE_URL is missing", () => {
    expect(() => assertTestDatabase({ DATABASE_URL: main })).toThrow(/not set/);
    expect(() => assertTestDatabase({ DATABASE_URL_TEST: test })).toThrow(/DATABASE_URL is not set/);
  });
});
