import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  start: vi.fn(async () => "foreground-service"),
  update: vi.fn(),
  finish: vi.fn(),
  expire: null as (() => void) | null,
}));

vi.mock("../../modules/background-build", () => ({
  startBackgroundBuild: native.start,
  updateBackgroundBuild: native.update,
  finishBackgroundBuild: native.finish,
  onBackgroundBuildExpire: (listener: () => void) => {
    native.expire = listener;
    return () => {};
  },
}));

const { holdBackgroundWork } = await import("./background-work");

const STATUS = { title: "t", subtitle: "s" };

describe("holdBackgroundWork", () => {
  beforeEach(() => {
    native.start.mockClear();
    native.update.mockClear();
    native.finish.mockClear();
  });

  it("starts the OS session for the first holder and ends it with the last", () => {
    const plan = holdBackgroundWork("plan", STATUS);
    const build = holdBackgroundWork("build", STATUS);
    expect(native.start).toHaveBeenCalledTimes(1);

    // A plan reply finishing must not end the session a running build needs.
    plan.release(true);
    expect(native.finish).not.toHaveBeenCalled();
    build.release(true);
    expect(native.finish).toHaveBeenCalledTimes(1);
    expect(native.finish).toHaveBeenCalledWith(true);
  });

  it("lets a running build drive the progress, not a plan turn", () => {
    const build = holdBackgroundWork("build", STATUS);
    const plan = holdBackgroundWork("plan", STATUS);
    native.update.mockClear();
    plan.update(0.9, "planning");
    build.update(0.4, "writing");
    expect(native.update).toHaveBeenCalledTimes(1);
    expect(native.update).toHaveBeenCalledWith(0.4, "writing");
    plan.release(true);
    build.release(true);
  });

  it("releases once and forwards the OS expiry to every holder", () => {
    const onExpire = vi.fn();
    const build = holdBackgroundWork("build", STATUS, onExpire);
    native.expire?.();
    expect(onExpire).toHaveBeenCalledTimes(1);
    build.release(false);
    build.release(false);
    expect(native.finish).toHaveBeenCalledTimes(1);
  });
});
