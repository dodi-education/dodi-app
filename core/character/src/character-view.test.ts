import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { CharacterView, VIEW_TARGET } from "./character-view";

describe("CharacterView", () => {
  it("keeps the camera at its distance, looking at the target, however it is turned", () => {
    const view = new CharacterView();
    const camera = new THREE.OrthographicCamera();
    view.orbitBy(123, -45);
    view.apply(camera, 5);
    expect(camera.position.distanceTo(VIEW_TARGET)).toBeCloseTo(5);
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const toTarget = VIEW_TARGET.clone().sub(camera.position).normalize();
    expect(forward.dot(toTarget)).toBeCloseTo(1);
  });

  it("never tips over the top or far below the character", () => {
    const view = new CharacterView();
    view.orbitBy(0, 10_000);
    expect(view.elevation).toBeCloseTo(THREE.MathUtils.degToRad(70));
    view.orbitBy(0, -10_000);
    expect(view.elevation).toBeCloseTo(THREE.MathUtils.degToRad(-20));
  });

  it("zooms between the whole figure and 3x", () => {
    const view = new CharacterView();
    const camera = new THREE.OrthographicCamera();
    view.zoomBy(0.5);
    expect(view.zoom).toBe(1);
    view.zoomBy(10);
    view.apply(camera, 5);
    expect(camera.zoom).toBe(3);
  });
});
