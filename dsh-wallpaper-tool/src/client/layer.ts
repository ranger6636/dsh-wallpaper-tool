/**
 * The wallpaper layer itself: a fixed, click-through stage that sits behind the
 * application, holding up to two media slides (so the carousel can cross-fade),
 * the animated-effect canvas, and the darkening / vignette overlays.
 */
import { EffectRenderer } from './effects.js';
import { framingCss } from './crop.js';
import type { EffectParams } from './effects.js';
import type {
  AppearanceSettings,
  EffectSettings,
  MotionSettings,
  SurfaceSettings,
  TransitionKind,
  WallpaperItem,
} from './types.js';

const SLIDE_COUNT = 2;
const FROST_KEYS: SurfaceKey[] = ['sidebar', 'content', 'input'];

interface Slide {
  root: HTMLElement;
  media: HTMLImageElement | HTMLVideoElement | null;
  objectUrl: string | null;
  itemId: string | null;
}

function isVideo(item: WallpaperItem | null): boolean {
  return item !== null && item.kind === 'video';
}

export class WallpaperLayer {
  readonly element: HTMLElement;
  private stage: HTMLElement;
  private slides: Slide[] = [];
  private scrim: HTMLElement;
  private vignette: HTMLElement;
  private canvas: HTMLCanvasElement;
  private effects: EffectRenderer;
  private front = 0;
  private appearance: AppearanceSettings | null = null;
  private transitionTimer = 0;
  private transitionResolve: (() => void) | null = null;
  private destroyed = false;
  private currentItem: WallpaperItem | null = null;
  private videoSound = false;
  private videoVolume = 0.6;
  private frost: Partial<Record<SurfaceKey, HTMLElement>> = {};
  /** Called when the browser refuses unmuted autoplay and the layer mutes itself. */
  onAutoplayBlocked: (() => void) | null = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'dws-root';
    this.element.setAttribute('data-dws-root', '');
    this.element.setAttribute('aria-hidden', 'true');

    this.stage = document.createElement('div');
    this.stage.className = 'dws-stage';
    this.element.appendChild(this.stage);

    for (let index = 0; index < SLIDE_COUNT; index += 1) {
      const root = document.createElement('div');
      root.className = 'dws-slide';
      root.setAttribute('data-dws-slide', String(index));
      this.stage.appendChild(root);
      this.slides.push({ root, media: null, objectUrl: null, itemId: null });
    }

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'dws-fx';
    this.canvas.setAttribute('data-dws-fx', '');
    this.stage.appendChild(this.canvas);
    this.effects = new EffectRenderer(this.canvas);

    this.scrim = document.createElement('div');
    this.scrim.className = 'dws-scrim';
    this.scrim.setAttribute('data-dws-scrim', '');
    this.stage.appendChild(this.scrim);

    this.vignette = document.createElement('div');
    this.vignette.className = 'dws-vignette';
    this.vignette.setAttribute('data-dws-vignette', '');
    this.stage.appendChild(this.vignette);

    // Frost rectangles sit above the wallpaper but inside this layer, so their
    // blur can never touch a host element's layout (see theme.measurePaneRects).
    for (const key of FROST_KEYS) {
      const frost = document.createElement('div');
      frost.className = 'dws-frost';
      frost.setAttribute('data-dws-frost', key);
      frost.style.display = 'none';
      this.element.appendChild(frost);
      this.frost[key] = frost;
    }

    this.slides[0].root.classList.add('dws-slide-front');
  }

  get item(): WallpaperItem | null {
    return this.currentItem;
  }

  /**
   * Position the per-pane frost rectangles.
   *
   * `rects` are viewport coordinates measured from the real panes; this layer is
   * an untransformed fixed box, so they can be used verbatim. The blur strength
   * comes from `--dws-frost-<pane>` on this element.
   */
  applyFrost(rects: Partial<Record<SurfaceKey, { x: number; y: number; width: number; height: number }>>): void {
    for (const key of FROST_KEYS) {
      const frost = this.frost[key];
      if (!frost) continue;
      const rect = rects[key];
      if (!rect || rect.width < 2 || rect.height < 2) {
        frost.style.display = 'none';
        continue;
      }
      frost.style.display = 'block';
      frost.style.left = `${Math.round(rect.x)}px`;
      frost.style.top = `${Math.round(rect.y)}px`;
      frost.style.width = `${Math.round(rect.width)}px`;
      frost.style.height = `${Math.round(rect.height)}px`;
    }
  }

  setVideoSound(on: boolean, volumePercent: number): void {
    this.videoSound = on;
    this.videoVolume = Math.max(0, Math.min(1, volumePercent / 100));
    for (const slide of this.slides) {
      if (slide.media instanceof HTMLVideoElement) {
        slide.media.muted = !on;
        slide.media.volume = this.videoVolume;
        if (on) void this.tryPlay(slide.media);
      }
    }
  }

  setEnabled(enabled: boolean): void {
    this.element.classList.toggle('dws-on', enabled);
    this.effects.setPaused(!enabled);
    if (!enabled) this.pauseVideos();
    else this.playVideos();
    // The canvas has no size while the layer is `display: none`, so it is measured
    // here — on the transition to visible — and not only on a window resize.
    // Without this the effect canvas stayed 0×0 and every effect drew nothing.
    if (enabled) this.resize();
  }

  applyAppearance(appearance: AppearanceSettings): void {
    this.appearance = appearance;
    this.element.style.setProperty('--dws-opacity', String(appearance.opacity / 100));
    this.element.style.setProperty('--dws-blur', `${appearance.blur}px`);
    this.element.style.setProperty('--dws-darken', String(appearance.darken / 100));
    this.element.style.setProperty('--dws-brightness', String(appearance.brightness / 100));
    this.element.style.setProperty('--dws-saturate', String(appearance.saturate / 100));
    this.element.style.setProperty('--dws-vignette', String(appearance.vignette / 100));
    this.element.style.setProperty('--dws-zoom', String(appearance.zoom));
    this.element.style.setProperty('--dws-offset-x', `${appearance.offsetX}%`);
    this.element.style.setProperty('--dws-offset-y', `${appearance.offsetY}%`);
    if (this.currentItem) this.applyFraming(this.currentItem);
  }

  applySurfaces(surfaces: SurfaceSettings): void {
    this.element.style.setProperty('--dws-surface-scrim', String(surfaces.scrim / 100));
  }

  applyMotion(motion: MotionSettings, reducedMotion: boolean): void {
    const mode = reducedMotion ? 'none' : motion.mode;
    this.element.setAttribute('data-dws-motion', mode);
    this.element.style.setProperty('--dws-motion-amount', String(motion.amount / 100));
    this.element.style.setProperty('--dws-motion-speed', `${Math.max(4, 26 / Math.max(0.2, motion.speed))}s`);
  }

  applyEffect(effect: EffectSettings, active: boolean): void {
    const params: EffectParams = {
      id: effect.id,
      intensity: effect.intensity,
      speed: effect.speed,
      color: effect.color,
      accent: effect.accent || effect.color,
    };
    this.effects.setParams(params);
    this.element.setAttribute('data-dws-effect', effect.id);
    if (active) this.effects.start();
    else this.effects.stop();
  }

  setReducedMotion(value: boolean): void {
    this.effects.setReducedMotion(value);
  }

  setPaused(paused: boolean): void {
    this.effects.setPaused(paused);
    if (paused) this.pauseVideos();
    else this.playVideos();
  }

  resize(): void {
    this.effects.resize();
    if (this.currentItem) this.applyFraming(this.currentItem);
  }

  /**
   * What the effect canvas is doing right now, for the in-app diagnostics.
   *
   * `width`/`height` are the canvas backing-store size: a zero here means the
   * effect cannot paint anything, which is the one way an animated effect looks
   * broken while the wallpaper itself works.
   */
  effectStatus(): { id: string; running: boolean; paused: boolean; reducedMotion: boolean; width: number; height: number } {
    return { id: this.effects.effectId, ...this.effects.status() };
  }

  /** Show `item` immediately, replacing whatever is on screen. */
  async show(item: WallpaperItem | null, assetUrl: string | null): Promise<void> {
    if (this.destroyed) return;
    // An interrupted transition can leave media on the other slide; `show`
    // resets the whole stage, so both slides are released and re-marked.
    this.cancelTransition();
    for (const slide of this.slides) this.releaseSlide(slide);
    const slide = this.slides[this.front];
    slide.itemId = item ? item.id : null;
    this.currentItem = item;
    if (!item || item.kind === 'effect' || !assetUrl) {
      slide.media = null;
      return;
    }
    const media = this.createMedia(item, assetUrl);
    slide.media = media;
    slide.objectUrl = assetUrl;
    slide.root.appendChild(media);
    this.applyFraming(item);
  }

  /**
   * Settle an in-flight transition: drop its timer, clear the classes it added
   * and resolve its promise.
   *
   * Clearing the classes matters: `dws-slide-enter` carries the transition's
   * opening transform (zoom / slide) and `dws-slide-leave` its exit filter, so a
   * slide that keeps either one stays visually offset or blurred forever — the
   * timer callback that would have removed them never runs once cancelled.
   */
  private cancelTransition(): void {
    window.clearTimeout(this.transitionTimer);
    this.transitionTimer = 0;
    this.resetSlideClasses();
    if (this.transitionResolve) {
      const resolve = this.transitionResolve;
      this.transitionResolve = null;
      resolve();
    }
  }

  /** Leave exactly one slide marked as the front one, with no transition state. */
  private resetSlideClasses(): void {
    this.slides.forEach((slide, index) => {
      slide.root.classList.remove('dws-slide-enter');
      slide.root.classList.remove('dws-slide-leave');
      slide.root.classList.toggle('dws-slide-front', index === this.front);
    });
  }

  /** Move to `item`, animating with the requested transition. */
  async transitionTo(item: WallpaperItem | null, assetUrl: string | null, transition: TransitionKind, durationMs: number): Promise<void> {
    if (this.destroyed) return;
    // Interrupting a running transition must settle its promise, otherwise the
    // caller's `await` would hang for good (and the carousel would stop). It also
    // resets the slide classes before this transition claims them again.
    this.cancelTransition();

    const outgoingIndex = this.front;
    const incomingIndex = (this.front + 1) % SLIDE_COUNT;
    const incoming = this.slides[incomingIndex];
    this.releaseSlide(incoming);
    incoming.itemId = item ? item.id : null;
    if (item && item.kind !== 'effect' && assetUrl) {
      const media = this.createMedia(item, assetUrl);
      incoming.media = media;
      incoming.objectUrl = assetUrl;
      incoming.root.appendChild(media);
    } else {
      incoming.media = null;
    }
    this.currentItem = item;
    this.applyFramingToSlide(incoming, item);

    this.element.setAttribute('data-dws-transition', transition);
    this.element.style.setProperty('--dws-transition-duration', `${durationMs}ms`);
    incoming.root.classList.add('dws-slide-front');
    incoming.root.classList.add('dws-slide-enter');
    const outgoing = this.slides[outgoingIndex];
    outgoing.root.classList.remove('dws-slide-front');
    outgoing.root.classList.add('dws-slide-leave');

    this.front = incomingIndex;
    await new Promise<void>((resolve) => {
      this.transitionResolve = resolve;
      this.transitionTimer = window.setTimeout(() => {
        this.transitionTimer = 0;
        this.transitionResolve = null;
        incoming.root.classList.remove('dws-slide-enter');
        outgoing.root.classList.remove('dws-slide-leave');
        this.releaseSlide(outgoing);
        resolve();
      }, Math.max(0, durationMs));
    });
  }

  destroy(): void {
    this.destroyed = true;
    this.cancelTransition();
    this.effects.stop();
    for (const slide of this.slides) this.releaseSlide(slide);
    if (this.element.parentNode) this.element.parentNode.removeChild(this.element);
  }

  private applyFraming(item: WallpaperItem): void {
    const slide = this.slides[this.front];
    if (slide.itemId !== item.id) return;
    this.applyFramingToSlide(slide, item);
  }

  private applyFramingToSlide(slide: Slide, item: WallpaperItem | null): void {
    if (!slide.media || !item || item.kind === 'effect') return;
    const boxW = window.innerWidth || 1920;
    const boxH = window.innerHeight || 1080;
    const width = item.width ?? boxW;
    const height = item.height ?? boxH;
    const css = framingCss(item.framing, width, height, boxW, boxH);
    slide.media.style.width = css.width;
    slide.media.style.height = css.height;
    slide.media.style.transform = css.transform;
  }

  private createMedia(item: WallpaperItem, url: string): HTMLImageElement | HTMLVideoElement {
    if (isVideo(item)) {
      const video = document.createElement('video');
      video.className = 'dws-media';
      video.src = url;
      video.loop = true;
      video.muted = !this.videoSound;
      video.volume = this.videoVolume;
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('disablepictureinpicture', '');
      video.addEventListener('loadeddata', () => {
        if (this.destroyed) return;
        this.applyFramingToSlide(this.slides[this.front], item);
      });
      void this.tryPlay(video);
      return video;
    }
    const image = document.createElement('img');
    image.className = 'dws-media';
    image.decoding = 'async';
    image.draggable = false;
    image.alt = '';
    image.src = url;
    image.addEventListener('load', () => {
      if (!this.destroyed) this.applyFramingToSlide(this.slides[this.front], item);
    });
    return image;
  }

  private async tryPlay(video: HTMLVideoElement): Promise<void> {
    try {
      await video.play();
    } catch {
      const wantedSound = !video.muted;
      video.muted = true;
      try {
        await video.play();
      } catch {
        /* autoplay refused entirely; the poster frame stays visible */
        return;
      }
      if (wantedSound && this.onAutoplayBlocked) this.onAutoplayBlocked();
    }
  }

  private playVideos(): void {
    for (const slide of this.slides) {
      if (slide.media instanceof HTMLVideoElement) void this.tryPlay(slide.media);
    }
  }

  private pauseVideos(): void {
    for (const slide of this.slides) {
      if (slide.media instanceof HTMLVideoElement) {
        try {
          slide.media.pause();
        } catch {
          /* ignore */
        }
      }
    }
  }

  private releaseSlide(slide: Slide): void {
    if (slide.media && slide.media.parentNode === slide.root) slide.root.removeChild(slide.media);
    if (slide.media instanceof HTMLVideoElement) {
      try {
        slide.media.pause();
        slide.media.removeAttribute('src');
        slide.media.load();
      } catch {
        /* ignore */
      }
    }
    slide.media = null;
    slide.itemId = null;
    // Object URLs are owned by the controller, which keeps them for reuse and
    // revokes them when a wallpaper leaves the library. Revoking here would
    // break the next carousel pass over the same item.
    slide.objectUrl = null;
  }

  get appearanceState(): AppearanceSettings | null {
    return this.appearance;
  }
}
