/**
 * Time of day and weather
 * =======================
 * The atmospheric counterpart to `journey.ts`. That file turns *distance*
 * along the route into smooth 0→1 signals — `cityness`, `mountainness` —
 * and every system multiplies by them rather than branching on a stage.
 * This file does exactly the same thing with *time*.
 *
 * So there is no `isNight` anywhere. There is `SKY.daylight`, which is 1 at
 * noon and 0 after dark and spends twenty minutes in between, and there is
 * `SKY.lamps`, which is what the street lighting and the headlights read.
 * Dusk is then a gradient rather than a switch, which is the only way it
 * ever looks right: the lamps flicker on while there is still light in the
 * sky, and that overlap *is* dusk.
 *
 * Two objects, mirroring the split in `stores/useGame.ts`:
 *
 *   CLOCK  what the player sets — the time, the rate it runs at, which
 *          weather is rolling in, whether the lights are forced.
 *   SKY    what falls out of that each frame. Derived, mutated in place,
 *          read by everything, subscribed to by nothing.
 *
 * `advance(dt)` is called once per frame by <Weather/>, before every other
 * system runs, so they all see the same sky on the same frame.
 */

/**
 * Kathmandu, 27.7°N.
 *
 * The sun path below is built from this rather than being a hand-drawn arc,
 * which costs about six lines and buys the real thing: the sun rises due
 * east, crosses at 62° — high, but never overhead, so shadows always have a
 * direction — and sets due west. Driving north to Kathmandu that puts the
 * morning sun on your right and the evening sun on your left, which is what
 * the drive actually looks like.
 */
const LATITUDE = (27.7 * Math.PI) / 180;

/** Solar declination. Zero is the equinox — good enough, and it makes the
 *  day exactly twelve hours, which is easy to reason about. */
const DECLINATION = 0;

const DEG = Math.PI / 180;

// ---------------------------------------------------------------- presets

export interface WeatherPreset {
  name: string;
  /** How hard it is raining, 0..1. */
  rain: number;
  /**
   * Airborne particulate, 0..1 — separate from rain because in Kathmandu it
   * usually is. The winter inversion traps brick-kiln smoke under the valley
   * rim and the hills disappear behind it without a drop falling.
   */
  haze: number;
}

export const WEATHER: WeatherPreset[] = [
  { name: "Clear", rain: 0, haze: 0.05 },
  { name: "Hazy", rain: 0, haze: 0.62 },
  { name: "Rain", rain: 0.5, haze: 0.45 },
  { name: "Monsoon", rain: 1, haze: 0.8 },
];

export const TIME_PRESETS: { name: string; hour: number }[] = [
  { name: "Dawn", hour: 5.7 },
  { name: "Morning", hour: 8.5 },
  { name: "Noon", hour: 12.4 },
  { name: "Golden hour", hour: 17.2 },
  { name: "Dusk", hour: 18.5 },
  { name: "Night", hour: 21.5 },
];

/** Headlight switch, exactly as the stalk works: auto, on, off. */
export enum Lights {
  Auto = 0,
  On = 1,
  Off = 2,
}

export const LIGHT_MODE_NAMES: Record<Lights, string> = {
  [Lights.Auto]: "auto",
  [Lights.On]: "on",
  [Lights.Off]: "off",
};

// ------------------------------------------------------------------ state

export const CLOCK = {
  /** Time of day, 0..24. Starts late afternoon: the light is at its best
   *  and the drive reaches Kathmandu around dusk. */
  hour: 16.4,
  /**
   * Simulated minutes per real second. At 40 a full day takes 36 minutes,
   * which is long enough that the light does not visibly slide during a
   * corner and short enough that a drive from Dhading arrives at a
   * different time of day than it set off in. 0 freezes the sky.
   */
  rate: 40,
  /** Index into WEATHER — what the sky is heading toward. */
  weather: 0,
  lights: Lights.Auto,

  // ---- Damped toward the preset, so weather rolls in rather than cuts ----
  rain: 0,
  haze: 0.05,
  /**
   * How wet the road is. Rises with the rain and falls far slower, because
   * asphalt does: a shower that stops does not leave a dry road, and the
   * ten minutes afterwards are the ones that catch people out. This is the
   * value the tyres read, not `rain`.
   */
  wetness: 0,
};

/**
 * Everything derived from the clock, recomputed each frame and mutated in
 * place. Read it, never write it.
 */
export const SKY = {
  /** Sun altitude above the horizon (rad). Negative after sunset. */
  altitude: 0,
  /** Unit vector pointing at the sun, in world axes (+X east, −Z north). */
  x: 0,
  y: 1,
  z: 0,
  /** Same for the moon, which is simply put opposite the sun. */
  moonX: 0,
  moonY: -1,
  moonZ: 0,

  /**
   * How far the sun is up, 0..1, crossing over through twilight. Weather
   * does not touch it — this is astronomy, and it is what colours are
   * blended by: an overcast afternoon is grey, not dusk-coloured.
   */
  sunlit: 1,
  /** 1 − sunlit. */
  night: 0,
  /**
   * How much light is actually arriving: `sunlit`, with cloud taken off.
   * This is what the lights are driven by, and it is deliberately *not*
   * what the colours are. Confusing the two is what makes a rainy midday
   * in a game look like nine in the evening.
   */
  daylight: 1,
  /** How on the street lighting is. Leads `night` — lamps beat the dark. */
  lamps: 0,
  /** 1 when the sun is low and warm, 0 when it is high or gone. */
  golden: 0,
  /** How flat and grey the light is: haze and rain together. */
  overcast: 0,
  /** Whether the car's own lights are on, honouring the stalk. */
  headlights: 0,
};

// -------------------------------------------------------------- sun path

/**
 * Solar altitude and azimuth for a time of day, from the standard hour-angle
 * formulae at `LATITUDE`.
 *
 * Azimuth comes back measured from north, turning east — the convention
 * everyone else uses — and `advance` is the only place it gets converted
 * into the world's axes.
 */
export function sunPosition(hour: number): { altitude: number; azimuth: number } {
  // 15° per hour, zero at solar noon.
  const H = (hour - 12) * 15 * DEG;

  const sinAlt =
    Math.sin(LATITUDE) * Math.sin(DECLINATION) +
    Math.cos(LATITUDE) * Math.cos(DECLINATION) * Math.cos(H);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

  const cosAlt = Math.cos(altitude);
  // Guard the poles of the formula: at the zenith azimuth is undefined, and
  // at 27.7°N we get close enough to it in June to care.
  const denom = Math.max(1e-4, Math.cos(LATITUDE) * cosAlt);
  const cosAz = (Math.sin(DECLINATION) - Math.sin(LATITUDE) * sinAlt) / denom;
  const sinAz = (-Math.sin(H) * Math.cos(DECLINATION)) / Math.max(1e-4, cosAlt);

  return {
    altitude,
    azimuth: Math.atan2(sinAz, Math.max(-1, Math.min(1, cosAz))),
  };
}

const smoothstep = (t: number) => {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
};

/** Smooth 0 → 1 as `v` crosses from `a` to `b`. */
const ramp = (v: number, a: number, b: number) => smoothstep((v - a) / (b - a));

// -------------------------------------------------------------- the tick

export function advance(dt: number) {
  // ---- Move the clock ----
  if (CLOCK.rate !== 0) {
    CLOCK.hour = (CLOCK.hour + (CLOCK.rate * dt) / 60) % 24;
    if (CLOCK.hour < 0) CLOCK.hour += 24;
  }

  // ---- Weather rolls in ----
  const target = WEATHER[CLOCK.weather] ?? WEATHER[0];
  // Rain arrives quicker than it leaves, the way a squall does.
  const rainRate = target.rain > CLOCK.rain ? 0.35 : 0.22;
  CLOCK.rain += (target.rain - CLOCK.rain) * Math.min(1, rainRate * dt);
  CLOCK.haze += (target.haze - CLOCK.haze) * Math.min(1, 0.25 * dt);

  // Wet asphalt: soaks in about half a minute, takes several to dry. The
  // asymmetry is the whole point — the road stays slippery long after the
  // sky has cleared, and those are the minutes that catch people out.
  const soak = CLOCK.rain > CLOCK.wetness ? 0.12 : 0.008;
  CLOCK.wetness += (CLOCK.rain - CLOCK.wetness) * Math.min(1, soak * dt);
  CLOCK.wetness = Math.max(0, Math.min(1, CLOCK.wetness));

  // ---- Where the sun is ----
  const { altitude, azimuth } = sunPosition(CLOCK.hour);
  SKY.altitude = altitude;

  const cosAlt = Math.cos(altitude);
  // North is −Z (the direction of travel toward Kathmandu) and east is +X,
  // so an azimuth measured from north turning east lands like this.
  SKY.x = cosAlt * Math.sin(azimuth);
  SKY.y = Math.sin(altitude);
  SKY.z = -cosAlt * Math.cos(azimuth);

  // The moon opposite, which is only true at full moon — but a moon that
  // rises with the sun would be no use to anyone driving at night.
  SKY.moonX = -SKY.x;
  SKY.moonY = -SKY.y;
  SKY.moonZ = -SKY.z;

  // ---- What that light is like ----
  const alt = altitude / DEG; // degrees, easier to reason about

  // Civil twilight runs to −6°; the sky is properly bright by about +4°.
  // Overcast eats the top of the range, so a monsoon afternoon never gets
  // the full value — which is the whole reason it feels like dusk all day.
  const overcast = Math.min(1, CLOCK.haze * 0.55 + CLOCK.rain * 0.75);
  SKY.overcast = overcast;
  const sunlit = ramp(alt, -6.5, 4);
  SKY.sunlit = sunlit;
  SKY.night = 1 - sunlit;
  SKY.daylight = sunlit * (1 - 0.35 * overcast);

  // Lamps lead the dark: they are on well before the sky has finished
  // going out, and under a monsoon sky they come on in the afternoon.
  SKY.lamps = Math.max(1 - ramp(alt, 0, 9), overcast > 0.75 ? 0.55 : 0);

  // The warm low sun, both ends of the day. Zero once it is properly up,
  // zero once it is properly gone, and killed by cloud.
  SKY.golden = ramp(alt, -5, 1.5) * (1 - ramp(alt, 4, 17)) * (1 - overcast * 0.8);

  // ---- The stalk ----
  SKY.headlights =
    CLOCK.lights === Lights.On
      ? 1
      : CLOCK.lights === Lights.Off
        ? 0
        : Math.max(SKY.lamps, CLOCK.rain > 0.25 ? 1 : 0);
}

// ------------------------------------------------------------------ misc

/** "16:24", for the HUD. */
export function clockLabel(hour = CLOCK.hour): string {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function weatherName(): string {
  return (WEATHER[CLOCK.weather] ?? WEATHER[0]).name;
}

/** Step to the next weather preset. Returns its name. */
export function cycleWeather(): string {
  CLOCK.weather = (CLOCK.weather + 1) % WEATHER.length;
  return weatherName();
}

/**
 * Jump to the next time-of-day preset — the one after the current hour,
 * wrapping. Scrubbing forward through the day, rather than a fixed list
 * position, so it does the obvious thing whatever the clock is doing.
 */
export function cycleTime(): string {
  const next =
    TIME_PRESETS.find((p) => p.hour > CLOCK.hour + 0.05) ?? TIME_PRESETS[0];
  CLOCK.hour = next.hour;
  return next.name;
}

export function cycleLights(): Lights {
  CLOCK.lights = (CLOCK.lights + 1) % 3;
  return CLOCK.lights;
}
