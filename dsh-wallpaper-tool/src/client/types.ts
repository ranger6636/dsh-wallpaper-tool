/**
 * Shared types for Wallpaper Studio. This module is erased at build time for
 * everything except the few runtime constants at the bottom.
 */

export type WallpaperKind = 'image' | 'video' | 'effect';

export type EffectId = 'none' | 'aurora' | 'starfield' | 'particles' | 'waves' | 'rays' | 'rain';

export type MotionMode = 'none' | 'kenburns' | 'drift' | 'pulse';

export type FitMode = 'cover' | 'contain' | 'fill';

export type TransitionKind = 'fade' | 'zoom' | 'slide' | 'blur';

export type CarouselOrder = 'sequential' | 'shuffle';

/** Framing of one wallpaper: how the source is placed inside the viewport. */
export interface Framing {
  /** Horizontal focus, -1 (left edge) .. 1 (right edge); 0 centres. */
  x: number;
  /** Vertical focus, -1 (top edge) .. 1 (bottom edge); 0 centres. */
  y: number;
  /** Extra zoom on top of `fit`, 1 .. 4. */
  zoom: number;
  /** Degrees, -180 .. 180. */
  rotate: number;
  fit: FitMode;
}

/** A wallpaper in the library. Binary payloads live in IndexedDB under `assetId`. */
export interface WallpaperItem {
  id: string;
  kind: WallpaperKind;
  name: string;
  /** Key of the stored Blob for `image` / `video` items. */
  assetId: string | null;
  /** Which animated canvas effect this item paints, for `effect` items. */
  effectId: EffectId | null;
  /** Small data-URL preview used by the library grid. */
  thumb: string | null;
  /** Pixel size of the stored image, when known. */
  width: number | null;
  height: number | null;
  /** Duration in seconds for videos, when known. */
  duration: number | null;
  framing: Framing;
  createdAt: number;
}

/** How strongly the wallpaper bleeds through one pane of the application. */
export interface SurfaceRule {
  enabled: boolean;
  /** 0 = pane is fully transparent over the wallpaper, 100 = pane keeps its own fill. */
  opacity: number;
  /** Backdrop blur in px applied behind the pane. */
  blur: number;
}

export type SurfaceKey = 'sidebar' | 'content' | 'input' | 'menus';

export interface EffectSettings {
  id: EffectId;
  /** 0 .. 100 */
  intensity: number;
  speed: number;
  /** Any CSS colour; effects derive their palette from it. */
  color: string;
  /** Second colour for gradients; empty means "derive from `color`". */
  accent: string;
}

export interface MotionSettings {
  mode: MotionMode;
  /** 0 .. 100 */
  amount: number;
  /** 0.2 .. 4 */
  speed: number;
}

export interface CarouselSettings {
  enabled: boolean;
  /** Seconds between switches, 5 .. 3600. */
  intervalSec: number;
  order: CarouselOrder;
  transition: TransitionKind;
  /** Transition length in ms, 200 .. 4000. */
  durationMs: number;
  /** Wallpapers in the rotation; empty means "every item in the library". */
  ids: string[];
}

export interface SurfaceSettings {
  sidebar: SurfaceRule;
  content: SurfaceRule;
  input: SurfaceRule;
  menus: SurfaceRule;
  /** Extra darkening painted above the wallpaper, 0 .. 100. */
  scrim: number;
}

export interface AppearanceSettings {
  /** Wallpaper visibility, 0 .. 100. */
  opacity: number;
  /** Blur in px, 0 .. 60. */
  blur: number;
  /** Darkening painted over the wallpaper, 0 .. 100. */
  darken: number;
  /** 0 .. 200 (%) */
  brightness: number;
  /** 0 .. 200 (%) */
  saturate: number;
  /** Vignette strength, 0 .. 100. */
  vignette: number;
  /** Global wallpaper scale, 1 .. 2. */
  zoom: number;
  /** Global composition offset in viewport percent, -50 .. 50. */
  offsetX: number;
  offsetY: number;
}

export interface StudioSettings {
  /** Document revision; older documents are migrated on load (see normaliseSettings). */
  schemaVersion: number;
  enabled: boolean;
  activeId: string | null;
  appearance: AppearanceSettings;
  surfaces: SurfaceSettings;
  motion: MotionSettings;
  effect: EffectSettings;
  /** Paint the effect canvas over the current wallpaper, not only as a wallpaper item. */
  effectOverlay: boolean;
  carousel: CarouselSettings;
  /** Wallpapers shown in the library, in display order. */
  items: WallpaperItem[];
  /** Follow the OS "reduce motion" preference and pause animated backgrounds. */
  respectReducedMotion: boolean;
  /** Pause video / effect animation while the window is in the background. */
  pauseWhenHidden: boolean;
  /** Play uploaded videos with sound. Off by default (autoplay policy). */
  videoSound: boolean;
  /** Playback volume for videos, 0 .. 100. */
  videoVolume: number;
}

export interface StudioHost {
  settings: StudioSettings;
  subscribe(listener: () => void): () => void;
  update(patch: Partial<StudioSettings>): void;
  updateAppearance(patch: Partial<AppearanceSettings>): void;
  updateSurfaces(patch: Partial<SurfaceSettings>): void;
  updateSurface(key: SurfaceKey, patch: Partial<SurfaceRule>): void;
  updateMotion(patch: Partial<MotionSettings>): void;
  updateEffect(patch: Partial<EffectSettings>): void;
  updateCarousel(patch: Partial<CarouselSettings>): void;
  addFiles(files: File[]): Promise<void>;
  removeItem(id: string): Promise<void>;
  activate(id: string | null): void;
  cropItem(id: string, blob: Blob, size: { width: number; height: number }): Promise<void>;
  renameItem(id: string, name: string): void;
  reset(): void;
  openCrop(id: string): void;
  t(key: string, vars?: Record<string, string | number>): string;
}

export const SURFACE_KEYS: SurfaceKey[] = ['sidebar', 'content', 'input', 'menus'];

export const EFFECT_IDS: EffectId[] = ['none', 'aurora', 'starfield', 'particles', 'waves', 'rays', 'rain'];

/**
 * Plugin version, shown in the Advanced tab so a screenshot or a read-out says
 * which build is actually loaded in the page. `build.mjs` replaces the
 * placeholder with the version from package.json.
 */
export const PLUGIN_VERSION = '__PLUGIN_VERSION__';

/**
 * Settings document revision.
 * 1 → 2: the menus surface became functional (menu material, selector and the
 * elevated dialog/card layers are now overridden, and menus are on by default).
 * 2 → 3: the sidebar tint is applied through its own token again, with the
 * window frame neutralised separately instead of sharing that token.
 */
export const SETTINGS_VERSION = 3;

export const DB_NAME = 'dsh-wallpaper-studio';
export const DB_VERSION = 1;
export const STATE_KEY = 'studio-state';
export const ASSET_STORE = 'assets';
export const STATE_STORE = 'state';
/** Where the installation's own defaults live ("set current settings as default"). */
export const DEFAULTS_KEY = 'studio-defaults';
export const MAX_UPLOAD_BYTES = 320 * 1024 * 1024;
export const THUMB_WIDTH = 320;

export const SUPPORTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/bmp',
  'image/svg+xml',
];

export const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
