"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { nowPlaying, useMedia } from "@/stores/useMedia";

/**
 * InfotainmentScreen
 * ------------------
 * The head unit as it appears in the cabin: a small lit panel in the centre
 * console showing what is playing, plus the hard button beside it that
 * opens the full screen.
 *
 * The display is a CanvasTexture repainted a few times a second rather than
 * DOM or a render target. A render target would mean drawing the whole
 * Android Auto layout a second time every frame for something the size of a
 * postage stamp; 2D canvas at 4 Hz costs nothing and is legible from the
 * driver's seat, which is the only place it is ever seen from.
 *
 * Both the screen and the button are click targets — R3F raycasts them like
 * any DOM element — so the stereo can be opened by reaching for it, which
 * is the whole point of putting it in the car rather than only on a hotkey.
 */

const WIDTH = 384;
const HEIGHT = 216;

export function InfotainmentScreen({
  position,
  rotation,
}: {
  position: [number, number, number];
  rotation: number;
}) {
  const canvas = useMemo(() => {
    const element = document.createElement("canvas");
    element.width = WIDTH;
    element.height = HEIGHT;
    return element;
  }, []);

  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [canvas]);

  useEffect(() => () => texture.dispose(), [texture]);

  const clock = useRef(0);
  const lastKey = useRef("");

  useFrame((_, dt) => {
    clock.current += dt;
    if (clock.current < 0.25) return;
    clock.current = 0;

    const media = useMedia.getState();
    const playing = nowPlaying(media);

    // Only repaint when something actually changed — the panel is static
    // for minutes at a time.
    const key = `${media.source}|${playing.title}|${playing.subtitle}|${media.volume.toFixed(2)}`;
    if (key === lastKey.current) return;
    lastKey.current = key;

    draw(canvas, playing.title, playing.subtitle, media.source, media.volume);
    texture.needsUpdate = true;
  });

  const open = () => useMedia.getState().setOpen(true);

  return (
    <group position={position} rotation-y={rotation}>
      {/* Bezel */}
      <mesh>
        <boxGeometry args={[0.28, 0.17, 0.02]} />
        <meshStandardMaterial color="#0c0d10" roughness={0.6} />
      </mesh>

      {/* The display itself. Basic material: a screen emits its own light
          and should not be shaded by the cabin. */}
      <mesh position={[0, 0, 0.011]} onClick={open}>
        <planeGeometry args={[0.25, 0.14]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>

      {/* Hard button under the screen, as every car still has */}
      <mesh position={[0, -0.105, 0.004]} onClick={open}>
        <boxGeometry args={[0.05, 0.022, 0.014]} />
        <meshStandardMaterial color="#2a2d33" roughness={0.5} />
      </mesh>
      <mesh position={[0, -0.105, 0.012]}>
        <boxGeometry args={[0.02, 0.006, 0.002]} />
        <meshBasicMaterial color="#A8C7FA" toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Repaint the panel. Same visual language as the full screen. */
function draw(
  canvas: HTMLCanvasElement,
  title: string,
  subtitle: string,
  source: string,
  volume: number
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Same tokens as the full screen, so the dash panel reads as the same
  // system rather than as a second, worse one.
  ctx.fillStyle = source === "off" ? "#0E1013" : "#16181D";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.textBaseline = "alphabetic";

  if (source === "off") {
    ctx.fillStyle = "#5A6068";
    ctx.font = "500 20px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.letterSpacing = "2px";
    ctx.fillText("PRESS I", WIDTH / 2, HEIGHT / 2);
    ctx.letterSpacing = "0px";
    return;
  }

  ctx.textAlign = "left";

  ctx.fillStyle = "#9BA1A6";
  ctx.font = "500 15px system-ui, sans-serif";
  ctx.letterSpacing = "2px";
  ctx.fillText(
    (source === "youtube" ? "video" : source).toUpperCase(),
    28,
    44
  );
  ctx.letterSpacing = "0px";

  ctx.fillStyle = "#E3E3E3";
  ctx.font = "500 30px system-ui, sans-serif";
  ctx.fillText(clip(ctx, title, WIDTH - 56), 28, 102);

  ctx.fillStyle = "#9BA1A6";
  ctx.font = "20px system-ui, sans-serif";
  ctx.fillText(clip(ctx, subtitle, WIDTH - 56), 28, 138);

  // Volume, as a hairline rather than a slab.
  const y = HEIGHT - 38;
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(28, y, WIDTH - 56, 4);
  ctx.fillStyle = "#A8C7FA";
  ctx.fillRect(28, y, (WIDTH - 56) * volume, 4);
}

/** Trim a string to fit, with an ellipsis. */
function clip(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}
