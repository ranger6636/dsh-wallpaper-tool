/**
 * The manual crop editor: drag to move, wheel to zoom, sliders for fine work,
 * aspect presets for composition. For images the visible region is baked into a
 * new bitmap; for videos (which cannot be re-encoded in the browser) the framing
 * is stored and applied at paint time.
 */
import { ASPECTS, aspectRatio, framingCss, layout, renderCrop } from './crop.js';
import { defaultFraming } from './settings.js';
import { Button, IconButton, Segmented, useToast } from './ui.js';
import type { Runtime } from './runtime.js';
import type { Studio } from './studio.js';
import type { FitMode, Framing, WallpaperItem } from './types.js';

interface CropProps {
  rt: Runtime;
  studio: Studio;
  item: WallpaperItem;
  onClose: () => void;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Longest edge of a baked crop. A 4096px canvas costs ~48 MB while it is live
 * (plus the source blob and the decoded image), so low-memory machines and
 * machines without spare cores take a smaller ceiling.
 */
function maxCropEdge(): number {
  const memory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency;
  if (typeof memory === 'number' && memory > 0 && memory <= 4) return 2560;
  if (typeof cores === 'number' && cores > 0 && cores <= 4) return 3072;
  return 4096;
}

export function CropEditor(props: CropProps): unknown {
  const { rt, studio, item, onClose } = props;
  const t = (key: string) => studio.t(key);
  const toast = useToast(rt, studio);

  const [framing, setFraming] = rt.useState<Framing>({ ...item.framing });
  const [aspect, setAspect] = rt.useState<string>('viewport');
  const [busy, setBusy] = rt.useState(false);
  const [objectUrl, setObjectUrl] = rt.useState<string | null>(null);
  const [source, setSource] = rt.useState({ width: item.width ?? 1600, height: item.height ?? 900 });
  const [box, setBox] = rt.useState({ width: 620, height: 349 });
  const stageRef = rt.useRef<HTMLDivElement | null>(null);
  const dragRef = rt.useRef<{ x: number; y: number; framing: Framing; overflowX: number; overflowY: number } | null>(null);

  rt.useEffect(() => {
    let url: string | null = null;
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
    const onWheel = (event: { deltaY: number; preventDefault: () => void }) => {
      event.preventDefault();
      setFraming((previous: Framing) => ({ ...previous, zoom: clamp(previous.zoom * (1 - event.deltaY * 0.0012), 1, 4) }));
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, []);

  const geometry = layout(framing, source.width, source.height, box.width, box.height);
  const preview = framingCss(framing, source.width, source.height, box.width, box.height);

  const patch = (next: Partial<Framing>) => setFraming({ ...framing, ...next });

  const onPointerDown = (event: { clientX: number; clientY: number; currentTarget: { setPointerCapture: (id: number) => void }; pointerId: number; preventDefault: () => void }) => {
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

  const onPointerMove = (event: { clientX: number; clientY: number }) => {
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
              { value: 'cover' as FitMode, label: t('crop.fit.cover') },
              { value: 'contain' as FitMode, label: t('crop.fit.contain') },
              { value: 'fill' as FitMode, label: t('crop.fit.fill') },
            ],
            onChange: (value: FitMode) => patch({ fit: value }),
          }),
          rt.h(SliderRow, {
            rt,
            label: t('crop.zoom'),
            value: framing.zoom,
            min: 1,
            max: 4,
            step: 0.01,
            onChange: (value: number) => patch({ zoom: value }),
          }),
          rt.h(SliderRow, {
            rt,
            label: t('crop.rotate'),
            value: framing.rotate,
            min: -180,
            max: 180,
            step: 1,
            suffix: '°',
            onChange: (value: number) => patch({ rotate: value }),
          }),
          rt.h(SliderRow, {
            rt,
            label: t('crop.offsetX'),
            value: framing.x,
            min: -1,
            max: 1,
            step: 0.01,
            onChange: (value: number) => patch({ x: value }),
          }),
          rt.h(SliderRow, {
            rt,
            label: t('crop.offsetY'),
            value: framing.y,
            min: -1,
            max: 1,
            step: 0.01,
            onChange: (value: number) => patch({ y: value }),
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
function SliderRow(props: {
  rt: Runtime;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}): unknown {
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
        onChange: (event: { target: { value: string } }) => onChange(Number(event.target.value)),
      }),
      rt.h('span', { className: 'dws-value' }, `${Math.round(value * 100) / 100}${suffix ?? ''}`),
    ),
  );
}
