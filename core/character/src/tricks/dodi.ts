import type { MotionScript } from "../motion-script";

/**
 * dodi's built-in tricks, as motion scripts (motion-script.ts). The runtime
 * turns them into clips like any custom trick, and they double as the
 * examples in the custom-trick prompt.
 */

export const PIROUETTE: MotionScript = {
  v: 1,
  name: "Pirouette",
  duration: 1.6,
  root_pivot: "feet",
  poses: [
    {
      t: 0.25,
      bones: {
        root: { loc: [0, -0.02, 0] },
        body: { rot: [8, 0, 0] },
        wing_L: { rot: [0, 0, 35] },
        wing_R: { rot: [0, 0, -35] },
      },
      face: { eyes: "happy" },
    },
    {
      t: 0.45,
      bones: {
        root: { rot: [0, 0, 0], loc: [0, 0.03, 0] },
        body: { rot: [-4, 0, 0] },
        head: { rot: [-8, 0, 6] },
        wing_L: { rot: [0, 0, 70] },
        wing_R: { rot: [0, 0, -70] },
      },
    },
    {
      t: 1.2,
      bones: {
        root: { rot: [0, 360, 0], loc: [0, 0.03, 0] },
        head: { rot: [-8, 0, -6] },
        wing_L: { rot: [0, 0, 70] },
        wing_R: { rot: [0, 0, -70] },
      },
    },
    {
      t: 1.4,
      bones: {
        root: { rot: [0, 360, 0], loc: [0, 0, 0] },
        body: { rot: [6, 0, 0] },
        wing_L: { rot: [0, 0, 20] },
        wing_R: { rot: [0, 0, -20] },
      },
      face: { mouth: "smile" },
    },
  ],
};

export const BACKFLIP: MotionScript = {
  v: 1,
  name: "Backflip",
  duration: 1.4,
  root_pivot: "center",
  poses: [
    {
      t: 0.22,
      bones: {
        root: { loc: [0, -0.03, 0] },
        body: { rot: [15, 0, 0] },
        head: { rot: [10, 0, 0] },
        wing_L: { rot: [0, 0, -10] },
        wing_R: { rot: [0, 0, 10] },
      },
      face: { eyes: "closed" },
    },
    {
      t: 0.45,
      bones: {
        root: { rot: [-110, 0, 0], loc: [0, 0.3, 0] },
        body: { rot: [-10, 0, 0] },
        head: { rot: [-15, 0, 0] },
        wing_L: { rot: [0, 0, 100] },
        wing_R: { rot: [0, 0, -100] },
      },
      face: { eyes: "up" },
    },
    {
      t: 0.75,
      bones: {
        root: { rot: [-250, 0, 0], loc: [0, 0.38, 0] },
        wing_L: { rot: [0, 0, 90] },
        wing_R: { rot: [0, 0, -90] },
      },
    },
    {
      t: 1.05,
      bones: {
        root: { rot: [-360, 0, 0], loc: [0, 0.02, 0] },
        body: { rot: [0, 0, 0] },
        wing_L: { rot: [0, 0, 40] },
        wing_R: { rot: [0, 0, -40] },
      },
    },
    {
      t: 1.2,
      bones: {
        root: { rot: [-360, 0, 0], loc: [0, -0.03, 0] },
        body: { rot: [12, 0, 0] },
        head: { rot: [8, 0, 0] },
      },
      face: { eyes: "happy", mouth: "smile" },
    },
  ],
};

export const WAVE: MotionScript = {
  v: 1,
  name: "Wave",
  duration: 1.6,
  root_pivot: "feet",
  poses: [
    {
      t: 0.3,
      bones: {
        wing_R: { rot: [0, 0, -110] },
        head: { rot: [0, -10, 8] },
        body: { rot: [0, 0, 4] },
      },
      face: { eyes: "happy" },
    },
    { t: 0.5, bones: { wing_R: { rot: [0, 18, -120] } } },
    { t: 0.7, bones: { wing_R: { rot: [0, -18, -100] } } },
    { t: 0.9, bones: { wing_R: { rot: [0, 18, -120] } } },
    { t: 1.1, bones: { wing_R: { rot: [0, -18, -105] }, head: { rot: [0, -10, 8] } } },
    { t: 1.35, bones: { wing_R: { rot: [0, 0, -25] }, body: { rot: [0, 0, 0] } }, face: { mouth: "smile" } },
  ],
};
