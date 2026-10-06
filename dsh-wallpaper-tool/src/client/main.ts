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
import { injectBaseStyles } from './theme.js';
import { Studio } from './studio.js';
import { createQuickPanel, createSettingsSection } from './panel.js';
import { NS, en, zh } from './i18n.js';
import type { Runtime } from './runtime.js';

const PACKAGE_ID = 'dsh-wallpaper-studio';
const SETTINGS_SECTION_SLOT = 'settings.section';
const SIDEBAR_FOOTER_SLOT = 'sidebar.footer.action';

interface LoaderLike {
  load: (options: { id: string; factory: (require: (id: string) => unknown) => unknown }) => void;
}

interface SlotsService {
  inject: (name: string, register: () => unknown) => unknown;
  register: (options: Record<string, unknown>, component: unknown) => unknown;
}

interface ClientContext {
  effect: (callback: () => unknown, label?: string) => unknown;
  slots: SlotsService;
  locale?: { register: (namespace: string, dictionaries: Record<string, unknown>) => unknown };
}

/**
 * The loader facade is injected into `<head>` by the Host before any plugin
 * script runs, so it is normally already there. If it is not (an unusual boot
 * order, a page restored from the back/forward cache), retry briefly instead of
 * giving up on the first look.
 */
function boot(attempt = 0): void {
  const loader = (window as unknown as { __ModuleLoader__?: LoaderLike }).__ModuleLoader__;
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
      const React = require('react') as Runtime['React'];
      if (!React || typeof React.createElement !== 'function') {
        throw new Error(`[${PACKAGE_ID}] React is missing from the platform module table`);
      }
      const rt: Runtime = {
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
        apply(ctx: ClientContext) {
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
