"use client";

import { useEffect, useRef } from "react";
import { CONFIG, roadHalfWidth } from "@/lib/config";
import { generateCity, type CityLayout } from "@/lib/city";
import { ROUTE_END, WAYPOINTS, cityness, type Waypoint } from "@/lib/journey";
import { centerX, roadPoint, sFromZ } from "@/lib/road";
import { useGame } from "@/stores/useGame";

/**
 * Minimap
 * =======
 * The radar in the corner, and the route map behind Tab.
 *
 * It is a plain DOM <canvas> driven by its own requestAnimationFrame loop
 * rather than anything inside the R3F tree, for two reasons. It reads the
 * transient vehicle state directly with `getState()`, so a map that updates
 * sixty times a second still costs zero React renders; and 2D canvas is
 * simply the right tool for a 2D map — every shape here is a path fill.
 *
 * Radar mode is heading-up, the way a car's navigation is: the player sits
 * at the centre pointing up the screen and the world rotates underneath.
 * That rotation is the whole trick, so it is derived rather than guessed —
 * see `applyRadarTransform`.
 *
 * Expanded mode is north-up and shows the entire scripted route at once,
 * with every waypoint named, because that is a map you read while stopped
 * rather than one you glance at mid-corner.
 */

const RADAR_SIZE = 200;

const COLORS = {
  ground: "#3b4433",
  groundCity: "#4a473c",
  road: "#26282b",
  roadEdge: "#585c60",
  route: "#e8b52c",
  building: "#6a6257",
  buildingRoof: "#7d7466",
  player: "#f2f4f6",
  traffic: "#7fd0ff",
  oncoming: "#ff9d6b",
  waypoint: "#f0ead8",
  water: "#2f4f6a",
};

/**
 * Building footprints for the chunks near the player.
 *
 * `generateCity` is deterministic but not free, and the map wants the same
 * chunks the world is already showing, so results are memoised by index and
 * the cache trimmed whenever it outgrows the window it can possibly need.
 */
const cityCache = new Map<number, CityLayout>();
function cityFor(index: number): CityLayout {
  let layout = cityCache.get(index);
  if (!layout) {
    layout = generateCity(index);
    cityCache.set(index, layout);
    if (cityCache.size > 96) {
      // Drop the oldest half — insertion order is iteration order here.
      const keys = [...cityCache.keys()].slice(0, 48);
      for (const k of keys) cityCache.delete(k);
    }
  }
  return layout;
}

export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const expanded = useGame((s) => s.mapExpanded);
  const toggleMap = useGame((s) => s.toggleMap);
  const started = useGame((s) => s.started);

  // Tab opens the full map. The browser would otherwise move focus, and
  // there is nothing to focus on over a canvas.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Tab") return;
      e.preventDefault();
      toggleMap();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleMap]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;

    const render = () => {
      frame = requestAnimationFrame(render);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssWidth = canvas.clientWidth;
      const cssHeight = canvas.clientHeight;
      if (cssWidth === 0 || cssHeight === 0) return;

      if (canvas.width !== cssWidth * dpr || canvas.height !== cssHeight * dpr) {
        canvas.width = cssWidth * dpr;
        canvas.height = cssHeight * dpr;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      const { vehicle, traffic, mapExpanded } = useGame.getState();
      if (mapExpanded) drawRouteMap(ctx, cssWidth, cssHeight, vehicle);
      else drawRadar(ctx, cssWidth, cssHeight, vehicle, traffic.blips);
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [expanded]);

  if (!started) return null;

  return (
    <>
      <div
        className={
          expanded
            ? "pointer-events-none fixed inset-0 z-20 flex items-center justify-center bg-black/55 backdrop-blur-sm"
            : "pointer-events-none fixed bottom-6 right-6 z-10"
        }
      >
        <canvas
          ref={canvasRef}
          className={
            expanded
              ? "h-[76vmin] w-[76vmin] rounded-xl border border-white/15 shadow-2xl"
              : "rounded-full border-2 border-white/25 shadow-lg"
          }
          style={
            expanded
              ? undefined
              : { width: RADAR_SIZE, height: RADAR_SIZE }
          }
        />
      </div>

      {!expanded && (
        <div className="pointer-events-none fixed bottom-2 right-6 z-10 w-[200px] select-none text-center text-[11px] uppercase tracking-widest text-white/45">
          Tab · map
        </div>
      )}
    </>
  );
}

type Car = ReturnType<typeof useGame.getState>["vehicle"];

// ------------------------------------------------------------------ radar

/**
 * Put the canvas into world space, heading-up.
 *
 * World (x, z) maps to canvas (x, y) directly — +x right, +z down — which
 * already makes -z "up", the direction of travel at yaw 0. Rotating the
 * canvas by exactly `yaw` then keeps the car's heading pointing up for
 * every other yaw: the heading vector (-sin yaw, -cos yaw) is (0, -1)
 * rotated by yaw, so undoing that rotation is the whole transform.
 */
function applyRadarTransform(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  car: Car,
  scale: number
) {
  ctx.translate(cx, cy);
  ctx.rotate(car.yaw);
  ctx.scale(scale, scale);
  ctx.translate(-car.position.x, -car.position.z);
}

function drawRadar(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  car: Car,
  blips: ReturnType<typeof useGame.getState>["traffic"]["blips"]
) {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2;

  // Zoom out with speed so the look-ahead stays roughly constant in time
  // rather than in metres — at 100 km/h you want to see further.
  const range = 85 + Math.abs(car.speed) * 3.2;
  const scale = radius / range;
  const playerS = sFromZ(car.position.z);
  const urban = cityness(playerS);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = urban > 0.5 ? COLORS.groundCity : COLORS.ground;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  applyRadarTransform(ctx, cx, cy, car, scale);

  const from = playerS - range * 0.9;
  const to = playerS + range * 1.5;

  drawRoadBand(ctx, from, to, 6);
  if (urban > 0.15) drawBuildings(ctx, from, to);
  drawRouteLine(ctx, playerS, to, 3 / scale);

  ctx.restore();

  // Traffic, drawn unrotated at rotated positions so the blips stay legible.
  for (const blip of blips) {
    if (!blip.active) continue;
    const dx = blip.x - car.position.x;
    const dz = blip.z - car.position.z;
    if (Math.hypot(dx, dz) > range) continue;

    const [px, py] = rotate(dx * scale, dz * scale, car.yaw);
    ctx.fillStyle = blip.oncoming ? COLORS.oncoming : COLORS.traffic;
    ctx.beginPath();
    ctx.arc(cx + px, cy + py, blip.size > 3 ? 4 : 2.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Waypoint markers inside the radar circle.
  for (const w of WAYPOINTS) {
    const p = roadPoint(0, w.s);
    const dx = p.x - car.position.x;
    const dz = p.z - car.position.z;
    if (Math.hypot(dx, dz) > range) continue;
    const [px, py] = rotate(dx * scale, dz * scale, car.yaw);
    drawWaypointPin(ctx, cx + px, cy + py, w, 5);
  }

  drawPlayerArrow(ctx, cx, cy, 0);
  ctx.restore();

  // North pointer on the rim, so a heading-up map still tells you which way
  // you are actually facing.
  const [nx, ny] = rotate(0, -radius + 12, car.yaw);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", cx + nx, cy + ny);
}

/** Filled band between the two shoulder edges over a range of road. */
function drawRoadBand(
  ctx: CanvasRenderingContext2D,
  from: number,
  to: number,
  step: number
) {
  const half = roadHalfWidth();

  ctx.beginPath();
  for (let s = from; s <= to; s += step) {
    const p = roadPoint(-half, s);
    if (s === from) ctx.moveTo(p.x, p.z);
    else ctx.lineTo(p.x, p.z);
  }
  for (let s = to; s >= from; s -= step) {
    const p = roadPoint(half, s);
    ctx.lineTo(p.x, p.z);
  }
  ctx.closePath();
  ctx.fillStyle = COLORS.road;
  ctx.fill();
}

/** The road ahead, highlighted the way a satnav highlights your route. */
function drawRouteLine(
  ctx: CanvasRenderingContext2D,
  from: number,
  to: number,
  lineWidth: number
) {
  ctx.beginPath();
  for (let s = from; s <= to; s += 6) {
    const p = roadPoint(0, s);
    if (s === from) ctx.moveTo(p.x, p.z);
    else ctx.lineTo(p.x, p.z);
  }
  ctx.strokeStyle = COLORS.route;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.85;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Building footprints for whatever chunks the visible range touches. */
function drawBuildings(
  ctx: CanvasRenderingContext2D,
  from: number,
  to: number
) {
  const L = CONFIG.road.chunkLength;
  const first = Math.floor(from / L);
  const last = Math.floor(to / L);

  for (let index = first; index <= last; index++) {
    if (index < 0) continue;
    const city = cityFor(index);
    for (const b of city.buildings) {
      ctx.save();
      ctx.translate(b.x, b.z);
      // Building rot is a road yaw; on the map that is a plain rotation of
      // the footprint about its own centre.
      ctx.rotate(-b.rot);
      ctx.fillStyle = b.floors > 4 ? COLORS.buildingRoof : COLORS.building;
      ctx.fillRect(-b.width / 2, -b.depth / 2, b.width, b.depth);
      ctx.restore();
    }
  }
}

// -------------------------------------------------------------- route map

/**
 * The whole journey on one page: Dhading to Ratna Park, north up, fitted to
 * whatever square the overlay gives us.
 */
function drawRouteMap(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  car: Car
) {
  const padding = 46;
  const tail = 700; // a little of the city past the last waypoint
  const end = ROUTE_END + tail;

  // Bounds of the route in world space. The road wanders a long way
  // laterally, so this has to be measured rather than assumed.
  let minX = Infinity;
  let maxX = -Infinity;
  for (let s = 0; s <= end; s += 25) {
    const x = centerX(s);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  const worldW = Math.max(maxX - minX, 1);
  const worldH = end;

  const scale = Math.min(
    (width - padding * 2) / worldW,
    (height - padding * 2) / worldH
  );
  const offsetX = width / 2 - ((minX + maxX) / 2) * scale;
  // z runs from 0 down to -end, so centre on the midpoint of that span.
  const offsetY = height / 2 - (-end / 2) * scale;

  const toScreen = (x: number, z: number): [number, number] => [
    offsetX + x * scale,
    offsetY + z * scale,
  ];

  ctx.fillStyle = "#20241d";
  ctx.fillRect(0, 0, width, height);

  // The valley floor, so the city reads as a place rather than as the end
  // of a line.
  ctx.fillStyle = "rgba(90,84,62,0.35)";
  const cityTop = toScreen(minX - 200, -end)[1];
  ctx.fillRect(0, cityTop, width, toScreen(0, -3300)[1] - cityTop);

  // Route
  ctx.beginPath();
  for (let s = 0; s <= end; s += 15) {
    const p = roadPoint(0, s);
    const [px, py] = toScreen(p.x, p.z);
    if (s === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = "#4d5157";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.strokeStyle = COLORS.route;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Waypoints, with names — this is the map you actually read.
  ctx.font = "12px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  for (const w of WAYPOINTS) {
    const p = roadPoint(0, w.s);
    const [px, py] = toScreen(p.x, p.z);
    drawWaypointPin(ctx, px, py, w, 6);

    // Alternate sides so consecutive labels do not collide.
    const left = WAYPOINTS.indexOf(w) % 2 === 0;
    ctx.textAlign = left ? "right" : "left";
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.fillText(w.name, px + (left ? -12 : 12), py);
  }

  // Where you are, pointing where you are pointing.
  const [px, py] = toScreen(car.position.x, car.position.z);
  drawPlayerArrow(ctx, px, py, car.yaw, 9);

  // Title and scale bar.
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "600 15px system-ui, sans-serif";
  ctx.fillText("Prithvi Highway · Dhading → Kathmandu", 20, 26);

  const barMetres = 1000;
  const barPx = barMetres * scale;
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(20, height - 24);
  ctx.lineTo(20 + barPx, height - 24);
  ctx.stroke();
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.fillText("1 km", 20, height - 34);
}

// --------------------------------------------------------------- markers

function drawWaypointPin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: Waypoint,
  size: number
) {
  const fill =
    w.kind === "tunnel"
      ? "#b98cff"
      : w.kind === "bridge"
      ? "#6fc0ff"
      : w.kind === "checkpost"
      ? "#ff8f6b"
      : w.kind === "finish"
      ? "#6be09a"
      : COLORS.waypoint;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = fill;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 1.5;
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.strokeRect(-size / 2, -size / 2, size, size);
  ctx.restore();
}

function drawPlayerArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  yaw: number,
  size = 8
) {
  ctx.save();
  ctx.translate(x, y);
  // On the radar the world is already rotated, so yaw is 0 and the arrow
  // just points up; on the route map it carries the real heading.
  ctx.rotate(-yaw);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.72, size * 0.8);
  ctx.lineTo(0, size * 0.4);
  ctx.lineTo(-size * 0.72, size * 0.8);
  ctx.closePath();
  ctx.fillStyle = COLORS.player;
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 1.5;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** 2D rotation, matching the canvas convention (+y down, positive = CW). */
function rotate(x: number, y: number, a: number): [number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}
