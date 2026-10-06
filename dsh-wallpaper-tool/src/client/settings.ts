/**
 * Default settings plus the small amount of normalisation every mutation goes
 * through, so a hand-edited or older stored document can never put the layer
 * into an impossible state.
 */
import { EFFECT_IDS, SETTINGS_VERSION, SURFACE_KEYS } from './types.js';
import type {
  AppearanceSettings,
  CarouselSettings,
  EffectId,
  EffectSettings,
  FitMode,
  Framing,
  MotionSettings,
  MotionMode,
  StudioSettings,
  SurfaceKey,
  SurfaceRule,
  SurfaceSettings,
  TransitionKind,
  CarouselOrder,
  WallpaperItem,
  WallpaperKind,
} from './types.js';

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return num < min ? min : num > max ? max : num;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function pick<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === 'string' && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

function colour(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  if (text === '') return fallback;
  // Accept #rgb / #rrggbb / #rrggbbaa and simple rgb()/hsl() colours only.
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text)) return text;
  if (/^(rgb|hsl)a?\([0-9.,%\s/]+\)$/i.test(text)) return text;
  return fallback;
}

export const FIT_MODES: FitMode[] = ['cover', 'contain', 'fill'];
export const MOTION_MODES: MotionMode[] = ['none', 'kenburns', 'drift', 'pulse'];
export const TRANSITIONS: TransitionKind[] = ['fade', 'zoom', 'slide', 'blur'];
export const CAROUSEL_ORDERS: CarouselOrder[] = ['sequential', 'shuffle'];
export const WALLPAPER_KINDS: WallpaperKind[] = ['image', 'video', 'effect'];

export function defaultFraming(): Framing {
  return { x: 0, y: 0, zoom: 1, rotate: 0, fit: 'cover' };
}

export function defaultRule(opacity: number, blur: number, enabled: boolean): SurfaceRule {
  return { enabled, opacity, blur };
}

export function defaultSettings(): StudioSettings {
  return defaultTemplate ? clone(defaultTemplate) : shippedDefaults();
}

/**
 * The defaults this installation ships with.
 *
 * Kept separate from `defaultSettings()` because the user can replace the
 * effective defaults with their own current settings ("把当前设置设为默认值"),
 * and the replacement has to be normalised against something stable.
 *
 * The values below are the owner's own setup, recovered from the installed
 * document and frozen as the shipped baseline: no dimming, full brightness and
 * saturation, 2× zoom, a slow push-in, no overlay effect, a two-minute carousel
 * and sound on for videos.
 */
export function shippedDefaults(): StudioSettings {
  return {
    schemaVersion: SETTINGS_VERSION,
    enabled: false,
    activeId: null,
    appearance: {
      opacity: 100,
      blur: 0,
      darken: 0,
      brightness: 200,
      saturate: 200,
      vignette: 0,
      zoom: 2,
      offsetX: 0,
      offsetY: 0,
    },
    surfaces: {
      // Panes default to translucent-over-wallpaper only once the user turns the
      // wallpaper on; 62 / 48 / 70 keep text readable on a busy photo, and the
      // menus sit higher still so popover text stays legible.
      sidebar: defaultRule(62, 18, true),
      content: defaultRule(48, 14, true),
      input: defaultRule(70, 22, true),
      menus: defaultRule(76, 20, true),
      scrim: 0,
    },
    motion: { mode: 'kenburns', amount: 36, speed: 2 },
    effect: { id: 'none', intensity: 100, speed: 1, color: '#4f8cff', accent: '#a86bff' },
    effectOverlay: true,
    carousel: {
      enabled: false,
      intervalSec: 120,
      order: 'sequential',
      transition: 'fade',
      durationMs: 1200,
      ids: [],
    },
    items: [],
    respectReducedMotion: true,
    pauseWhenHidden: true,
    videoSound: true,
    videoVolume: 100,
  };
}

/** When set, these replace the shipped defaults for this installation. */
let defaultTemplate: StudioSettings | null = null;

function clone(settings: StudioSettings): StudioSettings {
  return JSON.parse(JSON.stringify(settings)) as StudioSettings;
}

/**
 * Install (or clear) the installation's own defaults.
 *
 * The value is normalised with the template cleared, so it is validated against
 * the shipped defaults and can never be fed by itself.
 */
export function applyDefaultTemplate(value: unknown): void {
  if (value === null || value === undefined) {
    defaultTemplate = null;
    return;
  }
  const previous = defaultTemplate;
  defaultTemplate = null;
  try {
    defaultTemplate = normaliseSettings(value);
  } catch {
    defaultTemplate = previous;
  }
}

/** The installed template, or null while the shipped defaults are in effect. */
export function currentDefaultTemplate(): StudioSettings | null {
  return defaultTemplate ? clone(defaultTemplate) : null;
}

/** JSON of whatever a fresh install or "reset" would use right now. */
export function effectiveDefaultsJson(): string {
  return JSON.stringify(defaultSettings(), null, 1);
}

export function normaliseFraming(input: unknown): Framing {
  const source = (input ?? {}) as Partial<Framing>;
  return {
    x: clamp(source.x, -1, 1, 0),
    y: clamp(source.y, -1, 1, 0),
    zoom: clamp(source.zoom, 1, 4, 1),
    rotate: clamp(source.rotate, -180, 180, 0),
    fit: pick(source.fit, FIT_MODES, 'cover'),
  };
}

export function normaliseItem(input: unknown): WallpaperItem | null {
  const source = (input ?? {}) as Partial<WallpaperItem>;
  if (typeof source.id !== 'string' || source.id === '') return null;
  const kind = pick(source.kind, WALLPAPER_KINDS, 'image');
  const effectId = pick<EffectId>(source.effectId, EFFECT_IDS, 'aurora');
  return {
    id: source.id,
    kind,
    name: typeof source.name === 'string' && source.name.trim() !== '' ? source.name.trim() : kind,
    assetId: typeof source.assetId === 'string' && source.assetId !== '' ? source.assetId : null,
    effectId: kind === 'effect' ? effectId : null,
    thumb: typeof source.thumb === 'string' && source.thumb.startsWith('data:') ? source.thumb : null,
    width: typeof source.width === 'number' && source.width > 0 ? Math.round(source.width) : null,
    height: typeof source.height === 'number' && source.height > 0 ? Math.round(source.height) : null,
    duration: typeof source.duration === 'number' && source.duration > 0 ? source.duration : null,
    framing: normaliseFraming(source.framing),
    createdAt: typeof source.createdAt === 'number' ? source.createdAt : Date.now(),
  };
}

export function normaliseSettings(input: unknown): StudioSettings {
  const base = defaultSettings();
  const source = (input ?? {}) as Partial<StudioSettings>;
  const appearance = (source.appearance ?? {}) as Partial<AppearanceSettings>;
  const surfaces = (source.surfaces ?? {}) as Partial<SurfaceSettings>;
  const motion = (source.motion ?? {}) as Partial<MotionSettings>;
  const effect = (source.effect ?? {}) as Partial<EffectSettings>;
  const carousel = (source.carousel ?? {}) as Partial<CarouselSettings>;

  const rules = {} as SurfaceSettings;
  for (const key of SURFACE_KEYS) {
    const fallback = base.surfaces[key];
    const value = (surfaces[key] ?? {}) as Partial<SurfaceRule>;
    rules[key] = {
      enabled: bool(value.enabled, fallback.enabled),
      opacity: clamp(value.opacity, 0, 100, fallback.opacity),
      blur: clamp(value.blur, 0, 60, fallback.blur),
    };
  }
  rules.scrim = clamp(surfaces.scrim, 0, 100, base.surfaces.scrim);

  // v1 documents predate a working menus surface: its fill and blur tokens were
  // wrong and the card was off by default, so any stored value is the inert
  // default rather than a choice. Move them to the v2 defaults once.
  const version = typeof source.schemaVersion === 'number' ? source.schemaVersion : 1;
  if (version < SETTINGS_VERSION) rules.menus = { ...base.surfaces.menus };

  const items: WallpaperItem[] = [];
  if (Array.isArray(source.items)) {
    for (const raw of source.items) {
      const item = normaliseItem(raw);
      if (item) items.push(item);
    }
  }

  const ids = Array.isArray(carousel.ids) ? carousel.ids.filter((id): id is string => typeof id === 'string') : [];
  const activeId = typeof source.activeId === 'string' && items.some((item) => item.id === source.activeId)
    ? source.activeId
    : null;

  return {
    schemaVersion: SETTINGS_VERSION,
    enabled: bool(source.enabled, base.enabled),
    activeId,
    appearance: {
      opacity: clamp(appearance.opacity, 0, 100, base.appearance.opacity),
      blur: clamp(appearance.blur, 0, 60, base.appearance.blur),
      darken: clamp(appearance.darken, 0, 100, base.appearance.darken),
      brightness: clamp(appearance.brightness, 0, 200, base.appearance.brightness),
      saturate: clamp(appearance.saturate, 0, 200, base.appearance.saturate),
      vignette: clamp(appearance.vignette, 0, 100, base.appearance.vignette),
      zoom: clamp(appearance.zoom, 1, 2, base.appearance.zoom),
      offsetX: clamp(appearance.offsetX, -50, 50, base.appearance.offsetX),
      offsetY: clamp(appearance.offsetY, -50, 50, base.appearance.offsetY),
    },
    surfaces: rules,
    motion: {
      mode: pick(motion.mode, MOTION_MODES, base.motion.mode),
      amount: clamp(motion.amount, 0, 100, base.motion.amount),
      speed: clamp(motion.speed, 0.2, 4, base.motion.speed),
    },
    effect: {
      id: pick<EffectId>(effect.id, EFFECT_IDS, base.effect.id),
      intensity: clamp(effect.intensity, 0, 100, base.effect.intensity),
      speed: clamp(effect.speed, 0.2, 4, base.effect.speed),
      color: colour(effect.color, base.effect.color),
      accent: colour(effect.accent, base.effect.accent),
    },
    effectOverlay: bool(source.effectOverlay, base.effectOverlay),
    carousel: {
      enabled: bool(carousel.enabled, base.carousel.enabled),
      intervalSec: clamp(carousel.intervalSec, 5, 3600, base.carousel.intervalSec),
      order: pick(carousel.order, CAROUSEL_ORDERS, base.carousel.order),
      transition: pick(carousel.transition, TRANSITIONS, base.carousel.transition),
      durationMs: clamp(carousel.durationMs, 200, 4000, base.carousel.durationMs),
      ids: ids.filter((id) => items.some((item) => item.id === id)),
    },
    items,
    respectReducedMotion: bool(source.respectReducedMotion, base.respectReducedMotion),
    pauseWhenHidden: bool(source.pauseWhenHidden, base.pauseWhenHidden),
    videoSound: bool(source.videoSound, base.videoSound),
    videoVolume: clamp(source.videoVolume, 0, 100, base.videoVolume),
  };
}

/** Wallpapers eligible for the rotation, in carousel order. */
export function rotationPool(settings: StudioSettings): WallpaperItem[] {
  const pool = settings.carousel.ids.length > 0
    ? settings.items.filter((item) => settings.carousel.ids.includes(item.id))
    : settings.items.slice();
  return pool.filter((item) => item.kind !== 'effect' || item.effectId !== null);
}

export function findItem(settings: StudioSettings, id: string | null): WallpaperItem | null {
  if (!id) return null;
  return settings.items.find((item) => item.id === id) ?? null;
}
