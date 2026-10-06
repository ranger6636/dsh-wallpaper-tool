/**
 * The Settings page: wallpaper library, appearance, animated effects, carousel,
 * pane see-through and advanced controls. Registered into the Harness
 * `settings.section` list slot by `main.ts`.
 */
import { CropEditor } from './cropEditor.js';
import { describeSurfaces } from './theme.js';
import { EFFECT_IDS, PLUGIN_VERSION, SURFACE_KEYS } from './types.js';
import type { EffectId, MotionMode, StudioSettings, SurfaceKey, TransitionKind, CarouselOrder, WallpaperItem } from './types.js';
import { Button, Card, IconButton, Segmented, Slider, Toggle, useStudio, useToast } from './ui.js';
import type { Runtime } from './runtime.js';
import type { Studio } from './studio.js';

const TABS = ['library', 'look', 'effect', 'carousel', 'surfaces', 'advanced'] as const;
type Tab = (typeof TABS)[number];

interface PanelDeps {
  rt: Runtime;
  studio: Studio;
}

function effectTile(rt: Runtime, effectId: EffectId, color: string, accent: string, label: string): unknown {
  const backgrounds: Record<string, string> = {
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

export function createSettingsSection(deps: PanelDeps): (props: Record<string, unknown>) => unknown {
  const { rt, studio } = deps;

  return function SettingsSection(): unknown {
    const settings = useStudio(rt, studio) as StudioSettings;
    const toast = useToast(rt, studio);
    const [tab, setTab] = rt.useState<Tab>('library');
    const [cropId, setCropId] = rt.useState<string | null>(null);
    const [renaming, setRenaming] = rt.useState<string | null>(null);
    const [draft, setDraft] = rt.useState('');
    const [reading, setReading] = rt.useState(false);
    const [dragOver, setDragOver] = rt.useState(false);
    const fileRef = rt.useRef<HTMLInputElement | null>(null);

    const t = (key: string) => studio.t(key);
    const items = settings.items;
    const activeItem = items.find((item) => item.id === settings.activeId) ?? null;
    const cropItem = cropId ? items.find((item) => item.id === cropId) ?? null : null;

    const pickFiles = async (files: File[] | null) => {
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
            onKeyDown: (event: { key: string }) => {
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
                  onClick: (event: { stopPropagation: () => void }) => event.stopPropagation(),
                  onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
                  onBlur: () => {
                    studio.renameItem(item.id, draft);
                    setRenaming(null);
                  },
                  onKeyDown: (event: { key: string }) => {
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
            onDragOver: (event: { preventDefault: () => void }) => {
              event.preventDefault();
              setDragOver(true);
            },
            onDragLeave: () => setDragOver(false),
            onDrop: (event: { preventDefault: () => void; dataTransfer: { files: FileList | null } }) => {
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
            onChange: (event: { target: { value: string; files: FileList | null } }) => {
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
          rt.h(Slider, { rt, label: t('look.opacity'), value: look.opacity, min: 0, max: 100, suffix: '%', onChange: (value: number) => studio.updateAppearance({ opacity: value }) }),
          rt.h(Slider, { rt, label: t('look.blur'), value: look.blur, min: 0, max: 60, suffix: 'px', onChange: (value: number) => studio.updateAppearance({ blur: value }) }),
          rt.h(Slider, { rt, label: t('look.darken'), value: look.darken, min: 0, max: 100, suffix: '%', onChange: (value: number) => studio.updateAppearance({ darken: value }) }),
          rt.h(Slider, { rt, label: t('look.brightness'), value: look.brightness, min: 0, max: 200, suffix: '%', onChange: (value: number) => studio.updateAppearance({ brightness: value }) }),
          rt.h(Slider, { rt, label: t('look.saturate'), value: look.saturate, min: 0, max: 200, suffix: '%', onChange: (value: number) => studio.updateAppearance({ saturate: value }) }),
          rt.h(Slider, { rt, label: t('look.vignette'), value: look.vignette, min: 0, max: 100, suffix: '%', onChange: (value: number) => studio.updateAppearance({ vignette: value }) }),
        ),
        rt.h(
          Card,
          { rt, title: t('look.zoom'), note: t('effect.note') },
          rt.h(Slider, { rt, label: t('look.zoom'), value: look.zoom, min: 1, max: 2, step: 0.01, suffix: '×', onChange: (value: number) => studio.updateAppearance({ zoom: value }) }),
          rt.h(Slider, { rt, label: t('look.offsetX'), value: look.offsetX, min: -50, max: 50, suffix: '%', onChange: (value: number) => studio.updateAppearance({ offsetX: value }) }),
          rt.h(Slider, { rt, label: t('look.offsetY'), value: look.offsetY, min: -50, max: 50, suffix: '%', onChange: (value: number) => studio.updateAppearance({ offsetY: value }) }),
          rt.h(Segmented, {
            rt,
            label: t('look.motion'),
            value: settings.motion.mode,
            options: [
              { value: 'none' as MotionMode, label: t('motion.none') },
              { value: 'kenburns' as MotionMode, label: t('motion.kenburns') },
              { value: 'drift' as MotionMode, label: t('motion.drift') },
              { value: 'pulse' as MotionMode, label: t('motion.pulse') },
            ],
            onChange: (value: MotionMode) => studio.updateMotion({ mode: value }),
          }),
          rt.h(Slider, { rt, label: t('look.motionAmount'), value: settings.motion.amount, min: 0, max: 100, suffix: '%', onChange: (value: number) => studio.updateMotion({ amount: value }) }),
          rt.h(Slider, { rt, label: t('look.motionSpeed'), value: settings.motion.speed, min: 0.2, max: 4, step: 0.1, suffix: '×', onChange: (value: number) => studio.updateMotion({ speed: value }) }),
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
          rt.h(Slider, { rt, label: t('effect.intensity'), value: effect.intensity, min: 0, max: 100, suffix: '%', onChange: (value: number) => studio.updateEffect({ intensity: value }) }),
          rt.h(Slider, { rt, label: t('effect.speed'), value: effect.speed, min: 0.2, max: 4, step: 0.1, suffix: '×', onChange: (value: number) => studio.updateEffect({ speed: value }) }),
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
                onChange: (event: { target: { value: string } }) => studio.updateEffect({ color: event.target.value }),
              }),
              rt.h('span', { className: 'dws-rowLabel' }, t('effect.accent')),
              rt.h('input', {
                type: 'color',
                className: 'dws-color',
                value: effect.accent,
                'aria-label': t('effect.accent'),
                onChange: (event: { target: { value: string } }) => studio.updateEffect({ accent: event.target.value }),
              }),
            ),
          ),
          rt.h(Toggle, {
            rt,
            label: t('effect.asBackground'),
            hint: t('effect.note'),
            checked: settings.effectOverlay,
            onChange: (checked: boolean) => studio.update({ effectOverlay: checked, enabled: checked ? true : settings.enabled }),
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
            onChange: (event: { target: { checked: boolean } }) => {
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
            onChange: (checked: boolean) => studio.updateCarousel({ enabled: checked }),
          }),
          rt.h(Slider, { rt, label: t('carousel.interval'), value: carousel.intervalSec, min: 5, max: 600, step: 5, suffix: 's', onChange: (value: number) => studio.updateCarousel({ intervalSec: value }) }),
          rt.h(Slider, { rt, label: t('carousel.duration'), value: carousel.durationMs, min: 200, max: 4000, step: 100, suffix: 'ms', onChange: (value: number) => studio.updateCarousel({ durationMs: value }) }),
          rt.h(Segmented, {
            rt,
            label: t('carousel.order'),
            value: carousel.order,
            options: [
              { value: 'sequential' as CarouselOrder, label: t('carousel.order.sequential') },
              { value: 'shuffle' as CarouselOrder, label: t('carousel.order.shuffle') },
            ],
            onChange: (value: CarouselOrder) => studio.updateCarousel({ order: value }),
          }),
          rt.h(Segmented, {
            rt,
            label: t('carousel.transition'),
            value: carousel.transition,
            options: [
              { value: 'fade' as TransitionKind, label: t('carousel.transition.fade') },
              { value: 'zoom' as TransitionKind, label: t('carousel.transition.zoom') },
              { value: 'slide' as TransitionKind, label: t('carousel.transition.slide') },
              { value: 'blur' as TransitionKind, label: t('carousel.transition.blur') },
            ],
            onChange: (value: TransitionKind) => studio.updateCarousel({ transition: value }),
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
      const cards = SURFACE_KEYS.map((key: SurfaceKey) => {
        const rule = settings.surfaces[key];
        return rt.h(
          Card,
          { rt, key, title: t(`surface.${key}`) },
          rt.h(Toggle, {
            rt,
            label: t('surface.enabled'),
            checked: rule.enabled,
            onChange: (checked: boolean) => studio.updateSurface(key, { enabled: checked }),
          }),
          rt.h(Slider, {
            rt,
            label: t('surface.opacity'),
            value: rule.opacity,
            min: 0,
            max: 100,
            suffix: '%',
            disabled: !rule.enabled,
            onChange: (value: number) => studio.updateSurface(key, { opacity: value }),
          }),
          rt.h(Slider, {
            rt,
            label: t('surface.blur'),
            value: rule.blur,
            min: 0,
            max: 40,
            suffix: 'px',
            disabled: !rule.enabled,
            onChange: (value: number) => studio.updateSurface(key, { blur: value }),
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
          onChange: (value: number) => studio.updateSurfaces({ scrim: value }),
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
            onFocus: (event: { target: { select: () => void } }) => event.target.select(),
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
            onChange: (checked: boolean) => studio.update({ respectReducedMotion: checked }),
          }),
          rt.h(Toggle, {
            rt,
            label: t('advanced.pauseHidden'),
            checked: settings.pauseWhenHidden,
            onChange: (checked: boolean) => studio.update({ pauseWhenHidden: checked }),
          }),
          rt.h(Toggle, {
            rt,
            label: t('advanced.videoSound'),
            checked: settings.videoSound,
            onChange: (checked: boolean) => studio.update({ videoSound: checked }),
          }),
          rt.h(Slider, {
            rt,
            label: t('advanced.videoVolume'),
            value: settings.videoVolume,
            min: 0,
            max: 100,
            suffix: '%',
            disabled: !settings.videoSound,
            onChange: (value: number) => studio.update({ videoVolume: value, videoSound: true }),
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
          onChange: (checked: boolean) => studio.update({ enabled: checked }),
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
export function createQuickPanel(deps: PanelDeps): (props: Record<string, unknown>) => unknown {
  const { rt, studio } = deps;
  return function QuickPanel(): unknown {
    const settings = useStudio(rt, studio) as StudioSettings;
    const [open, setOpen] = rt.useState(false);
    const t = (key: string) => studio.t(key);
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
        onChange: (checked: boolean) => studio.update({ enabled: checked }),
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
