/**
 * Small UI primitives shared by the Settings page, the quick panel and the crop
 * editor. Everything is built with `createElement` (no JSX) because the plugin
 * bundle is emitted by a TypeScript-stripping build with no JSX transform, and
 * every colour comes from a Harness theme token so light and dark both work.
 */
import type { Runtime } from './runtime.js';

export interface PrimitiveProps {
  rt: Runtime;
}

export function Slider(props: {
  rt: Runtime;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
}): unknown {
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
        onChange: (event: { target: { value: string } }) => onChange(Number(event.target.value)),
        'aria-label': label,
      }),
      rt.h('span', { className: 'dws-value' }, `${Math.round(value * 100) / 100}${suffix ?? ''}`),
    ),
  );
}

export function Toggle(props: {
  rt: Runtime;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}): unknown {
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

export function Segmented<T extends string>(props: {
  rt: Runtime;
  label?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}): unknown {
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

export function Card(props: { rt: Runtime; title?: string; children?: unknown; note?: string }): unknown {
  const { rt, title, children, note } = props;
  return rt.h(
    'section',
    { className: 'dws-card' },
    title ? rt.h('h3', { className: 'dws-cardTitle', style: { margin: 0 } }, title) : null,
    note ? rt.h('p', { className: 'dws-note', style: { margin: 0 } }, note) : null,
    children ?? null,
  );
}

export function Button(props: {
  rt: Runtime;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
  title?: string;
}): unknown {
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

export function IconButton(props: {
  rt: Runtime;
  label: string;
  glyph: string;
  onClick: () => void;
}): unknown {
  const { rt, label, glyph, onClick } = props;
  return rt.h(
    'button',
    {
      type: 'button',
      className: 'dws-iconBtn',
      title: label,
      'aria-label': label,
      onClick: (event: { stopPropagation: () => void }) => {
        event.stopPropagation();
        onClick();
      },
    },
    glyph,
  );
}

/** Subscribe a component to the studio's settings object. */
export function useStudio(rt: Runtime, studio: { subscribe: (listener: () => void) => () => void; settings: unknown }): unknown {
  const [, force] = rt.useState(0);
  rt.useEffect(() => {
    return studio.subscribe(() => force((value: number) => value + 1));
  }, [studio]);
  return studio.settings;
}

export function useToast(rt: Runtime, studio: { onNotice: (listener: (notice: { kind: string; message: string }) => void) => () => void }): unknown {
  const [notice, setNotice] = rt.useState(null as null | { kind: string; message: string });
  const timer = rt.useRef(0);
  rt.useEffect(() => {
    const unsubscribe = studio.onNotice((next: { kind: string; message: string }) => {
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
