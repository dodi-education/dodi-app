import { generateDeviceKeyPairs, utf8ToBytes } from "@dodi/crypto";
import { describe, expect, it } from "vitest";

import {
  openEnvelope,
  openEnvelopeJson,
  sealEnvelope,
  sealEnvelopeJson,
  type EnvelopeSender,
} from "./envelope";

function makeParties() {
  const recipient = generateDeviceKeyPairs();
  const sender = generateDeviceKeyPairs();
  const senderId: EnvelopeSender = {
    signPublicKey: sender.sign.publicKey,
    signSecretKey: sender.sign.secretKey,
  };
  return { recipient, sender, senderId };
}

describe("SealedEnvelope", () => {
  it("round-trips a raw payload", () => {
    const { recipient, senderId } = makeParties();
    const payload = utf8ToBytes("store this transcript");
    const envelope = sealEnvelope(recipient.kem.publicKey, payload, senderId);
    const opened = openEnvelope(recipient.kem.secretKey, envelope);
    expect(new TextDecoder().decode(opened)).toBe("store this transcript");
  });

  it("round-trips a JSON value", () => {
    const { recipient, senderId } = makeParties();
    const msg = { kind: "command", action: "run-nightly-memory", kidIds: ["a", "b"] };
    const envelope = sealEnvelopeJson(recipient.kem.publicKey, msg, senderId);
    expect(openEnvelopeJson(recipient.kem.secretKey, envelope)).toEqual(msg);
  });

  it("the stored envelope leaks no plaintext", () => {
    const { recipient, senderId } = makeParties();
    const secret = "SUPER-SECRET-CHILD-NAME";
    const envelope = sealEnvelope(recipient.kem.publicKey, utf8ToBytes(secret), senderId);
    expect(JSON.stringify(envelope)).not.toContain(secret);
  });

  it("rejects a tampered ciphertext", () => {
    const { recipient, senderId } = makeParties();
    const envelope = sealEnvelope(recipient.kem.publicKey, utf8ToBytes("hi"), senderId);
    // Flip the signature so verification fails before decryption is attempted.
    const tampered = { ...envelope, ciphertext: envelope.ciphertext.slice(0, -2) + "AA" };
    expect(() => openEnvelope(recipient.kem.secretKey, tampered)).toThrow();
  });

  it("rejects the wrong recipient", () => {
    const { recipient, senderId } = makeParties();
    const other = generateDeviceKeyPairs();
    const envelope = sealEnvelope(recipient.kem.publicKey, utf8ToBytes("hi"), senderId);
    expect(() => openEnvelope(other.kem.secretKey, envelope)).toThrow();
  });

  it("enforces an expected sender public key", () => {
    const { recipient, senderId } = makeParties();
    const impostorExpectation = generateDeviceKeyPairs().sign.publicKey;
    const envelope = sealEnvelope(recipient.kem.publicKey, utf8ToBytes("hi"), senderId);
    expect(() =>
      openEnvelope(recipient.kem.secretKey, envelope, {
        expectedSenderSignPublicKey: impostorExpectation,
      }),
    ).toThrow(/sender public key/);
    // The real sender key passes.
    expect(() =>
      openEnvelope(recipient.kem.secretKey, envelope, {
        expectedSenderSignPublicKey: senderId.signPublicKey,
      }),
    ).not.toThrow();
  });
});
