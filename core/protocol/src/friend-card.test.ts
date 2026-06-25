import { generateVaultMasterKey } from "@dodi/crypto";
import type { FriendCard, FriendPreviewCard } from "@dodi/types/database";
import { VaultSession } from "@dodi/vault";
import { describe, expect, it } from "vitest";

import {
  generateProfileFriendKeys,
  openFriendCard,
  publishedFriendKeys,
  sealFriendCard,
  unwrapProfileSecretKeys,
  wrapProfileSecretKeys,
} from "./friend-card";

describe("friend cards", () => {
  it("round-trips a full card sealed to the recipient profile key", () => {
    const requester = generateProfileFriendKeys();
    const addressee = generateProfileFriendKeys();
    const card: FriendCard = {
      displayName: "Emma",
      birthdate: "2018-04-05",
      avatarConfig: { color: "purple" },
    };

    const sealed = sealFriendCard(
      publishedFriendKeys(addressee).kemPublicKey,
      card,
      requester.sign,
    );
    const opened = openFriendCard<FriendCard>(addressee.kem.secretKey, sealed);
    expect(opened).toEqual(card);
  });

  it("a preview card carries name + avatar but not birthdate", () => {
    const requester = generateProfileFriendKeys();
    const addressee = generateProfileFriendKeys();
    const preview: FriendPreviewCard = {
      displayName: "Liam",
      avatarConfig: null,
    };

    const sealed = sealFriendCard(
      publishedFriendKeys(addressee).kemPublicKey,
      preview,
      requester.sign,
    );
    // The plaintext name must never appear in the stored blob.
    expect(JSON.stringify(sealed)).not.toContain("Liam");

    const opened = openFriendCard<FriendPreviewCard>(
      addressee.kem.secretKey,
      sealed,
    );
    expect(opened).toEqual(preview);
    expect("birthdate" in opened).toBe(false);
  });

  it("binds the card to the expected sender and rejects an impostor", () => {
    const requester = generateProfileFriendKeys();
    const impostor = generateProfileFriendKeys();
    const addressee = generateProfileFriendKeys();
    const card: FriendCard = {
      displayName: "Mia",
      birthdate: null,
      avatarConfig: null,
    };

    const sealed = sealFriendCard(
      publishedFriendKeys(addressee).kemPublicKey,
      card,
      requester.sign,
    );

    // Opening while expecting the impostor's key fails...
    expect(() =>
      openFriendCard(
        addressee.kem.secretKey,
        sealed,
        publishedFriendKeys(impostor).signPublicKey,
      ),
    ).toThrow(/sender public key/);
    // ...and the real requester's key passes.
    expect(() =>
      openFriendCard(
        addressee.kem.secretKey,
        sealed,
        publishedFriendKeys(requester).signPublicKey,
      ),
    ).not.toThrow();
  });

  it("rejects the wrong recipient", () => {
    const requester = generateProfileFriendKeys();
    const addressee = generateProfileFriendKeys();
    const eavesdropper = generateProfileFriendKeys();
    const sealed = sealFriendCard(
      publishedFriendKeys(addressee).kemPublicKey,
      { displayName: "Noah", birthdate: null, avatarConfig: null },
      requester.sign,
    );
    expect(() =>
      openFriendCard(eavesdropper.kem.secretKey, sealed),
    ).toThrow();
  });

  it("wraps and unwraps the profile secret keys under the VMK", () => {
    const session = new VaultSession(generateVaultMasterKey());
    const keys = generateProfileFriendKeys();

    const blob = wrapProfileSecretKeys(session, keys);
    expect(blob.startsWith("enc:v1:")).toBe(true);

    const recovered = unwrapProfileSecretKeys(session, blob);
    expect(recovered.kem.publicKey).toEqual(keys.kem.publicKey);
    expect(recovered.kem.secretKey).toEqual(keys.kem.secretKey);
    expect(recovered.sign.publicKey).toEqual(keys.sign.publicKey);
    expect(recovered.sign.secretKey).toEqual(keys.sign.secretKey);

    // The recovered keys can actually open a card sealed to the public half.
    const sender = generateProfileFriendKeys();
    const sealed = sealFriendCard(
      publishedFriendKeys(keys).kemPublicKey,
      { displayName: "Ava", birthdate: "2017-01-01", avatarConfig: null },
      sender.sign,
    );
    expect(
      openFriendCard<FriendCard>(recovered.kem.secretKey, sealed).displayName,
    ).toBe("Ava");
  });
});
