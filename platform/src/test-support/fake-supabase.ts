/**
 * Test-only in-memory stand-in for the PostgREST query builder, with just
 * enough surface to run the real services unmodified: eq/is/not/gte/lt/in
 * filters, insert/update/delete, order/limit, head-counts
 * (`select(cols, { count, head })`), and the single/maybeSingle terminals.
 * Awaiting the builder itself (what `delete()` does) also works.
 *
 * Grown out of the fake originally embedded in game-publications.test.ts;
 * shared by the publication/review/discover test suites.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@dodi/types/database";

export type Row = Record<string, unknown>;

type FilterOp = "eq" | "neq" | "gte" | "lt" | "in" | "or";

interface Filter {
  op: FilterOp;
  column: string;
  value: unknown;
}

interface QueryResult {
  data: unknown;
  error: unknown;
  count: number | null;
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

export class FakeQuery implements PromiseLike<QueryResult> {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private orderBy: string | null = null;
  private orderAscending = true;
  private limitTo: number | null = null;
  private countMode = false;

  constructor(
    private rows: Row[],
    private idPrefix = "row",
  ) {}

  select(_columns?: string, opts?: { count?: string; head?: boolean }): this {
    if (opts?.count) this.countMode = true;
    return this;
  }
  insert(payload: Row | Row[]): this {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row): this {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }
  eq(column: string, value: unknown): this {
    this.filters.push({ op: "eq", column, value });
    return this;
  }
  is(column: string, value: unknown): this {
    this.filters.push({ op: "eq", column, value });
    return this;
  }
  not(column: string, _operator: string, value: unknown): this {
    this.filters.push({ op: "neq", column, value });
    return this;
  }
  gte(column: string, value: unknown): this {
    this.filters.push({ op: "gte", column, value });
    return this;
  }
  lt(column: string, value: unknown): this {
    this.filters.push({ op: "lt", column, value });
    return this;
  }
  in(column: string, values: unknown[]): this {
    this.filters.push({ op: "in", column, value: values });
    return this;
  }
  /** PostgREST or-string, minimal: `col.is.null`, `col.eq.X`, `col.neq.X`. */
  or(conditions: string): this {
    this.filters.push({ op: "or", column: "", value: conditions.split(",") });
    return this;
  }
  order(column: string, opts?: { ascending?: boolean }): this {
    this.orderBy = column;
    this.orderAscending = opts?.ascending ?? true;
    return this;
  }
  limit(n: number): this {
    this.limitTo = n;
    return this;
  }

  private matches(row: Row): boolean {
    return this.filters.every(({ op, column, value }) => {
      if (op === "or") {
        return (value as string[]).some((condition) => {
          const [col, cop, ...rest] = condition.trim().split(".");
          const cell = row[col] === undefined ? null : row[col];
          const cval = rest.join(".");
          if (cop === "is" && cval === "null") return cell === null;
          if (cop === "eq") return cell === cval;
          // PostgREST semantics: neq never matches NULL cells.
          if (cop === "neq") return cell !== null && cell !== cval;
          throw new Error(`fake or(): unsupported condition "${condition}"`);
        });
      }
      // A column a row never set IS NULL in Postgres terms.
      const cell = row[column] === undefined ? null : row[column];
      switch (op) {
        case "eq":
          return cell === value;
        case "neq":
          return cell !== value;
        case "gte":
          return cell != null && compare(cell, value) >= 0;
        case "lt":
          return cell != null && compare(cell, value) < 0;
        case "in":
          return (value as unknown[]).includes(cell);
      }
    });
  }

  private run(): Row[] {
    if (this.op === "insert") {
      const inserts = (Array.isArray(this.payload)
        ? this.payload
        : [this.payload!]
      ).map((r, i) => ({
        id: `${this.idPrefix}-${this.rows.length + i + 1}`,
        ...r,
      }));
      this.rows.push(...inserts);
      return inserts;
    }
    const hit = this.rows.filter((r) => this.matches(r));
    if (this.op === "update") {
      hit.forEach((r) => Object.assign(r, this.payload));
    }
    if (this.op === "delete") {
      hit.forEach((r) => this.rows.splice(this.rows.indexOf(r), 1));
    }
    if (this.orderBy) {
      const dir = this.orderAscending ? 1 : -1;
      hit.sort((a, b) => dir * compare(a[this.orderBy!], b[this.orderBy!]));
    }
    return this.limitTo === null ? hit : hit.slice(0, this.limitTo);
  }

  async single(): Promise<QueryResult> {
    const hit = this.run();
    if (hit.length !== 1) {
      return {
        data: null,
        error: { code: "PGRST116", message: "no rows" },
        count: null,
      };
    }
    return { data: hit[0], error: null, count: null };
  }

  async maybeSingle(): Promise<QueryResult> {
    const hit = this.run();
    return { data: hit[0] ?? null, error: null, count: null };
  }

  then<R1, R2 = never>(
    onfulfilled?: ((v: QueryResult) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    const hit = this.run();
    return Promise.resolve({
      data: this.countMode ? null : hit,
      error: null,
      count: this.countMode ? hit.length : null,
    }).then(onfulfilled, onrejected);
  }
}

/** In-memory client over named tables. Mutate `tables` to assert on state. */
export function fakeDb<T extends Record<string, Row[]>>(tables: T) {
  const client = {
    from: (table: keyof T & string) => new FakeQuery(tables[table], table),
  } as unknown as SupabaseClient<Database>;
  return { client, tables };
}
