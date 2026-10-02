import { describe, expect, it } from "vitest";

import {
  type SnapshotFilterFacts,
  type SnapshotFilters,
  matchesSnapshotFilters,
} from "./snapshot-filters";

const ALL: SnapshotFilters = { kid: { kind: "all" }, type: "all", usage: "all" };

/** kid-a's plain manual save. */
const stored: SnapshotFilterFacts = {
  kidId: "kid-a",
  origin: "own",
  senderKidId: null,
  sharedWithKidId: null,
};
/** kid-a's save that was created by sharing with friend-x. */
const sent: SnapshotFilterFacts = {
  ...stored,
  sharedWithKidId: "friend-x",
};
/** A snapshot friend-x delivered to kid-a. */
const received: SnapshotFilterFacts = {
  kidId: "kid-a",
  origin: "received",
  senderKidId: "friend-x",
  sharedWithKidId: null,
};
/** kid-b's hidden resume slot. */
const autosave: SnapshotFilterFacts = {
  kidId: "kid-b",
  origin: "autosave",
  senderKidId: null,
  sharedWithKidId: null,
};
/** Sibling share: kid-b's snapshot received from their own-account sibling kid-a. */
const siblingReceived: SnapshotFilterFacts = {
  kidId: "kid-b",
  origin: "received",
  senderKidId: "kid-a",
  sharedWithKidId: null,
};

describe("matchesSnapshotFilters", () => {
  it("matches everything on the all-defaults", () => {
    for (const facts of [stored, sent, received, autosave]) {
      expect(matchesSnapshotFilters(facts, ALL)).toBe(true);
    }
  });

  it("filters by own kid via row ownership", () => {
    const filters: SnapshotFilters = { ...ALL, kid: { kind: "own", kidId: "kid-a" } };
    expect(matchesSnapshotFilters(stored, filters)).toBe(true);
    expect(matchesSnapshotFilters(received, filters)).toBe(true);
    expect(matchesSnapshotFilters(autosave, filters)).toBe(false);
  });

  it("own-kid selection ignores rows where the kid is only the sender (sibling share)", () => {
    const filters: SnapshotFilters = { ...ALL, kid: { kind: "own", kidId: "kid-a" } };
    expect(matchesSnapshotFilters(siblingReceived, filters)).toBe(false);
    const filtersB: SnapshotFilters = { ...ALL, kid: { kind: "own", kidId: "kid-b" } };
    expect(matchesSnapshotFilters(siblingReceived, filtersB)).toBe(true);
  });

  it("filters by friend kid via both directions of an exchange", () => {
    const filters: SnapshotFilters = { ...ALL, kid: { kind: "friend", kidId: "friend-x" } };
    expect(matchesSnapshotFilters(received, filters)).toBe(true);
    expect(matchesSnapshotFilters(sent, filters)).toBe(true);
    expect(matchesSnapshotFilters(stored, filters)).toBe(false);
  });

  it("splits manual saves from autosave slots", () => {
    expect(matchesSnapshotFilters(stored, { ...ALL, type: "manual" })).toBe(true);
    expect(matchesSnapshotFilters(received, { ...ALL, type: "manual" })).toBe(true);
    expect(matchesSnapshotFilters(autosave, { ...ALL, type: "manual" })).toBe(false);
    expect(matchesSnapshotFilters(autosave, { ...ALL, type: "autosave" })).toBe(true);
    expect(matchesSnapshotFilters(sent, { ...ALL, type: "autosave" })).toBe(false);
  });

  it("usage=stored keeps everything the kid saved themselves", () => {
    const filters = { ...ALL, usage: "stored" as const };
    expect(matchesSnapshotFilters(stored, filters)).toBe(true);
    expect(matchesSnapshotFilters(sent, filters)).toBe(true);
    expect(matchesSnapshotFilters(autosave, filters)).toBe(true);
    expect(matchesSnapshotFilters(received, filters)).toBe(false);
  });

  it("usage=sent keeps only share-created copies", () => {
    const filters = { ...ALL, usage: "sent" as const };
    expect(matchesSnapshotFilters(sent, filters)).toBe(true);
    expect(matchesSnapshotFilters(stored, filters)).toBe(false);
    expect(matchesSnapshotFilters(received, filters)).toBe(false);
  });

  it("usage=received keeps only friend-delivered rows", () => {
    const filters = { ...ALL, usage: "received" as const };
    expect(matchesSnapshotFilters(received, filters)).toBe(true);
    expect(matchesSnapshotFilters(sent, filters)).toBe(false);
    expect(matchesSnapshotFilters(autosave, filters)).toBe(false);
  });

  it("combines the dimensions (friend kid + sent)", () => {
    const filters: SnapshotFilters = {
      kid: { kind: "friend", kidId: "friend-x" },
      type: "manual",
      usage: "sent",
    };
    expect(matchesSnapshotFilters(sent, filters)).toBe(true);
    expect(matchesSnapshotFilters(received, filters)).toBe(false);
  });
});
