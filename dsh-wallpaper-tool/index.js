/* Wallpaper Studio — generated Host half. Edit src/index.ts and run `node build.mjs`. */
/**
 * Wallpaper Studio — Host half.
 *
 * The plugin is a browser-side feature: the Client module (client.js) owns the
 * background layer, the wallpaper library and the Settings page. The Host half
 * only has to exist so the Loader has an entry to activate, and so the Client
 * bundle is published to the page under `/plugins`. It declares no services, no
 * tools and no config, and it touches nothing on disk.
 *
 * The export is load-bearing: the Loader `import()`s this file and calls
 * `apply()`, so the build must keep the ESM keyword (see `emitHost` in
 * build.mjs, which asserts it).
 */
export function apply() {}


//# sourceURL=src/index.ts
