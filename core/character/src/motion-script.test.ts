import { describe, expect, it } from "vitest";

import { CHARACTER_MODELS } from "./character-catalog";
import { channelKeys, fitMotionScript, jointLimitsFor, MotionScriptSchema, parseMotionScript } from "./motion-script";

const dodi = CHARACTER_MODELS.dodi;

function script(poses: unknown[], extra: Record<string, unknown> = {}): unknown {
  return { v: 1, name: "Test", duration: 1.5, poses, ...extra };
}

describe("MotionScriptSchema", () => {
  it("accepts a small trick and defaults the pivot to the feet", () => {
    const parsed = MotionScriptSchema.parse(script([{ t: 0.5, bones: { head: { rot: [10, 0, 0] } } }]));
    expect(parsed.root_pivot).toBe("feet");
  });

  it("rejects poses out of order, too close or past the end", () => {
    const result = MotionScriptSchema.safeParse(
      script([
        { t: 0.5, bones: {} },
        { t: 0.4, bones: {} },
        { t: 0.45, bones: {} },
        { t: 2, bones: {} },
      ]),
    );
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((i) => i.message).join(" | ");
    expect(messages).toContain("increase");
    expect(messages).toContain("past the duration");
  });

  it("rejects too long tricks and too many poses", () => {
    expect(MotionScriptSchema.safeParse(script([{ t: 1, bones: {} }], { duration: 9 })).success).toBe(false);
    const many = Array.from({ length: 20 }, (_, i) => ({ t: 0.1 + i * 0.07, bones: {} }));
    expect(MotionScriptSchema.safeParse(script(many, { duration: 6 })).success).toBe(false);
  });
});

describe("fitMotionScript", () => {
  it("drops bones the rig lacks and the jaw, and records the bones it moves", () => {
    const parsed = MotionScriptSchema.parse(
      script([{ t: 0.5, bones: { arm_L: { rot: [0, 0, 90] }, jaw: { rot: [10, 0, 0] }, wing_L: { rot: [0, 0, 60] } } }]),
    );
    const fitted = fitMotionScript(parsed, dodi);
    expect(fitted.requiredBones).toEqual(["wing_L"]);
    expect(fitted.script.poses[0].bones).toEqual({ wing_L: { rot: [0, 0, 60] } });
    expect(fitted.warnings.join(" ")).toMatch(/arm_L/);
    expect(fitted.warnings.join(" ")).toMatch(/jaw/);
  });

  it("clamps rotations to the joint limits, mirrored for the right side", () => {
    const parsed = MotionScriptSchema.parse(
      script([{ t: 0.5, bones: { head: { rot: [90, 0, 0] }, wing_R: { rot: [0, 0, -200] } } }]),
    );
    const fitted = fitMotionScript(parsed, dodi);
    expect(fitted.script.poses[0].bones.head.rot).toEqual([35, 0, 0]);
    expect(fitted.script.poses[0].bones.wing_R.rot).toEqual([0, 0, -120]);
    expect(jointLimitsFor("wing_R")[2]).toEqual([-120, 20]);
  });

  it("only lets root and body move, within bounds", () => {
    const parsed = MotionScriptSchema.parse(
      script([{ t: 0.5, bones: { head: { loc: [0, 1, 0] }, root: { loc: [0, 2, 0] } } }]),
    );
    const fitted = fitMotionScript(parsed, dodi);
    expect(fitted.script.poses[0].bones).toEqual({ root: { loc: [0, 0.45, 0] } });
  });

  it("drops face states the model lacks", () => {
    const parsed = MotionScriptSchema.parse(
      script([{ t: 0.5, bones: { head: { rot: [5, 0, 0] } }, face: { eyes: "angry", mouth: "frown" } }]),
    );
    expect(fitMotionScript(parsed, dodi).script.poses[0].face).toEqual({ mouth: "frown" });
  });

  it("slows a trick down when a bone would turn too fast", () => {
    const parsed = MotionScriptSchema.parse(
      script([{ t: 0.1, bones: { root: { rot: [0, 360, 0] } } }, { t: 0.2, bones: { root: { rot: [0, 360, 0] } } }], {
        duration: 0.5,
      }),
    );
    const fitted = fitMotionScript(parsed, dodi);
    expect(fitted.script.duration).toBeGreaterThan(0.5);
    expect(fitted.script.poses[0].t).toBeGreaterThan(0.1);
  });
});

describe("channelKeys", () => {
  it("implies rest at both ends, ending a full turn on the whole turn", () => {
    const parsed = MotionScriptSchema.parse(script([{ t: 1, bones: { root: { rot: [0, 350, 0] } } }]));
    expect(channelKeys(parsed, "root", "rot")).toEqual([
      { t: 0, value: [0, 0, 0] },
      { t: 1, value: [0, 350, 0] },
      { t: 1.5, value: [0, 360, 0] },
    ]);
  });
});

describe("parseMotionScript", () => {
  it("reports structural issues for a retry", () => {
    const result = parseMotionScript({ v: 1, name: "", duration: 1, poses: [] }, dodi);
    expect(result.ok).toBe(false);
  });

  it("refuses a trick that moves nothing on this rig", () => {
    const result = parseMotionScript(script([{ t: 0.5, bones: { arm_L: { rot: [0, 0, 90] } } }]), dodi);
    expect(result).toEqual({ ok: false, issues: ["the trick moves no bone this character has"] });
  });

  it("accepts every built-in trick unchanged", () => {
    for (const trick of dodi.tricks) {
      const result = parseMotionScript(trick.script, dodi);
      expect(result.ok, trick.id).toBe(true);
      if (result.ok) expect(result.motion.warnings, trick.id).toEqual([]);
    }
  });
});
