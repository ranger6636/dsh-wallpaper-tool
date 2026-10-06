/**
 * The controller: owns settings state, the wallpaper layer, blob lifetimes and
 * the carousel clock, and is the single object the UI talks to.
 *
 * It is deliberately free of React so the same object can be driven by the
 * Settings page, by the quick panel, and by headless tests.
 */
import { WallpaperLayer } from './layer.js';
import { deleteAsset, getAsset, isPersistent, loadDefaultTemplate, loadSettings, putAsset, saveDefaultTemplate, saveSettings } from './store.js';
import { probeImage, probeVideo } from './media.js';
import { defaultFraming, applyDefaultTemplate, currentDefaultTemplate, defaultSettings, effectiveDefaultsJson, findItem, normaliseSettings, rotationPool } from './settings.js';
import { applySurfaceVars, bindLayer, measurePaneRects, onPaneResize, releaseAppRoot, resetTokenCache, watchTheme } from './theme.js';
import { MAX_UPLOAD_BYTES, SUPPORTED_IMAGE_TYPES, SUPPORTED_VIDEO_TYPES, SURFACE_KEYS, THUMB_WIDTH } from './types.js';
import type {
  AppearanceSettings,
  CarouselSettings,
  EffectSettings,
  MotionSettings,
  StudioSettings,
  SurfaceKey,
  SurfaceRule,
  SurfaceSettings,
  TransitionKind,
  WallpaperItem,
} from './types.js';
import { detectLang, translate } from './i18n.js';
import type { Lang } from './i18n.js';
import type { Probe } from './media.js';

export type Notice = { kind: 'info' | 'error'; message: string };

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `wp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isImageFile(file: File): boolean {
  if (SUPPORTED_IMAGE_TYPES.includes(file.type)) return true;
  return /\.(png|jpe?g|webp|gif|avif|bmp|svg)$/i.test(file.name);
}

// MKV is deliberately absent: Chromium (and therefore the Harness Web UI, in the
// browser and in Desktop) ships no Matroska demuxer, so such a file would be
// accepted and then never play. Everything listed here is decodable when its
// codec is one Chromium supports.
function isVideoFile(file: File): boolean {
  if (SUPPORTED_VIDEO_TYPES.includes(file.type)) return true;
  return /\.(mp4|m4v|webm|ogv|mov)$/i.test(file.name);
}

/** Probe helpers that turn a decoder failure into `null` instead of a throw. */
async function safeProbeImage(file: Blob): Promise<Probe | null> {
  try {
    return await probeImage(file, THUMB_WIDTH);
  } catch (error) {
    console.warn('[wallpaper-studio] image probe failed', error);
    return null;
  }
}

async function safeProbeVideo(file: Blob): Promise<Probe | null> {
  try {
    const probe = await probeVideo(file, THUMB_WIDTH, 8000);
    return probe.width > 0 ? probe : null;
  } catch (error) {
    console.warn('[wallpaper-studio] video probe failed', error);
    return null;
  }
}

export class Studio {
  settings: StudioSettings = defaultSettings();
  readonly layer: WallpaperLayer;
  readonly lang: Lang;
  private listeners = new Set<() => void>();
  private urls = new Map<string, string>();
  private carouselTimer = 0;
  /** Shared re-entrancy guard for the manual "next" button and the carousel tick. */
  private navigating = false;
  private started = false;
  private disposers: (() => void)[] = [];
  private noticeListeners = new Set<(notice: Notice) => void>();
  private ready: Promise<void>;
  private mediaQuery: MediaQueryList | null = null;
  private reducedMotion = false;
  private autoplayNoticeShown = false;
  private disposed = false;

  constructor() {
    this.layer = new WallpaperLayer();
    this.lang = detectLang();
    this.layer.onAutoplayBlocked = () => {
      if (this.autoplayNoticeShown) return;
      this.autoplayNoticeShown = true;
      this.notice('info', this.t('advanced.soundBlocked'));
    };
    this.ready = this.boot();
  }

  t(key: string, vars?: Record<string, string | number>): string {
    return translate(this.lang, key, vars);
  }

  get whenReady(): Promise<void> {
    return this.ready;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onNotice(listener: (notice: Notice) => void): () => void {
    this.noticeListeners.add(listener);
    return () => this.noticeListeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error('[wallpaper-studio] listener failed', error);
      }
    }
  }

  private notice(kind: 'info' | 'error', message: string): void {
    for (const listener of this.noticeListeners) {
      try {
        listener({ kind, message });
      } catch {
        /* ignore */
      }
    }
  }

  private async boot(): Promise<void> {
    // The installation's own defaults are installed *first*: the stored document
    // is normalised against them, which is what makes them the defaults.
    applyDefaultTemplate(await loadDefaultTemplate());
    const stored = await loadSettings();
    // The plugin can be unloaded while settings are still loading; nothing below
    // may touch a disposed controller.
    if (this.disposed) return;
    this.settings = normaliseSettings(stored);
    if (typeof document !== 'undefined' && document.body) document.body.appendChild(this.layer.element);
    bindLayer(this.layer.element);
    onPaneResize(() => this.applyThemeVars());
    // Size the effect canvas before the first paint: it is measured from its own
    // box, and the layer is display:none until it is switched on, so a wallpaper
    // enabled at boot would otherwise start with a 0×0 canvas and draw nothing.
    this.layer.resize();
    this.applyAll();
    this.applyThemeVars();
    this.disposers.push(watchTheme(() => this.applyThemeChange()));

    const onVisibility = () => {
      const hidden = document.visibilityState === 'hidden';
      if (this.settings.pauseWhenHidden) this.layer.setPaused(hidden);
      if (!hidden) this.scheduleCarousel();
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.disposers.push(() => document.removeEventListener('visibilitychange', onVisibility));

    const onResize = () => this.layer.resize();
    window.addEventListener('resize', onResize);
    this.disposers.push(() => window.removeEventListener('resize', onResize));

    const onKey = (event: KeyboardEvent) => {
      if (event.altKey && !event.ctrlKey && !event.metaKey && (event.key === 'b' || event.key === 'B')) {
        event.preventDefault();
        this.update({ enabled: !this.settings.enabled });
      }
    };
    window.addEventListener('keydown', onKey);
    this.disposers.push(() => window.removeEventListener('keydown', onKey));

    if (typeof window.matchMedia === 'function') {
      this.mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion = this.settings.respectReducedMotion && this.mediaQuery.matches;
      const onChange = () => {
        this.reducedMotion = this.settings.respectReducedMotion && (this.mediaQuery?.matches ?? false);
        this.applyAll();
      };
      if (typeof this.mediaQuery.addEventListener === 'function') {
        this.mediaQuery.addEventListener('change', onChange);
        this.disposers.push(() => this.mediaQuery?.removeEventListener('change', onChange));
      }
    }

    this.started = true;
    await this.showActive(false);
    if (this.disposed) return;
    this.scheduleCarousel();
  }

  destroy(): void {
    this.disposed = true;
    for (const dispose of this.disposers) {
      try {
        dispose();
      } catch {
        /* ignore */
      }
    }
    this.disposers = [];
    window.clearTimeout(this.carouselTimer);
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
    this.layer.destroy();
    releaseAppRoot();
    this.listeners.clear();
  }

  // ---------------------------------------------------------------- mutations

  update(patch: Partial<StudioSettings>): void {
    const before = this.settings;
    this.settings = normaliseSettings({ ...this.settings, ...patch });
    this.commit(before);
  }

  updateAppearance(patch: Partial<AppearanceSettings>): void {
    this.update({ appearance: { ...this.settings.appearance, ...patch } });
  }

  updateSurfaces(patch: Partial<SurfaceSettings>): void {
    this.update({ surfaces: { ...this.settings.surfaces, ...patch } });
  }

  updateSurface(key: SurfaceKey, patch: Partial<SurfaceRule>): void {
    this.updateSurfaces({ [key]: { ...this.settings.surfaces[key], ...patch } } as Partial<SurfaceSettings>);
  }

  updateMotion(patch: Partial<MotionSettings>): void {
    this.update({ motion: { ...this.settings.motion, ...patch } });
  }

  updateEffect(patch: Partial<EffectSettings>): void {
    this.update({ effect: { ...this.settings.effect, ...patch } });
  }

  updateCarousel(patch: Partial<CarouselSettings>): void {
    this.update({ carousel: { ...this.settings.carousel, ...patch } });
  }

  activate(id: string | null): void {
    this.update({ activeId: id });
  }

  renameItem(id: string, name: string): void {
    const items = this.settings.items.map((item) => (item.id === id ? { ...item, name: name.trim() || item.name } : item));
    this.update({ items });
  }

  setFraming(id: string, framing: WallpaperItem['framing']): void {
    const items = this.settings.items.map((item) => (item.id === id ? { ...item, framing } : item));
    this.update({ items });
  }

  async cropItem(id: string, blob: Blob, size: { width: number; height: number }): Promise<void> {
    const item = findItem(this.settings, id);
    if (!item) return;
    const assetId = newId();
    await putAsset(assetId, blob);
    const previous = item.assetId;
    const items = this.settings.items.map((entry) =>
      entry.id === id
        ? { ...entry, assetId, width: size.width, height: size.height, framing: { ...defaultFraming() } }
        : entry,
    );
    if (previous && previous !== assetId && !items.some((entry) => entry.assetId === previous)) {
      await deleteAsset(previous);
      const url = this.urls.get(previous);
      if (url) {
        URL.revokeObjectURL(url);
        this.urls.delete(previous);
      }
    }
    this.update({ items });
    if (this.settings.activeId === id) await this.showActive(true);
    this.notice('info', this.t('crop.saved'));
  }

  async addFiles(files: File[]): Promise<void> {
    if (files.length === 0) return;
    const added: WallpaperItem[] = [];
    for (const file of files) {
      if (file.size > MAX_UPLOAD_BYTES) {
        this.notice('error', this.t('common.tooLarge', { name: file.name }));
        continue;
      }

      // Chromium — not this plugin's MIME list — is the authority on what can be
      // decoded, so every file is probed before it is judged. That keeps an
      // unusual extension or an empty `file.type` (common when a file does not
      // come from the OS picker) from being rejected out of hand.
      const hint = isVideoFile(file) ? 'video' : isImageFile(file) ? 'image' : 'unknown';
      let kind: 'image' | 'video' | null = null;
      let probe: Probe | null = null;

      if (hint !== 'image') {
        const videoProbe = await safeProbeVideo(file);
        if (videoProbe && videoProbe.width > 0) {
          probe = videoProbe;
          kind = 'video';
        }
      }
      if (kind === null && hint !== 'video') {
        const imageProbe = await safeProbeImage(file);
        if (imageProbe) {
          probe = imageProbe;
          kind = 'image';
        }
      }
      if (kind === null || probe === null) {
        // Neither a decodable image nor a decodable video: report the file by
        // name instead of a blanket "unsupported type".
        this.notice('error', this.t('common.undecodable', { name: file.name }));
        continue;
      }

      try {
        const assetId = newId();
        await putAsset(assetId, file);
        added.push({
          id: newId(),
          kind,
          name: file.name.replace(/\.[^.]+$/, '') || (kind === 'video' ? 'video' : 'image'),
          assetId,
          effectId: null,
          thumb: probe.thumb,
          width: probe.width || null,
          height: probe.height || null,
          duration: probe.duration,
          framing: defaultFraming(),
          createdAt: Date.now(),
        });
      } catch (error) {
        // Storage failure is not a format problem; say so instead of blaming the
        // file, which is what hid the real cause of a broken IndexedDB call.
        console.error('[wallpaper-studio] could not store the wallpaper', error);
        this.notice('error', this.t('common.storeFailed', { name: file.name }));
      }
    }
    if (added.length === 0) return;
    const items = [...this.settings.items, ...added];
    const activeId = this.settings.activeId ?? added[0].id;
    const enabled = this.settings.enabled || this.settings.activeId === null;
    // `update` → `commit` already repaints when the active wallpaper changes,
    // which is exactly the case here; repainting again would decode the same
    // blob twice for nothing.
    this.update({ items, activeId, enabled });
    this.notice('info', this.t('common.added'));
  }

  addEffectItem(): void {
    const effect = this.settings.effect;
    const item: WallpaperItem = {
      id: newId(),
      kind: 'effect',
      name: this.t(`effect.${effect.id}`),
      assetId: null,
      effectId: effect.id,
      thumb: null,
      width: null,
      height: null,
      duration: null,
      framing: defaultFraming(),
      createdAt: Date.now(),
    };
    const items = [...this.settings.items, item];
    this.update({ items, enabled: true });
    this.notice('info', this.t('common.added'));
  }

  async removeItem(id: string): Promise<void> {
    const item = findItem(this.settings, id);
    if (!item) return;
    const items = this.settings.items.filter((entry) => entry.id !== id);
    const activeId = this.settings.activeId === id ? (items[0]?.id ?? null) : this.settings.activeId;
    if (item.assetId) {
      await deleteAsset(item.assetId);
      const url = this.urls.get(item.assetId);
      if (url) {
        URL.revokeObjectURL(url);
        this.urls.delete(item.assetId);
      }
    }
    // Removing the active wallpaper changes `activeId`, so `commit` repaints;
    // removing any other one does not change what is on screen.
    this.update({
      items,
      activeId,
      carousel: { ...this.settings.carousel, ids: this.settings.carousel.ids.filter((entry) => entry !== id) },
    });
    this.notice('info', this.t('common.removed'));
  }

  async reset(): Promise<void> {
    for (const item of this.settings.items) {
      if (item.assetId) await deleteAsset(item.assetId);
    }
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
    const items: WallpaperItem[] = [];
    // `defaultSettings()` is the installation's own defaults when one is set, so
    // "reset" restores what the user saved as their default, not the shipped one.
    this.update({ ...defaultSettings(), items });
    await this.showActive(true);
  }

  /**
   * Make the settings that are on screen right now the installation's defaults.
   *
   * They are persisted separately from the working copy, so a later "reset"
   * (and any field a future version adds) falls back to them.
   */
  async saveCurrentAsDefaults(): Promise<void> {
    const snapshot: StudioSettings = JSON.parse(JSON.stringify({ ...this.settings, items: [], activeId: null }));
    // Install it in memory first so the panel and `reset` see it immediately; the
    // write is what carries it across restarts.
    applyDefaultTemplate(snapshot);
    await saveDefaultTemplate(snapshot);
    this.notice('info', this.t('defaults.saved'));
    this.notify();
  }

  /** Drop the installation's own defaults and go back to the shipped ones. */
  async clearCustomDefaults(): Promise<void> {
    applyDefaultTemplate(null);
    await saveDefaultTemplate(null);
    this.notice('info', this.t('defaults.cleared'));
    this.notify();
  }

  /** Whether an installation default is installed, and its JSON for export. */
  defaultsInfo(): { custom: boolean; json: string } {
    return { custom: currentDefaultTemplate() !== null, json: effectiveDefaultsJson() };
  }

  /**
   * Advance to the next wallpaper in the rotation pool.
   *
   * `next()` (the manual button) and the carousel timer share this path and one
   * re-entrancy guard, so rapid clicks — or a click landing on a timer tick —
   * can never start two overlapping transitions or write the settings twice.
   */
  private async stepToNext(useCarouselTransition: boolean): Promise<void> {
    if (this.navigating || this.disposed) return;
    const pool = rotationPool(this.settings);
    if (pool.length < 2) {
      // Nothing to rotate through; still restart the clock so a later change
      // to the library or the interval is honoured.
      this.scheduleCarousel();
      return;
    }
    this.navigating = true;
    try {
      const currentIndex = pool.findIndex((item) => item.id === this.settings.activeId);
      let nextIndex: number;
      if (this.settings.carousel.order === 'shuffle' && pool.length > 1) {
        nextIndex = Math.floor(Math.random() * (pool.length - 1));
        if (nextIndex >= currentIndex) nextIndex += 1;
      } else {
        nextIndex = (currentIndex + 1 + pool.length) % pool.length;
      }
      const target = pool[nextIndex];
      if (!target || target.id === this.settings.activeId) return;
      this.settings = normaliseSettings({ ...this.settings, activeId: target.id });
      await this.showActive(true, useCarouselTransition ? this.settings.carousel.transition : 'fade');
      if (this.disposed) return;
      await saveSettings(this.settings);
      this.notify();
    } finally {
      this.navigating = false;
      this.scheduleCarousel();
    }
  }

  /** Manual "next wallpaper" (sidebar quick panel, carousel tab). */
  async next(): Promise<void> {
    await this.stepToNext(this.settings.carousel.enabled);
  }

  // ------------------------------------------------------------------ runtime

  private commit(before: StudioSettings): void {
    if (this.disposed) return;
    this.applyAll();
    this.applyThemeVars();
    void saveSettings(this.settings);
    if (before.activeId !== this.settings.activeId || before.enabled !== this.settings.enabled) {
      void this.showActive(true);
    }
    this.scheduleCarousel();
    this.notify();
  }

  private applyAll(): void {
    this.layer.applyAppearance(this.settings.appearance);
    this.layer.applySurfaces(this.settings.surfaces);
    this.layer.applyMotion(this.settings.motion, this.reducedMotion || (this.settings.respectReducedMotion && this.isReducedMotion()));
    this.layer.setVideoSound(this.settings.videoSound, this.settings.videoVolume);
    const active = findItem(this.settings, this.settings.activeId);
    const effectItem = active !== null && active.kind === 'effect';
    const effectSettings = effectItem && active.effectId ? { ...this.settings.effect, id: active.effectId } : this.settings.effect;
    const effectVisible = effectSettings.id !== 'none' && (effectItem || this.settings.effectOverlay);
    this.layer.applyEffect(effectSettings, this.settings.enabled && effectVisible);
    this.layer.setReducedMotion(this.settings.respectReducedMotion && this.isReducedMotion());
    this.layer.setEnabled(this.settings.enabled);
  }

  private isReducedMotion(): boolean {
    if (this.mediaQuery) return this.mediaQuery.matches;
    return this.reducedMotion;
  }

  private applyThemeVars(): void {
    applySurfaceVars(this.settings);
    this.applyFrost();
  }

  /**
   * Re-resolve everything after a palette switch.
   *
   * Token colours are read once and cached (a second pass would otherwise read
   * back what this plugin wrote), so a light/dark switch has to drop that cache
   * or the new palette keeps the old palette's tints.
   */
  private applyThemeChange(): void {
    resetTokenCache();
    this.applyThemeVars();
  }

  /**
   * Re-measure the panes and hand the geometry to the layer, which draws the
   * frost. Called after every settings change, on theme switches and whenever a
   * measured pane resizes (sidebar collapse, right panel toggle, …).
   */
  private applyFrost(): void {
    if (!this.settings.enabled) {
      this.layer.applyFrost({});
      return;
    }
    const blur: Record<SurfaceKey, number> = { sidebar: 0, content: 0, input: 0, menus: 0 };
    for (const key of SURFACE_KEYS) {
      const rule = this.settings.surfaces[key];
      if (rule.enabled && rule.blur > 0) blur[key] = rule.blur;
    }
    this.layer.applyFrost(measurePaneRects(blur));
  }

  private async showActive(animate: boolean, transition?: TransitionKind): Promise<void> {
    if (this.disposed) return;
    const item = findItem(this.settings, this.settings.activeId);
    if (!item) {
      await this.layer.show(null, null);
      return;
    }
    let url: string | null = null;
    if (item.kind !== 'effect' && item.assetId) url = await this.urlFor(item.assetId);
    const kind: TransitionKind = (transition as TransitionKind | undefined) ?? this.settings.carousel.transition;
    if (animate && this.started && this.layer.item && this.layer.item.id !== item.id) {
      await this.layer.transitionTo(item, url, kind, this.settings.carousel.durationMs);
    } else {
      await this.layer.show(item, url);
    }
  }

  private async urlFor(assetId: string): Promise<string | null> {
    const cached = this.urls.get(assetId);
    if (cached) return cached;
    const blob = await getAsset(assetId);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    this.urls.set(assetId, url);
    return url;
  }

  /** Resolve the displayable object URL of one library item (used by the crop editor). */
  async blobFor(item: WallpaperItem): Promise<Blob | null> {
    if (!item.assetId) return null;
    return getAsset(item.assetId);
  }

  private scheduleCarousel(): void {
    window.clearTimeout(this.carouselTimer);
    if (!this.started) return;
    const { enabled, intervalSec } = this.settings.carousel;
    const pool = rotationPool(this.settings);
    if (!enabled || pool.length < 2) return;
    this.carouselTimer = window.setTimeout(() => {
      void this.advance();
    }, Math.max(5, intervalSec) * 1000);
  }

  private async advance(): Promise<void> {
    await this.stepToNext(true);
  }

  get persistent(): boolean {
    return isPersistent();
  }
}
