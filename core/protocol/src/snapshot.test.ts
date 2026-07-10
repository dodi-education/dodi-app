import { generateVaultMasterKey } from "@dodi/crypto";
import type { SnapshotInfoV1, SnapshotPayloadV1 } from "@dodi/types/games";
import { VaultSession } from "@dodi/vault";
import { describe, expect, it } from "vitest";

import { generateKidFriendKeys, publishedFriendKeys } from "./friend-card";
import {
  SNAPSHOT_SAVED_STATE_MAX_CHARS,
  estimateSnapshotPayloadBytes,
  openOwnSnapshotInfo,
  openOwnSnapshotPayload,
  openSharedSnapshotInfo,
  openSharedSnapshotPayload,
  sealOwnSnapshotInfo,
  sealOwnSnapshotPayload,
  sealSnapshotForFriend,
} from "./snapshot";

const info: SnapshotInfoV1 = {
  v: 1,
  title: "My rainbow castle",
  gameTitle: "Drawing",
  thumbnail: "data:image/jpeg;base64,AAAA",
  createdAt: "2026-07-10T12:00:00.000Z",
};

const payload: SnapshotPayloadV1 = {
  v: 1,
  title: "My rainbow castle",
  createdAt: "2026-07-10T12:00:00.000Z",
  gameId: "560b130f-80a6-4353-a750-deac44224c53",
  gameTitle: "Drawing",
  gameDescription: "A simple drawing game.",
  gameMarkdown: "# Drawing\nFreeform canvas.",
  codeBundle: "<!doctype html><html><body><canvas></canvas></body></html>",
  capabilities: ["set_drawing_color", "save_state"],
  drawingStyle: "picture",
  savedState: { currentColor: "#e53935", canvasPng: "data:image/png;base64,BBBB" },
};

describe("own snapshots (VMK-sealed)", () => {
  it("round-trips info and payload as enc:v1: blobs", () => {
    const session = new VaultSession(generateVaultMasterKey());

    const infoBlob = sealOwnSnapshotInfo(session, info);
    const payloadBlob = sealOwnSnapshotPayload(session, payload);
    expect(infoBlob.startsWith("enc:v1:")).toBe(true);
    expect(payloadBlob.startsWith("enc:v1:")).toBe(true);
    // The plaintext title must never appear in the stored blobs.
    expect(infoBlob).not.toContain("rainbow");
    expect(payloadBlob).not.toContain("rainbow");

    expect(openOwnSnapshotInfo(session, infoBlob)).toEqual(info);
    expect(openOwnSnapshotPayload(session, payloadBlob)).toEqual(payload);
  });

  it("cannot be opened under a different VMK", () => {
    const session = new VaultSession(generateVaultMasterKey());
    const other = new VaultSession(generateVaultMasterKey());
    const blob = sealOwnSnapshotInfo(session, info);
    expect(() => openOwnSnapshotInfo(other, blob)).toThrow();
  });
});

describe("shared snapshots (friend-sealed envelopes)", () => {
  it("round-trips both blobs sealed to the recipient kid", () => {
    const sender = generateKidFriendKeys();
    const recipient = generateKidFriendKeys();

    const { infoEnvelope, payloadEnvelope } = sealSnapshotForFriend(
      publishedFriendKeys(recipient).kemPublicKey,
      info,
      payload,
      sender.sign,
    );
    expect(infoEnvelope).not.toContain("rainbow");
    expect(payloadEnvelope).not.toContain("canvasPng");

    const senderSignKey = publishedFriendKeys(sender).signPublicKey;
    expect(
      openSharedSnapshotInfo(recipient.kem.secretKey, infoEnvelope, senderSignKey),
    ).toEqual(info);
    expect(
      openSharedSnapshotPayload(recipient.kem.secretKey, payloadEnvelope, senderSignKey),
    ).toEqual(payload);
  });

  it("rejects a swapped sender on both blobs independently", () => {
    const sender = generateKidFriendKeys();
    const impostor = generateKidFriendKeys();
    const recipient = generateKidFriendKeys();
    const { infoEnvelope, payloadEnvelope } = sealSnapshotForFriend(
      publishedFriendKeys(recipient).kemPublicKey,
      info,
      payload,
      sender.sign,
    );
    const impostorKey = publishedFriendKeys(impostor).signPublicKey;
    expect(() =>
      openSharedSnapshotInfo(recipient.kem.secretKey, infoEnvelope, impostorKey),
    ).toThrow(/sender public key/);
    expect(() =>
      openSharedSnapshotPayload(recipient.kem.secretKey, payloadEnvelope, impostorKey),
    ).toThrow(/sender public key/);
  });

  it("rejects a tampered envelope", () => {
    const sender = generateKidFriendKeys();
    const recipient = generateKidFriendKeys();
    const { infoEnvelope } = sealSnapshotForFriend(
      publishedFriendKeys(recipient).kemPublicKey,
      info,
      payload,
      sender.sign,
    );
    const parsed = JSON.parse(infoEnvelope) as { ciphertext: string };
    parsed.ciphertext =
      (parsed.ciphertext.startsWith("A") ? "B" : "A") + parsed.ciphertext.slice(1);
    expect(() =>
      openSharedSnapshotInfo(recipient.kem.secretKey, JSON.stringify(parsed)),
    ).toThrow();
  });

  it("rejects the wrong recipient", () => {
    const sender = generateKidFriendKeys();
    const recipient = generateKidFriendKeys();
    const eavesdropper = generateKidFriendKeys();
    const { payloadEnvelope } = sealSnapshotForFriend(
      publishedFriendKeys(recipient).kemPublicKey,
      info,
      payload,
      sender.sign,
    );
    expect(() =>
      openSharedSnapshotPayload(eavesdropper.kem.secretKey, payloadEnvelope),
    ).toThrow();
  });
});

describe("content validation", () => {
  it("rejects a malformed decrypted payload (hostile shared content)", () => {
    const session = new VaultSession(generateVaultMasterKey());
    const bogus = session.encryptJson({ v: 1, title: "x" }); // missing fields
    expect(() => openOwnSnapshotPayload(session, bogus)).toThrow();
  });

  it("rejects an oversized savedState at seal time", () => {
    const session = new VaultSession(generateVaultMasterKey());
    const huge: SnapshotPayloadV1 = {
      ...payload,
      savedState: { blob: "x".repeat(SNAPSHOT_SAVED_STATE_MAX_CHARS + 1) },
    };
    expect(() => sealOwnSnapshotPayload(session, huge)).toThrow(/size limit/);
  });

  it("rejects a non-image thumbnail", () => {
    const session = new VaultSession(generateVaultMasterKey());
    const bad = { ...info, thumbnail: "javascript:alert(1)" };
    expect(() => sealOwnSnapshotInfo(session, bad)).toThrow();
  });

  it("estimates payload bytes", () => {
    expect(estimateSnapshotPayloadBytes(payload)).toBeGreaterThan(100);
  });
});
