import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDb, type TestDatabase } from "../test-support/pglite-db";
import {
  addSharedAsset,
  approveAssetPublication,
  getAssetPublicationStatus,
  getPublishedAssetFile,
  listPendingAssetPublications,
  listPublishedAssets,
  listSharedAssets,
  rejectAssetPublication,
  removeSharedAsset,
  submitAssetPublication,
  withdrawAssetPublication,
} from "./character-asset-publications";

/**
 * Discover for avatars and accessories: a family submits a plaintext copy of
 * its own asset, the server re-validates the file, a person approves it, and
 * other families add it in place (a sharing row, never a copy).
 */

const HAT = readFileSync(
  path.resolve(
    __dirname,
    "../../../characters/accessories/party_hat/party_hat.glb",
  ),
).toString("base64");

describe("character asset publications", () => {
  let t: TestDatabase;
  let publisher: string;
  let other: string;
  let assetId: string;

  beforeAll(async () => {
    t = await createTestDb();
    publisher = await t.createAccount("publisher@example.com");
    other = await t.createAccount("other@example.com");
    const row = await t.serviceDb
      .insertInto("character_assets")
      .values({
        account_id: publisher,
        kind: "accessory",
        name_enc: "enc:v1:name",
        glb_enc: "enc:v1:glb",
        byte_size: 1000,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    assetId = row.id;
  });

  afterAll(async () => {
    await t.close();
  });

  const submit = (accountId = publisher, glbBase64 = HAT) =>
    submitAssetPublication(t.serviceDb, {
      accountId,
      sourceAssetId: assetId,
      name: "Party hat",
      description: "A pink cone",
      glbBase64,
      previewImage: null,
    });

  it("needs a publication handle first", async () => {
    await expect(submit()).rejects.toMatchObject({ code: "handle_required" });
    await t.serviceDb
      .updateTable("accounts")
      .set({ publication_handle: "hatmaker" })
      .where("id", "=", publisher)
      .execute();
  });

  it("refuses another family's asset and a broken file", async () => {
    await expect(submit(other)).rejects.toMatchObject({ code: "not_found" });
    await expect(
      submit(
        publisher,
        Buffer.from("not a glb file at all").toString("base64"),
      ),
    ).rejects.toMatchObject({
      code: "invalid_file",
    });
  });

  it("queues a valid file for review, invisible on Discover until approved", async () => {
    const status = await submit();
    expect(status.state).toBe("in_review");
    const pending = await listPendingAssetPublications(t.serviceDb);
    expect(pending.map((p) => p.name)).toEqual(["Party hat"]);
    expect(pending[0].socket).toBe("socket_head_top");
    expect(await listPublishedAssets(t.serviceDb, other)).toEqual([]);
    expect(await getPublishedAssetFile(t.serviceDb, status.id)).toBeNull();
  });

  it("goes live on approval and other families add it in place", async () => {
    const { id } = (await getAssetPublicationStatus(
      t.serviceDb,
      publisher,
      assetId,
    ))!;
    expect(await approveAssetPublication(t.serviceDb, id)).toBe("ok");
    expect(await approveAssetPublication(t.serviceDb, id)).toBe("already_reviewed");
    expect(await approveAssetPublication(t.serviceDb, "00000000-0000-0000-0000-000000000000")).toBe("not_found");
    const cards = await listPublishedAssets(t.serviceDb, other);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      name: "Party hat",
      publisher_handle: "hatmaker",
      is_added: false,
    });
    expect(cards[0]).not.toHaveProperty("account_id");

    await addSharedAsset(t.scopedDb(other), t.serviceDb, other, id);
    await addSharedAsset(t.scopedDb(other), t.serviceDb, other, id);
    expect((await listPublishedAssets(t.serviceDb, other))[0].is_added).toBe(
      true,
    );
    expect(
      (await listSharedAssets(t.serviceDb, other)).map((a) => a.id),
    ).toEqual([id]);
    expect((await getPublishedAssetFile(t.serviceDb, id))?.glb_base64).toBe(
      HAT,
    );
  });

  it("hides a rejected asset from families that added it", async () => {
    const { id } = (await getAssetPublicationStatus(
      t.serviceDb,
      publisher,
      assetId,
    ))!;
    expect(await rejectAssetPublication(t.serviceDb, id, "Too pointy")).toBe("ok");
    expect(await rejectAssetPublication(t.serviceDb, id, "again")).toBe("already_reviewed");
    expect(await listSharedAssets(t.serviceDb, other)).toEqual([]);
    const status = await getAssetPublicationStatus(
      t.serviceDb,
      publisher,
      assetId,
    );
    expect(status).toMatchObject({
      state: "rejected",
      rejection_reason: "Too pointy",
    });
  });

  it("resubmits into the same row and back into review", async () => {
    const before = await getAssetPublicationStatus(
      t.serviceDb,
      publisher,
      assetId,
    );
    const after = await submit();
    expect(after.id).toBe(before!.id);
    expect(after.state).toBe("in_review");
  });

  it("lets a family remove what it added, and the publisher withdraw", async () => {
    const { id } = (await getAssetPublicationStatus(
      t.serviceDb,
      publisher,
      assetId,
    ))!;
    await approveAssetPublication(t.serviceDb, id);
    await removeSharedAsset(t.scopedDb(other), other, id);
    expect(await listSharedAssets(t.serviceDb, other)).toEqual([]);
    expect(await withdrawAssetPublication(t.serviceDb, other, assetId)).toBe(
      false,
    );
    expect(
      await withdrawAssetPublication(t.serviceDb, publisher, assetId),
    ).toBe(true);
    expect(await listPublishedAssets(t.serviceDb, other)).toEqual([]);
  });

  it("keeps sharing rows private to each family", async () => {
    const rows = await t
      .scopedDb(publisher)
      .selectFrom("character_asset_sharings")
      .selectAll()
      .execute();
    expect(rows).toEqual([]);
  });
});
