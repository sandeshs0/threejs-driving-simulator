import type { KeyboardControlsEntry } from "@react-three/drei";

/** Named actions for drei's KeyboardControls. */
export enum Controls {
  forward = "forward",
  back = "back",
  left = "left",
  right = "right",
  horn = "horn",
}

/** Camera viewpoints, cycled with C. */
export enum CameraMode {
  Driver = 0,
  Chase = 1,
  Cinematic = 2,
}

export const CAMERA_MODE_NAMES: Record<CameraMode, string> = {
  [CameraMode.Driver]: "Driver",
  [CameraMode.Chase]: "Chase",
  [CameraMode.Cinematic]: "Cinematic",
};

export const controlsMap: KeyboardControlsEntry<Controls>[] = [
  { name: Controls.forward, keys: ["KeyW", "ArrowUp"] },
  { name: Controls.back, keys: ["KeyS", "ArrowDown"] },
  { name: Controls.left, keys: ["KeyA", "ArrowLeft"] },
  { name: Controls.right, keys: ["KeyD", "ArrowRight"] },
  { name: Controls.horn, keys: ["KeyH"] },
];

/** useFrame priorities — lower runs first. Keeps the update order explicit. */
export const UPDATE_ORDER = {
  traffic: -40, // publishes the car ahead before the player integrates
  vehicle: -30,
  collision: -25, // resolves contacts once both have moved this frame
  road: -20,
  camera: -10,
  audio: 0,
} as const;
