import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";

import type { Database, Game } from "@dodi/types/database";

import {
  PublicationError,
  approvePublication,
  getPublication,
  listPendingPublications,
  submitPublication,
  withdrawPublication,
} from "./game-publications";

/**
 * In-memory stand-in for the two tables the publication flow touches, with just
 * enough of the PostgREST builder to run the real service unmodified: eq /
 * not-is-null filters, insert/update/delete, and the single/maybeSingle
 * terminals. Awaiting the builder itself (what `delete()` does) also works.
 */
type Row = Record<string, unknown>;

interface Filter {
  column: string;
  value: unknown;
  negated: boolean;
}

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown }> {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | null = null;
  private orderBy: string | null = null;
  private limitTo: number | null = null;

  constructor(private rows: Row[]) {}

  select(): this {
    return this;
  }
  insert(payload: Row): this {
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
    this.filters.push({ column, value, negated: false });
    return this;
  }
  is(column: string, value: unknown): this {
    this.filters.push({ column, value, negated: false });
    return this;
  }
  not(column: string, _op: string, value: unknown): this {
    this.filters.push({ column, value, negated: true });
    return this;
  }
  order(column: string): this {
    this.orderBy = column;
    return this;
  }
  limit(n: number): this {
    this.limitTo = n;
    return this;
  }

  private matches(row: Row): boolean {
    return this.filters.every(({ column, value, negated }) =>
      negated ? row[column] !== value : row[column] === value,
    );
  }

  private run(): Row[] {
    if (this.op === "insert") {
      const row = { id: `pub-${this.rows.length + 1}`, ...this.payload };
      this.rows.push(row);
      return [row];
    }
    const hit = this.rows.filter((r) => this.matches(r));
    if (this.op === "update") {
      hit.forEach((r) => Object.assign(r, this.payload));
    }
    if (this.op === "delete") {
      hit.forEach((r) => this.rows.splice(this.rows.indexOf(r), 1));
    }
    if (this.orderBy) {
      hit.sort((a, b) =>
        String(a[this.orderBy!]).localeCompare(String(b[this.orderBy!])),
      );
    }
    return this.limitTo === null ? hit : hit.slice(0, this.limitTo);
  }

  async single(): Promise<{ data: unknown; error: unknown }> {
    const hit = this.run();
    if (hit.length !== 1) {
      return { data: null, error: { code: "PGRST116", message: "no rows" } };
    }
    return { data: hit[0], error: null };
  }

  async maybeSingle(): Promise<{ data: unknown; error: unknown }> {
    const hit = this.run();
    return { data: hit[0] ?? null, error: null };
  }

  then<R1, R2 = never>(
    onfulfilled?:
      | ((v: { data: unknown; error: unknown }) => R1 | PromiseLike<R1>)
      | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve({ data: this.run(), error: null }).then(
      onfulfilled,
      onrejected,
    );
  }
}

function fakeDb(tables: { games: Row[]; accounts: Row[] }) {
  const client = {
    from: (table: "games" | "accounts") => new FakeQuery(tables[table]),
  } as unknown as SupabaseClient<Database>;
  return { client, tables };
}

const ACCOUNT = "acc-1";
const SOURCE_ID = "game-1";

const CONTENT = {
  title: "Counting Comets",
  description: "Count the comets",
  codeBundle: "<html><body>hi</body></html>",
  markdown: "# Briefing",
  learningGoal: "Count to ten",
  successDefinition: "3 sums",
  successCriteria: { description: "3 sums" },
  previewImage: null,
};

function sourceGame(overrides: Row = {}): Row {
  return {
    id: SOURCE_ID,
    account_id: ACCOUNT,
    is_system: false,
    kid_id: "kid-1",
    tags: ["math"],
    target_age_min: 5,
    target_age_max: 8,
    estimated_duration_minutes: 10,
    progress_kind: "goal",
    metadata: {},
    created_by: "parent",
    agent_transcript_enc: "enc:v1:k1:aaa:bbb",
    publication_requested_at: null,
    ...overrides,
  };
}

let db: ReturnType<typeof fakeDb>;

beforeEach(() => {
  db = fakeDb({
    games: [sourceGame()],
    accounts: [{ id: ACCOUNT, publication_handle: "fun_games" }],
  });
});

describe("submitPublication", () => {
  it("forks a plaintext copy and leaves the private source untouched", async () => {
    const pub = (await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    })) as unknown as Row;

    expect(db.tables.games).toHaveLength(2);
    expect(pub.source_game_id).toBe(SOURCE_ID);
    expect(pub.title).toBe("Counting Comets");
    expect(pub.publication_requested_at).toBeTruthy();
    expect(pub.published_at).toBeNull();
    expect(pub.approved_by).toBeNull();
    expect(pub.published_by_account_id).toBe(ACCOUNT);

    // The source row is not modified in any way.
    const source = db.tables.games.find((g) => g.id === SOURCE_ID)!;
    expect(source.publication_requested_at).toBeNull();
    expect(source.title).toBeUndefined();
  });

  it("does not carry the studio conversation into the public copy", async () => {
    const pub = (await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    })) as unknown as Row;

    expect(pub.agent_transcript_enc).toBeUndefined();
    // Nor anything that ties the listing to a specific child.
    expect(pub.kid_id).toBeNull();
    expect(pub.is_active).toBe(false);
    expect(pub.current_game_version_id).toBeNull();
  });

  it("copies the plaintext facets from the source row", async () => {
    const pub = (await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    })) as unknown as Row;

    expect(pub.tags).toEqual(["math"]);
    expect(pub.target_age_min).toBe(5);
    expect(pub.progress_kind).toBe("goal");
  });

  it("replaces the existing copy on re-submit and sends it back to review", async () => {
    await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    });
    await approvePublication(
      db.client,
      db.tables.games[1].id as string,
      "system",
    );
    expect(db.tables.games[1].published_at).toBeTruthy();

    const again = (await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: { ...CONTENT, title: "Counting Comets 2" },
    })) as unknown as Row;

    expect(db.tables.games).toHaveLength(2);
    expect(again.title).toBe("Counting Comets 2");
    expect(again.published_at).toBeNull();
    expect(again.approved_by).toBeNull();
  });

  it("refuses a game the caller does not own", async () => {
    await expect(
      submitPublication(db.client, {
        sourceGameId: SOURCE_ID,
        accountId: "someone-else",
        content: CONTENT,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("refuses an account with no publication handle", async () => {
    db.tables.accounts[0].publication_handle = null;
    await expect(
      submitPublication(db.client, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      }),
    ).rejects.toBeInstanceOf(PublicationError);
  });

  it("rejects a bundle the sanitizer refuses — this copy runs on other devices", async () => {
    await expect(
      submitPublication(db.client, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: { ...CONTENT, codeBundle: "<script>fetch('//evil')</script>" },
      }),
    ).rejects.toThrow(/Unsafe game bundle/);
    expect(db.tables.games).toHaveLength(1);
  });
});

describe("withdrawPublication", () => {
  it("deletes the copy and leaves the source alone", async () => {
    await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    });
    await withdrawPublication(db.client, SOURCE_ID, ACCOUNT);

    expect(db.tables.games).toHaveLength(1);
    expect(db.tables.games[0].id).toBe(SOURCE_ID);
    await expect(
      getPublication(db.client, SOURCE_ID, ACCOUNT),
    ).resolves.toBeNull();
  });
});

describe("approvePublication", () => {
  it("stamps published_at and who approved it", async () => {
    await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    });
    const id = db.tables.games[1].id as string;

    const approved = await approvePublication(db.client, id, "admin");
    expect(approved.published_at).toBeTruthy();
    expect(approved.approved_by).toBe("admin");
  });

  it("404s for an id that was never submitted", async () => {
    await expect(
      approvePublication(db.client, SOURCE_ID, "system"),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("listPendingPublications", () => {
  it("returns only unapproved submissions", async () => {
    await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    });
    expect(await listPendingPublications(db.client)).toHaveLength(1);

    await approvePublication(
      db.client,
      db.tables.games[1].id as string,
      "system",
    );
    expect(await listPendingPublications(db.client)).toHaveLength(0);
  });

  it("never includes ordinary private games", async () => {
    const pending = (await listPendingPublications(db.client)) as unknown as Row[];
    expect(pending).toHaveLength(0);
  });
});

/** Typed re-export guard: the service returns Game rows, not bare records. */
describe("types", () => {
  it("returns a Game from submit", async () => {
    const pub: Game = await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    });
    expect(pub.id).toBeTruthy();
  });
});
