/**
 * Styling bridge between the plugin and the Harness theme.
 *
 * Two things happen here:
 *
 * 1. **Surface tokens.** The Web UI paints its panes from alias tokens
 *    (`--dsw-alias-bg-base` for the frame / document / transcript,
 *    `--dsw-specific-sidebar-fill` for the sidebar column,
 *    `--dsw-specific-input-major` for the composer card and
 *    `--dsw-specific-menu` for menus). The user's pane opacity is applied by
 *    overriding exactly those tokens with an alpha version of the colour the
 *    active palette already uses, so light and dark themes both keep their own
 *    tint and the wallpaper simply shows through. The original colour is read
 *    from a probe element, never hard-coded.
 *
 * 2. **Pane blur.** Per-pane backdrop blur needs the pane elements, and their
 *    class names are build-hashed, so the elements are located by geometry
 *    (`elementsFromPoint` at three stable points) and the geometry is handed to
 *    the plugin's own layer, which draws frost rectangles there. Host elements
 *    are never restyled: `backdrop-filter` on a pane would make it the
 *    containing block for its `position: fixed` children and move them.
 */
import type { StudioSettings, SurfaceKey } from './types.js';
import { SURFACE_KEYS } from './types.js';

const STYLE_ID = 'dsh-wallpaper-studio';
const VARS_ATTR = 'data-dws-vars';

/**
 * Token each pane paints its fill from.
 *
 * `sidebar` is not private to its pane: `--dsw-specific-sidebar-fill` is also
 * what the window frame paints its base with (and the sidebar column and sidebar
 * root paint it again), so the frame is neutralised separately — see
 * neutralizeFrame().
 *
 * `menus` covers everything that floats above the layout: the shared menu
 * material (`--dsw-menu-surface-fill`), the specific menu token, dropdown
 * selectors, and the elevated layers dialogs, popovers and cards are painted
 * from. Those surfaces are what a user actually sees when they drag the menus
 * sliders — the settings dialog itself included — so covering only the shared
 * menu material made the sliders look inert.
 */
const PANE_TOKENS: Record<SurfaceKey, string[]> = {
  sidebar: ['--dsw-specific-sidebar-fill'],
  content: ['--dsw-alias-bg-base'],
  input: ['--dsw-specific-input-major'],
  menus: [
    '--dsw-specific-menu',
    '--dsw-menu-surface-fill',
    '--dsw-specific-selector',
    '--dsw-alias-bg-layer-2',
    '--dsw-alias-bg-layer-1',
  ],
};

let varsSheet: HTMLStyleElement | null = null;
let probe: HTMLElement | null = null;

export const BASE_CSS = `
.dws-root{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;opacity:var(--dws-opacity,1);transition:opacity .3s ease}
.dws-root:not(.dws-on){display:none}
.dws-stage{position:absolute;inset:0;overflow:hidden;background:#000;transform:translate3d(var(--dws-offset-x,0),var(--dws-offset-y,0),0) scale(var(--dws-zoom,1));transform-origin:50% 50%;transition:transform .6s cubic-bezier(.4,0,.2,1)}
.dws-slide{position:absolute;inset:0;opacity:0;transition:opacity var(--dws-transition-duration,1200ms) ease,transform var(--dws-transition-duration,1200ms) ease,filter var(--dws-transition-duration,1200ms) ease}
.dws-slide-front{opacity:1}
.dws-root[data-dws-transition="zoom"] .dws-slide-enter{transform:scale(1.08)}
.dws-root[data-dws-transition="slide"] .dws-slide-enter{transform:translateX(6%)}
.dws-root[data-dws-transition="blur"] .dws-slide-enter{filter:blur(26px)}
.dws-root[data-dws-transition="blur"] .dws-slide-leave{filter:blur(26px)}
.dws-media{position:absolute;top:0;left:0;transform-origin:50% 50%;will-change:transform;filter:blur(var(--dws-blur,0px)) brightness(var(--dws-brightness,1)) saturate(var(--dws-saturate,1));backface-visibility:hidden}
img.dws-media{-webkit-user-drag:none;user-select:none}
.dws-fx{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:.92}
.dws-root[data-dws-effect="aurora"] .dws-fx,.dws-root[data-dws-effect="rays"] .dws-fx,.dws-root[data-dws-effect="starfield"] .dws-fx,.dws-root[data-dws-effect="particles"] .dws-fx{mix-blend-mode:screen}
.dws-root[data-dws-effect="none"] .dws-fx{display:none}
.dws-scrim{position:absolute;inset:0;pointer-events:none;background:#000;opacity:var(--dws-darken,0);transition:opacity .3s ease}
.dws-scrim:after{content:"";position:absolute;inset:0;background:#000;opacity:var(--dws-surface-scrim,0)}
.dws-vignette{position:absolute;inset:0;pointer-events:none;opacity:var(--dws-vignette,0);background:radial-gradient(120% 90% at 50% 45%,rgba(0,0,0,0) 42%,rgba(0,0,0,.85) 100%)}
/* Motion runs on the slide: the media element's own transform belongs to framing. */
.dws-root[data-dws-motion="kenburns"] .dws-slide-front{animation:dws-kenburns var(--dws-motion-speed,18s) ease-in-out infinite alternate}
.dws-root[data-dws-motion="drift"] .dws-slide-front{animation:dws-drift var(--dws-motion-speed,18s) ease-in-out infinite alternate}
.dws-root[data-dws-motion="pulse"] .dws-slide-front{animation:dws-pulse var(--dws-motion-speed,18s) ease-in-out infinite alternate}
@keyframes dws-kenburns{from{transform:scale(1) translate3d(0,0,0)}to{transform:scale(calc(1 + var(--dws-motion-amount,.18) * .14)) translate3d(calc(var(--dws-motion-amount,.18) * -1.6%),calc(var(--dws-motion-amount,.18) * 1.1%),0)}}
@keyframes dws-drift{from{transform:translate3d(calc(var(--dws-motion-amount,.18) * -2.4%),0,0) scale(1.04)}to{transform:translate3d(calc(var(--dws-motion-amount,.18) * 2.4%),0,0) scale(1.04)}}
@keyframes dws-pulse{from{transform:scale(1)}to{transform:scale(calc(1 + var(--dws-motion-amount,.18) * .05))}}
/* Per-pane frost: rectangles drawn by the plugin's own layer over the measured
   pane geometry. Host elements are never restyled, so no host layout can move. */
.dws-frost{position:absolute;pointer-events:none;z-index:1}
.dws-frost[data-dws-frost="sidebar"]{backdrop-filter:blur(var(--dws-frost-sidebar,0px))}
.dws-frost[data-dws-frost="content"]{backdrop-filter:blur(var(--dws-frost-content,0px))}
.dws-frost[data-dws-frost="input"]{backdrop-filter:blur(var(--dws-frost-input,0px))}
/* The window frame paints an opaque base behind every pane, and on a
   Windows-titlebar window it paints it from the *sidebar's* token, so a
   translucent sidebar would otherwise reveal the frame instead of the wallpaper.
   The plugin clears the frame inline; these rules cover the same element when the
   probe cannot find it. */
html.dws-surfaces #root > :first-child,
html.dws-surfaces [data-sidebar-collapsed],
html.dws-surfaces [data-rightbar-collapsed]{background-color:transparent!important;background-image:none!important}
/* Keep the title-bar strip off the sidebar's token, so the sidebar slider cannot
   tint it (pseudo-elements cannot be written inline). */
html.dws-surfaces #root > :first-child::before{background-color:var(--dsw-alias-bg-base)!important}
@media (prefers-reduced-motion:reduce){
  .dws-slide,.dws-scrim,.dws-stage{transition:none}
  [data-dws-motion] .dws-media{animation:none!important}
}

/* ---------------------------------------------------------------- panel UI */
.dws-panel{color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px;display:flex;flex-direction:column;gap:14px;padding:22px 24px 32px;box-sizing:border-box}
.dws-panel *{box-sizing:border-box}
.dws-head{display:flex;align-items:flex-start;gap:12px;justify-content:space-between}
.dws-title{font-size:16px;line-height:24px;font-weight:500;color:var(--dsw-alias-label-primary)}
.dws-sub{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);margin-top:2px;max-width:52ch}
.dws-tabs{display:flex;gap:4px;flex-wrap:wrap;border-bottom:.5px solid var(--dsw-alias-border-l2);padding-bottom:8px}
.dws-tab{border:none;background:0 0;font:inherit;font-size:13px;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:6px 10px;border-radius:var(--dsw-radius-sm)}
.dws-tab:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dws-tab[aria-selected="true"]{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary)}
.dws-body{display:flex;flex-direction:column;gap:14px}
.dws-card{border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:14px;display:flex;flex-direction:column;gap:12px;background:var(--dsw-alias-bg-layer-1)}
.dws-cardTitle{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}
.dws-note{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dws-row{display:flex;align-items:center;gap:10px;justify-content:space-between}
.dws-rowLabel{font-size:13px;color:var(--dsw-alias-label-secondary);flex:none}
.dws-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.dws-slider{display:flex;align-items:center;gap:10px}
.dws-slider input[type="range"]{flex:1;min-width:80px;accent-color:var(--dsw-alias-state-business-primary)}
.dws-value{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary);font-size:12px;min-width:52px;text-align:right}
.dws-btn{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:var(--dsw-radius-sm);font:inherit;font-size:13px;padding:6px 12px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.dws-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dws-btn[disabled]{opacity:.5;cursor:default}
.dws-btn.primary{background:var(--dsw-alias-button-info-fill);color:#fff;border-color:transparent}
.dws-btn.primary:hover{background:var(--dsw-alias-button-info-hover)}
.dws-btn.danger{color:var(--dsw-alias-state-error-primary)}
.dws-switch{position:relative;width:38px;height:22px;border-radius:999px;background:var(--dsw-alias-border-l3);border:none;cursor:pointer;flex:none;transition:background .2s ease}
.dws-switch:after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:var(--dsw-alias-switch-thumb,#fff);transition:transform .2s ease}
.dws-switch[aria-checked="true"]{background:var(--dsw-alias-state-business-primary)}
.dws-switch[aria-checked="true"]:after{transform:translateX(16px)}
.dws-seg{display:inline-flex;gap:2px;background:var(--dsw-alias-bg-module-platform);border-radius:var(--dsw-radius-sm);padding:2px}
.dws-seg button{border:none;background:0 0;font:inherit;font-size:12px;color:var(--dsw-alias-label-secondary);padding:4px 10px;border-radius:var(--dsw-radius-xs);cursor:pointer}
.dws-seg button[aria-pressed="true"]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dws-thumb{position:relative;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);overflow:hidden;aspect-ratio:16/10;background:var(--dsw-alias-bg-module-platform);cursor:pointer;padding:0}
.dws-thumb img,.dws-thumb video,.dws-thumb .dws-thumbFx{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border:0;display:block}
.dws-thumb[data-active="true"]{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 1px var(--dsw-alias-state-business-primary)}
.dws-thumbBar{position:absolute;inset:auto 0 0 0;display:flex;align-items:center;gap:6px;padding:6px 8px;background:linear-gradient(to top,rgba(0,0,0,.72),rgba(0,0,0,0))}
.dws-thumbName{color:#fff;font-size:12px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.dws-badge{position:absolute;top:6px;left:6px;background:var(--dsw-alias-state-business-primary);color:#fff;font-size:11px;padding:1px 6px;border-radius:999px}
.dws-thumbActions{position:absolute;top:6px;right:6px;display:flex;gap:4px;opacity:0;transition:opacity .15s ease}
.dws-thumb:hover .dws-thumbActions,.dws-thumb:focus-within .dws-thumbActions{opacity:1}
.dws-iconBtn{border:none;background:rgba(0,0,0,.55);color:#fff;border-radius:var(--dsw-radius-xs);width:24px;height:24px;display:grid;place-items:center;cursor:pointer;font-size:12px;line-height:1;padding:0}
.dws-iconBtn:hover{background:rgba(0,0,0,.78)}
.dws-drop{border:1px dashed var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);padding:18px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:13px}
.dws-drop[data-over="true"]{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-tertiary)}
.dws-empty{color:var(--dsw-alias-label-tertiary);font-size:13px;padding:18px 0;text-align:center}
.dws-inline{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dws-color{width:34px;height:26px;padding:0;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dws-radius-xs);background:0 0;cursor:pointer}
.dws-list{display:flex;flex-direction:column;gap:6px;max-height:220px;overflow:auto;padding-right:4px}
.dws-listRow{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dws-alias-label-secondary)}
.dws-listRow img{width:44px;height:28px;object-fit:cover;border-radius:var(--dsw-radius-xs);flex:none}
.dws-toast{position:fixed;left:50%;bottom:32px;transform:translateX(-50%);background:var(--dsw-alias-toast-bg,rgba(0,0,0,.8));color:var(--dsw-alias-toast-label,#fff);padding:8px 14px;border-radius:var(--dsw-radius-sm);font-size:13px;z-index:2000;pointer-events:none}

/* ------------------------------------------------------------ quick panel */
.dws-quickWrap{position:fixed;z-index:1100;inset:auto}
.dws-quick{width:280px;border-radius:var(--dsw-radius-lg);padding:12px;display:flex;flex-direction:column;gap:10px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2));backdrop-filter:var(--dsw-menu-backdrop-filter);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);font-size:13px}
.dws-quickHead{display:flex;align-items:center;justify-content:space-between;gap:8px}
.dws-quickPreview{height:92px;border-radius:var(--dsw-radius-sm);overflow:hidden;background:var(--dsw-alias-bg-module-platform);position:relative}
.dws-quickPreview img,.dws-quickPreview video{width:100%;height:100%;object-fit:cover;display:block}
.dws-quickPreview span{position:absolute;inset:auto 0 0 0;padding:4px 8px;font-size:11px;color:#fff;background:linear-gradient(to top,rgba(0,0,0,.7),transparent)}

/* ------------------------------------------------------------ crop editor */
.dws-modalMask{position:fixed;inset:0;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.55));z-index:1500;display:flex;align-items:center;justify-content:center;padding:24px}
.dws-modal{width:min(920px,100%);max-height:min(760px,100%);display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-2);border-radius:var(--dsw-radius-lg);box-shadow:var(--dsw-elevation-prominent);overflow:hidden;color:var(--dsw-alias-label-primary)}
.dws-modalHead{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:.5px solid var(--dsw-alias-border-l2);font-size:14px}
.dws-modalBody{display:flex;gap:16px;padding:16px 18px;min-height:0;flex:1}
.dws-cropStage{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-module-platform);border-radius:var(--dsw-radius-md);overflow:hidden;position:relative;touch-action:none;cursor:grab}
.dws-cropStage[data-dragging="true"]{cursor:grabbing}
.dws-cropBox{position:relative;overflow:hidden;background:#000}
.dws-cropBox img{position:absolute;top:0;left:0;transform-origin:50% 50%;will-change:transform;user-select:none;-webkit-user-drag:none}
.dws-cropGrid{position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(to right,rgba(255,255,255,.35) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,.35) 1px,transparent 1px);background-size:33.33% 33.33%}
.dws-cropSide{width:240px;flex:none;display:flex;flex-direction:column;gap:12px;overflow:auto}
.dws-modalFoot{display:flex;justify-content:space-between;gap:8px;padding:12px 18px;border-top:.5px solid var(--dsw-alias-border-l2)}
.dws-aspects{display:flex;flex-wrap:wrap;gap:6px}
.dws-launcher{width:100%;justify-content:center;padding:6px 0;font-size:14px;line-height:1}
.dws-renameInput{flex:1;min-width:0;font:inherit;font-size:12px;padding:2px 4px;border-radius:var(--dws-radius-xs);border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dws-json{width:100%;box-sizing:border-box;font-family:var(--ds-font-family-code,monospace);font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-module-platform);border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dws-radius-sm);padding:8px;resize:vertical}
`;

/** Inject the plugin's own stylesheet once; returns a disposer. */
export function injectBaseStyles(): () => void {
  if (typeof document === 'undefined') return () => {};
  let element = document.querySelector<HTMLStyleElement>(`style[data-plugin-css="${STYLE_ID}"]`);
  if (!element) {
    element = document.createElement('style');
    element.setAttribute('data-plugin-css', STYLE_ID);
    element.textContent = BASE_CSS;
    document.head.appendChild(element);
  }
  return () => {
    if (element && element.parentNode) element.parentNode.removeChild(element);
  };
}

function ensureVarsSheet(): HTMLStyleElement | null {
  if (typeof document === 'undefined') return null;
  if (varsSheet && varsSheet.parentNode) return varsSheet;
  const existing = document.querySelector<HTMLStyleElement>(`style[${VARS_ATTR}]`);
  if (existing) {
    varsSheet = existing;
    return varsSheet;
  }
  const element = document.createElement('style');
  element.setAttribute(VARS_ATTR, '');
  document.head.appendChild(element);
  varsSheet = element;
  return varsSheet;
}

function ensureProbe(): HTMLElement | null {
  if (typeof document === 'undefined' || !document.body) return null;
  if (probe && probe.parentNode) return probe;
  const element = document.createElement('div');
  element.setAttribute('data-dws-probe', '');
  element.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.appendChild(element);
  probe = element;
  return probe;
}

/** Resolve any CSS colour (including var() chains) to `{r,g,b}` via a probe element. */
function resolveColour(token: string): { r: number; g: number; b: number } | null {
  const element = ensureProbe();
  if (!element) return null;
  // A sentinel distinguishes "the token does not exist" from a real colour:
  // without it a missing token would resolve to the fallback and the plugin
  // would paint a grey pane.
  const sentinel = 'rgba(1, 2, 3, 0.456)';
  element.style.backgroundColor = `var(${token}, ${sentinel})`;
  const computed = getComputedStyle(element).backgroundColor;
  element.style.backgroundColor = '';
  if (computed === sentinel) return null;
  const match = computed.match(/rgba?\(([^)]+)\)/i);
  if (!match) {
    // Chromium reports wide-gamut / color-mix results as color(srgb … or
    // oklab(…. Those are still resolvable through a canvas, so try that before
    // giving up: giving up means writing no override at all, which leaves every
    // pane opaque and makes the wallpaper invisible.
    return resolveViaCanvas(computed);
  }
  const parts = match[1].split(/[,\s/]+/).map((piece) => parseFloat(piece));
  if (parts.length < 3 || parts.some((value) => !Number.isFinite(value))) return resolveViaCanvas(computed);
  return { r: parts[0], g: parts[1], b: parts[2] };
}

/** Last-resort colour resolution: let the browser paint the colour and read it back. */
function resolveViaCanvas(colour: string): { r: number; g: number; b: number } | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#010203';
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    if (data[0] === 1 && data[1] === 2 && data[2] === 3) return null; // colour rejected
    return { r: data[0], g: data[1], b: data[2] };
  } catch {
    return null;
  }
}

/** Original (pre-override) value of each token, cached until the theme changes. */
const tokenOriginals = new Map<string, string>();

/** Drop the cache; called when the palette may have changed. */
export function resetTokenCache(): void {
  tokenOriginals.clear();
}

/**
 * Read a token's own value with our override temporarily switched off, so a
 * second pass cannot read back the value it wrote itself.
 */
function readTokenValue(token: string): string | null {
  const cached = tokenOriginals.get(token);
  if (cached) return cached;
  if (typeof document === 'undefined' || !document.body) return null;
  const sheet = varsSheet;
  const wasDisabled = sheet ? sheet.disabled : false;
  if (sheet) sheet.disabled = true;
  let value = '';
  try {
    value = getComputedStyle(document.body).getPropertyValue(token).trim();
  } catch {
    value = '';
  }
  if (sheet) sheet.disabled = wasDisabled;
  if (value === '') return null;
  tokenOriginals.set(token, value);
  return value;
}

/**
 * A translucent version of the token's own colour.
 *
 * Preference order:
 *  1. CSS relative colour syntax (`rgb(from <original> r g b / 62%)`), which
 *     keeps whatever the palette produced …hex, color-mix(), oklab(), a var()
 *     chain …instead of this plugin parsing it. Wide-gamut values made the old
 *     parse-only path silently produce nothing.
 *  2. A numeric rgba() from the resolved colour, for engines without it.
 */
function translucentValue(token: string, alpha: number): string | null {
  const clamped = Math.max(0, Math.min(1, alpha));
  const original = readTokenValue(token);
  if (original && supportsRelativeColour()) {
    return `rgb(from ${original} r g b / ${(clamped * 100).toFixed(1)}%)`;
  }
  const colour = resolveColour(token);
  if (!colour) return null;
  return `rgba(${Math.round(colour.r)}, ${Math.round(colour.g)}, ${Math.round(colour.b)}, ${clamped.toFixed(3)})`;
}

let relativeColourSupport: boolean | null = null;
function supportsRelativeColour(): boolean {
  if (relativeColourSupport !== null) return relativeColourSupport;
  try {
    const view = window as unknown as { CSS?: { supports?: (property: string, value: string) => boolean } };
    relativeColourSupport = Boolean(view.CSS?.supports?.('color', 'rgb(from #fff r g b / 50%)'));
  } catch {
    relativeColourSupport = false;
  }
  return relativeColourSupport;
}


/**
 * Locate the pane element for one surface.
 *
 * Pane class names are build-hashed, so the pane is found geometrically and then
 * confirmed by the token it paints its fill from. Three rules keep a wrong
 * element out, each one paid for by a reported bug:
 *
 *  1. Anything spanning the window is the frame, never a pane, and is dropped
 *     whenever a real candidate exists (the frame paints the *sidebar's* token on
 *     the Desktop titlebar layout, and accepting it drew a full-window frost
 *     rectangle that blurred every pane at once).
 *  2. The sidebar additionally refuses anything wider than a third of the window.
 *  3. Among the candidates that really paint the pane's token the *outermost* one
 *     wins: that is the pane container, not a chip, row or bubble inside it. With
 *     no colour match at all the largest remaining candidate is used, so a future
 *     app build cannot turn the frost off entirely.
 */
function findPane(key: SurfaceKey, point: { x: number; y: number }, band: { min: number; max: number }): HTMLElement | null {
  if (typeof document.elementsFromPoint !== 'function') return null;
  const wanted = key === 'menus' ? null : probeTokenColour(PANE_TOKENS[key][0]);
  const maxWidth = key === 'sidebar' ? window.innerWidth * 0.33 : Number.POSITIVE_INFINITY;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const candidates: HTMLElement[] = [];
  for (const node of document.elementsFromPoint(point.x, point.y)) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.hasAttribute('data-dws-root') || node.closest('[data-dws-root]')) continue;
    if (node === document.body || node === document.documentElement) continue;
    const style = getComputedStyle(node);
    if (style.backgroundColor === 'rgba(0, 0, 0, 0)' || style.backgroundColor === 'transparent') continue;
    const rect = node.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area < band.min || area > band.max || rect.width < 2 || rect.height < 2) continue;
    if (rect.width > maxWidth) continue;
    candidates.push(node);
  }
  if (candidates.length === 0) return null;

  const paneSized = candidates.filter((node) => {
    const rect = node.getBoundingClientRect();
    return !(rect.width >= viewportWidth * 0.9 && rect.height >= viewportHeight * 0.6);
  });
  const pool = paneSized.length > 0 ? paneSized : candidates;

  if (wanted) {
    const matching = pool.filter((node) => getComputedStyle(node).backgroundColor === wanted);
    // The stack is topmost-first, so the last match is the outermost container.
    if (matching.length > 0) return matching[matching.length - 1];
  }
  // No colour match: the largest candidate is the pane rather than its contents.
  return pool.reduce((best, node) => {
    const bestBox = best.getBoundingClientRect();
    const nodeBox = node.getBoundingClientRect();
    return nodeBox.width * nodeBox.height > bestBox.width * bestBox.height ? node : best;
  }, pool[0]);
}

/** The colour a token resolves to right now, as `getComputedStyle` would report it. */
function probeTokenColour(token: string): string | null {
  const element = ensureProbe();
  if (!element) return null;
  element.style.backgroundColor = `var(${token}, rgba(1, 2, 3, 0.456))`;
  const computed = getComputedStyle(element).backgroundColor;
  element.style.backgroundColor = '';
  return computed && computed !== 'rgba(0, 0, 0, 0)' ? computed : null;
}

function panePoints(key: SurfaceKey): { x: number; y: number }[] {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (key === 'sidebar') return [{ x: 24, y: Math.round(h / 2) }, { x: 24, y: Math.round(h * 0.25) }];
  // The composer is a small card near the bottom; the transcript starts higher up.
  if (key === 'input') {
    return [
      { x: Math.round(w / 2), y: h - 90 },
      { x: Math.round(w / 2), y: h - 130 },
      { x: Math.round(w / 2), y: h - 170 },
    ];
  }
  if (key === 'content') return [{ x: Math.round(w / 2), y: Math.round(h * 0.32) }, { x: Math.round(w * 0.72), y: Math.round(h * 0.55) }];
  return [];
}

/** Plausible size band for each pane, as a fraction of the viewport area. */
function paneBand(key: SurfaceKey): { min: number; max: number } {
  const viewport = window.innerWidth * window.innerHeight;
  if (key === 'input') return { min: viewport / 900, max: viewport / 6 };
  return { min: viewport / 12, max: Number.POSITIVE_INFINITY };
}

/** Geometry of one pane, in viewport coordinates. */
export interface FrostRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

let layerElement: HTMLElement | null = null;
const measured = new Map<SurfaceKey, HTMLElement>();
let resizeObserver: ResizeObserver | null = null;
let resizeCallback: (() => void) | null = null;
let resizeTimer = 0;

/** The studio hands its layer over; the frost variables live in that subtree. */
export function bindLayer(layer: HTMLElement): void {
  layerElement = layer;
}

/** Called when a measured pane changes size (sidebar collapse, right panel, …. */
export function onPaneResize(callback: () => void): void {
  resizeCallback = callback;
}

/**
 * Measure the panes that need a frost rectangle.
 *
 * Read-only: it asks for geometry and never writes a style, class or attribute
 * to a host element. `menus` is skipped on purpose …they mount per open, so a
 * rect taken now would be stale, and they already blur themselves with
 * `--dsw-menu-backdrop-filter`.
 *
 * The whole probe runs with this plugin's overrides suspended, for the reason in
 * withOverridesSuspended(): matching against our own translucent values picks the
 * window frame instead of the pane.
 */
export function measurePaneRects(blur: Record<SurfaceKey, number>): Partial<Record<SurfaceKey, FrostRect>> {
  const rects: Partial<Record<SurfaceKey, FrostRect>> = {};
  if (typeof document === 'undefined') return rects;
  const seen = new Set<HTMLElement>();

  withOverridesSuspended(() => {
    for (const key of SURFACE_KEYS) {
      if (key === 'menus') continue;
      if (blur[key] <= 0) continue;
      const band = paneBand(key);
      for (const point of panePoints(key)) {
        const element = findPane(key, point, band);
        if (!element) continue;
        // Two surfaces resolving to the same element means the probe guessed
        // wrong for one of them; the first (outermost) claim wins.
        if (seen.has(element)) continue;
        const box = element.getBoundingClientRect();
        if (box.width < 2 || box.height < 2) continue;
        rects[key] = { x: box.left, y: box.top, width: box.width, height: box.height };
        if (measured.get(key) !== element) {
          measured.set(key, element);
          observeResize(element);
        }
        seen.add(element);
        break;
      }
    }
  });

  for (const [key, element] of [...measured]) {
    if (!seen.has(element)) {
      try {
        resizeObserver?.unobserve(element);
      } catch {
        /* ignore */
      }
      measured.delete(key);
    }
  }
  return rects;
}

function observeResize(element: HTMLElement): void {
  if (typeof ResizeObserver === 'undefined') return;
  if (!resizeObserver) {
    resizeObserver = new ResizeObserver(() => {
      // Panes animate while the sidebar collapses; wait out the motion.
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => resizeCallback?.(), 180);
    });
  }
  try {
    resizeObserver.observe(element);
  } catch {
    /* ignore */
  }
}

/**
 * Publish the per-pane frost strength on the plugin's own layer.
 *
 * The blur is deliberately NOT applied to the panes. `backdrop-filter` makes an
 * element the containing block for its `position: fixed` descendants, so
 * styling a host pane moves every fixed child it owns: in the Desktop titlebar
 * layout that displaced the brand row and re-anchored the composer's floating
 * controls. The layer draws its own rectangles over the measured pane geometry
 * instead, which cannot affect host layout at all.
 */
function setPaneBlur(blur: Record<SurfaceKey, number>): void {
  const layer = layerElement;
  const root = document.documentElement;
  for (const key of SURFACE_KEYS) {
    const value = blur[key];
    if (layer) {
      if (value > 0) layer.style.setProperty(`--dws-frost-${key}`, `${value}px`);
      else layer.style.removeProperty(`--dws-frost-${key}`);
    }
    // Where the value lived before this change; cleared so an upgrade cannot
    // leave a stale variable behind on <html>.
    root.style.removeProperty(`--dws-pane-blur-${key}`);
  }
}

const NO_BLUR: Record<SurfaceKey, number> = { sidebar: 0, content: 0, input: 0, menus: 0 };

/**
 * The application frame, and the paint this plugin replaced on it.
 *
 * Every pane sits on top of the frame, and the frame paints an opaque base. On a
 * Windows-titlebar window that base is `--dsw-specific-sidebar-fill` … the exact
 * token the sidebar column paints … so tinting that token to let the wallpaper
 * through the sidebar also tinted the whole window, which is why the sidebar
 * slider used to drag every other pane with it.
 *
 * The frame is neutralised on the element instead. `background-color` is a
 * paint-only property, so writing it cannot move host layout (unlike
 * `backdrop-filter`, which reparents `position: fixed` descendants).
 */
let frameElement: HTMLElement | null = null;
let framePrevious: { color: string; colorPriority: string; image: string; imagePriority: string } | null = null;

function restoreFrame(): void {
  if (frameElement && framePrevious && frameElement.style) {
    try {
      if (framePrevious.color) frameElement.style.setProperty('background-color', framePrevious.color, framePrevious.colorPriority);
      else frameElement.style.removeProperty('background-color');
      if (framePrevious.image) frameElement.style.setProperty('background-image', framePrevious.image, framePrevious.imagePriority);
      else frameElement.style.removeProperty('background-image');
    } catch {
      /* ignore */
    }
  }
  frameElement = null;
  framePrevious = null;
}

function neutralizeFrame(): void {
  restoreFrame();
  const frame = findWindowFrame();
  if (!frame) return;
  frameElement = frame;
  framePrevious = {
    color: frame.style.getPropertyValue('background-color'),
    colorPriority: frame.style.getPropertyPriority('background-color'),
    image: frame.style.getPropertyValue('background-image'),
    imagePriority: frame.style.getPropertyPriority('background-image'),
  };
  try {
    frame.style.setProperty('background-color', 'transparent', 'important');
    frame.style.setProperty('background-image', 'none', 'important');
  } catch {
    /* ignore */
  }
}

/** The frame is whichever ancestor of a real pane spans the whole window. */
function findWindowFrame(): HTMLElement | null {
  if (typeof document === 'undefined' || !document.body) return null;
  const spans = (element: HTMLElement): boolean => {
    const rect = element.getBoundingClientRect();
    return rect.width >= window.innerWidth * 0.9 && rect.height >= window.innerHeight * 0.6;
  };
  const candidates: HTMLElement[] = [];
  const mount = typeof document.getElementById === 'function' ? document.getElementById('root') : null;
  const mountChild = (mount ?? document.body.firstElementChild)?.firstElementChild;
  if (mountChild instanceof HTMLElement) candidates.push(mountChild);
  const pane = locatePane('content') ?? locatePane('sidebar') ?? locatePane('input');
  let node = pane?.parentElement ?? null;
  while (node && node !== document.body && node !== document.documentElement) {
    if (spans(node)) {
      candidates.push(node);
      break;
    }
    node = node.parentElement;
  }
  for (const candidate of candidates) {
    if (candidate !== document.body && candidate !== document.documentElement && spans(candidate)) return candidate;
  }
  return null;
}

let suspendDepth = 0;

/**
 * Run a probe with this plugin's own overrides switched off.
 *
 * Pane matching compares an element's painted colour against the palette's value
 * for a token. Once a pass has written its translucent values, every pane paints
 * that translucent colour, while the window frame keeps a *different* opaque one
 * … so a match run then picks the frame for the sidebar and draws a full-window
 * rectangle (blur and tint over the whole app). Suspending the overrides for the
 * duration of the probe restores the palette colours and makes the match exact.
 */
function withOverridesSuspended<T>(probe: () => T): T {
  if (suspendDepth > 0) return probe();
  const sheet = varsSheet;
  const wasDisabled = sheet ? sheet.disabled : false;
  suspendDepth += 1;
  if (sheet) sheet.disabled = true;
  const suspended = suspendInlineOverrides();
  try {
    return probe();
  } finally {
    restoreInlineOverrides(suspended);
    if (sheet) sheet.disabled = wasDisabled;
    suspendDepth -= 1;
  }
}

/** Locate one pane (call inside withOverridesSuspended). */
function locatePane(key: SurfaceKey): HTMLElement | null {
  if (typeof document === 'undefined' || typeof document.elementsFromPoint !== 'function') return null;
  const band = paneBand(key);
  for (const point of panePoints(key)) {
    const element = findPane(key, point, band);
    if (element) return element;
  }
  return null;
}

/** Apply (or clear) every surface override for the current settings. */
export function applySurfaceVars(settings: StudioSettings): void {
  if (typeof document === 'undefined' || !document.body) return;
  const sheet = ensureVarsSheet();
  if (!sheet) return;

  const root = document.documentElement;
  const active = settings.enabled;
  // Page-level markers: the layer marks itself with the same class, this one lets
  // external CSS and the smoke test see the plugin's state on <html>.
  root.classList.toggle('dws-on', active);

  if (!active) {
    sheet.textContent = '';
    releaseInlineOverrides();
    setPaneBlur(NO_BLUR);
    restoreFrame();
    root.classList.remove('dws-surfaces');
    return;
  }

  const declarations: string[] = [];
  const values: Record<string, string> = {};
  const blur: Record<SurfaceKey, number> = { ...NO_BLUR };
  let anySurface = false;

  for (const key of SURFACE_KEYS) {
    const rule = settings.surfaces[key];
    // A pane that is switched off keeps its own fill and therefore needs no
    // backdrop blur: the blur slider is disabled for it in the panel, so the
    // two controls never disagree.
    if (!rule.enabled) continue;
    anySurface = true;

    const alpha = Math.max(0, Math.min(1, rule.opacity / 100));
    for (const token of PANE_TOKENS[key]) {
      const colour = translucentValue(token, alpha);
      if (!colour) continue;
      declarations.push(`  ${token}: ${colour} !important;`);
      values[token] = colour;
    }

    // Menus and popovers mount per open, so a frost rectangle measured now would
    // be stale: their blur is taken over through the token the material reads.
    if (key === 'menus' && rule.blur > 0) {
      const filter = `blur(${Math.round(rule.blur)}px) saturate(150%)`;
      declarations.push(`  --dsw-menu-backdrop-filter: ${filter} !important;`);
      values['--dsw-menu-backdrop-filter'] = filter;
    }

    if (rule.blur > 0) blur[key] = rule.blur;
  }

  // While any pane is translucent the frame must not block the wallpaper, and it
  // must not follow the sidebar's token either.
  root.classList.toggle('dws-surfaces', anySurface);
  if (anySurface) withOverridesSuspended(() => neutralizeFrame());
  else restoreFrame();

  sheet.textContent = declarations.length > 0 ? `body {\n${declarations.join('\n')}\n}` : '';
  // Second line of defence: an inline `!important` declaration outranks every
  // stylesheet, including another plugin's higher-specificity `!important`
  // override of the same token. Custom properties have no layout effect, so this
  // cannot move anything.
  applyInlineOverrides(values);
  setPaneBlur(blur);
}

/** Tokens this plugin set inline, with what was there before, for exact restore. */
const inlineOverrides = new Map<string, { value: string; priority: string }>();

function applyInlineOverrides(values: Record<string, string>): void {
  const body = document.body;
  if (!body || !body.style) return;
  for (const [token, value] of Object.entries(values)) {
    if (!inlineOverrides.has(token)) {
      inlineOverrides.set(token, {
        value: body.style.getPropertyValue(token),
        priority: body.style.getPropertyPriority(token),
      });
    }
    try {
      body.style.setProperty(token, value, 'important');
    } catch {
      /* ignore */
    }
  }
}

function releaseInlineOverrides(): void {
  const body = document.body;
  if (!body || !body.style) return;
  for (const [token, previous] of inlineOverrides) {
    try {
      if (previous.value) body.style.setProperty(token, previous.value, previous.priority);
      else body.style.removeProperty(token);
    } catch {
      /* ignore */
    }
  }
  inlineOverrides.clear();
}

/**
 * Take this plugin's inline declarations off `<body>` (for a probe), returning
 * what has to be put back.
 *
 * It saves what is *currently* written — not the pre-plugin value stored in
 * `inlineOverrides` — because restoring the latter would delete the override the
 * previous pass installed, and every later read would see the palette again.
 */
function suspendInlineOverrides(): Map<string, { value: string; priority: string }> {
  const body = document.body;
  const saved = new Map<string, { value: string; priority: string }>();
  if (!body || !body.style) return saved;
  for (const token of [...inlineOverrides.keys()]) {
    saved.set(token, {
      value: body.style.getPropertyValue(token),
      priority: body.style.getPropertyPriority(token),
    });
    try {
      body.style.removeProperty(token);
    } catch {
      /* ignore */
    }
  }
  return saved;
}

function restoreInlineOverrides(saved: Map<string, { value: string; priority: string }>): void {
  const body = document.body;
  if (!body || !body.style) return;
  for (const [token, entry] of saved) {
    try {
      if (entry.value) body.style.setProperty(token, entry.value, entry.priority);
      else body.style.removeProperty(token);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Report what the surface override actually did, for the in-app diagnosis panel.
 * `hijacked` lists tokens whose effective value is no longer ours …the signal
 * that another plugin or the shell is overriding the same surface.
 */
export interface SurfaceReport {
  active: boolean;
  declared: number;
  applied: number;
  hijacked: string[];
  sample: string;
}

export function describeSurfaces(): SurfaceReport {
  const body = document.body;
  if (typeof document === 'undefined' || !body) {
    return { active: false, declared: 0, applied: 0, hijacked: [], sample: '' };
  }
  const active = document.documentElement.classList.contains('dws-on');
  const declared = inlineOverrides.size;
  const hijacked: string[] = [];
  let applied = 0;
  let sample = '';
  for (const [token, previous] of inlineOverrides) {
    let effective = '';
    try {
      effective = getComputedStyle(body).getPropertyValue(token).trim();
    } catch {
      effective = '';
    }
    const wanted = body.style.getPropertyValue(token).trim();
    if (!sample && wanted) sample = `${token} = ${wanted}`;
    if (effective !== '' && wanted !== '' && effective.replace(/\s+/g, '') === wanted.replace(/\s+/g, '')) applied += 1;
    else hijacked.push(`${token}${effective ? ` →${effective.slice(0, 48)}` : ' (???'}${previous.value ? ' [原为内联值]' : ''}`);
  }
  return { active, declared, applied, hijacked, sample };
}

/** Watch palette / platform switches so token colours and panes are re-resolved. */
export function watchTheme(onChange: () => void): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {};
  let timer = 0;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      onChange();
    }, 120);
  };
  const observer = new MutationObserver(schedule);
  // Only attributes the shell owns: `class` on <html> is written by this plugin
  // itself, so observing it would re-enter the surface pass for nothing.
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-platform', 'data-windows-titlebar', 'data-fullscreen'] });
  if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'class'] });
  const onResize = () => schedule();
  window.addEventListener('resize', onResize);
  return () => {
    window.clearTimeout(timer);
    observer.disconnect();
    window.removeEventListener('resize', onResize);
  };
}

/** Remove every trace of the plugin from the page. */
export function releaseAppRoot(): void {
  releaseInlineOverrides();
  restoreFrame();
  document.documentElement.classList.remove('dws-surfaces');
  resetTokenCache();
  for (const [, element] of measured) {
    try {
      resizeObserver?.unobserve(element);
    } catch {
      /* ignore */
    }
  }
  measured.clear();
  resizeObserver?.disconnect();
  resizeObserver = null;
  resizeCallback = null;
  layerElement = null;
  if (typeof document === 'undefined') return;
  document.documentElement.classList.remove('dws-on');
  setPaneBlur(NO_BLUR);
  if (varsSheet && varsSheet.parentNode) varsSheet.parentNode.removeChild(varsSheet);
  varsSheet = null;
  if (probe && probe.parentNode) probe.parentNode.removeChild(probe);
  probe = null;
}
