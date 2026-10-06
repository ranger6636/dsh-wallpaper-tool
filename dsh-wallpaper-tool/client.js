/* Wallpaper Studio — generated bundle. Edit src/ and run `node build.mjs`. */
(function () {
  'use strict';
  var __factories = {};
  var __cache = {};
  var __loading = {};
  function __require(id) {
    if (Object.prototype.hasOwnProperty.call(__cache, id)) return __cache[id];
    var factory = __factories[id];
    if (!factory) throw new Error('[wallpaper-studio] module not found: ' + id);
    if (__loading[id]) throw new Error('[wallpaper-studio] circular import: ' + id);
    __loading[id] = true;
    try {
      var exports = factory();
      __cache[id] = exports;
      return exports;
    } finally {
      delete __loading[id];
    }
  }
  __factories["src/client/main.ts"] = function () {
    const { injectBaseStyles } = __require("src/client/theme.ts");
    const { Studio } = __require("src/client/studio.ts");
    const { createQuickPanel, createSettingsSection } = __require("src/client/panel.ts");
    const { NS, en, zh } = __require("src/client/i18n.ts");
    /**
     * Client entry. The DSH module loader evaluates this bundle once and keeps the
     * factory; the factory itself is side-effect free and only builds the plugin
     * object when the Loader activates the entry.
     *
     * Registrations:
     *   - `settings.section`      → the Wallpaper Studio page in Settings
     *   - `sidebar.footer.action` → a compact launcher next to the Settings trigger
     *
     * The background layer, theme-token overrides and the carousel live in the
     * `Studio` controller, which is created inside `apply` and torn down with the
     * plugin's own disposer.
     */




                                                

    const PACKAGE_ID = 'dsh-wallpaper-studio';
    const SETTINGS_SECTION_SLOT = 'settings.section';
    const SIDEBAR_FOOTER_SLOT = 'sidebar.footer.action';

                          
                                                                                                      
     

                            
                                                                 
                                                                                  
     

                             
                                                                   
                          
                                                                                                   
     

    /**
     * The loader facade is injected into `<head>` by the Host before any plugin
     * script runs, so it is normally already there. If it is not (an unusual boot
     * order, a page restored from the back/forward cache), retry briefly instead of
     * giving up on the first look.
     */
    function boot(attempt = 0)       {
      const loader = (window                                                ).__ModuleLoader__;
      if (!loader || typeof loader.load !== 'function') {
        if (attempt < 40) {
          window.setTimeout(() => boot(attempt + 1), 250);
          return;
        }
        console.error(
          `[${PACKAGE_ID}] window.__ModuleLoader__ never appeared, so the client bundle could not register. Reload the page; if it persists, check that the plugin is enabled in Settings → Plugins.`,
        );
        return;
      }

      loader.load({
        id: PACKAGE_ID,
        factory(require) {
          const React = require('react')                    ;
          if (!React || typeof React.createElement !== 'function') {
            throw new Error(`[${PACKAGE_ID}] React is missing from the platform module table`);
          }
          const rt          = {
            React,
            h: React.createElement,
            useState: React.useState,
            useEffect: React.useEffect,
            useRef: React.useRef,
            useMemo: React.useMemo,
            useCallback: React.useCallback,
          };

          return {
            // Cordis service injection for the runtime half. This is a different
            // layer from `dsh.client.inject` in package.json, which orders the
            // browser bundles; both are needed and neither replaces the other.
            inject: ['slots'],
            apply(ctx               ) {
              const studio = new Studio();

              ctx.effect(() => injectBaseStyles(), `${PACKAGE_ID}: styles`);
              ctx.effect(() => () => studio.destroy(), `${PACKAGE_ID}: runtime`);

              // The plugin carries its own zh/en dictionary so it works everywhere; when
              // the deployment composes the locale service, publish it there as well.
              try {
                const locale = ctx.locale;
                if (locale && typeof locale.register === 'function') {
                  ctx.effect(() => locale.register(NS, { zh, en }), `${PACKAGE_ID}: dictionary`);
                }
              } catch {
                /* no locale service in this composition */
              }

              ctx.effect(
                () =>
                  ctx.slots.inject(SETTINGS_SECTION_SLOT, () =>
                    ctx.slots.register(
                      {
                        name: SETTINGS_SECTION_SLOT,
                        id: 'wallpaper-studio',
                        order: 40,
                        label: () => studio.t('section.title'),
                      },
                      createSettingsSection({ rt, studio }),
                    ),
                  ),
                `${PACKAGE_ID}: settings page`,
              );

              ctx.effect(
                () =>
                  ctx.slots.inject(SIDEBAR_FOOTER_SLOT, () =>
                    ctx.slots.register(
                      {
                        name: SIDEBAR_FOOTER_SLOT,
                        id: 'wallpaper-studio',
                        order: 20,
                        label: () => studio.t('quick.open'),
                      },
                      createQuickPanel({ rt, studio }),
                    ),
                  ),
                `${PACKAGE_ID}: sidebar launcher`,
              );
            },
          };
        },
      });
    }

    boot();


    //# sourceURL=src/client/main.ts
    return {  };
  };
  __factories["src/client/theme.ts"] = function () {
    const { SURFACE_KEYS } = __require("src/client/types.ts");
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
    const PANE_TOKENS                               = {
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

    let varsSheet                          = null;
    let probe                     = null;

    const BASE_CSS = `
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
    function injectBaseStyles()             {
      if (typeof document === 'undefined') return () => {};
      let element = document.querySelector                  (`style[data-plugin-css="${STYLE_ID}"]`);
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

    function ensureVarsSheet()                          {
      if (typeof document === 'undefined') return null;
      if (varsSheet && varsSheet.parentNode) return varsSheet;
      const existing = document.querySelector                  (`style[${VARS_ATTR}]`);
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

    function ensureProbe()                     {
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
    function resolveColour(token        )                                             {
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
    function resolveViaCanvas(colour        )                                             {
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
    const tokenOriginals = new Map                ();

    /** Drop the cache; called when the palette may have changed. */
    function resetTokenCache()       {
      tokenOriginals.clear();
    }

    /**
     * Read a token's own value with our override temporarily switched off, so a
     * second pass cannot read back the value it wrote itself.
     */
    function readTokenValue(token        )                {
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
    function translucentValue(token        , alpha        )                {
      const clamped = Math.max(0, Math.min(1, alpha));
      const original = readTokenValue(token);
      if (original && supportsRelativeColour()) {
        return `rgb(from ${original} r g b / ${(clamped * 100).toFixed(1)}%)`;
      }
      const colour = resolveColour(token);
      if (!colour) return null;
      return `rgba(${Math.round(colour.r)}, ${Math.round(colour.g)}, ${Math.round(colour.b)}, ${clamped.toFixed(3)})`;
    }

    let relativeColourSupport                 = null;
    function supportsRelativeColour()          {
      if (relativeColourSupport !== null) return relativeColourSupport;
      try {
        const view = window                                                                                    ;
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
    function findPane(key            , point                          , band                              )                     {
      if (typeof document.elementsFromPoint !== 'function') return null;
      const wanted = key === 'menus' ? null : probeTokenColour(PANE_TOKENS[key][0]);
      const maxWidth = key === 'sidebar' ? window.innerWidth * 0.33 : Number.POSITIVE_INFINITY;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const candidates                = [];
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
    function probeTokenColour(token        )                {
      const element = ensureProbe();
      if (!element) return null;
      element.style.backgroundColor = `var(${token}, rgba(1, 2, 3, 0.456))`;
      const computed = getComputedStyle(element).backgroundColor;
      element.style.backgroundColor = '';
      return computed && computed !== 'rgba(0, 0, 0, 0)' ? computed : null;
    }

    function panePoints(key            )                             {
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
    function paneBand(key            )                               {
      const viewport = window.innerWidth * window.innerHeight;
      if (key === 'input') return { min: viewport / 900, max: viewport / 6 };
      return { min: viewport / 12, max: Number.POSITIVE_INFINITY };
    }

    /** Geometry of one pane, in viewport coordinates. */
                                
                
                
                    
                     
     

    let layerElement                     = null;
    const measured = new Map                         ();
    let resizeObserver                        = null;
    let resizeCallback                      = null;
    let resizeTimer = 0;

    /** The studio hands its layer over; the frost variables live in that subtree. */
    function bindLayer(layer             )       {
      layerElement = layer;
    }

    /** Called when a measured pane changes size (sidebar collapse, right panel, …. */
    function onPaneResize(callback            )       {
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
    function measurePaneRects(blur                            )                                         {
      const rects                                         = {};
      if (typeof document === 'undefined') return rects;
      const seen = new Set             ();

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

    function observeResize(element             )       {
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
    function setPaneBlur(blur                            )       {
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

    const NO_BLUR                             = { sidebar: 0, content: 0, input: 0, menus: 0 };

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
    let frameElement                     = null;
    let framePrevious                                                                                        = null;

    function restoreFrame()       {
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

    function neutralizeFrame()       {
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
    function findWindowFrame()                     {
      if (typeof document === 'undefined' || !document.body) return null;
      const spans = (element             )          => {
        const rect = element.getBoundingClientRect();
        return rect.width >= window.innerWidth * 0.9 && rect.height >= window.innerHeight * 0.6;
      };
      const candidates                = [];
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
    function withOverridesSuspended   (probe         )    {
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
    function locatePane(key            )                     {
      if (typeof document === 'undefined' || typeof document.elementsFromPoint !== 'function') return null;
      const band = paneBand(key);
      for (const point of panePoints(key)) {
        const element = findPane(key, point, band);
        if (element) return element;
      }
      return null;
    }

    /** Apply (or clear) every surface override for the current settings. */
    function applySurfaceVars(settings                )       {
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

      const declarations           = [];
      const values                         = {};
      const blur                             = { ...NO_BLUR };
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
    const inlineOverrides = new Map                                             ();

    function applyInlineOverrides(values                        )       {
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

    function releaseInlineOverrides()       {
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
    function suspendInlineOverrides()                                                   {
      const body = document.body;
      const saved = new Map                                             ();
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

    function restoreInlineOverrides(saved                                                  )       {
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
                                    
                      
                       
                      
                         
                     
     

    function describeSurfaces()                {
      const body = document.body;
      if (typeof document === 'undefined' || !body) {
        return { active: false, declared: 0, applied: 0, hijacked: [], sample: '' };
      }
      const active = document.documentElement.classList.contains('dws-on');
      const declared = inlineOverrides.size;
      const hijacked           = [];
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
    function watchTheme(onChange            )             {
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
    function releaseAppRoot()       {
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


    //# sourceURL=src/client/theme.ts
    return { BASE_CSS, injectBaseStyles, resetTokenCache, bindLayer, onPaneResize, measurePaneRects, applySurfaceVars, describeSurfaces, watchTheme, releaseAppRoot };
  };
  __factories["src/client/types.ts"] = function () {
    /**
     * Shared types for Wallpaper Studio. This module is erased at build time for
     * everything except the few runtime constants at the bottom.
     */

                                                             

                                                                                                     

                                                                     

                                                       

                                                                    

                                                         

    /** Framing of one wallpaper: how the source is placed inside the viewport. */
                              
                                                                           
                
                                                                         
                
                                                
                   
                                  
                     
                   
     

    /** A wallpaper in the library. Binary payloads live in IndexedDB under `assetId`. */
                                    
                 
                          
                   
                                                                
                             
                                                                               
                                
                                                             
                           
                                                        
                           
                            
                                                        
                              
                       
                        
     

    /** How strongly the wallpaper bleeds through one pane of the application. */
                                  
                       
                                                                                             
                      
                                                         
                   
     

                                                                       

                                     
                   
                     
                        
                    
                                                                  
                    
                                                                            
                     
     

                                     
                       
                     
                     
                     
                    
     

                                       
                       
                                                 
                          
                           
                                 
                                                  
                         
                                                                                 
                    
     

                                      
                           
                           
                         
                         
                                                                   
                    
     

                                         
                                            
                      
                                 
                   
                                                            
                     
                         
                         
                         
                       
                                         
                       
                                            
                   
                                                                      
                      
                      
     

                                     
                                                                                             
                            
                       
                              
                                     
                                
                             
                             
                                                                                              
                             
                                 
                                                               
                             
                                                                                     
                                    
                                                                                  
                               
                                                                               
                          
                                                  
                          
     

                                 
                               
                                                  
                                                   
                                                                 
                                                            
                                                                        
                                                         
                                                         
                                                             
                                             
                                            
                                        
                                                                                               
                                                 
                    
                                 
                                                                     
     

    const SURFACE_KEYS               = ['sidebar', 'content', 'input', 'menus'];

    const EFFECT_IDS             = ['none', 'aurora', 'starfield', 'particles', 'waves', 'rays', 'rain'];

    /**
     * Plugin version, shown in the Advanced tab so a screenshot or a read-out says
     * which build is actually loaded in the page. `build.mjs` replaces the
     * placeholder with the version from package.json.
     */
    const PLUGIN_VERSION = '1.0.7';

    /**
     * Settings document revision.
     * 1 → 2: the menus surface became functional (menu material, selector and the
     * elevated dialog/card layers are now overridden, and menus are on by default).
     * 2 → 3: the sidebar tint is applied through its own token again, with the
     * window frame neutralised separately instead of sharing that token.
     */
    const SETTINGS_VERSION = 3;

    const DB_NAME = 'dsh-wallpaper-studio';
    const DB_VERSION = 1;
    const STATE_KEY = 'studio-state';
    const ASSET_STORE = 'assets';
    const STATE_STORE = 'state';
    /** Where the installation's own defaults live ("set current settings as default"). */
    const DEFAULTS_KEY = 'studio-defaults';
    const MAX_UPLOAD_BYTES = 320 * 1024 * 1024;
    const THUMB_WIDTH = 320;

    const SUPPORTED_IMAGE_TYPES = [
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'image/avif',
      'image/bmp',
      'image/svg+xml',
    ];

    const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];


    //# sourceURL=src/client/types.ts
    return { SURFACE_KEYS, EFFECT_IDS, PLUGIN_VERSION, SETTINGS_VERSION, DB_NAME, DB_VERSION, STATE_KEY, ASSET_STORE, STATE_STORE, DEFAULTS_KEY, MAX_UPLOAD_BYTES, THUMB_WIDTH, SUPPORTED_IMAGE_TYPES, SUPPORTED_VIDEO_TYPES };
  };
  __factories["src/client/studio.ts"] = function () {
    const { WallpaperLayer } = __require("src/client/layer.ts");
    const { deleteAsset, getAsset, isPersistent, loadDefaultTemplate, loadSettings, putAsset, saveDefaultTemplate, saveSettings } = __require("src/client/store.ts");
    const { probeImage, probeVideo } = __require("src/client/media.ts");
    const { defaultFraming, applyDefaultTemplate, currentDefaultTemplate, defaultSettings, effectiveDefaultsJson, findItem, normaliseSettings, rotationPool } = __require("src/client/settings.ts");
    const { applySurfaceVars, bindLayer, measurePaneRects, onPaneResize, releaseAppRoot, resetTokenCache, watchTheme } = __require("src/client/theme.ts");
    const { MAX_UPLOAD_BYTES, SUPPORTED_IMAGE_TYPES, SUPPORTED_VIDEO_TYPES, SURFACE_KEYS, THUMB_WIDTH } = __require("src/client/types.ts");
    const { detectLang, translate } = __require("src/client/i18n.ts");
    /**
     * The controller: owns settings state, the wallpaper layer, blob lifetimes and
     * the carousel clock, and is the single object the UI talks to.
     *
     * It is deliberately free of React so the same object can be driven by the
     * Settings page, by the quick panel, and by headless tests.
     */






                 
                         
                       
                     
                     
                     
                 
                  
                      
                     
                    
                        

                                          
                                            

                                                                     

    function newId()         {
      try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
      } catch {
        /* fall through */
      }
      return `wp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }

    function isImageFile(file      )          {
      if (SUPPORTED_IMAGE_TYPES.includes(file.type)) return true;
      return /\.(png|jpe?g|webp|gif|avif|bmp|svg)$/i.test(file.name);
    }

    // MKV is deliberately absent: Chromium (and therefore the Harness Web UI, in the
    // browser and in Desktop) ships no Matroska demuxer, so such a file would be
    // accepted and then never play. Everything listed here is decodable when its
    // codec is one Chromium supports.
    function isVideoFile(file      )          {
      if (SUPPORTED_VIDEO_TYPES.includes(file.type)) return true;
      return /\.(mp4|m4v|webm|ogv|mov)$/i.test(file.name);
    }

    /** Probe helpers that turn a decoder failure into `null` instead of a throw. */
    async function safeProbeImage(file      )                        {
      try {
        return await probeImage(file, THUMB_WIDTH);
      } catch (error) {
        console.warn('[wallpaper-studio] image probe failed', error);
        return null;
      }
    }

    async function safeProbeVideo(file      )                        {
      try {
        const probe = await probeVideo(file, THUMB_WIDTH, 8000);
        return probe.width > 0 ? probe : null;
      } catch (error) {
        console.warn('[wallpaper-studio] video probe failed', error);
        return null;
      }
    }

    class Studio {
      settings                 = defaultSettings();
               layer                ;
               lang      ;
              listeners = new Set            ();
              urls = new Map                ();
              carouselTimer = 0;
      /** Shared re-entrancy guard for the manual "next" button and the carousel tick. */
              navigating = false;
              started = false;
              disposers                 = [];
              noticeListeners = new Set                          ();
              ready               ;
              mediaQuery                        = null;
              reducedMotion = false;
              autoplayNoticeShown = false;
              disposed = false;

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

      t(key        , vars                                  )         {
        return translate(this.lang, key, vars);
      }

      get whenReady()                {
        return this.ready;
      }

      subscribe(listener            )             {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      }

      onNotice(listener                          )             {
        this.noticeListeners.add(listener);
        return () => this.noticeListeners.delete(listener);
      }

              notify()       {
        for (const listener of this.listeners) {
          try {
            listener();
          } catch (error) {
            console.error('[wallpaper-studio] listener failed', error);
          }
        }
      }

              notice(kind                  , message        )       {
        for (const listener of this.noticeListeners) {
          try {
            listener({ kind, message });
          } catch {
            /* ignore */
          }
        }
      }

              async boot()                {
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

        const onKey = (event               ) => {
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

      destroy()       {
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

      update(patch                         )       {
        const before = this.settings;
        this.settings = normaliseSettings({ ...this.settings, ...patch });
        this.commit(before);
      }

      updateAppearance(patch                             )       {
        this.update({ appearance: { ...this.settings.appearance, ...patch } });
      }

      updateSurfaces(patch                          )       {
        this.update({ surfaces: { ...this.settings.surfaces, ...patch } });
      }

      updateSurface(key            , patch                      )       {
        this.updateSurfaces({ [key]: { ...this.settings.surfaces[key], ...patch } }                            );
      }

      updateMotion(patch                         )       {
        this.update({ motion: { ...this.settings.motion, ...patch } });
      }

      updateEffect(patch                         )       {
        this.update({ effect: { ...this.settings.effect, ...patch } });
      }

      updateCarousel(patch                           )       {
        this.update({ carousel: { ...this.settings.carousel, ...patch } });
      }

      activate(id               )       {
        this.update({ activeId: id });
      }

      renameItem(id        , name        )       {
        const items = this.settings.items.map((item) => (item.id === id ? { ...item, name: name.trim() || item.name } : item));
        this.update({ items });
      }

      setFraming(id        , framing                          )       {
        const items = this.settings.items.map((item) => (item.id === id ? { ...item, framing } : item));
        this.update({ items });
      }

      async cropItem(id        , blob      , size                                   )                {
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

      async addFiles(files        )                {
        if (files.length === 0) return;
        const added                  = [];
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
          let kind                           = null;
          let probe               = null;

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

      addEffectItem()       {
        const effect = this.settings.effect;
        const item                = {
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

      async removeItem(id        )                {
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

      async reset()                {
        for (const item of this.settings.items) {
          if (item.assetId) await deleteAsset(item.assetId);
        }
        for (const url of this.urls.values()) URL.revokeObjectURL(url);
        this.urls.clear();
        const items                  = [];
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
      async saveCurrentAsDefaults()                {
        const snapshot                 = JSON.parse(JSON.stringify({ ...this.settings, items: [], activeId: null }));
        // Install it in memory first so the panel and `reset` see it immediately; the
        // write is what carries it across restarts.
        applyDefaultTemplate(snapshot);
        await saveDefaultTemplate(snapshot);
        this.notice('info', this.t('defaults.saved'));
        this.notify();
      }

      /** Drop the installation's own defaults and go back to the shipped ones. */
      async clearCustomDefaults()                {
        applyDefaultTemplate(null);
        await saveDefaultTemplate(null);
        this.notice('info', this.t('defaults.cleared'));
        this.notify();
      }

      /** Whether an installation default is installed, and its JSON for export. */
      defaultsInfo()                                    {
        return { custom: currentDefaultTemplate() !== null, json: effectiveDefaultsJson() };
      }

      /**
       * Advance to the next wallpaper in the rotation pool.
       *
       * `next()` (the manual button) and the carousel timer share this path and one
       * re-entrancy guard, so rapid clicks — or a click landing on a timer tick —
       * can never start two overlapping transitions or write the settings twice.
       */
              async stepToNext(useCarouselTransition         )                {
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
          let nextIndex        ;
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
      async next()                {
        await this.stepToNext(this.settings.carousel.enabled);
      }

      // ------------------------------------------------------------------ runtime

              commit(before                )       {
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

              applyAll()       {
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

              isReducedMotion()          {
        if (this.mediaQuery) return this.mediaQuery.matches;
        return this.reducedMotion;
      }

              applyThemeVars()       {
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
              applyThemeChange()       {
        resetTokenCache();
        this.applyThemeVars();
      }

      /**
       * Re-measure the panes and hand the geometry to the layer, which draws the
       * frost. Called after every settings change, on theme switches and whenever a
       * measured pane resizes (sidebar collapse, right panel toggle, …).
       */
              applyFrost()       {
        if (!this.settings.enabled) {
          this.layer.applyFrost({});
          return;
        }
        const blur                             = { sidebar: 0, content: 0, input: 0, menus: 0 };
        for (const key of SURFACE_KEYS) {
          const rule = this.settings.surfaces[key];
          if (rule.enabled && rule.blur > 0) blur[key] = rule.blur;
        }
        this.layer.applyFrost(measurePaneRects(blur));
      }

              async showActive(animate         , transition                 )                {
        if (this.disposed) return;
        const item = findItem(this.settings, this.settings.activeId);
        if (!item) {
          await this.layer.show(null, null);
          return;
        }
        let url                = null;
        if (item.kind !== 'effect' && item.assetId) url = await this.urlFor(item.assetId);
        const kind                 = (transition                              ) ?? this.settings.carousel.transition;
        if (animate && this.started && this.layer.item && this.layer.item.id !== item.id) {
          await this.layer.transitionTo(item, url, kind, this.settings.carousel.durationMs);
        } else {
          await this.layer.show(item, url);
        }
      }

              async urlFor(assetId        )                         {
        const cached = this.urls.get(assetId);
        if (cached) return cached;
        const blob = await getAsset(assetId);
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        this.urls.set(assetId, url);
        return url;
      }

      /** Resolve the displayable object URL of one library item (used by the crop editor). */
      async blobFor(item               )                       {
        if (!item.assetId) return null;
        return getAsset(item.assetId);
      }

              scheduleCarousel()       {
        window.clearTimeout(this.carouselTimer);
        if (!this.started) return;
        const { enabled, intervalSec } = this.settings.carousel;
        const pool = rotationPool(this.settings);
        if (!enabled || pool.length < 2) return;
        this.carouselTimer = window.setTimeout(() => {
          void this.advance();
        }, Math.max(5, intervalSec) * 1000);
      }

              async advance()                {
        await this.stepToNext(true);
      }

      get persistent()          {
        return isPersistent();
      }
    }


    //# sourceURL=src/client/studio.ts
    return { Studio };
  };
  __factories["src/client/layer.ts"] = function () {
    const { EffectRenderer } = __require("src/client/effects.ts");
    const { framingCss } = __require("src/client/crop.ts");
    /**
     * The wallpaper layer itself: a fixed, click-through stage that sits behind the
     * application, holding up to two media slides (so the carousel can cross-fade),
     * the animated-effect canvas, and the darkening / vignette overlays.
     */


                                                     
                 
                         
                     
                     
                      
                     
                    
                        

    const SLIDE_COUNT = 2;
    const FROST_KEYS               = ['sidebar', 'content', 'input'];

                     
                        
                                                        
                               
                            
     

    function isVideo(item                      )          {
      return item !== null && item.kind === 'video';
    }

    class WallpaperLayer {
               element             ;
              stage             ;
              slides          = [];
              scrim             ;
              vignette             ;
              canvas                   ;
              effects                ;
              front = 0;
              appearance                            = null;
              transitionTimer = 0;
              transitionResolve                      = null;
              destroyed = false;
              currentItem                       = null;
              videoSound = false;
              videoVolume = 0.6;
              frost                                           = {};
      /** Called when the browser refuses unmuted autoplay and the layer mutes itself. */
      onAutoplayBlocked                      = null;

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

      get item()                       {
        return this.currentItem;
      }

      /**
       * Position the per-pane frost rectangles.
       *
       * `rects` are viewport coordinates measured from the real panes; this layer is
       * an untransformed fixed box, so they can be used verbatim. The blur strength
       * comes from `--dws-frost-<pane>` on this element.
       */
      applyFrost(rects                                                                                      )       {
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

      setVideoSound(on         , volumePercent        )       {
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

      setEnabled(enabled         )       {
        this.element.classList.toggle('dws-on', enabled);
        this.effects.setPaused(!enabled);
        if (!enabled) this.pauseVideos();
        else this.playVideos();
        // The canvas has no size while the layer is `display: none`, so it is measured
        // here — on the transition to visible — and not only on a window resize.
        // Without this the effect canvas stayed 0×0 and every effect drew nothing.
        if (enabled) this.resize();
      }

      applyAppearance(appearance                    )       {
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

      applySurfaces(surfaces                 )       {
        this.element.style.setProperty('--dws-surface-scrim', String(surfaces.scrim / 100));
      }

      applyMotion(motion                , reducedMotion         )       {
        const mode = reducedMotion ? 'none' : motion.mode;
        this.element.setAttribute('data-dws-motion', mode);
        this.element.style.setProperty('--dws-motion-amount', String(motion.amount / 100));
        this.element.style.setProperty('--dws-motion-speed', `${Math.max(4, 26 / Math.max(0.2, motion.speed))}s`);
      }

      applyEffect(effect                , active         )       {
        const params               = {
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

      setReducedMotion(value         )       {
        this.effects.setReducedMotion(value);
      }

      setPaused(paused         )       {
        this.effects.setPaused(paused);
        if (paused) this.pauseVideos();
        else this.playVideos();
      }

      resize()       {
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
      effectStatus()                                                                                                           {
        return { id: this.effects.effectId, ...this.effects.status() };
      }

      /** Show `item` immediately, replacing whatever is on screen. */
      async show(item                      , assetUrl               )                {
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
              cancelTransition()       {
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
              resetSlideClasses()       {
        this.slides.forEach((slide, index) => {
          slide.root.classList.remove('dws-slide-enter');
          slide.root.classList.remove('dws-slide-leave');
          slide.root.classList.toggle('dws-slide-front', index === this.front);
        });
      }

      /** Move to `item`, animating with the requested transition. */
      async transitionTo(item                      , assetUrl               , transition                , durationMs        )                {
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
        await new Promise      ((resolve) => {
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

      destroy()       {
        this.destroyed = true;
        this.cancelTransition();
        this.effects.stop();
        for (const slide of this.slides) this.releaseSlide(slide);
        if (this.element.parentNode) this.element.parentNode.removeChild(this.element);
      }

              applyFraming(item               )       {
        const slide = this.slides[this.front];
        if (slide.itemId !== item.id) return;
        this.applyFramingToSlide(slide, item);
      }

              applyFramingToSlide(slide       , item                      )       {
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

              createMedia(item               , url        )                                      {
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

              async tryPlay(video                  )                {
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

              playVideos()       {
        for (const slide of this.slides) {
          if (slide.media instanceof HTMLVideoElement) void this.tryPlay(slide.media);
        }
      }

              pauseVideos()       {
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

              releaseSlide(slide       )       {
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

      get appearanceState()                            {
        return this.appearance;
      }
    }


    //# sourceURL=src/client/layer.ts
    return { WallpaperLayer };
  };
  __factories["src/client/effects.ts"] = function () {
    /**
     * Animated background effects painted on a 2D canvas that sits inside the
     * wallpaper layer. Every effect is a pure draw function over a shared clock so
     * they can be added or tuned without touching the layer.
     *
     * Cost control: one requestAnimationFrame loop for the whole plugin, device
     * pixel ratio capped at 1.5, particle counts scaled by both intensity and the
     * canvas area, and the loop stops whenever the effect is hidden, the window is
     * in the background, or `prefers-reduced-motion` asks for stillness.
     */
                                               

                                   
                   
                        
                    
                    
                     
     

                    
                
                
                
                   
     

                    
                
                
                
                 
                 
                  
     

                    
                
                
                  
                
     

                     
                    
                    
                    
                   
     

    function makeState()        {
      return { stars: [], motes: [], drops: [], seed: Math.random() * 1000 };
    }

    function hexToRgb(colour        )                           {
      const hex = colour.trim();
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) {
        const body = hex.slice(1);
        const full = body.length === 3 ? body.split('').map((c) => c + c).join('') : body;
        return [
          parseInt(full.slice(0, 2), 16),
          parseInt(full.slice(2, 4), 16),
          parseInt(full.slice(4, 6), 16),
        ];
      }
      const rgb = hex.match(/rgba?\(([^)]+)\)/i);
      if (rgb) {
        const parts = rgb[1].split(/[,\s/]+/).map((piece) => parseFloat(piece));
        return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
      }
      return [79, 140, 255];
    }

    function rgba(colour        , alpha        )         {
      const [r, g, b] = hexToRgb(colour);
      return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
    }

    function mix(a        , b        , t        )         {
      const [r1, g1, b1] = hexToRgb(a);
      const [r2, g2, b2] = hexToRgb(b);
      return `rgb(${Math.round(r1 + (r2 - r1) * t)}, ${Math.round(g1 + (g2 - g1) * t)}, ${Math.round(b1 + (b2 - b1) * t)})`;
    }

    class EffectRenderer {
              canvas                   ;
              ctx                                 ;
              params               = { id: 'aurora', intensity: 55, speed: 1, color: '#4f8cff', accent: '#a86bff' };
              state        = makeState();
              frame = 0;
              running = false;
      /** Explicit "a frame is queued" flag: a handle of 0 is a legal rAF return. */
              scheduled = false;
              last = 0;
              clock = 0;
              width = 0;
              height = 0;
              reducedMotion = false;
              paused = false;
              area = 1;

      constructor(canvas                   ) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: true });
      }

      setParams(params                       )       {
        const previous = this.params.id;
        this.params = { ...this.params, ...params };
        if (previous !== this.params.id) this.state = makeState();
      }

      setReducedMotion(value         )       {
        this.reducedMotion = value;
        this.sync();
      }

      /** Background tabs and hidden windows stop the loop entirely. */
      setPaused(value         )       {
        this.paused = value;
        this.sync();
      }

      get active()          {
        return this.running;
      }

      /** Which effect is selected right now. */
      get effectId()         {
        return this.params.id;
      }

      /**
       * Live state for the diagnostics panel.
       *
       * `width`/`height` are the canvas backing store: zero means the draw calls are
       * being skipped, which is what makes an effect look broken while the wallpaper
       * itself is fine.
       */
      status()                                                                                               {
        return {
          running: this.running,
          paused: this.paused,
          reducedMotion: this.reducedMotion,
          width: this.canvas.width,
          height: this.canvas.height,
        };
      }

      start()       {
        this.running = true;
        this.sync();
      }

      stop()       {
        this.running = false;
        this.sync();
      }

      resize()       {
        const dpr = Math.min(1.5, Math.max(1, window.devicePixelRatio || 1));
        const width = this.canvas.clientWidth || window.innerWidth;
        const height = this.canvas.clientHeight || window.innerHeight;
        this.width = width;
        this.height = height;
        this.canvas.width = Math.max(1, Math.round(width * dpr));
        this.canvas.height = Math.max(1, Math.round(height * dpr));
        this.area = (width * height) / (1920 * 1080);
        if (this.ctx) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.state.stars = [];
        this.state.motes = [];
        this.state.drops = [];
      }

              shouldRun()          {
        return this.running && !this.paused && this.params.id !== 'none' && !this.reducedMotion;
      }

              sync()       {
        const shouldRun = this.shouldRun();
        if (shouldRun && !this.scheduled) {
          this.last = performance.now();
          this.scheduled = true;
          this.frame = window.requestAnimationFrame(this.tick);
        } else if (!shouldRun && this.scheduled) {
          window.cancelAnimationFrame(this.frame);
          this.frame = 0;
          this.scheduled = false;
          if (this.ctx) this.ctx.clearRect(0, 0, this.width, this.height);
        }
      }

              tick = (now        )       => {
        this.scheduled = false;
        this.frame = 0;
        const delta = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
        this.last = now;
        this.clock += delta * this.params.speed;
        this.draw();
        if (this.shouldRun()) {
          this.scheduled = true;
          this.frame = window.requestAnimationFrame(this.tick);
        }
      };

              draw()       {
        const ctx = this.ctx;
        if (!ctx) return;
        const { width, height } = this;
        if (width === 0 || height === 0) return;
        const { id, intensity, color, accent } = this.params;
        const strength = Math.max(0, Math.min(1, intensity / 100));

        switch (id) {
          case 'aurora':
            this.drawAurora(ctx, width, height, strength, color, accent);
            break;
          case 'starfield':
            this.drawStarfield(ctx, width, height, strength, color);
            break;
          case 'particles':
            this.drawParticles(ctx, width, height, strength, color, accent);
            break;
          case 'waves':
            this.drawWaves(ctx, width, height, strength, color, accent);
            break;
          case 'rays':
            this.drawRays(ctx, width, height, strength, color, accent);
            break;
          case 'rain':
            this.drawRain(ctx, width, height, strength, color);
            break;
          default:
            ctx.clearRect(0, 0, width, height);
            break;
        }
      }

              drawAurora(ctx                          , w        , h        , strength        , color        , accent        )       {
        ctx.clearRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        const bands = 5;
        for (let i = 0; i < bands; i += 1) {
          const phase = this.clock * 0.35 + i * 1.7;
          const y = h * (0.18 + 0.16 * i) + Math.sin(phase) * h * 0.06;
          const gradient = ctx.createLinearGradient(0, y - h * 0.25, 0, y + h * 0.25);
          const tone = mix(color, accent, (i + 1) / (bands + 1));
          gradient.addColorStop(0, rgba(tone, 0));
          gradient.addColorStop(0.5, rgba(tone, 0.22 * strength));
          gradient.addColorStop(1, rgba(tone, 0));
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.moveTo(0, h);
          for (let x = 0; x <= w; x += Math.max(12, w / 48)) {
            const wave = Math.sin(x / (w / 6) + phase) * h * 0.05 + Math.sin(x / (w / 17) - phase * 1.3) * h * 0.03;
            ctx.lineTo(x, y + wave);
          }
          ctx.lineTo(w, h);
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }

              seedStars(w        , h        , strength        )       {
        const target = Math.round(90 + strength * 260 * this.area);
        while (this.state.stars.length < target) {
          this.state.stars.push({
            x: Math.random() * w,
            y: Math.random() * h,
            z: 0.2 + Math.random() * 0.8,
            size: 0.4 + Math.random() * 1.8,
          });
        }
        if (this.state.stars.length > target) this.state.stars.length = target;
      }

              drawStarfield(ctx                          , w        , h        , strength        , color        )       {
        ctx.clearRect(0, 0, w, h);
        this.seedStars(w, h, strength);
        const cx = w / 2;
        const cy = h / 2;
        for (const star of this.state.stars) {
          star.z -= 0.0016 * (0.4 + strength);
          if (star.z <= 0.05) {
            star.x = Math.random() * w;
            star.y = Math.random() * h;
            star.z = 1;
          }
          const scale = 1 / star.z;
          const px = cx + (star.x - cx) * scale * 0.35;
          const py = cy + (star.y - cy) * scale * 0.35;
          if (px < -20 || px > w + 20 || py < -20 || py > h + 20) continue;
          const radius = star.size * scale * 0.5;
          ctx.beginPath();
          ctx.fillStyle = rgba(color, Math.min(0.9, (1.05 - star.z) * strength + 0.08));
          ctx.arc(px, py, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

              seedMotes(w        , h        , strength        )       {
        const target = Math.round(24 + strength * 90 * this.area);
        while (this.state.motes.length < target) {
          this.state.motes.push({
            x: Math.random() * w,
            y: Math.random() * h,
            r: 6 + Math.random() * 46,
            vx: (Math.random() - 0.5) * 12,
            vy: -4 - Math.random() * 14,
            hue: Math.random(),
          });
        }
        if (this.state.motes.length > target) this.state.motes.length = target;
      }

              drawParticles(ctx                          , w        , h        , strength        , color        , accent        )       {
        ctx.clearRect(0, 0, w, h);
        this.seedMotes(w, h, strength);
        ctx.globalCompositeOperation = 'lighter';
        for (const mote of this.state.motes) {
          mote.x += mote.vx * 0.016;
          mote.y += mote.vy * 0.016;
          if (mote.y + mote.r < 0) {
            mote.y = h + mote.r;
            mote.x = Math.random() * w;
          }
          if (mote.x < -mote.r) mote.x = w + mote.r;
          if (mote.x > w + mote.r) mote.x = -mote.r;
          const tone = mix(color, accent, mote.hue);
          const gradient = ctx.createRadialGradient(mote.x, mote.y, 0, mote.x, mote.y, mote.r);
          gradient.addColorStop(0, rgba(tone, 0.3 * strength));
          gradient.addColorStop(1, rgba(tone, 0));
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(mote.x, mote.y, mote.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }

              drawWaves(ctx                          , w        , h        , strength        , color        , accent        )       {
        ctx.clearRect(0, 0, w, h);
        const rows = 4;
        for (let i = 0; i < rows; i += 1) {
          const t = i / rows;
          const tone = mix(color, accent, t);
          const base = h * (0.45 + i * 0.12);
          const amplitude = h * 0.04 * (1 + strength);
          ctx.beginPath();
          ctx.moveTo(0, h);
          for (let x = 0; x <= w; x += Math.max(10, w / 60)) {
            const y = base + Math.sin(x / (w / (3 + i)) + this.clock * (0.6 + i * 0.2)) * amplitude;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w, h);
          ctx.closePath();
          ctx.fillStyle = rgba(tone, 0.07 + 0.1 * strength * (1 - t));
          ctx.fill();
        }
      }

              drawRays(ctx                          , w        , h        , strength        , color        , accent        )       {
        ctx.clearRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        const originX = w * (0.5 + Math.sin(this.clock * 0.08) * 0.18);
        const count = 9;
        for (let i = 0; i < count; i += 1) {
          const spread = (i / (count - 1) - 0.5) * 0.9 + Math.sin(this.clock * 0.12 + i) * 0.05;
          const tone = mix(color, accent, i / count);
          const gradient = ctx.createLinearGradient(originX, -h * 0.2, originX + spread * w, h);
          gradient.addColorStop(0, rgba(tone, 0.18 * strength));
          gradient.addColorStop(1, rgba(tone, 0));
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.moveTo(originX - w * 0.06, -h * 0.1);
          ctx.lineTo(originX + w * 0.06, -h * 0.1);
          ctx.lineTo(originX + spread * w + w * 0.18, h * 1.05);
          ctx.lineTo(originX + spread * w - w * 0.18, h * 1.05);
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }

              seedDrops(w        , h        , strength        )       {
        const target = Math.round(80 + strength * 320 * this.area);
        while (this.state.drops.length < target) {
          this.state.drops.push({
            x: Math.random() * w,
            y: Math.random() * h,
            len: 12 + Math.random() * 40,
            v: 260 + Math.random() * 620,
          });
        }
        if (this.state.drops.length > target) this.state.drops.length = target;
      }

              drawRain(ctx                          , w        , h        , strength        , color        )       {
        ctx.clearRect(0, 0, w, h);
        this.seedDrops(w, h, strength);
        ctx.strokeStyle = rgba(color, 0.12 + 0.24 * strength);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const drop of this.state.drops) {
          drop.y += drop.v * 0.016;
          if (drop.y > h + drop.len) {
            drop.y = -drop.len;
            drop.x = Math.random() * w;
          }
          ctx.moveTo(drop.x, drop.y);
          ctx.lineTo(drop.x - drop.len * 0.16, drop.y + drop.len);
        }
        ctx.stroke();
      }
    }


    //# sourceURL=src/client/effects.ts
    return { EffectRenderer };
  };
  __factories["src/client/crop.ts"] = function () {
    const { canvasToBlob, loadImage } = __require("src/client/media.ts");
    /**
     * Framing maths and the canvas pass behind "crop by hand".
     *
     * The same `Framing` object drives three things, and they must agree exactly:
     *   1. the live background layer (CSS transform on the slide),
     *   2. the crop editor preview (CSS transform on the preview image),
     *   3. the baked crop written back to IndexedDB (canvas drawImage).
     * All three go through `layout()` below, so what the editor shows is what the
     * wallpaper and the saved file contain.
     */
                                                       


                             
                                                                    
                    
                    
                                                                
                   
                  
                                                                                   
                        
                        
     

    function fitScale(fit         , iw        , ih        , boxW        , boxH        )         {
      const scaleX = boxW / iw;
      const scaleY = boxH / ih;
      if (fit === 'contain') return Math.min(scaleX, scaleY);
      if (fit === 'fill') return Math.min(scaleX, scaleY); // unused for `fill`, see layout()
      return Math.max(scaleX, scaleY);
    }

    /** Resolve a framing into concrete box-space geometry. */
    function layout(framing         , iw        , ih        , boxW        , boxH        )         {
      // `fill` stretches the source to the box: no slack, so framing cannot pan.
      if (framing.fit === 'fill') {
        return { drawW: boxW, drawH: boxH, left: 0, top: 0, overflowX: 0, overflowY: 0 };
      }
      const scale = fitScale(framing.fit, iw, ih, boxW, boxH) * framing.zoom;
      const drawW = iw * scale;
      const drawH = ih * scale;
      const overflowX = Math.max(0, drawW - boxW);
      const overflowY = Math.max(0, drawH - boxH);
      return {
        drawW,
        drawH,
        left: (boxW - drawW) / 2 + (framing.x * overflowX) / 2,
        top: (boxH - drawH) / 2 + (framing.y * overflowY) / 2,
        overflowX,
        overflowY,
      };
    }

    /** CSS transform for the live layer / preview; the box is positioned at 0/0. */
    function framingCss(framing         , iw        , ih        , boxW        , boxH        )   
                    
                     
                        
      {
      const geometry = layout(framing, iw, ih, boxW, boxH);
      return {
        width: `${geometry.drawW}px`,
        height: `${geometry.drawH}px`,
        transform: `translate3d(${geometry.left}px, ${geometry.top}px, 0) rotate(${framing.rotate}deg)`,
      };
    }

    const ASPECTS                                                        = [
      { id: 'viewport', label: 'window', ratio: null },
      { id: '21:9', label: '21:9', ratio: 21 / 9 },
      { id: '16:9', label: '16:9', ratio: 16 / 9 },
      { id: '3:2', label: '3:2', ratio: 3 / 2 },
      { id: '4:3', label: '4:3', ratio: 4 / 3 },
      { id: '1:1', label: '1:1', ratio: 1 },
      { id: '9:16', label: '9:16', ratio: 9 / 16 },
      { id: 'original', label: 'source', ratio: -1 },
    ];

    function aspectRatio(id        , source                                   , viewport                                   )         {
      const found = ASPECTS.find((entry) => entry.id === id);
      if (!found || found.ratio === null) return viewport.width / Math.max(1, viewport.height);
      if (found.ratio === -1) return source.width / Math.max(1, source.height);
      return found.ratio;
    }

    /**
     * Render the visible region of `blob` under `framing` into a new image whose
     * aspect ratio equals `aspect`. Returns the baked blob plus its pixel size.
     */
    async function renderCrop(
      blob      ,
      framing         ,
      aspect        ,
      source                                   ,
      maxEdge        ,
    )                                                                {
      const url = URL.createObjectURL(blob);
      try {
        const image = await loadImage(url);
        const iw = image.naturalWidth || source.width;
        const ih = image.naturalHeight || source.height;
        if (!iw || !ih) return null;

        // Work in a virtual box that already has the target aspect ratio.
        const boxH = 1000;
        const boxW = boxH * aspect;
        const geometry = layout(framing, iw, ih, boxW, boxH);

        // Output resolution: as close to native source pixels as the cap allows.
        const nativeScale = geometry.drawW / iw; // box px per source px
        let quality = nativeScale > 0 ? 1 / nativeScale : 1; // source px per box px
        const capByEdge = Math.min(maxEdge / boxW, maxEdge / boxH);
        quality = Math.min(quality, capByEdge, 3);
        quality = Math.max(quality, 0.2);

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(boxW * quality));
        canvas.height = Math.max(1, Math.round(boxH * quality));
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.scale(quality, quality);
        // Same transform chain as the CSS on the live layer: move the source centre
        // to its framed position, then rotate about that centre.
        ctx.translate(geometry.left + geometry.drawW / 2, geometry.top + geometry.drawH / 2);
        ctx.rotate((framing.rotate * Math.PI) / 180);
        ctx.drawImage(image, -geometry.drawW / 2, -geometry.drawH / 2, geometry.drawW, geometry.drawH);

        const out = await canvasToBlob(canvas, 0.94);
        if (!out) return null;
        return { blob: out, width: canvas.width, height: canvas.height };
      } finally {
        URL.revokeObjectURL(url);
      }
    }


    //# sourceURL=src/client/crop.ts
    return { fitScale, layout, framingCss, ASPECTS, aspectRatio, renderCrop };
  };
  __factories["src/client/media.ts"] = function () {
    /**
     * Media helpers: probing uploaded files, extracting preview thumbnails, and the
     * small canvas utilities shared by the crop editor.
     */

                            
                    
                     
                              
                           
     

    function canvasToBlob(canvas                   , quality        )                       {
      return new Promise((resolve) => {
        if (typeof canvas.toBlob !== 'function') {
          resolve(null);
          return;
        }
        try {
          canvas.toBlob((blob) => resolve(blob), 'image/webp', quality);
        } catch {
          resolve(null);
        }
      });
    }

    function blobToDataUrl(blob      )                  {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error ?? new Error('read failed'));
        reader.readAsDataURL(blob);
      });
    }

    function loadImage(url        )                            {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('image decode failed'));
        image.src = url;
      });
    }

    function drawThumb(source                   , width        , height        , max        )                {
      const scale = Math.min(1, max / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      try {
        return canvas.toDataURL('image/webp', 0.72);
      } catch {
        try {
          return canvas.toDataURL('image/jpeg', 0.72);
        } catch {
          return null;
        }
      }
    }

    /** Probe an uploaded image: natural size plus a grid thumbnail. */
    async function probeImage(file      , max        )                 {
      const url = URL.createObjectURL(file);
      try {
        const image = await loadImage(url);
        return {
          width: image.naturalWidth || image.width,
          height: image.naturalHeight || image.height,
          duration: null,
          thumb: drawThumb(image, image.naturalWidth || image.width, image.naturalHeight || image.height, max),
        };
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    /** Probe an uploaded video: size, duration and a frame captured near the start. */
    function probeVideo(file      , max        , timeoutMs        )                 {
      return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        let settled = false;
        const finish = (probe       ) => {
          if (settled) return;
          settled = true;
          video.removeAttribute('src');
          try {
            video.load();
          } catch {
            /* ignore */
          }
          URL.revokeObjectURL(url);
          resolve(probe);
        };
        const timer = window.setTimeout(() => {
          finish({ width: 0, height: 0, duration: null, thumb: null });
        }, timeoutMs);

        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        video.onloadedmetadata = () => {
          const width = video.videoWidth;
          const height = video.videoHeight;
          const duration = Number.isFinite(video.duration) ? video.duration : null;
          // Seek a little way in: the very first frame is often black.
          const target = duration && duration > 0.4 ? Math.min(duration * 0.1, 2) : 0;
          const grab = () => {
            window.clearTimeout(timer);
            let thumb                = null;
            try {
              thumb = drawThumb(video, width, height, max);
            } catch {
              thumb = null;
            }
            finish({ width, height, duration, thumb });
          };
          if (target > 0) {
            video.onseeked = grab;
            try {
              video.currentTime = target;
            } catch {
              grab();
            }
          } else {
            grab();
          }
        };
        video.onerror = () => {
          window.clearTimeout(timer);
          finish({ width: 0, height: 0, duration: null, thumb: null });
        };
        video.src = url;
      });
    }

    function formatBytes(bytes        )         {
      if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      let value = bytes;
      let unit = 0;
      while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
      }
      return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
    }

    function formatDuration(seconds               )         {
      if (!seconds || !Number.isFinite(seconds)) return '--:--';
      const total = Math.round(seconds);
      const minutes = Math.floor(total / 60);
      const rest = total % 60;
      return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
    }


    //# sourceURL=src/client/media.ts
    return { canvasToBlob, blobToDataUrl, loadImage, probeImage, probeVideo, formatBytes, formatDuration };
  };
  __factories["src/client/store.ts"] = function () {
    const { ASSET_STORE, DB_NAME, DB_VERSION, DEFAULTS_KEY, STATE_KEY, STATE_STORE } = __require("src/client/types.ts");
    const { normaliseSettings } = __require("src/client/settings.ts");
    /**
     * Persistence. The wallpaper document (settings + library metadata) and the
     * uploaded image/video blobs both live in IndexedDB in the page's own origin,
     * so nothing is written to the machine, nothing crosses the network, and a
     * refresh or an app restart keeps the wallpaper.
     *
     * When IndexedDB is unavailable (private windows, hardened profiles) the module
     * degrades to an in-memory store: the plugin keeps working for the session and
     * reports that persistence is off instead of throwing.
     */

                                                     


    let dbPromise                                     = null;
    let memoryState                        = null;
    const memoryAssets = new Map              ();
    let persistent = true;

    function isPersistent()          {
      return persistent;
    }

    function openDb()                              {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve) => {
        let request                  ;
        try {
          if (typeof indexedDB === 'undefined' || indexedDB === null) {
            persistent = false;
            resolve(null);
            return;
          }
          request = indexedDB.open(DB_NAME, DB_VERSION);
        } catch {
          persistent = false;
          resolve(null);
          return;
        }
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STATE_STORE)) db.createObjectStore(STATE_STORE);
          if (!db.objectStoreNames.contains(ASSET_STORE)) db.createObjectStore(ASSET_STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          persistent = false;
          resolve(null);
        };
        request.onblocked = () => {
          persistent = false;
          resolve(null);
        };
      });
      return dbPromise;
    }

    function tx   (store        , mode                    , run                                                )                    {
      return openDb().then((db) => {
        if (!db) return null;
        return new Promise          ((resolve) => {
          let request               ;
          // `transaction` must outlive the try block: the abort handler below needs
          // it. Declaring it inside the try made every call throw
          // "ReferenceError: transaction is not defined" — which took down settings
          // loading, settings saving and every upload at once.
          let transaction                ;
          try {
            transaction = db.transaction(store, mode);
            request = run(transaction.objectStore(store));
          } catch {
            persistent = false;
            resolve(null);
            return;
          }
          request.onsuccess = () => resolve(request.result ?? null);
          request.onerror = () => {
            persistent = false;
            resolve(null);
          };
          transaction.onabort = () => resolve(null);
        });
      });
    }

    async function loadSettings()                          {
      const stored = await tx         (STATE_STORE, 'readonly', (objectStore) => objectStore.get(STATE_KEY));
      if (stored === null) return normaliseSettings(memoryState ?? {});
      const settings = normaliseSettings(stored);
      memoryState = settings;
      return settings;
    }

    async function saveSettings(settings                )                {
      memoryState = settings;
      await tx(STATE_STORE, 'readwrite', (objectStore) => objectStore.put(JSON.parse(JSON.stringify(settings)), STATE_KEY));
    }

    /** The installation's own defaults ("set my current settings as the default"). */
    async function loadDefaultTemplate()                          {
      return tx         (STATE_STORE, 'readonly', (objectStore) => objectStore.get(DEFAULTS_KEY));
    }

    async function saveDefaultTemplate(settings                       )                {
      await tx(STATE_STORE, 'readwrite', (objectStore) => {
        if (settings === null) return objectStore.delete(DEFAULTS_KEY);
        return objectStore.put(JSON.parse(JSON.stringify(settings)), DEFAULTS_KEY);
      });
    }

    async function putAsset(id        , blob      )                {
      memoryAssets.set(id, blob);
      await tx(ASSET_STORE, 'readwrite', (objectStore) => objectStore.put(blob, id));
    }

    async function getAsset(id        )                       {
      const blob = await tx      (ASSET_STORE, 'readonly', (objectStore) => objectStore.get(id)                    );
      if (blob instanceof Blob) return blob;
      return memoryAssets.get(id) ?? null;
    }

    async function deleteAsset(id        )                {
      memoryAssets.delete(id);
      await tx(ASSET_STORE, 'readwrite', (objectStore) => objectStore.delete(id));
    }

    /** Free every blob this plugin owns, used by "remove all". */
    async function clearAssets(ids          )                {
      for (const id of ids) await deleteAsset(id);
    }


    //# sourceURL=src/client/store.ts
    return { isPersistent, loadSettings, saveSettings, loadDefaultTemplate, saveDefaultTemplate, putAsset, getAsset, deleteAsset, clearAssets };
  };
  __factories["src/client/settings.ts"] = function () {
    const { EFFECT_IDS, SETTINGS_VERSION, SURFACE_KEYS } = __require("src/client/types.ts");
    /**
     * Default settings plus the small amount of normalisation every mutation goes
     * through, so a hand-edited or older stored document can never put the layer
     * into an impossible state.
     */

                 
                         
                       
               
                     
              
              
                     
                 
                     
                 
                  
                      
                     
                    
                    
                    
                        

    function clamp(value         , min        , max        , fallback        )         {
      const num = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
      return num < min ? min : num > max ? max : num;
    }

    function bool(value         , fallback         )          {
      return typeof value === 'boolean' ? value : fallback;
    }

    function pick                  (value         , allowed     , fallback   )    {
      return typeof value === 'string' && (allowed            ).includes(value) ? (value     ) : fallback;
    }

    function colour(value         , fallback        )         {
      if (typeof value !== 'string') return fallback;
      const text = value.trim();
      if (text === '') return fallback;
      // Accept #rgb / #rrggbb / #rrggbbaa and simple rgb()/hsl() colours only.
      if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text)) return text;
      if (/^(rgb|hsl)a?\([0-9.,%\s/]+\)$/i.test(text)) return text;
      return fallback;
    }

    const FIT_MODES            = ['cover', 'contain', 'fill'];
    const MOTION_MODES               = ['none', 'kenburns', 'drift', 'pulse'];
    const TRANSITIONS                   = ['fade', 'zoom', 'slide', 'blur'];
    const CAROUSEL_ORDERS                  = ['sequential', 'shuffle'];
    const WALLPAPER_KINDS                  = ['image', 'video', 'effect'];

    function defaultFraming()          {
      return { x: 0, y: 0, zoom: 1, rotate: 0, fit: 'cover' };
    }

    function defaultRule(opacity        , blur        , enabled         )              {
      return { enabled, opacity, blur };
    }

    function defaultSettings()                 {
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
    function shippedDefaults()                 {
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
    let defaultTemplate                        = null;

    function clone(settings                )                 {
      return JSON.parse(JSON.stringify(settings))                  ;
    }

    /**
     * Install (or clear) the installation's own defaults.
     *
     * The value is normalised with the template cleared, so it is validated against
     * the shipped defaults and can never be fed by itself.
     */
    function applyDefaultTemplate(value         )       {
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
    function currentDefaultTemplate()                        {
      return defaultTemplate ? clone(defaultTemplate) : null;
    }

    /** JSON of whatever a fresh install or "reset" would use right now. */
    function effectiveDefaultsJson()         {
      return JSON.stringify(defaultSettings(), null, 1);
    }

    function normaliseFraming(input         )          {
      const source = (input ?? {})                    ;
      return {
        x: clamp(source.x, -1, 1, 0),
        y: clamp(source.y, -1, 1, 0),
        zoom: clamp(source.zoom, 1, 4, 1),
        rotate: clamp(source.rotate, -180, 180, 0),
        fit: pick(source.fit, FIT_MODES, 'cover'),
      };
    }

    function normaliseItem(input         )                       {
      const source = (input ?? {})                          ;
      if (typeof source.id !== 'string' || source.id === '') return null;
      const kind = pick(source.kind, WALLPAPER_KINDS, 'image');
      const effectId = pick          (source.effectId, EFFECT_IDS, 'aurora');
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

    function normaliseSettings(input         )                 {
      const base = defaultSettings();
      const source = (input ?? {})                           ;
      const appearance = (source.appearance ?? {})                               ;
      const surfaces = (source.surfaces ?? {})                            ;
      const motion = (source.motion ?? {})                           ;
      const effect = (source.effect ?? {})                           ;
      const carousel = (source.carousel ?? {})                             ;

      const rules = {}                   ;
      for (const key of SURFACE_KEYS) {
        const fallback = base.surfaces[key];
        const value = (surfaces[key] ?? {})                        ;
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

      const items                  = [];
      if (Array.isArray(source.items)) {
        for (const raw of source.items) {
          const item = normaliseItem(raw);
          if (item) items.push(item);
        }
      }

      const ids = Array.isArray(carousel.ids) ? carousel.ids.filter((id)               => typeof id === 'string') : [];
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
          id: pick          (effect.id, EFFECT_IDS, base.effect.id),
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
    function rotationPool(settings                )                  {
      const pool = settings.carousel.ids.length > 0
        ? settings.items.filter((item) => settings.carousel.ids.includes(item.id))
        : settings.items.slice();
      return pool.filter((item) => item.kind !== 'effect' || item.effectId !== null);
    }

    function findItem(settings                , id               )                       {
      if (!id) return null;
      return settings.items.find((item) => item.id === id) ?? null;
    }


    //# sourceURL=src/client/settings.ts
    return { FIT_MODES, MOTION_MODES, TRANSITIONS, CAROUSEL_ORDERS, WALLPAPER_KINDS, defaultFraming, defaultRule, defaultSettings, shippedDefaults, applyDefaultTemplate, currentDefaultTemplate, effectiveDefaultsJson, normaliseFraming, normaliseItem, normaliseSettings, rotationPool, findItem };
  };
  __factories["src/client/i18n.ts"] = function () {
    /**
     * Tiny built-in dictionary. The plugin ships with Chinese and English strings
     * and picks one from the page language, so it reads correctly in a deployment
     * where no locale service is reachable from a client plugin.
     */

                                   

    /** Dictionary namespace registered with the Client locale service when present. */
    const NS = 'wallpaper-studio';

    const zh                         = {
      'plugin.title': '壁纸工作室',
      'plugin.summary': '自定义背景：图片/视频、透明度、模糊、暗化、动态特效、轮播与裁切构图。',
      'section.title': '背景壁纸',
      'section.subtitle': '给整个界面铺一张壁纸，并让侧边栏、内容区和输入框一起透出来。',

      'toggle.enable': '启用壁纸',
      'toggle.enableHint': '关闭后保留全部设置，只是暂时不显示背景。',
      'tab.library': '壁纸库',
      'tab.look': '外观调节',
      'tab.effect': '动态特效',
      'tab.carousel': '背景轮播',
      'tab.surfaces': '界面透出',
      'tab.advanced': '高级',

      'library.empty': '还没有壁纸。拖入图片或视频，或点击下面的按钮上传。',
      'library.upload': '上传图片 / 视频',
      'library.drop': '把图片或视频拖到这里',
      'library.addEffect': '把当前特效存入壁纸库',
      'library.active': '使用中',
      'library.use': '设为壁纸',
      'library.crop': '裁切构图',
      'library.rename': '重命名',
      'library.remove': '删除',
      'library.effect': '特效',

      'look.opacity': '不透明度',
      'look.blur': '模糊',
      'look.darken': '暗化',
      'look.brightness': '亮度',
      'look.saturate': '饱和度',
      'look.vignette': '暗角',
      'look.zoom': '缩放',
      'look.offsetX': '水平位置',
      'look.offsetY': '垂直位置',
      'look.motion': '缓慢动效',
      'look.motionAmount': '动效幅度',
      'look.motionSpeed': '动效速度',
      'look.resetLook': '恢复外观默认值',
      'motion.none': '静止',
      'motion.kenburns': '推拉',
      'motion.drift': '漂移',
      'motion.pulse': '呼吸',

      'effect.none': '不使用',
      'effect.aurora': '极光',
      'effect.starfield': '星河流转',
      'effect.particles': '浮光粒子',
      'effect.waves': '层叠波浪',
      'effect.rays': '光束',
      'effect.rain': '细雨',
      'effect.intensity': '强度',
      'effect.speed': '速度',
      'effect.color': '主色',
      'effect.accent': '辅色',
      'effect.asBackground': '把特效铺成背景',
      'effect.addToLibrary': '存入壁纸库',
      'effect.note': '特效铺满整屏，会叠加在当前壁纸之上；也可以单独存入壁纸库当作背景使用。',
      'effect.canvas': '特效画布',
      'effect.reducedMotion': '系统开启了「减少动态效果」，动效已暂停（壁纸仍会显示）。',
      'effect.allowMotion': '仍然播放动效',

      'carousel.enable': '开启轮播',
      'carousel.interval': '切换间隔（秒）',
      'carousel.order': '顺序',
      'carousel.order.sequential': '按列表顺序',
      'carousel.order.shuffle': '随机',
      'carousel.transition': '过渡方式',
      'carousel.transition.fade': '淡入淡出',
      'carousel.transition.zoom': '缩放',
      'carousel.transition.slide': '平移',
      'carousel.transition.blur': '模糊切换',
      'carousel.duration': '过渡时长（毫秒）',
      'carousel.members': '参与轮播的壁纸',
      'carousel.all': '全部壁纸',
      'carousel.hint': '不勾选任何一张时，轮播会使用壁纸库里的全部内容。',
      'carousel.next': '立即切换下一张',

      'surfaces.note': '「内容区」是整窗底色（窗口框架、对话区、文档），它决定壁纸能不能透出来；侧边栏只改侧边栏自己那一条；「菜单与弹层」覆盖弹层材质、下拉选择器以及对话框 / 卡片那一层，所以调它时设置面板本身就会跟着变；输入框只管输入卡片。',
      'surface.sidebar': '侧边栏',
      'surface.content': '内容区',
      'surface.input': '输入框',
      'surface.menus': '菜单与弹层',
      'surface.opacity': '面板不透明度',
      'surface.blur': '背后模糊',
      'surface.scrim': '整体压暗',
      'surface.enabled': '透出壁纸',

      'advanced.persist': '保存状态',
      'advanced.persistOn': '本地已保存（IndexedDB）',
      'advanced.persistOff': '当前会话有效（无法使用本地存储）',
      'advanced.reducedMotion': '跟随系统“减少动态效果”',
      'advanced.pauseHidden': '窗口在后台时暂停动画',
      'advanced.videoSound': '播放视频声音',
      'advanced.videoVolume': '视频音量',
      'advanced.diagnosis': '自检',
      'advanced.diagnosisNote': '壁纸看不见时先看这里：它能区分「图层没显示」「没有画面」「面板没变透明（令牌被别的插件覆盖）」。',
      'diag.layer': '背景层',
      'diag.version': '版本',
      'diag.frost': '霜面实测',
      'diag.effect': '特效',
      'diag.running': '运行中',
      'diag.paused': '已暂停',
      'diag.idle': '未启动',
      'diag.suppressed': '被「减少动态效果」抑制',
      'diag.mounted': '已挂载',
      'diag.shown': '显示中',
      'diag.hidden': '已隐藏',
      'diag.hasMedia': '有画面',
      'diag.noMedia': '无画面',
      'diag.surfaces': '表面覆盖',
      'defaults.title': '默认值',
      'defaults.note': '「默认值」指新建/重置时使用的那一套。你可以把现在屏幕上的设置直接存成默认值，之后「清除全部壁纸与设置」就会回到它。',
      'defaults.shipped': '当前：出厂默认值',
      'defaults.custom': '当前：已把你自己保存的那套作为默认值',
      'defaults.save': '把当前设置设为默认值',
      'defaults.clear': '恢复出厂默认值',
      'defaults.saved': '已把当前设置设为默认值',
      'defaults.cleared': '已恢复出厂默认值',
      'defaults.json': '默认值 JSON',
      'defaults.jsonHint': '这段 JSON 就是当前的默认值（不含壁纸文件本身）；需要带到别的机器时可以直接复制。',
      'diag.declared': '已写入',
      'diag.effective': '生效',
      'diag.hijacked': '被覆盖',
      'diag.sample': '示例',
      'diag.noMediaHint': '没有画面：这张壁纸的原图可能没存进浏览器存储，删掉重新上传一次即可。',
      'diag.noActive': '当前没有选中的壁纸，请在上面的壁纸库点一张。',
      'advanced.soundBlocked': '浏览器拒绝了带声音的自动播放，已暂时静音；点一下页面再打开音量即可。',
      'advanced.reset': '清除全部壁纸与设置',
      'advanced.shortcut': '快捷键',
      'advanced.shortcutHint': '按 Alt+B 快速开关壁纸。',
      'advanced.storage': '已用壁纸',

      'crop.title': '裁切构图',
      'crop.hint': '拖动图片调整位置，滚轮缩放，右侧滑块可以做精细调整。保存后会写入新的图片副本。',
      'crop.aspect': '画幅比例',
      'crop.aspect.window': '跟随窗口',
      'crop.aspect.source': '原图比例',
      'crop.zoom': '缩放',
      'crop.rotate': '旋转',
      'crop.offsetX': '水平',
      'crop.offsetY': '垂直',
      'crop.fit': '填充方式',
      'crop.fit.cover': '铺满裁切',
      'crop.fit.contain': '完整显示',
      'crop.fit.fill': '拉伸铺满',
      'crop.reset': '重置构图',
      'crop.apply': '保存裁切',
      'crop.cancel': '取消',
      'crop.working': '正在处理…',
      'crop.videoNote': '视频无法重新编码，这里保存的是构图参数，会用于播放时的取景。',
      'crop.saved': '构图已保存',
      'crop.failed': '裁切失败，请换一张图片重试。',

      'common.on': '开',
      'common.off': '关',
      'common.close': '关闭',
      'common.remove': '移除',
      'common.confirm': '确定',
      'common.cancel': '取消',
      'common.none': '未选择壁纸',
      'common.seconds': '秒',
      'common.uploading': '正在读取文件…',
      'common.tooLarge': '文件太大（{name}），请压缩后再上传。',
      'common.unsupported': '不支持的文件类型，请选择图片或视频。',
      'common.undecodable': '浏览器无法解码「{name}」。若是 HEIC / H.265 等格式，请先转成 JPG/PNG 或 MP4(H.264)。',
      'common.storeFailed': '「{name}」读取成功但保存失败：浏览器存储不可用或已满。',
      'common.added': '已加入壁纸库',
      'common.removed': '已删除',
      'quick.open': '壁纸工作室',
      'quick.toggle': '开关壁纸',
      'quick.next': '下一张壁纸',
      'quick.settings': '打开设置',
    };

    const en                         = {
      'plugin.title': 'Wallpaper Studio',
      'plugin.summary': 'Custom background: image/video, opacity, blur, darken, animated effects, carousel and manual crop.',
      'section.title': 'Background wallpaper',
      'section.subtitle': 'Paint one wallpaper behind the whole app and let the sidebar, transcript and composer show it through.',

      'toggle.enable': 'Enable wallpaper',
      'toggle.enableHint': 'Turning this off keeps every setting, it just hides the background.',
      'tab.library': 'Library',
      'tab.look': 'Appearance',
      'tab.effect': 'Effects',
      'tab.carousel': 'Carousel',
      'tab.surfaces': 'See-through',
      'tab.advanced': 'Advanced',

      'library.empty': 'No wallpaper yet. Drop images or videos here, or upload below.',
      'library.upload': 'Upload image / video',
      'library.drop': 'Drop images or videos here',
      'library.addEffect': 'Save current effect to the library',
      'library.active': 'In use',
      'library.use': 'Use as wallpaper',
      'library.crop': 'Crop framing',
      'library.rename': 'Rename',
      'library.remove': 'Remove',
      'library.effect': 'Effect',

      'look.opacity': 'Opacity',
      'look.blur': 'Blur',
      'look.darken': 'Darken',
      'look.brightness': 'Brightness',
      'look.saturate': 'Saturation',
      'look.vignette': 'Vignette',
      'look.zoom': 'Zoom',
      'look.offsetX': 'Horizontal',
      'look.offsetY': 'Vertical',
      'look.motion': 'Slow motion',
      'look.motionAmount': 'Motion amount',
      'look.motionSpeed': 'Motion speed',
      'look.resetLook': 'Reset appearance',
      'motion.none': 'Still',
      'motion.kenburns': 'Push in',
      'motion.drift': 'Drift',
      'motion.pulse': 'Breathe',

      'effect.none': 'None',
      'effect.aurora': 'Aurora',
      'effect.starfield': 'Starfield',
      'effect.particles': 'Bokeh motes',
      'effect.waves': 'Waves',
      'effect.rays': 'Light rays',
      'effect.rain': 'Rain',
      'effect.intensity': 'Intensity',
      'effect.speed': 'Speed',
      'effect.color': 'Primary',
      'effect.accent': 'Accent',
      'effect.asBackground': 'Use effect as background',
      'effect.addToLibrary': 'Save to library',
      'effect.note': 'The effect fills the screen above the wallpaper; it can also be saved as its own background.',
      'effect.canvas': 'Effect canvas',
      'effect.reducedMotion': 'The system asks for reduced motion, so animated effects are paused (the wallpaper still shows).',
      'effect.allowMotion': 'Play effects anyway',

      'carousel.enable': 'Enable carousel',
      'carousel.interval': 'Interval (seconds)',
      'carousel.order': 'Order',
      'carousel.order.sequential': 'List order',
      'carousel.order.shuffle': 'Shuffle',
      'carousel.transition': 'Transition',
      'carousel.transition.fade': 'Cross fade',
      'carousel.transition.zoom': 'Zoom',
      'carousel.transition.slide': 'Slide',
      'carousel.transition.blur': 'Blur',
      'carousel.duration': 'Transition length (ms)',
      'carousel.members': 'Wallpapers in rotation',
      'carousel.all': 'All wallpapers',
      'carousel.hint': 'With nothing selected, every wallpaper in the library rotates.',
      'carousel.next': 'Switch to the next wallpaper',

      'surfaces.note': 'The transcript pane owns the window base (frame, conversation, documents), so it decides whether the wallpaper can show at all. The sidebar only tints the sidebar column. Menus & popovers cover the popover material, dropdown selectors and the elevated dialog/card layer — the settings dialog itself changes as you drag it. The composer slider only touches the composer card.',
      'surface.sidebar': 'Sidebar',
      'surface.content': 'Transcript',
      'surface.input': 'Composer',
      'surface.menus': 'Menus & popovers',
      'surface.opacity': 'Pane opacity',
      'surface.blur': 'Backdrop blur',
      'surface.scrim': 'Global dim',
      'surface.enabled': 'Show wallpaper through',

      'advanced.persist': 'Persistence',
      'advanced.persistOn': 'Saved locally (IndexedDB)',
      'advanced.persistOff': 'This session only (local storage unavailable)',
      'advanced.reducedMotion': 'Follow the system reduce-motion preference',
      'advanced.pauseHidden': 'Pause animation while the window is in the background',
      'advanced.videoSound': 'Play video sound',
      'advanced.videoVolume': 'Video volume',
      'advanced.diagnosis': 'Self-check',
      'advanced.diagnosisNote': 'When the wallpaper is not visible, start here: it separates "layer hidden", "no image loaded" and "panes never became translucent (tokens overridden by another plugin)".',
      'diag.layer': 'Layer',
      'diag.version': 'Version',
      'diag.frost': 'Frost rects',
      'diag.effect': 'Effect',
      'diag.running': 'running',
      'diag.paused': 'paused',
      'diag.idle': 'idle',
      'diag.suppressed': 'suppressed by reduce-motion',
      'diag.mounted': 'mounted',
      'diag.shown': 'visible',
      'diag.hidden': 'hidden',
      'diag.hasMedia': 'has image',
      'diag.noMedia': 'no image',
      'diag.surfaces': 'Surface overrides',
      'defaults.title': 'Defaults',
      'defaults.note': 'The defaults are what a fresh install or "clear everything" starts from. You can store the settings on screen right now as those defaults; after that, "delete every wallpaper and setting" comes back to them.',
      'defaults.shipped': 'Now using: the shipped defaults',
      'defaults.custom': 'Now using: your own saved defaults',
      'defaults.save': 'Set current settings as the default',
      'defaults.clear': 'Back to the shipped defaults',
      'defaults.saved': 'Current settings are now the defaults',
      'defaults.cleared': 'Shipped defaults restored',
      'defaults.json': 'Defaults JSON',
      'defaults.jsonHint': 'This JSON is the current defaults (wallpaper files excluded) — copy it to carry the setup to another machine.',
      'diag.declared': 'declared',
      'diag.effective': 'effective',
      'diag.hijacked': 'overridden',
      'diag.sample': 'sample',
      'diag.noMediaHint': 'No image: this wallpaper\'s original file is probably missing from browser storage. Remove it and upload it again.',
      'diag.noActive': 'No wallpaper is selected — pick one in the Library tab above.',
      'advanced.soundBlocked': 'The browser blocked autoplay with sound, so the video stays muted. Click the page once, then raise the volume again.',
      'advanced.reset': 'Delete every wallpaper and setting',
      'advanced.shortcut': 'Shortcut',
      'advanced.shortcutHint': 'Press Alt+B to toggle the wallpaper.',
      'advanced.storage': 'Stored wallpapers',

      'crop.title': 'Crop framing',
      'crop.hint': 'Drag the image to move it, scroll to zoom, or use the sliders. Saving writes a new image copy.',
      'crop.aspect': 'Aspect',
      'crop.aspect.window': 'Window',
      'crop.aspect.source': 'Source',
      'crop.zoom': 'Zoom',
      'crop.rotate': 'Rotate',
      'crop.offsetX': 'Horizontal',
      'crop.offsetY': 'Vertical',
      'crop.fit': 'Fit',
      'crop.fit.cover': 'Cover & crop',
      'crop.fit.contain': 'Show all',
      'crop.fit.fill': 'Stretch',
      'crop.reset': 'Reset framing',
      'crop.apply': 'Save crop',
      'crop.cancel': 'Cancel',
      'crop.working': 'Working…',
      'crop.videoNote': 'Video cannot be re-encoded, so this stores framing parameters used during playback.',
      'crop.saved': 'Framing saved',
      'crop.failed': 'Crop failed. Try another image.',

      'common.on': 'On',
      'common.off': 'Off',
      'common.close': 'Close',
      'common.remove': 'Remove',
      'common.confirm': 'Confirm',
      'common.cancel': 'Cancel',
      'common.none': 'No wallpaper selected',
      'common.seconds': 's',
      'common.uploading': 'Reading files…',
      'common.tooLarge': 'That file is too large ({name}); compress it and try again.',
      'common.unsupported': 'Unsupported file type. Choose an image or a video.',
      'common.undecodable': 'The browser cannot decode "{name}". For HEIC / H.265 and similar, convert it to JPG/PNG or MP4 (H.264) first.',
      'common.storeFailed': '"{name}" was read but could not be saved: browser storage is unavailable or full.',
      'common.added': 'Added to the library',
      'common.removed': 'Removed',
      'quick.open': 'Wallpaper Studio',
      'quick.toggle': 'Toggle wallpaper',
      'quick.next': 'Next wallpaper',
      'quick.settings': 'Open settings',
    };

    function detectLang()       {
      const candidates           = [];
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.language === 'string') candidates.push(navigator.language);
        if (typeof navigator !== 'undefined' && Array.isArray(navigator.languages)) candidates.push(...navigator.languages);
        if (typeof document !== 'undefined' && document.documentElement) {
          candidates.push(document.documentElement.lang || '');
        }
      } catch {
        /* ignore */
      }
      for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.toLowerCase().startsWith('zh')) return 'zh';
      }
      return 'en';
    }

    function translate(lang      , key        , vars                                  )         {
      const table = lang === 'zh' ? zh : en;
      const fallback = en[key] ?? key;
      let text = table[key] ?? fallback;
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          // split/join instead of a RegExp: placeholder names are not pattern-safe.
          text = text.split(`{${name}}`).join(String(value));
        }
      }
      return text;
    }


    //# sourceURL=src/client/i18n.ts
    return { NS, zh, en, detectLang, translate };
  };
  __factories["src/client/panel.ts"] = function () {
    const { CropEditor } = __require("src/client/cropEditor.ts");
    const { describeSurfaces } = __require("src/client/theme.ts");
    const { EFFECT_IDS, PLUGIN_VERSION, SURFACE_KEYS } = __require("src/client/types.ts");
    const { Button, Card, IconButton, Segmented, Slider, Toggle, useStudio, useToast } = __require("src/client/ui.ts");
    /**
     * The Settings page: wallpaper library, appearance, animated effects, carousel,
     * pane see-through and advanced controls. Registered into the Harness
     * `settings.section` list slot by `main.ts`.
     */



                                                                                                                                     

                                                
                                              

    const TABS = ['library', 'look', 'effect', 'carousel', 'surfaces', 'advanced']         ;
                                     

                         
                  
                     
     

    function effectTile(rt         , effectId          , color        , accent        , label        )          {
      const backgrounds                         = {
        none: 'linear-gradient(135deg,#3a3f4b,#20242c)',
        aurora: `linear-gradient(140deg,${color},${accent} 55%,#0b1020)`,
        starfield: `radial-gradient(120% 120% at 20% 10%,${accent}55,transparent 55%),linear-gradient(160deg,#05070f,#111a33)`,
        particles: `radial-gradient(60% 60% at 30% 30%,${color}88,transparent 60%),linear-gradient(160deg,#0a0f1c,#1b2333)`,
        waves: `linear-gradient(180deg,#0b1220,${color} 70%,${accent})`,
        rays: `conic-gradient(from 200deg at 50% -10%,${accent},${color},#0b1020)`,
        rain: `linear-gradient(180deg,#0d1117,${color})`,
      };
      return rt.h('div', {
        className: 'dws-thumbFx',
        style: { background: backgrounds[effectId] ?? backgrounds.none },
        'aria-label': label,
        title: label,
      });
    }

    function createSettingsSection(deps           )                                              {
      const { rt, studio } = deps;

      return function SettingsSection()          {
        const settings = useStudio(rt, studio)                  ;
        const toast = useToast(rt, studio);
        const [tab, setTab] = rt.useState     ('library');
        const [cropId, setCropId] = rt.useState               (null);
        const [renaming, setRenaming] = rt.useState               (null);
        const [draft, setDraft] = rt.useState('');
        const [reading, setReading] = rt.useState(false);
        const [dragOver, setDragOver] = rt.useState(false);
        const fileRef = rt.useRef                         (null);

        const t = (key        ) => studio.t(key);
        const items = settings.items;
        const activeItem = items.find((item) => item.id === settings.activeId) ?? null;
        const cropItem = cropId ? items.find((item) => item.id === cropId) ?? null : null;

        const pickFiles = async (files               ) => {
          if (!files || files.length === 0) return;
          setReading(true);
          try {
            await studio.addFiles(files);
          } finally {
            setReading(false);
          }
        };

        const tabs = TABS.map((id) =>
          rt.h(
            'button',
            {
              key: id,
              type: 'button',
              className: 'dws-tab',
              role: 'tab',
              'aria-selected': tab === id ? 'true' : 'false',
              onClick: () => setTab(id),
            },
            t(`tab.${id}`),
          ),
        );

        const libraryTab = () => {
          const tiles = items.map((item) => {
            const isActive = item.id === settings.activeId;
            const preview =
              item.kind === 'effect'
                ? effectTile(rt, item.effectId ?? 'aurora', settings.effect.color, settings.effect.accent, item.name)
                : item.thumb
                  ? rt.h('img', { src: item.thumb, alt: '', draggable: false })
                  : rt.h('div', { className: 'dws-thumbFx', style: { background: 'linear-gradient(135deg,#2b3040,#141821)' } });
            return rt.h(
              'div',
              {
                key: item.id,
                className: 'dws-thumb',
                'data-active': isActive ? 'true' : 'false',
                role: 'button',
                tabIndex: 0,
                title: t('library.use'),
                onClick: () => studio.activate(item.id),
                onKeyDown: (event                 ) => {
                  if (event.key === 'Enter' || event.key === ' ') studio.activate(item.id);
                },
              },
              preview,
              isActive ? rt.h('span', { className: 'dws-badge' }, t('library.active')) : null,
              rt.h(
                'div',
                { className: 'dws-thumbActions' },
                item.kind !== 'effect'
                  ? rt.h(IconButton, {
                      rt,
                      label: t('library.crop'),
                      glyph: '⛶',
                      onClick: () => setCropId(item.id),
                    })
                  : null,
                rt.h(IconButton, {
                  rt,
                  label: t('library.rename'),
                  glyph: '✎',
                  onClick: () => {
                    setRenaming(item.id);
                    setDraft(item.name);
                  },
                }),
                rt.h(IconButton, {
                  rt,
                  label: t('library.remove'),
                  glyph: '🗑',
                  onClick: () => void studio.removeItem(item.id),
                }),
              ),
              rt.h(
                'div',
                { className: 'dws-thumbBar' },
                renaming === item.id
                  ? rt.h('input', {
                      className: 'dws-renameInput',
                      value: draft,
                      autoFocus: true,
                      onClick: (event                                 ) => event.stopPropagation(),
                      onChange: (event                               ) => setDraft(event.target.value),
                      onBlur: () => {
                        studio.renameItem(item.id, draft);
                        setRenaming(null);
                      },
                      onKeyDown: (event                 ) => {
                        if (event.key === 'Enter') {
                          studio.renameItem(item.id, draft);
                          setRenaming(null);
                        }
                        if (event.key === 'Escape') setRenaming(null);
                      },
                    })
                  : rt.h('span', { className: 'dws-thumbName' }, item.name),
                item.kind === 'video' ? rt.h('span', { className: 'dws-thumbName', style: { flex: 'none' } }, '▶') : null,
              ),
            );
          });

          return rt.h(
            'div',
            { className: 'dws-body' },
            rt.h(
              'div',
              {
                className: 'dws-drop',
                'data-over': dragOver ? 'true' : 'false',
                onDragOver: (event                                ) => {
                  event.preventDefault();
                  setDragOver(true);
                },
                onDragLeave: () => setDragOver(false),
                onDrop: (event                                                                          ) => {
                  event.preventDefault();
                  setDragOver(false);
                  void pickFiles(event.dataTransfer.files ? Array.from(event.dataTransfer.files) : null);
                },
              },
              t('library.drop'),
            ),
            rt.h(
              'div',
              { className: 'dws-inline' },
              rt.h(Button, {
                rt,
                label: reading ? t('common.uploading') : t('library.upload'),
                variant: 'primary',
                disabled: reading,
                onClick: () => fileRef.current?.click(),
              }),
              rt.h(Button, { rt, label: t('library.addEffect'), onClick: () => studio.addEffectItem() }),
              rt.h('input', {
                ref: fileRef,
                type: 'file',
                accept: 'image/*,video/*',
                multiple: true,
                style: { display: 'none' },
                onChange: (event                                                       ) => {
                  const files = event.target.files ? Array.from(event.target.files) : null;
                  event.target.value = '';
                  void pickFiles(files);
                },
              }),
            ),
            items.length === 0 ? rt.h('div', { className: 'dws-empty' }, t('library.empty')) : rt.h('div', { className: 'dws-grid' }, tiles),
          );
        };

        const lookTab = () => {
          const look = settings.appearance;
          return rt.h(
            'div',
            { className: 'dws-body' },
            rt.h(
              Card,
              { rt, title: t('tab.look') },
              rt.h(Slider, { rt, label: t('look.opacity'), value: look.opacity, min: 0, max: 100, suffix: '%', onChange: (value        ) => studio.updateAppearance({ opacity: value }) }),
              rt.h(Slider, { rt, label: t('look.blur'), value: look.blur, min: 0, max: 60, suffix: 'px', onChange: (value        ) => studio.updateAppearance({ blur: value }) }),
              rt.h(Slider, { rt, label: t('look.darken'), value: look.darken, min: 0, max: 100, suffix: '%', onChange: (value        ) => studio.updateAppearance({ darken: value }) }),
              rt.h(Slider, { rt, label: t('look.brightness'), value: look.brightness, min: 0, max: 200, suffix: '%', onChange: (value        ) => studio.updateAppearance({ brightness: value }) }),
              rt.h(Slider, { rt, label: t('look.saturate'), value: look.saturate, min: 0, max: 200, suffix: '%', onChange: (value        ) => studio.updateAppearance({ saturate: value }) }),
              rt.h(Slider, { rt, label: t('look.vignette'), value: look.vignette, min: 0, max: 100, suffix: '%', onChange: (value        ) => studio.updateAppearance({ vignette: value }) }),
            ),
            rt.h(
              Card,
              { rt, title: t('look.zoom'), note: t('effect.note') },
              rt.h(Slider, { rt, label: t('look.zoom'), value: look.zoom, min: 1, max: 2, step: 0.01, suffix: '×', onChange: (value        ) => studio.updateAppearance({ zoom: value }) }),
              rt.h(Slider, { rt, label: t('look.offsetX'), value: look.offsetX, min: -50, max: 50, suffix: '%', onChange: (value        ) => studio.updateAppearance({ offsetX: value }) }),
              rt.h(Slider, { rt, label: t('look.offsetY'), value: look.offsetY, min: -50, max: 50, suffix: '%', onChange: (value        ) => studio.updateAppearance({ offsetY: value }) }),
              rt.h(Segmented, {
                rt,
                label: t('look.motion'),
                value: settings.motion.mode,
                options: [
                  { value: 'none'              , label: t('motion.none') },
                  { value: 'kenburns'              , label: t('motion.kenburns') },
                  { value: 'drift'              , label: t('motion.drift') },
                  { value: 'pulse'              , label: t('motion.pulse') },
                ],
                onChange: (value            ) => studio.updateMotion({ mode: value }),
              }),
              rt.h(Slider, { rt, label: t('look.motionAmount'), value: settings.motion.amount, min: 0, max: 100, suffix: '%', onChange: (value        ) => studio.updateMotion({ amount: value }) }),
              rt.h(Slider, { rt, label: t('look.motionSpeed'), value: settings.motion.speed, min: 0.2, max: 4, step: 0.1, suffix: '×', onChange: (value        ) => studio.updateMotion({ speed: value }) }),
              rt.h(Button, {
                rt,
                label: t('look.resetLook'),
                onClick: () => {
                  studio.updateAppearance({ opacity: 100, blur: 0, darken: 18, brightness: 100, saturate: 100, vignette: 0, zoom: 1, offsetX: 0, offsetY: 0 });
                  studio.updateMotion({ mode: 'kenburns', amount: 18, speed: 1 });
                },
              }),
            ),
            activeItem ? rt.h('p', { className: 'dws-note', style: { margin: 0 } }, `${t('library.active')}: ${activeItem.name}`) : null,
          );
        };

        const effectTab = () => {
          const effect = settings.effect;
          const effectStatus = studio.layer.effectStatus();
          const tiles = EFFECT_IDS.map((id) =>
            rt.h(
              'button',
              {
                key: id,
                type: 'button',
                className: 'dws-thumb',
                'data-effect-id': id,
                'data-active': effect.id === id ? 'true' : 'false',
                onClick: () => {
                  studio.updateEffect({ id });
                  if (id !== 'none') studio.update({ enabled: true, effectOverlay: true });
                },
              },
              effectTile(rt, id, effect.color, effect.accent, t(`effect.${id}`)),
              rt.h('div', { className: 'dws-thumbBar' }, rt.h('span', { className: 'dws-thumbName' }, t(`effect.${id}`))),
            ),
          );
          return rt.h(
            'div',
            { className: 'dws-body' },
            rt.h('p', { className: 'dws-note', style: { margin: 0 } }, t('effect.note')),
            // An effect that cannot animate must say why, instead of looking broken.
            effectStatus.reducedMotion
              ? rt.h(
                  'div',
                  { className: 'dws-card', style: { borderColor: 'var(--dsw-alias-border-l3)' } },
                  rt.h('span', { className: 'dws-note' }, t('effect.reducedMotion')),
                  rt.h(Button, {
                    rt,
                    label: t('effect.allowMotion'),
                    onClick: () => studio.update({ respectReducedMotion: false }),
                  }),
                )
              : null,
            effectStatus.width < 2 || effectStatus.height < 2
              ? rt.h('p', { className: 'dws-note', style: { margin: 0 } }, `${t('effect.canvas')}: ${effectStatus.width}×${effectStatus.height}`)
              : null,
            rt.h('div', { className: 'dws-grid' }, tiles),
            rt.h(
              Card,
              { rt },
              rt.h(Slider, { rt, label: t('effect.intensity'), value: effect.intensity, min: 0, max: 100, suffix: '%', onChange: (value        ) => studio.updateEffect({ intensity: value }) }),
              rt.h(Slider, { rt, label: t('effect.speed'), value: effect.speed, min: 0.2, max: 4, step: 0.1, suffix: '×', onChange: (value        ) => studio.updateEffect({ speed: value }) }),
              rt.h(
                'div',
                { className: 'dws-row' },
                rt.h('span', { className: 'dws-rowLabel' }, t('effect.color')),
                rt.h(
                  'span',
                  { className: 'dws-inline' },
                  rt.h('input', {
                    type: 'color',
                    className: 'dws-color',
                    value: effect.color,
                    'aria-label': t('effect.color'),
                    onChange: (event                               ) => studio.updateEffect({ color: event.target.value }),
                  }),
                  rt.h('span', { className: 'dws-rowLabel' }, t('effect.accent')),
                  rt.h('input', {
                    type: 'color',
                    className: 'dws-color',
                    value: effect.accent,
                    'aria-label': t('effect.accent'),
                    onChange: (event                               ) => studio.updateEffect({ accent: event.target.value }),
                  }),
                ),
              ),
              rt.h(Toggle, {
                rt,
                label: t('effect.asBackground'),
                hint: t('effect.note'),
                checked: settings.effectOverlay,
                onChange: (checked         ) => studio.update({ effectOverlay: checked, enabled: checked ? true : settings.enabled }),
              }),
              rt.h(Button, { rt, label: t('effect.addToLibrary'), onClick: () => studio.addEffectItem() }),
            ),
          );
        };

        const carouselTab = () => {
          const carousel = settings.carousel;
          const rows = items.map((item) =>
            rt.h(
              'label',
              { key: item.id, className: 'dws-listRow' },
              rt.h('input', {
                type: 'checkbox',
                checked: carousel.ids.includes(item.id),
                onChange: (event                                  ) => {
                  const ids = event.target.checked
                    ? [...carousel.ids, item.id]
                    : carousel.ids.filter((entry) => entry !== item.id);
                  studio.updateCarousel({ ids });
                },
              }),
              item.thumb ? rt.h('img', { src: item.thumb, alt: '' }) : rt.h('span', { style: { width: '44px' } }),
              rt.h('span', { className: 'dws-thumbName', style: { color: 'inherit' } }, item.name),
            ),
          );
          return rt.h(
            'div',
            { className: 'dws-body' },
            rt.h(
              Card,
              { rt },
              rt.h(Toggle, {
                rt,
                label: t('carousel.enable'),
                checked: carousel.enabled,
                onChange: (checked         ) => studio.updateCarousel({ enabled: checked }),
              }),
              rt.h(Slider, { rt, label: t('carousel.interval'), value: carousel.intervalSec, min: 5, max: 600, step: 5, suffix: 's', onChange: (value        ) => studio.updateCarousel({ intervalSec: value }) }),
              rt.h(Slider, { rt, label: t('carousel.duration'), value: carousel.durationMs, min: 200, max: 4000, step: 100, suffix: 'ms', onChange: (value        ) => studio.updateCarousel({ durationMs: value }) }),
              rt.h(Segmented, {
                rt,
                label: t('carousel.order'),
                value: carousel.order,
                options: [
                  { value: 'sequential'                 , label: t('carousel.order.sequential') },
                  { value: 'shuffle'                 , label: t('carousel.order.shuffle') },
                ],
                onChange: (value               ) => studio.updateCarousel({ order: value }),
              }),
              rt.h(Segmented, {
                rt,
                label: t('carousel.transition'),
                value: carousel.transition,
                options: [
                  { value: 'fade'                  , label: t('carousel.transition.fade') },
                  { value: 'zoom'                  , label: t('carousel.transition.zoom') },
                  { value: 'slide'                  , label: t('carousel.transition.slide') },
                  { value: 'blur'                  , label: t('carousel.transition.blur') },
                ],
                onChange: (value                ) => studio.updateCarousel({ transition: value }),
              }),
              rt.h(Button, { rt, label: t('carousel.next'), onClick: () => void studio.next() }),
            ),
            rt.h(
              Card,
              { rt, title: t('carousel.members'), note: t('carousel.hint') },
              items.length === 0 ? rt.h('div', { className: 'dws-empty' }, t('library.empty')) : rt.h('div', { className: 'dws-list' }, rows),
            ),
          );
        };

        const surfacesTab = () => {
          const cards = SURFACE_KEYS.map((key            ) => {
            const rule = settings.surfaces[key];
            return rt.h(
              Card,
              { rt, key, title: t(`surface.${key}`) },
              rt.h(Toggle, {
                rt,
                label: t('surface.enabled'),
                checked: rule.enabled,
                onChange: (checked         ) => studio.updateSurface(key, { enabled: checked }),
              }),
              rt.h(Slider, {
                rt,
                label: t('surface.opacity'),
                value: rule.opacity,
                min: 0,
                max: 100,
                suffix: '%',
                disabled: !rule.enabled,
                onChange: (value        ) => studio.updateSurface(key, { opacity: value }),
              }),
              rt.h(Slider, {
                rt,
                label: t('surface.blur'),
                value: rule.blur,
                min: 0,
                max: 40,
                suffix: 'px',
                disabled: !rule.enabled,
                onChange: (value        ) => studio.updateSurface(key, { blur: value }),
              }),
            );
          });
          return rt.h(
            'div',
            { className: 'dws-body' },
            rt.h('p', { className: 'dws-note', style: { margin: 0 } }, t('surfaces.note')),
            cards,
            rt.h(Card, { rt }, rt.h(Slider, {
              rt,
              label: t('surface.scrim'),
              value: settings.surfaces.scrim,
              min: 0,
              max: 100,
              suffix: '%',
              onChange: (value        ) => studio.updateSurfaces({ scrim: value }),
            })),
          );
        };

        const advancedTab = () => {
          // Live self-check: it answers "why can't I see the wallpaper" from inside
          // the app, without devtools.
          const report = describeSurfaces();
          const layer = studio.layer.element;
          const media = layer.querySelector ? layer.querySelector('.dws-media') : null;
          const effectStatus = studio.layer.effectStatus();
          const defaults = studio.defaultsInfo();
          const effectState = effectStatus.running
            ? t('diag.running')
            : effectStatus.paused
              ? t('diag.paused')
              : t('diag.idle');
          // What the geometric probe actually measured. "—" means that pane's blur
          // slider has no rectangle to draw on, which is the one way it can look dead.
          const frostSummary = SURFACE_KEYS.map((key) => {
            const element = layer.querySelector ? layer.querySelector(`[data-dws-frost="${key}"]`) : null;
            const shown = element && element.style && element.style.display === 'block';
            return `${key} ${shown ? `${element.style.width}×${element.style.height}` : '—'}`;
          }).join(' · ');
          const diagnosisRows = [
            `${t('diag.version')}: v${PLUGIN_VERSION}`,
            `${t('diag.layer')}: ${t('diag.mounted')} · ${layer.classList.contains('dws-on') ? t('diag.shown') : t('diag.hidden')} · ${media ? t('diag.hasMedia') : t('diag.noMedia')}`,
            `${t('diag.frost')}: ${frostSummary}`,
            `${t('diag.effect')}: ${effectStatus.id} · ${t('effect.canvas')} ${effectStatus.width}×${effectStatus.height} · ${effectState}${effectStatus.reducedMotion ? ` · ${t('diag.suppressed')}` : ''}`,
            `${t('diag.surfaces')}: ${t('diag.declared')} ${report.declared} · ${t('diag.effective')} ${report.applied}${report.hijacked.length > 0 ? ` · ${t('diag.hijacked')} ${report.hijacked.length}` : ''}`,
            report.sample ? `${t('diag.sample')}: ${report.sample.slice(0, 110)}` : '',
            ...report.hijacked.slice(0, 3).map((entry) => `⚠ ${entry}`),
            !media && settings.activeId ? `⚠ ${t('diag.noMediaHint')}` : '',
            settings.activeId === null ? `⚠ ${t('diag.noActive')}` : '',
          ].filter((row) => row !== '');

          return rt.h(
            'div',
            { className: 'dws-body' },
            rt.h(
              Card,
              { rt, title: t('advanced.persist') },
              rt.h('p', { className: 'dws-note', style: { margin: 0 } }, studio.persistent ? t('advanced.persistOn') : t('advanced.persistOff')),
              rt.h('p', { className: 'dws-note', style: { margin: 0 } }, `${t('advanced.storage')}: ${items.length}`),
              rt.h('p', { className: 'dws-note', style: { margin: 0 } }, `${t('advanced.shortcut')}: Alt+B — ${t('advanced.shortcutHint')}`),
            ),
            rt.h(
              Card,
              { rt, title: t('advanced.diagnosis'), note: t('advanced.diagnosisNote') },
              ...diagnosisRows.map((row, index) => rt.h('p', { key: `diag-${index}`, className: 'dws-note', style: { margin: 0 } }, row)),
            ),
            rt.h(
              Card,
              { rt, title: t('defaults.title'), note: t('defaults.note') },
              rt.h(
                'p',
                { className: 'dws-note', style: { margin: 0 } },
                defaults.custom ? t('defaults.custom') : t('defaults.shipped'),
              ),
              rt.h(
                'div',
                { className: 'dws-inline' },
                rt.h(Button, {
                  rt,
                  label: t('defaults.save'),
                  variant: 'primary',
                  onClick: () => void studio.saveCurrentAsDefaults(),
                }),
                defaults.custom
                  ? rt.h(Button, { rt, label: t('defaults.clear'), onClick: () => void studio.clearCustomDefaults() })
                  : null,
              ),
              rt.h('textarea', {
                className: 'dws-json',
                readOnly: true,
                rows: 6,
                spellCheck: false,
                'aria-label': t('defaults.json'),
                value: defaults.json,
                onFocus: (event                                    ) => event.target.select(),
              }),
              rt.h('p', { className: 'dws-note', style: { margin: 0 } }, t('defaults.jsonHint')),
            ),
            rt.h(
              Card,
              { rt },
              rt.h(Toggle, {
                rt,
                label: t('advanced.reducedMotion'),
                checked: settings.respectReducedMotion,
                onChange: (checked         ) => studio.update({ respectReducedMotion: checked }),
              }),
              rt.h(Toggle, {
                rt,
                label: t('advanced.pauseHidden'),
                checked: settings.pauseWhenHidden,
                onChange: (checked         ) => studio.update({ pauseWhenHidden: checked }),
              }),
              rt.h(Toggle, {
                rt,
                label: t('advanced.videoSound'),
                checked: settings.videoSound,
                onChange: (checked         ) => studio.update({ videoSound: checked }),
              }),
              rt.h(Slider, {
                rt,
                label: t('advanced.videoVolume'),
                value: settings.videoVolume,
                min: 0,
                max: 100,
                suffix: '%',
                disabled: !settings.videoSound,
                onChange: (value        ) => studio.update({ videoVolume: value, videoSound: true }),
              }),
            ),
            rt.h(Button, {
              rt,
              label: t('advanced.reset'),
              variant: 'danger',
              onClick: () => {
                void studio.reset();
              },
            }),
          );
        };

        const body =
          tab === 'library'
            ? libraryTab()
            : tab === 'look'
              ? lookTab()
              : tab === 'effect'
                ? effectTab()
                : tab === 'carousel'
                  ? carouselTab()
                  : tab === 'surfaces'
                    ? surfacesTab()
                    : advancedTab();

        return rt.h(
          'div',
          { className: 'dws-panel' },
          rt.h(
            'div',
            { className: 'dws-head' },
            rt.h(
              'div',
              null,
              rt.h('h2', { className: 'dws-title', style: { margin: 0 } }, t('section.title')),
              rt.h('p', { className: 'dws-sub', style: { margin: 0 } }, t('section.subtitle')),
            ),
            rt.h(Toggle, {
              rt,
              label: t('toggle.enable'),
              hint: t('toggle.enableHint'),
              checked: settings.enabled,
              onChange: (checked         ) => studio.update({ enabled: checked }),
            }),
          ),
          rt.h('div', { className: 'dws-tabs', role: 'tablist' }, tabs),
          body,
          cropItem ? rt.h(CropEditor, { rt, studio, item: cropItem, onClose: () => setCropId(null) }) : null,
          toast,
        );
      };
    }

    /** A compact launcher panel for the sidebar footer button. */
    function createQuickPanel(deps           )                                              {
      const { rt, studio } = deps;
      return function QuickPanel()          {
        const settings = useStudio(rt, studio)                  ;
        const [open, setOpen] = rt.useState(false);
        const t = (key        ) => studio.t(key);
        const active = settings.items.find((item) => item.id === settings.activeId) ?? null;

        const button = rt.h(
          'button',
          {
            type: 'button',
            className: 'dws-btn dws-launcher',
            title: t('quick.open'),
            'aria-label': t('quick.open'),
            onClick: () => setOpen(!open),
          },
          '🖼',
        );

        if (!open) return rt.h('div', { style: { padding: '0 8px 6px' } }, button);

        const panel = rt.h(
          'div',
          { className: 'dws-quick', role: 'dialog', 'aria-label': t('quick.open') },
          rt.h(
            'div',
            { className: 'dws-quickHead' },
            rt.h('strong', null, t('quick.open')),
            rt.h(IconButton, { rt, label: t('common.close'), glyph: '✕', onClick: () => setOpen(false) }),
          ),
          rt.h(
            'div',
            { className: 'dws-quickPreview' },
            active && active.thumb ? rt.h('img', { src: active.thumb, alt: '' }) : null,
            rt.h('span', null, active ? active.name : t('common.none')),
          ),
          rt.h(Toggle, {
            rt,
            label: t('quick.toggle'),
            checked: settings.enabled,
            onChange: (checked         ) => studio.update({ enabled: checked }),
          }),
          rt.h(
            'div',
            { className: 'dws-inline' },
            rt.h(Button, { rt, label: t('quick.next'), onClick: () => void studio.next() }),
            rt.h(Button, {
              rt,
              label: t('effect.asBackground'),
              onClick: () => studio.update({ enabled: true, effectOverlay: !settings.effectOverlay }),
            }),
          ),
        );

        return rt.h('div', { style: { padding: '0 8px 6px' } }, button, rt.h('div', { className: 'dws-quickWrap', style: { position: 'fixed', left: '84px', bottom: '96px' } }, panel));
      };
    }


    //# sourceURL=src/client/panel.ts
    return { createSettingsSection, createQuickPanel };
  };
  __factories["src/client/cropEditor.ts"] = function () {
    const { ASPECTS, aspectRatio, framingCss, layout, renderCrop } = __require("src/client/crop.ts");
    const { defaultFraming } = __require("src/client/settings.ts");
    const { Button, IconButton, Segmented, useToast } = __require("src/client/ui.ts");
    /**
     * The manual crop editor: drag to move, wheel to zoom, sliders for fine work,
     * aspect presets for composition. For images the visible region is baked into a
     * new bitmap; for videos (which cannot be re-encoded in the browser) the framing
     * is stored and applied at paint time.
     */



                                                
                                              
                                                                      

                         
                  
                     
                          
                          
     

    function clamp(value        , min        , max        )         {
      return value < min ? min : value > max ? max : value;
    }

    /**
     * Longest edge of a baked crop. A 4096px canvas costs ~48 MB while it is live
     * (plus the source blob and the decoded image), so low-memory machines and
     * machines without spare cores take a smaller ceiling.
     */
    function maxCropEdge()         {
      const memory = (navigator                                        ).deviceMemory;
      const cores = navigator.hardwareConcurrency;
      if (typeof memory === 'number' && memory > 0 && memory <= 4) return 2560;
      if (typeof cores === 'number' && cores > 0 && cores <= 4) return 3072;
      return 4096;
    }

    function CropEditor(props           )          {
      const { rt, studio, item, onClose } = props;
      const t = (key        ) => studio.t(key);
      const toast = useToast(rt, studio);

      const [framing, setFraming] = rt.useState         ({ ...item.framing });
      const [aspect, setAspect] = rt.useState        ('viewport');
      const [busy, setBusy] = rt.useState(false);
      const [objectUrl, setObjectUrl] = rt.useState               (null);
      const [source, setSource] = rt.useState({ width: item.width ?? 1600, height: item.height ?? 900 });
      const [box, setBox] = rt.useState({ width: 620, height: 349 });
      const stageRef = rt.useRef                       (null);
      const dragRef = rt.useRef                                                                                         (null);

      rt.useEffect(() => {
        let url                = null;
        let cancelled = false;
        void (async () => {
          const blob = await studio.blobFor(item);
          if (!blob || cancelled) return;
          url = URL.createObjectURL(blob);
          setObjectUrl(url);
          if (item.kind === 'video') {
            // An <img> cannot decode a video blob, so the frame size comes from a
            // video element; without it the preview would fall back to 16:9 and lie.
            const probe = document.createElement('video');
            probe.preload = 'metadata';
            probe.muted = true;
            probe.onloadedmetadata = () => {
              if (cancelled) return;
              const width = probe.videoWidth;
              const height = probe.videoHeight;
              if (width > 0 && height > 0) setSource({ width, height });
            };
            probe.src = url;
          } else {
            const probe = new Image();
            probe.onload = () => {
              if (!cancelled) setSource({ width: probe.naturalWidth, height: probe.naturalHeight });
            };
            probe.src = url;
          }
        })();
        return () => {
          cancelled = true;
          if (url) URL.revokeObjectURL(url);
        };
      }, [item.id]);

      // Fit the crop box into the available stage area for the chosen aspect.
      rt.useEffect(() => {
        const measure = () => {
          const stage = stageRef.current;
          const availableW = stage ? Math.max(240, stage.clientWidth - 24) : 620;
          const availableH = stage ? Math.max(160, stage.clientHeight - 24) : 349;
          const ratio = aspectRatio(aspect, source, { width: window.innerWidth, height: window.innerHeight });
          let width = availableW;
          let height = width / ratio;
          if (height > availableH) {
            height = availableH;
            width = height * ratio;
          }
          setBox({ width: Math.round(width), height: Math.round(height) });
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
      }, [aspect, source.width, source.height, objectUrl]);

      // Zoom on wheel through a native, non-passive listener: React attaches
      // `onWheel` passively in some paths, where preventDefault() is ignored and the
      // page scrolls behind the dialog instead of zooming the crop.
      rt.useEffect(() => {
        const stage = stageRef.current;
        if (!stage || typeof stage.addEventListener !== 'function') return;
        const onWheel = (event                                                ) => {
          event.preventDefault();
          setFraming((previous         ) => ({ ...previous, zoom: clamp(previous.zoom * (1 - event.deltaY * 0.0012), 1, 4) }));
        };
        stage.addEventListener('wheel', onWheel, { passive: false });
        return () => stage.removeEventListener('wheel', onWheel);
      }, []);

      const geometry = layout(framing, source.width, source.height, box.width, box.height);
      const preview = framingCss(framing, source.width, source.height, box.width, box.height);

      const patch = (next                  ) => setFraming({ ...framing, ...next });

      const onPointerDown = (event                                                                                                                                                 ) => {
        event.preventDefault();
        const geometryNow = layout(framing, source.width, source.height, box.width, box.height);
        dragRef.current = {
          x: event.clientX,
          y: event.clientY,
          framing,
          overflowX: geometryNow.overflowX,
          overflowY: geometryNow.overflowY,
        };
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
      };

      const onPointerMove = (event                                      ) => {
        const drag = dragRef.current;
        if (!drag) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        const x = drag.overflowX > 0 ? clamp(drag.framing.x + (2 * dx) / drag.overflowX, -1, 1) : drag.framing.x;
        const y = drag.overflowY > 0 ? clamp(drag.framing.y + (2 * dy) / drag.overflowY, -1, 1) : drag.framing.y;
        setFraming({ ...drag.framing, x, y });
      };

      const onPointerUp = () => {
        dragRef.current = null;
      };

      const save = async () => {
        setBusy(true);
        try {
          if (item.kind === 'video') {
            studio.setFraming(item.id, framing);
            onClose();
            return;
          }
          const blob = await studio.blobFor(item);
          if (!blob) {
            onClose();
            return;
          }
          const ratio = aspectRatio(aspect, source, { width: window.innerWidth, height: window.innerHeight });
          const result = await renderCrop(blob, framing, ratio, source, maxCropEdge());
          if (!result) {
            onClose();
            return;
          }
          await studio.cropItem(item.id, result.blob, { width: result.width, height: result.height });
          onClose();
        } finally {
          setBusy(false);
        }
      };

      const aspectButtons = ASPECTS.map((entry) =>
        rt.h(
          'button',
          {
            key: entry.id,
            type: 'button',
            className: 'dws-tab',
            'aria-selected': entry.id === aspect ? 'true' : 'false',
            onClick: () => setAspect(entry.id),
          },
          entry.id === 'viewport' ? t('crop.aspect.window') : entry.id === 'original' ? t('crop.aspect.source') : entry.label,
        ),
      );

      return rt.h(
        'div',
        { className: 'dws-modalMask', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('crop.title') },
        rt.h(
          'div',
          { className: 'dws-modal' },
          rt.h(
            'div',
            { className: 'dws-modalHead' },
            rt.h('span', null, t('crop.title')),
            rt.h(IconButton, { rt, label: t('common.close'), glyph: '✕', onClick: onClose }),
          ),
          rt.h(
            'div',
            { className: 'dws-modalBody' },
            rt.h(
              'div',
              {
                className: 'dws-cropStage',
                ref: stageRef,
                'data-dragging': dragRef.current ? 'true' : 'false',
                onPointerDown,
                onPointerMove,
                onPointerUp,
                onPointerCancel: onPointerUp,
              },
              rt.h(
                'div',
                { className: 'dws-cropBox', style: { width: `${box.width}px`, height: `${box.height}px` } },
                objectUrl
                  ? rt.h('img', {
                      src: objectUrl,
                      alt: '',
                      draggable: false,
                      style: {
                        width: preview.width,
                        height: preview.height,
                        transform: preview.transform,
                        opacity: geometry.drawW > 0 ? 1 : 0,
                      },
                    })
                  : null,
                rt.h('div', { className: 'dws-cropGrid' }),
              ),
            ),
            rt.h(
              'div',
              { className: 'dws-cropSide' },
              rt.h('div', { className: 'dws-aspects' }, aspectButtons),
              rt.h('p', { className: 'dws-note', style: { margin: 0 } }, t('crop.hint')),
              item.kind === 'video' ? rt.h('p', { className: 'dws-note', style: { margin: 0 } }, t('crop.videoNote')) : null,
              rt.h(Segmented, {
                rt,
                label: t('crop.fit'),
                value: framing.fit,
                options: [
                  { value: 'cover'           , label: t('crop.fit.cover') },
                  { value: 'contain'           , label: t('crop.fit.contain') },
                  { value: 'fill'           , label: t('crop.fit.fill') },
                ],
                onChange: (value         ) => patch({ fit: value }),
              }),
              rt.h(SliderRow, {
                rt,
                label: t('crop.zoom'),
                value: framing.zoom,
                min: 1,
                max: 4,
                step: 0.01,
                onChange: (value        ) => patch({ zoom: value }),
              }),
              rt.h(SliderRow, {
                rt,
                label: t('crop.rotate'),
                value: framing.rotate,
                min: -180,
                max: 180,
                step: 1,
                suffix: '°',
                onChange: (value        ) => patch({ rotate: value }),
              }),
              rt.h(SliderRow, {
                rt,
                label: t('crop.offsetX'),
                value: framing.x,
                min: -1,
                max: 1,
                step: 0.01,
                onChange: (value        ) => patch({ x: value }),
              }),
              rt.h(SliderRow, {
                rt,
                label: t('crop.offsetY'),
                value: framing.y,
                min: -1,
                max: 1,
                step: 0.01,
                onChange: (value        ) => patch({ y: value }),
              }),
              rt.h(Button, { rt, label: t('crop.reset'), onClick: () => setFraming(defaultFraming()) }),
            ),
          ),
          rt.h(
            'div',
            { className: 'dws-modalFoot' },
            rt.h('span', { className: 'dws-note' }, `${source.width}×${source.height}`),
            rt.h(
              'span',
              { className: 'dws-inline' },
              rt.h(Button, { rt, label: t('crop.cancel'), onClick: onClose, disabled: busy }),
              rt.h(Button, {
                rt,
                label: busy ? t('crop.working') : t('crop.apply'),
                variant: 'primary',
                onClick: () => void save(),
                disabled: busy,
              }),
            ),
          ),
        ),
        toast,
      );
    }

    /** Local slider row so the crop editor does not depend on the panel module. */
    function SliderRow(props   
                  
                    
                    
                  
                  
                    
                      
                                        
     )          {
      const { rt, label, value, min, max, step, suffix, onChange } = props;
      return rt.h(
        'div',
        { className: 'dws-row' },
        rt.h('span', { className: 'dws-rowLabel' }, label),
        rt.h(
          'span',
          { className: 'dws-slider' },
          rt.h('input', {
            type: 'range',
            min,
            max,
            step: step ?? 1,
            value,
            'aria-label': label,
            onChange: (event                               ) => onChange(Number(event.target.value)),
          }),
          rt.h('span', { className: 'dws-value' }, `${Math.round(value * 100) / 100}${suffix ?? ''}`),
        ),
      );
    }


    //# sourceURL=src/client/cropEditor.ts
    return { CropEditor };
  };
  __factories["src/client/ui.ts"] = function () {
    /**
     * Small UI primitives shared by the Settings page, the quick panel and the crop
     * editor. Everything is built with `createElement` (no JSX) because the plugin
     * bundle is emitted by a TypeScript-stripping build with no JSX transform, and
     * every colour comes from a Harness theme token so light and dark both work.
     */
                                                

                                     
                  
     

    function Slider(props   
                  
                    
                    
                  
                  
                    
                      
                                        
                         
     )          {
      const { rt, label, value, min, max, step, suffix, onChange, disabled } = props;
      return rt.h(
        'label',
        { className: 'dws-row' },
        rt.h('span', { className: 'dws-rowLabel' }, label),
        rt.h(
          'span',
          { className: 'dws-slider' },
          rt.h('input', {
            type: 'range',
            min,
            max,
            step: step ?? 1,
            value,
            disabled: disabled === true,
            onChange: (event                               ) => onChange(Number(event.target.value)),
            'aria-label': label,
          }),
          rt.h('span', { className: 'dws-value' }, `${Math.round(value * 100) / 100}${suffix ?? ''}`),
        ),
      );
    }

    function Toggle(props   
                  
                    
                       
                                           
                    
     )          {
      const { rt, label, checked, onChange, hint } = props;
      return rt.h(
        'div',
        { className: 'dws-row' },
        rt.h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
          rt.h('span', { className: 'dws-rowLabel' }, label),
          hint ? rt.h('span', { className: 'dws-note' }, hint) : null,
        ),
        rt.h('button', {
          type: 'button',
          className: 'dws-switch',
          role: 'switch',
          'aria-checked': checked ? 'true' : 'false',
          'aria-label': label,
          onClick: () => onChange(!checked),
        }),
      );
    }

    function Segmented                  (props   
                  
                     
               
                                             
                                   
     )          {
      const { rt, label, value, options, onChange } = props;
      const buttons = options.map((option) =>
        rt.h(
          'button',
          {
            key: option.value,
            type: 'button',
            'aria-pressed': option.value === value ? 'true' : 'false',
            onClick: () => onChange(option.value),
          },
          option.label,
        ),
      );
      const group = rt.h('div', { className: 'dws-seg', role: 'group', 'aria-label': label ?? '' }, buttons);
      if (!label) return group;
      return rt.h('div', { className: 'dws-row' }, rt.h('span', { className: 'dws-rowLabel' }, label), group);
    }

    function Card(props                                                                    )          {
      const { rt, title, children, note } = props;
      return rt.h(
        'section',
        { className: 'dws-card' },
        title ? rt.h('h3', { className: 'dws-cardTitle', style: { margin: 0 } }, title) : null,
        note ? rt.h('p', { className: 'dws-note', style: { margin: 0 } }, note) : null,
        children ?? null,
      );
    }

    function Button(props   
                  
                    
                          
                                                 
                         
                     
     )          {
      const { rt, label, onClick, variant, disabled, title } = props;
      return rt.h(
        'button',
        {
          type: 'button',
          className: `dws-btn${variant && variant !== 'default' ? ` ${variant}` : ''}`,
          onClick,
          disabled: disabled === true,
          title: title ?? label,
        },
        label,
      );
    }

    function IconButton(props   
                  
                    
                    
                          
     )          {
      const { rt, label, glyph, onClick } = props;
      return rt.h(
        'button',
        {
          type: 'button',
          className: 'dws-iconBtn',
          title: label,
          'aria-label': label,
          onClick: (event                                 ) => {
            event.stopPropagation();
            onClick();
          },
        },
        glyph,
      );
    }

    /** Subscribe a component to the studio's settings object. */
    function useStudio(rt         , studio                                                                        )          {
      const [, force] = rt.useState(0);
      rt.useEffect(() => {
        return studio.subscribe(() => force((value        ) => value + 1));
      }, [studio]);
      return studio.settings;
    }

    function useToast(rt         , studio                                                                                             )          {
      const [notice, setNotice] = rt.useState(null                                            );
      const timer = rt.useRef(0);
      rt.useEffect(() => {
        const unsubscribe = studio.onNotice((next                                   ) => {
          setNotice(next);
          // Restart the dismissal for every new notice, and never let a stale timer
          // clear a newer one.
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setNotice(null), 2600);
        });
        return () => {
          unsubscribe();
          window.clearTimeout(timer.current);
          timer.current = 0;
        };
      }, [studio]);
      if (!notice) return null;
      return rt.h('div', { className: 'dws-toast', role: 'status' }, notice.message);
    }


    //# sourceURL=src/client/ui.ts
    return { Slider, Toggle, Segmented, Card, Button, IconButton, useStudio, useToast };
  };
  __require("src/client/main.ts");
})();