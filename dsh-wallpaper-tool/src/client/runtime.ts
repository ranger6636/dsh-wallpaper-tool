/**
 * The React runtime handle. `main.ts` receives React from the module loader's
 * `require` and passes it down; every other module imports this file for its
 * types only, so no module except the entry ever touches the loader.
 */
export interface Runtime {
  React: {
    createElement: (...args: unknown[]) => unknown;
    useState: <T>(initial: T) => [T, (next: T | ((previous: T) => T)) => void];
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => void;
    useRef: <T>(initial: T) => { current: T };
    useMemo: <T>(factory: () => T, deps: unknown[]) => T;
    useCallback: <T>(callback: T, deps: unknown[]) => T;
  };
  h: (type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]) => unknown;
  /** Hooks are proxied from React so components only depend on this object. */
  useState: Runtime['React']['useState'];
  useEffect: Runtime['React']['useEffect'];
  useRef: Runtime['React']['useRef'];
  useMemo: Runtime['React']['useMemo'];
  useCallback: Runtime['React']['useCallback'];
}
