/**
 * Headless smoke test for the built client bundle.
 *
 * The plugin runs inside the Harness Web page, and this deployment has no
 * browser automation, so the bundle is loaded into a minimal DOM stub with a
 * small React re-implementation (per-instance hooks, so state survives
 * re-renders). That is enough to execute the plugin's real code paths and prove:
 *
 *   - the bundle registers a factory under the package id, side-effect free,
 *   - `apply` registers both slots and mounts one background layer,
 *   - every Settings tab renders, and the library/effect/toggle interactions
 *     run through the controller without throwing,
 *   - enabling the wallpaper writes the theme-token override sheet with the
 *     sidebar / content / composer tokens,
 *   - all six animated effects draw frames on a 2D context,
 *   - the crop editor opens for an image item,
 *   - the launcher panel opens, and
 *   - `destroy()` removes the plugin's DOM footprint.
 *
 * Run: node tests/smoke.cjs
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const failures = [];
/**
 * Animation frames queued by the plugin, keyed by request id.
 *
 * A Map (not an array) because `cancelAnimationFrame` has to be able to actually
 * drop a callback: with a no-op cancel, a cancelled loop's callback stays queued
 * and the "switching effects must never stack animation loops" invariant cannot
 * be asserted at all.
 */
const pendingFrames = new Map();
let frameSeq = 0;

// ------------------------------------------------------------------ DOM stub

class StubClassList {
  constructor(element) {
    this.element = element;
  }
  get set() {
    return new Set(String(this.element.className || '').split(/\s+/).filter(Boolean));
  }
  write(set) {
    this.element.className = [...set].join(' ');
  }
  add(...names) {
    const set = this.set;
    for (const name of names) set.add(name);
    this.write(set);
  }
  remove(...names) {
    const set = this.set;
    for (const name of names) set.delete(name);
    this.write(set);
  }
  toggle(name, force) {
    const set = this.set;
    const next = force === undefined ? !set.has(name) : force;
    if (next) set.add(name);
    else set.delete(name);
    this.write(set);
  }
  contains(name) {
    return this.set.has(name);
  }
}

class StubStyle {
  constructor() {
    this.map = new Map();
    this.priorities = new Map();
    this.backgroundColor = '';
  }
  setProperty(name, value, priority) {
    this.map.set(name, value);
    if (priority) this.priorities.set(name, priority);
    else this.priorities.delete(name);
  }
  removeProperty(name) {
    this.map.delete(name);
    this.priorities.delete(name);
  }
  getPropertyValue(name) {
    return this.map.get(name) || '';
  }
  getPropertyPriority(name) {
    return this.priorities.get(name) || '';
  }
  get cssText() {
    return '';
  }
  set cssText(_value) {}
}

/** Token values the harness pretends the palette defines. */
const TOKEN_ORIGINALS = {
  '--dsw-alias-bg-base': '#ffffff',
  '--dsw-specific-sidebar-fill': '#fbfbfb',
  '--dsw-specific-input-major': '#f5f5f5',
  '--dsw-specific-menu': '#ffffff',
  '--dsw-menu-surface-fill': '#f8f9fa',
  '--dsw-specific-selector': '#e9ebef',
  '--dsw-alias-bg-layer-1': '#ffffff',
  '--dsw-alias-bg-layer-2': '#f7f8fa',
};

/** Counts the drawing calls the effect canvas actually receives. */
const drawCalls = { total: 0 };

function makeContext2d() {
  const noop = () => {};
  const count = (name) => (...args) => {
    drawCalls.total += 1;
    drawCalls[name] = (drawCalls[name] || 0) + 1;
  };
  return {
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
    setTransform: noop,
    save: noop,
    restore: noop,
    scale: noop,
    translate: noop,
    rotate: noop,
    clearRect: count('clearRect'),
    fillRect: count('fillRect'),
    drawImage: noop,
    beginPath: count('beginPath'),
    closePath: noop,
    moveTo: count('moveTo'),
    lineTo: count('lineTo'),
    arc: count('arc'),
    fill: count('fill'),
    stroke: count('stroke'),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
  };
}

class StubElement {
  constructor(tagName) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.className = '';
    this.classList = new StubClassList(this);
    this.style = new StubStyle();
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
    this.textContent = '';
    this.clientWidth = 640;
    this.clientHeight = 420;
    this.width = 0;
    this.height = 0;
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    this.children = this.children.filter((entry) => entry !== child);
    child.parentNode = null;
    return child;
  }
  insertBefore(child, before) {
    child.parentNode = this;
    const index = before ? this.children.indexOf(before) : -1;
    if (index >= 0) this.children.splice(index, 0, child);
    else this.children.push(child);
    return child;
  }
  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
    if (name === 'class') this.className = String(value);
  }
  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }
  hasAttribute(name) {
    return this.attributes.has(name);
  }
  removeAttribute(name) {
    this.attributes.delete(String(name));
  }
  addEventListener(type, listener) {
    const list = this.listeners.get(type) || [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  removeEventListener(type, listener) {
    const list = this.listeners.get(type) || [];
    this.listeners.set(type, list.filter((entry) => entry !== listener));
  }
  dispatch(type, event) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }
  getBoundingClientRect() {
    return { x: 0, y: 0, top: 0, left: 0, right: this.clientWidth, bottom: this.clientHeight, width: this.clientWidth, height: this.clientHeight };
  }
  getContext() {
    return makeContext2d();
  }
  toBlob(callback) {
    callback(new Blob(['fake'], { type: 'image/webp' }));
  }
  toDataURL() {
    return 'data:image/webp;base64,AAAA';
  }
  closest() {
    return null;
  }
  querySelector() {
    return null;
  }
  querySelectorAll() {
    return [];
  }
  focus() {}
  click() {}
  contains() {
    return false;
  }
}

const documentElement = new StubElement('html');
const documentHead = new StubElement('head');
const documentBody = new StubElement('body');

/** Types this harness pretends Chromium cannot decode, so refusal paths stay testable. */
const UNDECODABLE_TYPES = new Set(['video/x-matroska', 'image/heic', 'video/hevc']);
/** Object URLs are mapped back to their blobs so media stubs can inspect them. */
const objectUrls = new Map();
/** Call counters for the fake storage: "did the IndexedDB path run" must be assertable. */
const idbCalls = { transaction: 0, get: 0, put: 0, delete: 0 };

class FakeRequest {
  constructor() {
    this.result = undefined;
    this.error = null;
    this.onsuccess = null;
    this.onerror = null;
  }
}

class FakeObjectStore {
  constructor() {
    this.data = new Map();
  }
  get(key) {
    idbCalls.get += 1;
    const request = new FakeRequest();
    queueMicrotask(() => {
      request.result = this.data.get(key);
      if (request.onsuccess) request.onsuccess();
    });
    return request;
  }
  put(value, key) {
    idbCalls.put += 1;
    const request = new FakeRequest();
    queueMicrotask(() => {
      this.data.set(key, value);
      request.result = key;
      if (request.onsuccess) request.onsuccess();
    });
    return request;
  }
  delete(key) {
    idbCalls.delete += 1;
    const request = new FakeRequest();
    queueMicrotask(() => {
      this.data.delete(key);
      if (request.onsuccess) request.onsuccess();
    });
    return request;
  }
}

class FakeDatabase {
  constructor() {
    this.stores = new Map([
      ['state', new FakeObjectStore()],
      ['assets', new FakeObjectStore()],
    ]);
    this.objectStoreNames = { contains: (name) => this.stores.has(name) };
  }
  createObjectStore(name) {
    const store = new FakeObjectStore();
    this.stores.set(name, store);
    return store;
  }
  transaction() {
    idbCalls.transaction += 1;
    const stores = this.stores;
    return {
      onabort: null,
      objectStore: (storeName) => {
        const store = stores.get(storeName);
        if (!store) throw new Error(`no such object store: ${storeName}`);
        return store;
      },
    };
  }
}

/** Video stub: fires the metadata/seek events `probeVideo` waits for, and fails for undecodable containers. */
class StubVideo extends StubElement {
  constructor() {
    super('video');
    this.videoWidth = 1280;
    this.videoHeight = 720;
    this.duration = 12;
    this.paused = true;
    this.playsInline = true;
    this.preload = '';
    this._muted = true;
    this._volume = 1;
    this._currentTime = 0;
  }
  set src(value) {
    this._src = value;
    const blob = objectUrls.get(value);
    queueMicrotask(() => {
      if (blob && UNDECODABLE_TYPES.has(blob.type)) {
        if (typeof this.onerror === 'function') this.onerror(new Error('decode failed'));
        return;
      }
      if (typeof this.onloadedmetadata === 'function') this.onloadedmetadata();
    });
  }
  get src() {
    return this._src;
  }
  set currentTime(value) {
    this._currentTime = value;
    queueMicrotask(() => {
      if (typeof this.onseeked === 'function') this.onseeked();
    });
  }
  get currentTime() {
    return this._currentTime;
  }
  get muted() {
    return this._muted;
  }
  set muted(value) {
    this._muted = !!value;
  }
  get volume() {
    return this._volume;
  }
  set volume(value) {
    this._volume = value;
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  load() {}
  removeAttribute() {}
}

/** Image stub that fails to load for the undecodable types, like the real decoder. */
class StubImage extends StubElement {
  constructor() {
    super('img');
    this.naturalWidth = 1920;
    this.naturalHeight = 1080;
  }
  set src(value) {
    this._src = value;
    const blob = objectUrls.get(value);
    queueMicrotask(() => {
      if (blob && UNDECODABLE_TYPES.has(blob.type)) {
        if (typeof this.onerror === 'function') this.onerror(new Error('decode failed'));
        return;
      }
      if (typeof this.onload === 'function') this.onload();
    });
  }
  get src() {
    return this._src;
  }
}

const documentStub = {
  documentElement,
  head: documentHead,
  body: documentBody,
  visibilityState: 'visible',
  createElement: (tag) => (String(tag).toLowerCase() === 'video' ? new StubVideo() : new StubElement(tag)),
  querySelector: () => null,
  querySelectorAll: () => [],
  elementsFromPoint: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
};

/** Mimic CSS custom-property substitution and hex→rgb computation. */
function resolveFakeColour(value) {
  if (!value) return 'rgba(0, 0, 0, 0)';
  const text = String(value).trim();
  const variable = text.match(/^var\((--[a-z0-9-]+)\s*(?:,\s*(.+))?\)$/i);
  if (variable) {
    // A known token resolves to the palette value, exactly as a browser would;
    // only an unknown token falls back to the declaration's own fallback.
    const known = TOKEN_ORIGINALS[variable[1]];
    if (known) return resolveFakeColour(known);
    if (variable[2]) return resolveFakeColour(variable[2]);
    return 'rgba(0, 0, 0, 0)';
  }
  const hex = text.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const int = parseInt(hex[1], 16);
    return `rgb(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255})`;
  }
  return text;
}

function installGlobals() {
  globalThis.window = globalThis;
  globalThis.document = documentStub;
  globalThis.navigator = { language: 'zh-CN', languages: ['zh-CN'] };
  globalThis.devicePixelRatio = 1;
  globalThis.innerWidth = 1440;
  globalThis.innerHeight = 900;
  globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
  globalThis.getComputedStyle = (element) => ({
    backgroundColor: resolveFakeColour(element && element.style ? element.style.backgroundColor : ''),
    // Custom properties come back as the palette's own value (a token stream),
    // which is what the relative-colour override path reads.
    getPropertyValue: (name) => {
      const inline = element && element.style && element.style.getPropertyValue ? element.style.getPropertyValue(name) : '';
      return inline || TOKEN_ORIGINALS[name] || '';
    },
  });
  globalThis.CSS = { supports: () => true };
  globalThis.requestAnimationFrame = (callback) => {
    frameSeq += 1;
    pendingFrames.set(frameSeq, callback);
    return frameSeq;
  };
  globalThis.cancelAnimationFrame = (id) => {
    pendingFrames.delete(id);
  };
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  globalThis.HTMLElement = StubElement;
  globalThis.HTMLVideoElement = StubVideo;
  globalThis.HTMLImageElement = StubImage;
  globalThis.Element = StubElement;
  globalThis.indexedDB = {
    open() {
      const request = new FakeRequest();
      queueMicrotask(() => {
        request.result = new FakeDatabase();
        if (request.onsuccess) request.onsuccess();
      });
      return request;
    },
  };
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.Image = StubImage;
  globalThis.FileReader = class FileReader {
    readAsDataURL() {
      queueMicrotask(() => {
        this.result = 'data:image/webp;base64,AAAA';
        if (typeof this.onload === 'function') this.onload();
      });
    }
  };
  globalThis.File = class File extends Blob {
    constructor(parts, name, options) {
      super(parts, options);
      this.name = name;
    }
  };
  // Record every object URL so media stubs can tell which blob they are loading.
  const realCreate = globalThis.URL.createObjectURL.bind(globalThis.URL);
  globalThis.URL.createObjectURL = (blob) => {
    const url = realCreate(blob);
    objectUrls.set(url, blob);
    return url;
  };
  const realRevoke = globalThis.URL.revokeObjectURL.bind(globalThis.URL);
  globalThis.URL.revokeObjectURL = (url) => {
    realRevoke(url);
    objectUrls.delete(url);
  };
}

function runFrames(count) {
  let ran = 0;
  for (let index = 0; index < count; index += 1) {
    const entry = pendingFrames.entries().next();
    if (entry.done) break;
    const [id, callback] = entry.value;
    pendingFrames.delete(id);
    callback(16 * (index + 1));
    ran += 1;
  }
  return ran;
}
// ----------------------------------------------------- miniature React 18

let currentInstance = null;
const instances = new Map();
let pendingEffects = [];

function useState(initial) {
  const instance = currentInstance;
  const index = instance.index++;
  if (!(index in instance.hooks)) instance.hooks[index] = typeof initial === 'function' ? initial() : initial;
  return [
    instance.hooks[index],
    (next) => {
      instance.hooks[index] = typeof next === 'function' ? next(instance.hooks[index]) : next;
    },
  ];
}

function useEffect(effect, deps) {
  const instance = currentInstance;
  const index = instance.index++;
  const previous = instance.deps[index];
  const same = previous && deps && previous.length === deps.length && previous.every((value, position) => value === deps[position]);
  if (same) return;
  instance.deps[index] = deps;
  // Effects run after the whole tree is committed, like React, so a ref assigned
  // to a child element is already populated when the effect body runs.
  pendingEffects.push({ instance, effect });
}

/** A stand-in for a host DOM node, so `ref` targets accept native listeners. */
function createHostElement(type, props, children) {
  const listeners = new Map();
  return {
    type,
    props,
    children,
    listeners,
    addEventListener(type2, listener) {
      const list = listeners.get(type2) || [];
      list.push(listener);
      listeners.set(type2, list);
    },
    removeEventListener(type2, listener) {
      const list = listeners.get(type2) || [];
      listeners.set(type2, list.filter((entry) => entry !== listener));
    },
    dispatch(type2, event) {
      const list = listeners.get(type2) || [];
      for (const listener of list) listener(event);
      return list.length;
    },
  };
}

function useRef(initial) {
  const instance = currentInstance;
  const index = instance.index++;
  if (!(index in instance.hooks)) instance.hooks[index] = { current: initial };
  return instance.hooks[index];
}

const ReactStub = {
  createElement: (type, props, ...children) => ({
    type,
    props: { ...(props || {}), children: children.length === 0 ? undefined : children.length === 1 ? children[0] : children },
    children,
  }),
  useState,
  useEffect,
  useRef,
  useMemo: (factory) => factory(),
  useCallback: (callback) => callback,
};

/** Resolve a node tree, invoking function components with per-position hooks. */
function render(node, key) {
  if (node === null || node === undefined || node === false || node === true) return null;
  if (typeof node === 'string' || typeof node === 'number') return { type: '#text', props: {}, children: [], text: String(node) };
  if (Array.isArray(node)) return node.map((child, index) => render(child, `${key}.${index}`)).filter(Boolean);
  if (typeof node.type === 'function') {
    let instance = instances.get(key);
    if (!instance) {
      instance = { hooks: [], deps: [], cleanups: [], index: 0 };
      instances.set(key, instance);
    }
    instance.index = 0;
    const previous = currentInstance;
    currentInstance = instance;
    let output;
    try {
      output = node.type(node.props);
    } finally {
      currentInstance = previous;
    }
    return render(output, `${key}>`);
  }
  const props = node.props || {};
  const children = [];
  (node.children || []).forEach((child, index) => {
    const rendered = render(child, `${key}.${index}`);
    if (Array.isArray(rendered)) children.push(...rendered);
    else if (rendered) children.push(rendered);
  });
  const element = createHostElement(node.type, props, children);
  if (props.ref && typeof props.ref === 'object') props.ref.current = element;
  return element;
}

/** Render one component tree and flush its queued effects, like a commit would. */
function renderRoot(component, props, key) {
  const tree = render(ReactStub.createElement(component, props), key);
  const queue = pendingEffects;
  pendingEffects = [];
  for (const item of queue) {
    const cleanup = item.effect();
    if (typeof cleanup === 'function') item.instance.cleanups.push(cleanup);
  }
  return tree;
}

function walk(node, visit) {
  if (!node) return;
  visit(node);
  for (const child of node.children || []) walk(child, visit);
}

function findByClass(tree, className) {
  const found = [];
  walk(tree, (node) => {
    const cls = node.props && node.props.className;
    if (typeof cls === 'string' && cls.split(/\s+/).includes(className)) found.push(node);
  });
  return found;
}

function findByProp(tree, prop, value) {
  const found = [];
  walk(tree, (node) => {
    if (node.props && node.props[prop] === value) found.push(node);
  });
  return found;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --------------------------------------------------------------------- test

installGlobals();

const bundlePath = path.join(__dirname, '..', 'client.js');
const bundle = fs.readFileSync(bundlePath, 'utf8');
console.log(`\nWallpaper Studio smoke test\n  bundle: ${bundlePath} (${bundle.length} bytes)\n`);

async function main() {
  let captured = null;
  globalThis.__ModuleLoader__ = {
    load: (options) => {
      captured = options;
    },
  };

  let sandboxError = null;
  try {
    new Function(bundle)();
  } catch (error) {
    sandboxError = error;
  }

  await check('bundle evaluates and registers a factory', () => {
    if (sandboxError) throw sandboxError;
    assert.ok(captured, 'window.__ModuleLoader__.load was never called');
    assert.strictEqual(captured.id, 'dsh-wallpaper-studio');
    assert.strictEqual(typeof captured.factory, 'function');
  });

  let plugin = null;
  await check('factory is side-effect free', () => {
    assert.strictEqual(documentBody.children.length, 0, 'the factory must not touch the DOM');
    plugin = captured.factory((id) => {
      if (id === 'react') return ReactStub;
      throw new Error(`unexpected module request: ${id}`);
    });
    assert.deepStrictEqual(plugin.inject, ['slots']);
    assert.strictEqual(typeof plugin.apply, 'function');
  });

  const registrations = [];
  const disposers = [];
  const ctx = {
    effect: (callback, label) => {
      const disposer = callback();
      disposers.push({ label, disposer });
      return disposer;
    },
    slots: {
      inject: (_name, register) => {
        register();
        return () => {};
      },
      register: (options, component) => {
        registrations.push({ options, component });
        return () => {};
      },
    },
  };

  await check('apply() registers both slots', () => {
    plugin.apply(ctx);
    const names = registrations.map((entry) => entry.options.name).sort();
    assert.deepStrictEqual(names, ['settings.section', 'sidebar.footer.action']);
    for (const entry of registrations) {
      assert.strictEqual(entry.options.id, 'wallpaper-studio');
      assert.ok(String(entry.options.label()).length > 0, 'slot label must resolve to text');
    }
  });

  const section = registrations.find((entry) => entry.options.name === 'settings.section');
  const launcher = registrations.find((entry) => entry.options.name === 'sidebar.footer.action');

  let tree = renderRoot(section.component, { close: () => {} }, 'panel');

  await check('settings page renders every tab', () => {
    const tabs = findByClass(tree, 'dws-tab');
    assert.ok(tabs.length >= 6, `expected at least 6 tabs, saw ${tabs.length}`);
    for (const tab of tabs) {
      tab.props.onClick();
      tree = renderRoot(section.component, { close: () => {} }, 'panel');
    }
    assert.strictEqual(findByClass(tree, 'dws-panel').length, 1);
    // Leave the page on the library tab for the checks that follow.
    findByClass(tree, 'dws-tab')[0].props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
  });

  await check('background layer is mounted with slides and canvas', async () => {
    // Boot resolves settings through IndexedDB first, so give its microtasks a tick.
    await sleep(5);
    const bodyChildren = documentBody.children.map((child) => `${child.tagName}:${child.className || '-'}`);
    const layers = documentBody.children.filter((child) => child.hasAttribute('data-dws-root'));
    assert.strictEqual(layers.length, 1, `exactly one background layer (body holds: ${bodyChildren.join(' | ')})`);
    const layer = layers[0];
    assert.strictEqual(layer.getAttribute('aria-hidden'), 'true');
    assert.ok(layer.children[0].children.length >= 4, 'stage must hold two slides, the canvas and the overlays');
    assert.strictEqual(layer.children.filter((child) => child.hasAttribute('data-dws-frost')).length, 3, 'three frost rectangles');
  });

  await check('library starts empty', () => {
    assert.ok(findByClass(tree, 'dws-empty').length >= 1, 'the empty state should be rendered');
  });

  await check('uploading a wallpaper goes through IndexedDB', async () => {
    const before = { ...idbCalls };
    const inputs = [];
    walk(tree, (node) => {
      if (node.type === 'input' && node.props && node.props.type === 'file') inputs.push(node);
    });
    assert.strictEqual(inputs.length, 1, 'exactly one file input');
    const file = new globalThis.File([Buffer.from('89504e47', 'hex')], 'sunset.png', { type: 'image/png' });
    inputs[0].props.onChange({ target: { value: 'C:\\pictures\\sunset.png', files: [file] } });
    await sleep(60);
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    assert.ok(findByClass(tree, 'dws-thumb').length >= 1, 'one wallpaper tile expected');
    assert.ok(findByClass(tree, 'dws-empty').length === 0, 'the empty state should be gone');
    // Regression: the storage path must actually execute. A `transaction is not
    // defined` ReferenceError in the IndexedDB helper made every upload, every
    // settings save and boot-time settings load fail, and a harness without
    // IndexedDB could not see it.
    assert.ok(idbCalls.transaction > before.transaction, 'the IndexedDB transaction path must run');
    assert.ok(idbCalls.put > before.put, 'the asset must be written to IndexedDB');
  });

  await check('enabling the wallpaper writes the token overrides', () => {
    // Uploading the first wallpaper switches the background on by itself.
    assert.ok(documentElement.classList.contains('dws-on'), 'html should carry dws-on after the first upload');
    const layer = documentBody.children.find((child) => child.hasAttribute('data-dws-root'));
    assert.ok(layer.classList.contains('dws-on'), 'the layer should be marked on');
    const sheetFor = () => documentHead.children.find((child) => child.hasAttribute('data-dws-vars'));
    let sheet = sheetFor();
    assert.ok(sheet, 'the token override sheet must exist');
    for (const token of ['--dsw-alias-bg-base', '--dsw-specific-sidebar-fill', '--dsw-specific-input-major']) {
      assert.ok(sheet.textContent.includes(token), `override sheet should declare ${token}, saw: ${sheet.textContent.slice(0, 160)}`);
    }
    assert.ok(
      sheet.textContent.includes('rgb(from') || sheet.textContent.includes('rgba('),
      `overrides must be translucent colours, saw: ${sheet.textContent.slice(0, 200)}`,
    );

    // Regression (round 2): the pane frost must live inside the plugin's own
    // layer. Publishing the blur through a host element's `backdrop-filter` made
    // that element the containing block for its `position: fixed` children and
    // moved the Desktop titlebar brand row and the composer's floating controls.
    assert.strictEqual(
      layer.style.getPropertyValue('--dws-frost-sidebar'),
      '18px',
      'the sidebar frost strength must be published on the plugin layer',
    );
    assert.strictEqual(layer.style.getPropertyValue('--dws-frost-content'), '14px');
    assert.ok(layer.style.getPropertyValue('--dws-frost-input').endsWith('px'));
    assert.strictEqual(
      documentElement.style.getPropertyValue('--dws-pane-blur-sidebar'),
      '',
      'the old on-<html> variable must stay cleared',
    );
    for (const frost of layer.children.filter((child) => child.hasAttribute && child.hasAttribute('data-dws-frost'))) {
      assert.strictEqual(frost.style.display, 'none', 'with no measurable pane the frost stays hidden');
    }

    // The header switch turns it off and back on again.
    const switches = findByClass(tree, 'dws-switch');
    switches[0].props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    assert.ok(!documentElement.classList.contains('dws-on'), 'turning it off must clear dws-on');
    assert.ok(!layer.classList.contains('dws-on'), 'the layer must be hidden');
    // Regression: every pane variable is cleared, not just the sidebar's.
    for (const key of ['sidebar', 'content', 'input', 'menus']) {
      assert.strictEqual(
        layer.style.getPropertyValue(`--dws-frost-${key}`),
        '',
        `${key} frost must be cleared when the wallpaper is off`,
      );
    }
    findByClass(tree, 'dws-switch')[0].props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    assert.ok(documentElement.classList.contains('dws-on'), 'turning it back on must restore dws-on');
    sheet = sheetFor();
    assert.ok(sheet.textContent.includes('--dsw-alias-bg-base'), 'the sheet must be rewritten');
    assert.strictEqual(layer.style.getPropertyValue('--dws-frost-sidebar'), '18px', 'frost must come back');

    // The override must also be present inline with `!important`: an inline
    // important declaration outranks another plugin's higher-specificity rule,
    // which is what silently kept every pane opaque in the field.
    const inline = documentBody.style.getPropertyValue('--dsw-alias-bg-base');
    assert.ok(inline !== '', 'the base surface token must be set inline on <body>');
    assert.ok(
      inline.includes('rgb(from') || inline.startsWith('rgba('),
      `the override must be a translucent version of the palette colour, saw: ${inline}`,
    );
    assert.strictEqual(documentBody.style.getPropertyPriority('--dsw-alias-bg-base'), 'important', 'inline override must be important');
  });

  await check('regression: the sidebar slider never touches the other panes', () => {
    const sheetFor = () => documentHead.children.find((child) => child.hasAttribute('data-dws-vars'));

    // `--dsw-specific-sidebar-fill` is not private to the sidebar: on a
    // Windows-titlebar window the application frame paints it too, so the frame
    // has to be cleared separately… otherwise tinting the sidebar recolours the
    // whole window (the reported bug). The token itself carries the pane alpha,
    // which is what makes the sidebar follow its own slider only.
    const sidebarInline = () => documentBody.style.getPropertyValue('--dsw-specific-sidebar-fill');
    assert.ok(sidebarInline().includes('62.0%'), `the sidebar token must carry its own alpha, saw: ${sidebarInline()}`);
    assert.ok(
      sheetFor().textContent.includes('--dsw-specific-sidebar-fill'),
      `the sidebar token must be declared, saw: ${sheetFor().textContent.slice(0, 200)}`,
    );
    assert.ok(
      !sidebarInline().includes('transparent'),
      'the sidebar token must not be forced transparent: the sidebar has to keep its own tint',
    );
    assert.ok(
      documentElement.classList.contains('dws-surfaces'),
      'the frame-clearing marker must be on <html> while any surface is on',
    );

    const readOthers = () => ({
      content: documentBody.style.getPropertyValue('--dsw-alias-bg-base'),
      input: documentBody.style.getPropertyValue('--dsw-specific-input-major'),
      menu: documentBody.style.getPropertyValue('--dsw-specific-menu'),
      layer2: documentBody.style.getPropertyValue('--dsw-alias-bg-layer-2'),
      filter: documentBody.style.getPropertyValue('--dsw-menu-backdrop-filter'),
    });
    const before = readOthers();

    findByClass(tree, 'dws-tab')[4].props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    // The surfaces tab renders the panes in SURFACE_KEYS order, so the first
    // range input is the sidebar's pane opacity.
    const surfacesRanges = findByProp(tree, 'type', 'range');
    surfacesRanges[0].props.onChange({ target: { value: '11' } });
    tree = renderRoot(section.component, { close: () => {} }, 'panel');

    assert.ok(sidebarInline().includes('11.0%'), `the sidebar token must follow its own slider, saw: ${sidebarInline()}`);
    const after = readOthers();
    for (const key of Object.keys(before)) {
      assert.strictEqual(after[key], before[key], `moving the sidebar slider must not change ${key}`);
    }

    // Leave the suite on the library tab with the sidebar back at its default.
    surfacesRanges[0].props.onChange({ target: { value: '62' } });
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    findByClass(tree, 'dws-tab')[0].props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
  });

  await check('regression: the window frame is cleared and never used as a pane', () => {
    const layer = documentBody.children.find((child) => child.hasAttribute('data-dws-root'));
    const frost = () =>
      layer.children.find((child) => child.getAttribute && child.getAttribute('data-dws-frost') === 'sidebar');

    // Reproduce the Desktop layout: the frame spans the window and paints the
    // *sidebar's* token, with the sidebar column on top of it painting the same
    // colour. Matching by colour alone cannot tell them apart.
    const frame = new StubElement('div');
    frame.clientWidth = 1440;
    frame.clientHeight = 900;
    frame.style.backgroundColor = 'rgb(251, 251, 251)';
    const sidebar = new StubElement('div');
    sidebar.clientWidth = 240;
    sidebar.clientHeight = 900;
    sidebar.style.backgroundColor = 'rgb(251, 251, 251)';
    sidebar.parentNode = frame;
    sidebar.parentElement = frame;
    frame.parentNode = document.body;
    documentStub.elementsFromPoint = () => [sidebar, frame];
    try {
      findByClass(tree, 'dws-tab')[4].props.onClick();
      tree = renderRoot(section.component, { close: () => {} }, 'panel');
      const ranges = findByProp(tree, 'type', 'range');
      ranges[1].props.onChange({ target: { value: '9' } }); // sidebar blur
      tree = renderRoot(section.component, { close: () => {} }, 'panel');

      assert.strictEqual(
        frame.style.getPropertyValue('background-color'),
        'transparent',
        'the frame must be cleared, or a translucent pane reveals the frame colour instead of the wallpaper',
      );
      const placed = frost();
      assert.ok(placed, 'the sidebar frost element must exist');
      // The sidebar is 240px wide; the frame would be the full 1440px.
      assert.notStrictEqual(placed.style.width, '1440px', 'the sidebar frost must never cover the window frame');
      assert.strictEqual(placed.style.width, '240px', `the sidebar frost must cover the sidebar, saw ${placed.style.width}`);
    } finally {
      documentStub.elementsFromPoint = () => [];
      const ranges = findByProp(tree, 'type', 'range');
      if (ranges[1]) ranges[1].props.onChange({ target: { value: '18' } });
      tree = renderRoot(section.component, { close: () => {} }, 'panel');
      findByClass(tree, 'dws-tab')[0].props.onClick();
      tree = renderRoot(section.component, { close: () => {} }, 'panel');
    }
  });

  await check('regression: the menus surface drives every popover layer', () => {
    const sheet = documentHead.children.find((child) => child.hasAttribute('data-dws-vars'));
    // A popover is painted by the shared menu material, the specific menu token
    // and the elevated layers dialogs and cards use. All of them have to be
    // overridden, or dragging the menus sliders does nothing visible.
    for (const token of [
      '--dsw-specific-menu',
      '--dsw-menu-surface-fill',
      '--dsw-specific-selector',
      '--dsw-alias-bg-layer-2',
      '--dsw-alias-bg-layer-1',
    ]) {
      assert.ok(sheet.textContent.includes(token), `the menus surface must declare ${token}, saw: ${sheet.textContent.slice(0, 300)}`);
      assert.notStrictEqual(documentBody.style.getPropertyValue(token), '', `${token} must be set inline on <body>`);
    }
    assert.ok(
      documentBody.style.getPropertyValue('--dsw-menu-backdrop-filter').includes('blur('),
      'the menus blur slider must drive the menu backdrop filter',
    );
    assert.strictEqual(documentBody.style.getPropertyPriority('--dsw-menu-backdrop-filter'), 'important');
  });

  await check('pane blur: the content and composer rectangles are measured', () => {
    const layer = documentBody.children.find((child) => child.hasAttribute('data-dws-root'));
    const frostFor = (key) =>
      layer.children.find((child) => child.getAttribute && child.getAttribute('data-dws-frost') === key);

    // A layout the shape of the real window: the frame spans everything and (in
    // the Desktop titlebar layout) paints the sidebar's token, the sidebar column
    // sits on the left, the conversation fills the centre and the composer card
    // floats near the bottom.
    const box = (element, left, top, width, height, colour) => {
      element.clientWidth = width;
      element.clientHeight = height;
      element.style.backgroundColor = colour;
      element.getBoundingClientRect = () => ({ x: left, y: top, left, top, right: left + width, bottom: top + height, width, height });
      return element;
    };
    const frame = box(new StubElement('div'), 0, 0, 1440, 900, '#fbfbfb');
    const sidebarCol = box(new StubElement('div'), 0, 0, 240, 900, '#fbfbfb');
    const sidebarRoot = box(new StubElement('div'), 12, 6, 216, 888, '#fbfbfb');
    const centerCol = box(new StubElement('div'), 240, 0, 1200, 900, '#ffffff');
    const conversation = box(new StubElement('div'), 240, 0, 1200, 900, '#ffffff');
    const composer = box(new StubElement('div'), 400, 760, 880, 120, '#f5f5f5');
    // Inner chips a real layout puts on top: they must never win the probe.
    const messageChip = box(new StubElement('div'), 600, 260, 320, 90, '#e9ebef');
    const composerRow = box(new StubElement('div'), 420, 800, 300, 40, '#e9ebef');
    const inside = (element, x, y) => {
      const rect = element.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    };
    // `elementsFromPoint` reports the stack topmost-first, so depth decides order.
    const stack = [
      { element: messageChip, depth: 4 },
      { element: composerRow, depth: 4 },
      { element: conversation, depth: 3 },
      { element: sidebarRoot, depth: 3 },
      { element: composer, depth: 3 },
      { element: centerCol, depth: 2 },
      { element: sidebarCol, depth: 2 },
      { element: frame, depth: 1 },
    ];
    documentStub.elementsFromPoint = (x, y) =>
      stack
        .filter((entry) => inside(entry.element, x, y))
        .sort((a, b) => b.depth - a.depth)
        .map((entry) => entry.element);

    try {
      findByClass(tree, 'dws-tab')[4].props.onClick();
      tree = renderRoot(section.component, { close: () => {} }, 'panel');
      const ranges = findByProp(tree, 'type', 'range');
      // SURFACE_KEYS order: sidebar opacity, sidebar blur, content opacity,
      // content blur, input opacity, input blur, menus opacity, menus blur.
      ranges[1].props.onChange({ target: { value: '12' } });
      tree = renderRoot(section.component, { close: () => {} }, 'panel');
      ranges[3].props.onChange({ target: { value: '14' } });
      tree = renderRoot(section.component, { close: () => {} }, 'panel');
      ranges[5].props.onChange({ target: { value: '22' } });
      tree = renderRoot(section.component, { close: () => {} }, 'panel');

      assert.strictEqual(layer.style.getPropertyValue('--dws-frost-content'), '14px', 'content blur must reach the layer');
      assert.strictEqual(layer.style.getPropertyValue('--dws-frost-input'), '22px', 'composer blur must reach the layer');

      const sidebar = frostFor('sidebar');
      const content = frostFor('content');
      const input = frostFor('input');
      for (const [name, element] of [['sidebar', sidebar], ['content', content], ['input', input]]) {
        assert.ok(element, `${name} frost element must exist`);
        assert.strictEqual(element.style.display, 'block', `${name} frost must be placed, not hidden`);
        assert.ok(Number(element.style.width.replace('px', '')) > 100, `${name} frost must have a real width`);
        assert.ok(Number(element.style.height.replace('px', '')) > 60, `${name} frost must have a real height`);
      }
      assert.strictEqual(sidebar.style.width, '240px', `the sidebar frost must cover the sidebar column, saw ${sidebar.style.width}`);
      assert.strictEqual(sidebar.style.height, '900px');
      assert.strictEqual(content.style.width, '1200px', `the content frost must cover the conversation, saw ${content.style.width}`);
      assert.strictEqual(content.style.left, '240px', `the content frost must start where the conversation does, saw ${content.style.left}`);
      assert.strictEqual(input.style.top, '760px', `the composer frost must sit on the composer card, saw ${input.style.top}`);
      assert.strictEqual(input.style.height, '120px');
    } finally {
      documentStub.elementsFromPoint = () => [];
      const ranges = findByProp(tree, 'type', 'range');
      if (ranges && ranges.length >= 6) {
        ranges[1].props.onChange({ target: { value: '18' } });
        tree = renderRoot(section.component, { close: () => {} }, 'panel');
        ranges[3].props.onChange({ target: { value: '14' } });
        tree = renderRoot(section.component, { close: () => {} }, 'panel');
        ranges[5].props.onChange({ target: { value: '22' } });
        tree = renderRoot(section.component, { close: () => {} }, 'panel');
      }
      findByClass(tree, 'dws-tab')[0].props.onClick();
      tree = renderRoot(section.component, { close: () => {} }, 'panel');
    }
  });

  await check('regression: the effect canvas is sized and actually draws', () => {
    const layer = documentBody.children.find((child) => child.hasAttribute('data-dws-root'));
    const canvas = (() => {
      const found = [];
      const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        if (node.tagName === 'CANVAS') found.push(node);
        for (const child of node.children || []) visit(child);
      };
      visit(layer);
      return found[0];
    })();
    assert.ok(canvas, 'the layer must contain the effect canvas');

    // The canvas is measured from its own box, and the layer is display:none until
    // it is switched on: without a resize on that transition the backing store
    // stayed 0×0 and every effect silently drew nothing (the reported bug).
    canvas.clientWidth = 1440;
    canvas.clientHeight = 900;
    findByClass(tree, 'dws-tab')[2].props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    const auroraTile = findByProp(tree, 'data-effect-id', 'aurora')[0];
    assert.ok(auroraTile, 'the effect tiles must render');
    auroraTile.props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');

    assert.ok(canvas.width > 0 && canvas.height > 0, `the effect canvas must be sized, saw ${canvas.width}×${canvas.height}`);
    assert.strictEqual(canvas.width, 1440, 'the canvas backing store must follow its box');
    assert.strictEqual(canvas.height, 900);

    const before = drawCalls.total;
    runFrames(3);
    assert.ok(drawCalls.total > before, 'the effect must issue drawing calls once its canvas has a size');

    // Leave the suite where the following checks expect it.
    findByClass(tree, 'dws-tab')[0].props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
  });

  await check('defaults: the current settings can become the installation defaults', async () => {
    const click = (label) => {
      const button = findByClass(tree, 'dws-btn').find((candidate) => String(candidate.props.children).includes(label));
      assert.ok(button, `the "${label}" button must render`);
      button.props.onClick();
    };
    const openTab = (index) => {
      findByClass(tree, 'dws-tab')[index].props.onClick();
      tree = renderRoot(section.component, { close: () => {} }, 'panel');
    };
    // The Advanced tab prints the defaults that are in effect, as JSON.
    const defaults = () => JSON.parse(String(findByClass(tree, 'dws-json')[0].props.value));

    try {
      // 1. A distinctive setting, saved as the default.
      openTab(4);
      findByProp(tree, 'type', 'range')[0].props.onChange({ target: { value: '23' } });
      tree = renderRoot(section.component, { close: () => {} }, 'panel');
      openTab(5);
      assert.strictEqual(defaults().surfaces.sidebar.opacity, 62, 'the shipped default is 62 before saving');
      click('把当前设置设为默认值');
      await sleep(20);
      tree = renderRoot(section.component, { close: () => {} }, 'panel');
      assert.strictEqual(defaults().surfaces.sidebar.opacity, 23, 'the settings on screen must become the defaults');

      // 2. Move it away again: the saved default must not follow the live value.
      openTab(4);
      findByProp(tree, 'type', 'range')[0].props.onChange({ target: { value: '88' } });
      tree = renderRoot(section.component, { close: () => {} }, 'panel');
      openTab(5);
      assert.strictEqual(defaults().surfaces.sidebar.opacity, 23, 'the default must stay what was saved');

      // 3. Clearing puts the shipped defaults back.
      click('恢复出厂默认值');
      await sleep(20);
      tree = renderRoot(section.component, { close: () => {} }, 'panel');
      assert.strictEqual(defaults().surfaces.sidebar.opacity, 62, 'the shipped default must be back in effect');

      // Leave the suite as it was: shipped defaults, sidebar back at 62.
      openTab(4);
      findByProp(tree, 'type', 'range')[0].props.onChange({ target: { value: '62' } });
      tree = renderRoot(section.component, { close: () => {} }, 'panel');
    } finally {
      openTab(0);
    }
  });

  await check('turning the wallpaper off restores the inline tokens', () => {
    findByClass(tree, 'dws-switch')[0].props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    assert.strictEqual(documentBody.style.getPropertyValue('--dsw-alias-bg-base'), '', 'the inline override must be removed');
    for (const token of ['--dsw-specific-sidebar-fill', '--dsw-specific-input-major', '--dsw-specific-menu']) {
      assert.strictEqual(documentBody.style.getPropertyValue(token), '', `${token} must be restored`);
    }
    findByClass(tree, 'dws-switch')[0].props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
  });

  await check('no host element is restyled by the plugin', () => {
    // Anything the plugin adds to the page must live inside its own layer, its
    // probe, or be a <style> element in <head>. This is the invariant that keeps
    // host layout untouchable, so it is asserted over the whole stub document.
    const layer = documentBody.children.find((child) => child.hasAttribute('data-dws-root'));
    const insideLayer = (node) => {
      let cursor = node;
      while (cursor) {
        if (cursor === layer || cursor.hasAttribute?.('data-dws-probe')) return true;
        cursor = cursor.parentNode;
      }
      return false;
    };
    const offenders = [];
    const scan = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.attributes && node.attributes.size > 0 && !insideLayer(node)) {
        for (const name of node.attributes.keys()) {
          const key = String(name);
          if (!key.startsWith('data-dws') && !key.startsWith('data-plugin-css')) continue;
          if (node.parentNode && node.parentNode.tagName === 'HEAD') continue;
          offenders.push(`${node.tagName || '?'}[${key}]`);
        }
      }
      // Inline styles on a host element are only allowed on <body>, and only for
      // custom properties (which cannot affect layout).
      if (node.style && node.style.map && node.style.map.size > 0 && !insideLayer(node)) {
        for (const property of node.style.map.keys()) {
          const allowed = node.tagName === 'BODY' && String(property).startsWith('--');
          if (!allowed) offenders.push(`${node.tagName || '?'}{${property}}`);
        }
      }
      for (const child of node.children || []) scan(child);
    };
    scan(documentElement);
    scan(documentBody);
    assert.deepStrictEqual(offenders, [], `the plugin marked host elements: ${offenders.join(', ')}`);

    const strayBackdrop = [];
    const scanStyle = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.style && node.style.map && node.style.map.has('backdrop-filter') && !insideLayer(node)) {
        strayBackdrop.push(node.className || node.tagName);
      }
      for (const child of node.children || []) scanStyle(child);
    };
    scanStyle(documentBody);
    assert.deepStrictEqual(strayBackdrop, [], `backdrop-filter applied outside the layer: ${strayBackdrop.join(', ')}`);
  });

  await check('uploading a video adds a wallpaper', async () => {
    const inputs = [];
    walk(tree, (node) => {
      if (node.type === 'input' && node.props && node.props.type === 'file') inputs.push(node);
    });
    const file = new globalThis.File([Buffer.from('00000018', 'hex')], 'loop.mp4', { type: 'video/mp4' });
    inputs[0].props.onChange({ target: { value: 'C:\\clips\\loop.mp4', files: [file] } });
    await sleep(80);
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    const tiles = findByClass(tree, 'dws-thumb');
    assert.ok(tiles.length >= 2, `expected two library tiles, saw ${tiles.length}`);
    // Make the video the active wallpaper, which mounts a real <video> element.
    tiles[tiles.length - 1].props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    await sleep(40);
    const layer = documentBody.children.find((child) => child.hasAttribute('data-dws-root'));
    let video = null;
    walk({ type: '#root', props: {}, children: layer.children }, (node) => {
      if (node.tagName === 'VIDEO') video = node;
    });
    assert.ok(video, 'the layer must hold a video element for a video wallpaper');
    // The mute state follows the video-sound preference, which the owner's
    // defaults now leave on; the point here is that it is decided by settings and
    // not by accident.
    assert.strictEqual(typeof video.muted, 'boolean', 'the video must have a decided mute state');
    assert.strictEqual(video.loop, true, 'wallpaper videos loop');
  });

  await check('video sound and volume reach the video element', () => {
    // Advanced tab; the switch aria-labels are the Chinese strings because the
    // stubbed navigator reports zh-CN.
    findByClass(tree, 'dws-tab')[5].props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    const soundSwitch = findByProp(tree, 'aria-label', '播放视频声音')[0];
    assert.ok(soundSwitch, 'the video-sound switch must render');
    // Flip it; the switch must round-trip through the settings. (The element's own
    // mute state is not asserted here: a rejected `play()` legitimately mutes the
    // video, which is exactly what the stub's play() does.)
    const isOn = () => findByProp(tree, 'aria-label', '播放视频声音')[0].props['aria-checked'] === 'true';
    const before = isOn();
    soundSwitch.props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    assert.strictEqual(isOn(), !before, 'the video-sound switch must persist its new state');

    const volumeSlider = findByProp(tree, 'aria-label', '视频音量')[0];
    assert.ok(volumeSlider, 'the volume slider must render');
    volumeSlider.props.onChange({ target: { value: '25' } });
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    const layer = documentBody.children.find((child) => child.hasAttribute('data-dws-root'));
    let video = null;
    walk({ type: '#root', props: {}, children: layer.children }, (node) => {
      if (node.tagName === 'VIDEO') video = node;
    });
    assert.ok(video, 'the video element must still exist');
    assert.strictEqual(video.volume, 0.25, 'the volume slider must reach the video element');

    // Put the switch back so the rest of the suite sees the installed default.
    findByProp(tree, 'aria-label', '播放视频声音')[0].props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    assert.strictEqual(video.volume, 0.25, 'the slider drives the video element volume');
  });

  await check('an undecodable file is refused with a notice naming it', async () => {
    // Back to the library tab, where the file input lives.
    findByClass(tree, 'dws-tab')[0].props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    const inputs = [];
    walk(tree, (node) => {
      if (node.type === 'input' && node.props && node.props.type === 'file') inputs.push(node);
    });
    assert.strictEqual(inputs.length, 1, 'the library file input must be back');
    const before = findByClass(tree, 'dws-thumb').length;
    // The harness reports a decode failure for MKV, exactly as Chromium does, so
    // the refusal path is exercised even though the container type is now probed
    // rather than pre-filtered.
    const broken = new globalThis.File([Buffer.from('1a45dfa3', 'hex')], 'movie.mkv', { type: 'video/x-matroska' });
    inputs[0].props.onChange({ target: { value: 'C:\\clips\\movie.mkv', files: [broken] } });
    await sleep(120);
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    assert.strictEqual(findByClass(tree, 'dws-thumb').length, before, 'the refused file must not join the library');
    const toast = findByClass(tree, 'dws-toast')[0];
    assert.ok(toast, 'a refusal notice should be shown');
    const text = JSON.stringify(toast.props.children ?? '');
    assert.ok(text.includes('movie.mkv'), `the notice must name the file, saw: ${text}`);
  });

  await check('an interrupted transition leaves no stale slide classes', async () => {
    // Two wallpapers exist by now. Switching starts a transition; toggling the
    // wallpaper immediately afterwards routes through show(), which cancels that
    // transition — the exact path that used to strand `dws-slide-enter` on the
    // incoming slide and `dws-slide-leave` on the outgoing one.
    const tiles = findByClass(tree, 'dws-thumb');
    assert.ok(tiles.length >= 2, 'two wallpapers are needed for a transition');
    tiles[0].props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    findByClass(tree, 'dws-switch')[0].props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');

    // Let the cancelled transition's timer window pass: a class that survives
    // this long is stranded, one that disappears was cleaned up properly.
    await sleep(1400);

    const layer = documentBody.children.find((child) => child.hasAttribute('data-dws-root'));
    const stage = layer.children[0];
    const slides = stage.children.filter((child) => child.hasAttribute('data-dws-slide'));
    assert.strictEqual(slides.length, 2);
    const classesOf = (slide) => String(slide.className || '').split(/\s+/).filter(Boolean);
    for (const slide of slides) {
      const names = classesOf(slide);
      assert.ok(!names.includes('dws-slide-enter'), `stale dws-slide-enter left on a slide: ${slide.className}`);
      assert.ok(!names.includes('dws-slide-leave'), `stale dws-slide-leave left on a slide: ${slide.className}`);
    }
    const fronts = slides.filter((slide) => classesOf(slide).includes('dws-slide-front'));
    assert.strictEqual(fronts.length, 1, `exactly one slide must be the front one, saw ${fronts.length}`);

    // Restore the wallpaper for the checks that follow.
    findByClass(tree, 'dws-switch')[0].props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
  });

  await check('rapid "next" clicks advance exactly one wallpaper', async () => {
    const activeIndex = () => {
      const libraryTiles = findByClass(tree, 'dws-thumb');
      for (let index = 0; index < libraryTiles.length; index += 1) {
        let flagged = false;
        walk(libraryTiles[index], (node) => {
          if (typeof node.props.className === 'string' && node.props.className.includes('dws-badge')) flagged = true;
        });
        if (flagged) return index;
      }
      return -1;
    };

    // Read the active tile on the library tab, then drive the button on the
    // carousel tab.
    findByClass(tree, 'dws-tab')[0].props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    const before = activeIndex();
    assert.ok(before >= 0, 'the library must show which wallpaper is active');

    findByClass(tree, 'dws-tab')[3].props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    const nextButton = findByClass(tree, 'dws-btn').find((button) => String(button.props.children).includes('下一张'));
    assert.ok(nextButton, 'the manual next button must render');
    // Two clicks in the same tick: the second must be dropped by the guard.
    nextButton.props.onClick();
    nextButton.props.onClick();
    await sleep(1500);

    findByClass(tree, 'dws-tab')[0].props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    const after = activeIndex();
    assert.strictEqual(
      after,
      (before + 1) % 2,
      `expected exactly one advance from ${before}, ended on ${after} (with two wallpapers a double advance returns to the same tile)`,
    );
  });

  await check('every animated effect draws frames', () => {
    const tabs = findByClass(tree, 'dws-tab');
    tabs[2].props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    const ids = ['aurora', 'starfield', 'particles', 'waves', 'rays', 'rain'];
    let drawn = 0;
    for (const id of ids) {
      const tile = findByProp(tree, 'data-effect-id', id)[0];
      assert.ok(tile, `effect tile ${id} must render`);
      tile.props.onClick();
      tree = renderRoot(section.component, { close: () => {} }, 'panel');
      drawn += runFrames(3);
      // Regression: switching effects must never stack animation loops.
      assert.strictEqual(pendingFrames.size, 1, `exactly one animation frame may be queued after ${id}, saw ${pendingFrames.size}`);
    }
    assert.strictEqual(drawn >= ids.length, true, `expected animation frames, saw ${drawn}`);
  });

  await check('carousel, surfaces and advanced tabs interact', () => {
    const tabs = findByClass(tree, 'dws-tab');
    tabs[3].props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    const carouselSwitch = findByClass(tree, 'dws-switch')[0];
    carouselSwitch.props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    const checkboxes = findByProp(tree, 'type', 'checkbox');
    assert.ok(checkboxes.length >= 1, 'carousel member checkboxes must render');
    for (const box of checkboxes) box.props.onChange({ target: { checked: true } });
    tree = renderRoot(section.component, { close: () => {} }, 'panel');

    const surfaceTabs = findByClass(tree, 'dws-tab');
    surfaceTabs[4].props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    const sliders = findByProp(tree, 'type', 'range');
    assert.ok(sliders.length >= 4, 'pane sliders must render');
    sliders[0].props.onChange({ target: { value: '25' } });
    tree = renderRoot(section.component, { close: () => {} }, 'panel');

    const advancedTabs = findByClass(tree, 'dws-tab');
    advancedTabs[5].props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    assert.ok(findByClass(tree, 'dws-card').length >= 2, 'advanced cards must render');
  });

  await check('crop editor opens and zooms with the wheel', () => {
    const tabs = findByClass(tree, 'dws-tab');
    tabs[0].props.onClick();
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    const icons = findByClass(tree, 'dws-iconBtn');
    assert.ok(icons.length >= 1, 'item action buttons must render');
    icons[0].props.onClick({ stopPropagation: () => {} });
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    assert.strictEqual(findByClass(tree, 'dws-modalMask').length, 1, 'the crop dialog should be open');
    assert.ok(findByClass(tree, 'dws-cropBox').length === 1, 'the crop box should render');
    assert.ok(findByClass(tree, 'dws-modalFoot')[0], 'the crop dialog footer must render');

    // The wheel listener is native and non-passive (React's onWheel can be
    // attached passively), so it must be reachable on the stage element itself.
    const stage = findByClass(tree, 'dws-cropStage')[0];
    assert.ok(stage && typeof stage.dispatch === 'function', 'the crop stage must be a real element with listeners');
    const zoomValue = () => Number(findByProp(tree, 'aria-label', '缩放')[0].props.value);
    const before = zoomValue();
    let prevented = 0;
    const handled = stage.dispatch('wheel', {
      deltaY: -120,
      preventDefault: () => {
        prevented += 1;
      },
    });
    assert.strictEqual(handled, 1, 'exactly one wheel listener must be attached');
    assert.strictEqual(prevented, 1, 'the wheel handler must call preventDefault');
    tree = renderRoot(section.component, { close: () => {} }, 'panel');
    const after = zoomValue();
    assert.ok(after > before, `a wheel-up must zoom in, saw ${before} -> ${after}`);
  });

  await check('launcher panel opens', () => {
    const launcherTree = renderRoot(launcher.component, { wide: true }, 'launcher');
    const button = findByClass(launcherTree, 'dws-launcher')[0];
    assert.ok(button, 'launcher button must render');
    button.props.onClick();
    const opened = renderRoot(launcher.component, { wide: true }, 'launcher');
    assert.ok(findByClass(opened, 'dws-quick').length >= 1, 'the quick panel should open');
  });

  await check('destroy() removes the plugin footprint', () => {
    for (const entry of disposers.slice().reverse()) {
      if (typeof entry.disposer === 'function') entry.disposer();
    }
    assert.strictEqual(documentBody.children.filter((child) => child.hasAttribute('data-dws-root')).length, 0);
    assert.ok(!documentElement.classList.contains('dws-on'));
    for (const key of ['sidebar', 'content', 'input', 'menus']) {
      assert.strictEqual(documentElement.style.getPropertyValue(`--dws-pane-blur-${key}`), '', `${key} blur must be gone`);
    }
    const sheet = documentHead.children.find((child) => child.hasAttribute('data-dws-vars'));
    assert.strictEqual(sheet, undefined, 'the override sheet must be gone');
  });

  await check('the built Host half still exports apply()', () => {
    const host = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
    assert.ok(/^\s*export\s+function\s+apply\s*\(/m.test(host), 'index.js must export apply(), the Loader imports it');
  });

  console.log('');
  if (failures.length > 0) {
    console.error(`${failures.length} check(s) failed:\n - ${failures.join('\n - ')}\n`);
    process.exitCode = 1;
  } else {
    console.log('all checks passed\n');
  }
}

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    const detail = error && error.stack ? error.stack.split('\n').slice(0, 3).join('\n       ') : String(error);
    failures.push(`${name}: ${error && error.message}`);
    console.log(`  FAIL ${name}\n       ${detail}`);
  }
}

main().catch((error) => {
  console.error('smoke test crashed', error);
  process.exitCode = 1;
});
