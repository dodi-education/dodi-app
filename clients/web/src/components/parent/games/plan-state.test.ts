import { describe, expect, it } from "vitest";

import { generateVaultMasterKey } from "@dodi/crypto";
import { VaultSession } from "@dodi/vault/session";

import {
  EMPTY_PLANNING,
  type PlanningState,
  resolveInitialView,
  restorePlanning,
} from "./plan-state";

const session = new VaultSession(generateVaultMasterKey());

const stroke = { color: "#22384e", width: 3, isEraser: false, points: [{ x: 1, y: 2 }] };

describe("restorePlanning", () => {
  it("round-trips a sealed envelope", () => {
    const state: PlanningState = {
      summary: "**Goal**\n- Count comets",
      isAccepted: true,
      mode: "photo",
      sketchImage: "data:image/png;base64,AAA",
      photoImage: "data:image/jpeg;base64,BBB",
      sketchStrokes: [stroke],
    };
    expect(restorePlanning(session.encryptJson(state), session)).toEqual(state);
  });

  it("yields null without a column or an unlocked vault", () => {
    expect(restorePlanning(null, session)).toBeNull();
    expect(restorePlanning(undefined, session)).toBeNull();
    expect(restorePlanning("", session)).toBeNull();
    expect(restorePlanning(session.encryptJson(EMPTY_PLANNING), null)).toBeNull();
  });

  it("yields null for a blob sealed under another key", () => {
    const other = new VaultSession(generateVaultMasterKey());
    expect(restorePlanning(other.encryptJson(EMPTY_PLANNING), session)).toBeNull();
  });

  it("yields null for a malformed envelope rather than trapping the game in planning", () => {
    expect(restorePlanning(session.encryptJson(["not", "an", "object"]), session)).toBeNull();
    expect(restorePlanning(session.encryptJson({ isAccepted: true }), session)).toBeNull();
    expect(restorePlanning(session.encryptField("plain text"), session)).toBeNull();
  });

  it("fills defaults and drops junk strokes from a partial envelope", () => {
    const enc = session.encryptJson({
      summary: "",
      mode: "other",
      sketchStrokes: [stroke, { color: 1 }, "x"],
    });
    expect(restorePlanning(enc, session)).toEqual({
      ...EMPTY_PLANNING,
      sketchStrokes: [stroke],
    });
  });
});

describe("resolveInitialView", () => {
  const planning: PlanningState = { ...EMPTY_PLANNING, summary: "a plan" };

  it("lets a deep-linked tab win", () => {
    expect(resolveInitialView({ initialView: "code", hasId: true, planning })).toBe("code");
  });

  it("reopens a planning draft on the Plan step", () => {
    expect(resolveInitialView({ hasId: true, planning })).toBe("plan");
  });

  it("reopens an accepted plan on the settings, where saving starts the build", () => {
    expect(
      resolveInitialView({ hasId: true, planning: { ...planning, isAccepted: true } }),
    ).toBe("settings");
  });

  it("opens an existing game on its preview and a new one on the Plan step", () => {
    expect(resolveInitialView({ hasId: true, planning: null })).toBe("preview");
    expect(resolveInitialView({ hasId: false, planning: null })).toBe("plan");
  });
});
