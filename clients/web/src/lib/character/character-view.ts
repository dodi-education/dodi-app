import * as THREE from "three";

/**
 * Where the camera looks at the character from: an orbit around the view
 * target plus a zoom. Starts at the preview's "app" view
 * (characters/blender/preview.py), a three-quarter view from slightly above;
 * the kid can turn it and zoom in (character-gestures.ts).
 */

// Azimuth from the character's right side towards its front, elevation above the horizon.
const START_AZIMUTH = THREE.MathUtils.degToRad(55);
const START_ELEVATION = THREE.MathUtils.degToRad(14);
const MIN_ELEVATION = THREE.MathUtils.degToRad(-20);
const MAX_ELEVATION = THREE.MathUtils.degToRad(70);
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
// A drag across a 300 px figure turns the character about half way round.
const RADIANS_PER_PX = Math.PI / 300;

export const VIEW_TARGET = new THREE.Vector3(0, 0.49, 0.1);

export class CharacterView {
  azimuth = START_AZIMUTH;
  elevation = START_ELEVATION;
  zoom = MIN_ZOOM;

  /** Dragging right turns the character to its left, as if spinning it by hand. */
  orbitBy(dxPx: number, dyPx: number): void {
    this.azimuth = (this.azimuth - dxPx * RADIANS_PER_PX) % (2 * Math.PI);
    this.elevation = THREE.MathUtils.clamp(this.elevation + dyPx * RADIANS_PER_PX, MIN_ELEVATION, MAX_ELEVATION);
  }

  zoomBy(factor: number): void {
    this.zoom = THREE.MathUtils.clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  }

  /** Place an orthographic camera `distance` away; its frustum is set by the caller. */
  apply(camera: THREE.OrthographicCamera, distance: number): void {
    const toCamera = new THREE.Vector3(
      -Math.cos(this.azimuth) * Math.cos(this.elevation),
      Math.sin(this.elevation),
      Math.sin(this.azimuth) * Math.cos(this.elevation),
    );
    camera.position.copy(VIEW_TARGET).addScaledVector(toCamera, distance);
    camera.lookAt(VIEW_TARGET);
    if (camera.zoom !== this.zoom) {
      camera.zoom = this.zoom;
      camera.updateProjectionMatrix();
    }
  }
}
