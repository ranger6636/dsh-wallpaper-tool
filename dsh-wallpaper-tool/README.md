# Wallpaper Studio

Put your own wallpaper behind the DeepSeek Harness Web UI: upload an image or a
video, tune opacity / blur / darkening, layer animated effects, let the sidebar,
transcript and composer show the wallpaper through, and run a carousel with
hand-made framing.

> 中文说明???[README.zh.md](README.zh.md)

---

## Features

| Request | How it is delivered |
| --- | --- |
| Custom background | Any image, video or effect in the library can be the background in one click |
| Image and video upload | Drag & drop or file picker, multiple files; videos loop muted and contribute a first-frame thumbnail |
| Opacity / blur / darken | Three primary sliders, plus brightness, saturation, vignette, zoom and horizontal / vertical composition |
| Animated background effects | Aurora, starfield, bokeh motes, waves, light rays and rain, drawn live on a canvas …usable as the background itself or as an overlay on a photo |
| Sidebar / content / composer see-through | Four panes (including menus) each get a pane-opacity and backdrop-blur control; the plugin rewrites the UI's own surface tokens and keeps each palette's tint |
| Carousel | Interval, order (list / shuffle), transition (fade / zoom / slide / blur), duration, and per-wallpaper membership |
| Manual crop | Drag to move, wheel to zoom, sliders for fine work, rotation and aspect presets; images are baked into a new cropped copy, videos keep framing parameters |
| Extras | `Alt+B` toggle, slow motion modes (push-in / drift / breathe), reduce-motion support, pause while hidden, sidebar quick panel |

## Platforms and supported formats

**Platform.** The Desktop app (the Electron window) and the browser serve the
same Web UI through the same client-plugin mechanism, and this plugin only uses
DOM / CSS / Canvas / IndexedDB, so it works identically in Desktop …which is
what this machine runs (the `desktop` profile). Only the native title bar at the
very top is drawn by the application itself; the wallpaper stays behind it.

**Images** (recognised by MIME type or extension): PNG, JPEG/JPG, WebP, GIF
(animated included), AVIF, BMP, SVG.

**Videos**: MP4 / M4V (H.264 + AAC; Chromium also plays VP9 / AV1 inside MP4),
WebM (VP8 / VP9 / AV1 with Opus / Vorbis), Ogg (Theora) and MOV when it really
carries a supported codec such as H.264.

**What cannot be decoded is refused, loudly**: MKV, H.265/HEVC, WMV / AVI / FLV,
MPEG-2, ProRes and friends …Chromium ships no demuxer or decoder for them, so
the plugin reports it and asks you to re-encode to MP4 (H.264) or WebM instead of
adding a wallpaper that would stay black. Maximum file size is 320 MB.

Image decoding is Chromium's; if a picture is accepted but does not appear it is
usually an exotic encoding (CMYK JPEG, for instance) …re-save it once.

## Video sound

Yes. **Settings →Background wallpaper →Advanced** holds a "Play video sound"
switch and a "Video volume" slider (muted by default, 60% by default). Turning
the switch on unmutes the wallpaper video at that volume, and moving the volume
slider switches the sound on by itself.

Browsers restrict autoplay: without user interaction, unmuted playback can be
refused. The plugin then falls back to muted playback and tells you once …click
anywhere on the page and raise the volume again.

## Installation

This is a standard DSH bundle. The supported route is to let the Harness agent
install it (it drives `plugin_manager install_bundle`, which performs the package
install and bundle registration):

1. Keep the `dsh-wallpaper-studio` folder anywhere you like (the Desktop is fine).
2. In any DSH session, ask: **"install `<absolute folder path>` into the current profile"**.
3. Refresh the page when the install reports success, then open
   **Settings →Background wallpaper**.

Manual installation (informational only …DSH recommends `plugin_manager`): run
`pnpm add file:<folder>` inside the profile directory, add the package name to
`dsh.profile.bundles` in its `package.json`, and let it load this package's
`cordis.patch.yml`.

## Usage

- **Settings page**: bottom-left Settings →**Background wallpaper** in the left
  navigation, with six tabs: Library / Appearance / Effects / Carousel /
  See-through / Advanced.
- **Quick panel**: a 🖼 button sits above the Settings trigger in the sidebar
  footer; it toggles the wallpaper, switches to the next one and overlays effects.
- **Shortcut**: `Alt+B` toggles the wallpaper.
- The background switches itself on with your first upload; turning it off keeps
  every setting.

## Data and privacy

Everything stays in your browser: wallpapers are stored as Blobs in the page's
own IndexedDB database (`dsh-wallpaper-studio`) and the settings document sits in
the same database. No network requests, no files written to disk, nothing routed
through the Host. "Advanced →Delete every wallpaper and setting" removes all of
it. If IndexedDB is unavailable (private windows, hardened profiles) the plugin
degrades to a session-only mode and says so.

## How it works

- **See-through panes.** The UI paints its surfaces from design tokens …
  `--dsw-alias-bg-base` (window frame / document / transcript),
  `--dsw-specific-sidebar-fill` (the sidebar column, **which the whole window
  frame also paints**), `--dsw-specific-input-major` (composer card) and
  `--dsw-specific-menu` / `--dsw-menu-surface-fill` (menu material). The content,
  composer and menu surfaces override those tokens on `body` with `!important`,
  using an alpha version of whatever colour the active palette resolves to, so
  light and dark themes keep their own tint. The original colour is read through a
  probe element at apply time, never hard-coded. **The sidebar is different:** its
  token also paints the window frame, so tinting it recoloured the entire window.
  The plugin forces that token to `transparent` (which is what clears the frame
  and lets the wallpaper through everywhere) and draws the sidebar's own fill as a
  rectangle on its own layer, confined to the sidebar.
- **Menus.** Popovers mount per open, so a rectangle measured now would be stale:
  their blur overrides `--dsw-menu-backdrop-filter` and their fill overrides the
  two menu colour tokens.
- **Pane blur (redone in v1.0.1).** The blur is deliberately NOT applied to the pane
  elements. `backdrop-filter` makes an element the containing block for its
  `position: fixed` descendants, so styling a host pane moved the Desktop
  titlebar brand row and the composer's floating controls — the cause of the
  v1.0.0 `enabling the wallpaper breaks the layout` bug. The plugin now only
  MEASURES pane geometry (`elementsFromPoint` plus a token-colour
  confirmation) and draws matching frost rectangles inside its own layer. No
  host element is ever restyled, and an invariant check enforces that.
- **Background layer.** One `position: fixed; z-index: -1` element under `body`
  holding two slides (for cross-fades), the effect canvas and the darkening /
  vignette overlays. It is `pointer-events: none` and never intercepts input.
- **Consistent crop.** The live layer, the crop preview and the baked bitmap all
  go through the same `layout()` geometry, so the editor shows what you get.
- **Cost control.** One requestAnimationFrame loop, device pixel ratio capped at
  1.5, particle counts scaled by canvas area, animation paused while the window
  is hidden, `prefers-reduced-motion` respected.

## Layout

```
dsh-wallpaper-studio/
├─ package.json          bundle manifest (dsh.bundle / dsh.client / meta / icon)
├─ cordis.patch.yml      inserts the wallpaper-studio row into the profile
├─ index.js              Host half (empty apply; holds the Loader row)   →built
├─ client.js             browser half, self-registers with __ModuleLoader__ →built
├─ src/
─ ├─ index.ts           Host half source
─ └─ client/
─    ├─ main.ts         entry: registers settings.section + sidebar.footer.action
─    ├─ studio.ts       controller: state, persistence, carousel, blob lifetimes
─    ├─ layer.ts        the background layer (slides / video / effect / scrims)
─    ├─ theme.ts        surface-token overrides, pane blur, base stylesheet
─    ├─ effects.ts      the six canvas effects
─    ├─ crop.ts         framing geometry and baked cropping
─    ├─ cropEditor.ts   the crop editor (drag / wheel / sliders / aspects)
─    ├─ panel.ts        Settings page and quick panel
─    ├─ store.ts        IndexedDB persistence with an in-memory fallback
─    ├─ media.ts        probing and thumbnails
─    ├─ settings.ts     defaults and normalisation
─    ├─ i18n.ts         Chinese and English strings
─    ├─ ui.ts           small controls
─    └─ types.ts        shared types
├─ build.mjs             TypeScript →browser bundle (Node's type stripping)
├─ tests/smoke.cjs       headless smoke test (DOM + React stubs)
├─ locale/{zh,en}.json   plugin-manager card text
└─ icon.svg
```

## Build and test

Node ≥22.18 (built-in TypeScript type stripping); this machine runs Node 24.

```powershell
node build.mjs          # writes client.js and index.js, then runs the bundler guard self-test
node build.mjs --check  # compile and syntax-check without writing
node tests/smoke.cjs    # run the smoke test against the built bundle (same as npm test)
```

Every build also runs a **bundler guard self-test**: an import cycle must be
rejected (A→B→A and self-imports), a multi-declarator export must collect every
name, destructuring exports / `export {}` / `export default` must fail, and the
Host half must keep `export function apply`. A guard that stops firing breaks the
build instead of surfacing later as `Maximum call stack size exceeded` in the
browser.

The smoke test executes the real bundle against a minimal DOM stub and a
miniature React with per-instance hooks. It covers: factory registration,
`apply` registering both slots, all six Settings tabs rendering, uploading a
wallpaper, the token override sheet after enabling, every effect drawing frames,
opening the crop editor, opening the launcher panel, and `destroy()` cleanup.

## Fix log

- **v1.0.7**
  - Added: a **Defaults** card in the Advanced tab. "Set current settings as the default" stores what is on screen right now as the installation's defaults (persisted next to the working copy), which "delete every wallpaper and setting" — and any field a future version adds — then falls back to. "Back to the shipped defaults" undoes it. The card also prints the effective defaults as read-only JSON, so the setup can be carried to another machine.
  - The shipped defaults now carry the owner's own values: no dimming, full brightness/saturation, 2× zoom, a slow push-in at 36 / 2×, no overlay effect, a two-minute carousel, and video sound on at 100%. Pane see-through stays at 62 / 48 / 70 / 76.
  - These values were recovered from the app's own IndexedDB (`studio-state`) so they match what is on screen today; if anything is tuned again, the button above re-freezes it.
- **v1.0.6**
  - Fixed: **animated effects never drew anything**. The effect canvas is sized from its own box, but that measurement only ran on `window.resize` — never at startup and never when the layer went from hidden to visible. The layer is `display: none` while the wallpaper is off, so the canvas stayed **0×0** and `draw()` returned at its first line on every frame (which is also why resizing the window appeared to "fix" it). The canvas is now measured at startup and every time the layer becomes visible.
  - Improved: when the system asks for reduced motion the Effects tab **says so** and offers a "play effects anyway" button, instead of leaving the sliders and effects looking broken.
  - Added: the Advanced diagnostics gained an **effect row** — effect id, real canvas pixel size, running/paused/idle and whether reduce-motion suppresses it. A `0×0` canvas there is the signature of this bug.
  - Tests: the harness now models `requestAnimationFrame` / `cancelAnimationFrame` faithfully (cancel used to be a no-op, so the "switching effects must never stack animation loops" invariant could not actually fail), and a new check asserts the **canvas gets a real size and issues drawing calls** — it fails on the previous version.
- **v1.0.5**
  - Fixed: the **content and composer backdrop-blur sliders did nothing**. The blur is a rectangle drawn inside the plugin's own layer at the pane's measured position, and the old probe fell back to the *smallest* candidate when the colour match failed: a chip inside the composer, a message bubble — even the window frame — could win. The rectangle was then too small to notice or dropped altogether, so the slider looked dead. The rule is now threefold: (1) anything spanning the window is the frame and is dropped while a real candidate exists; (2) the sidebar still refuses anything wider than a third of the window; (3) among candidates that really paint the pane's token the **outermost** wins — the pane container, not a chip, row or bubble inside it — and only with no colour match at all does the largest candidate win. The sidebar frost improved from the inner container to the whole column (240px), the content frost lands on the conversation and the composer frost on the composer card.
  - Added: the Advanced tab reports the **measured frost rectangles** (`—` means that pane measured nothing, the one way its blur slider can look dead).
  - Tests: the headless harness gained a **realistic-layout geometry simulation** (frame / sidebar column / conversation / composer card plus chips and an inner composer row) asserting the three rectangles land on 240×900, 1200×900 and 880×120 — a check that fails on the previous version and reproduces exactly this bug.
- **v1.0.4**
  - Fixed: v1.0.3 forced the sidebar token to `transparent` and painted its fill from the plugin's layer, but **the probe then picked the wrong element**: with the sidebar's own elements transparent the colour match failed and the fallback chose the **window frame**, so the "sidebar" frost rectangle covered the whole window — which is why the sidebar sliders blurred and tinted the transcript as well. The sidebar token carries its own alpha again (so it can be matched), and the frame is neutralised **on the element** (`background-color` is paint-only; unlike `backdrop-filter` it cannot move `position: fixed` children), with an `#root > :first-child` CSS fallback. The sidebar probe also refuses anything wider than a third of the window.
  - Fixed: every probe now runs with the plugin's **own overrides suspended** (stylesheet disabled and inline declarations lifted, then restored). Without it every pane paints this plugin's translucent colour while the frame keeps a different opaque one, so the match inevitably picked the frame. That surfaced a real bug: the restore wrote the *pre-plugin* value back, deleting the inline override outright.
  - Fixed: the **menus sliders looked inert**. They now cover the menu material *and* the dropdown selector *and* the elevated dialog/card layers (`--dsw-alias-bg-layer-2` / `-1`), so dragging them changes the settings dialog itself.
  - Added: the Advanced tab shows the **running version**, injected by `build.mjs` from `package.json`.
  - Fixed: the token-colour cache was not dropped on a light/dark switch.
- **v1.0.3**
  - Fixed: the **sidebar pane-opacity slider changed every pane**. `--dsw-specific-sidebar-fill` is not private to the sidebar — on a window with the custom titlebar the whole application frame paints it as its base colour, so overriding it with the pane alpha recoloured the entire window. The shared token is now forced to `transparent` (which also clears the frame, the reason the wallpaper can show through at all) and the sidebar's own fill is drawn as a rectangle on the plugin's layer, confined to the sidebar rectangle. Moving the sidebar slider no longer touches the content, composer or menu surfaces, and turning the sidebar surface off paints the rectangle at full opacity so the sidebar looks untouched.
  - Fixed: the **menus surface did nothing**. Two causes: the menus card was off by default (its sliders were disabled), and a popover is actually painted by `--dsw-specific-menu` + `--dsw-menu-surface-fill` with `--dsw-menu-backdrop-filter` for its blur — none of which was overridden. Menus are now on by default (76% opacity), all three menu-material tokens are overridden, and stored v1 documents migrate on load (`schemaVersion` 1 → 2).
  - Tests: two new regression checks — "the sidebar slider never touches the other panes" and "the menus surface drives the menu material" — so neither bug can come back unnoticed.
- **v1.0.1**
  - Fixed: enabling the wallpaper broke the layout. `backdrop-filter` was applied to host panes, making them the containing block for their `position: fixed` children (the Desktop titlebar brand row and the composer's floating controls moved). The layer now draws its own frost rectangles and no host element is restyled; verified in a real browser by comparing every element's box with the wallpaper off and on (308 host elements identical).
  - Fixed: every upload reported `unsupported file type`. `store.ts`'s `tx()` declared `const transaction` inside a `try` block and used it outside, so every call threw `ReferenceError: transaction is not defined` — uploads, settings saves and the boot-time settings load all failed, and the error surfaced as a format problem.
  - Improved: uploads now probe first (Chromium decides what decodes, not the plugin's MIME list) and failures name the file and the real reason (undecodable / storage unavailable / too large).
  - Tests: the headless harness now models IndexedDB and object URLs (`indexedDB` used to be undefined, which bypassed the broken code) and asserts that no host element is rewritten.

## Known limitations

- **No live visual verification yet.** This machine has no browser automation, so
  the visuals (how a wallpaper reads, how strong the blur feels, where the pane
  opacity lands) are verified at the logic level only. After installing, start
  with the See-through tab and tune the sliders to taste.
- Pane blur depends on geometric probing; a pane that cannot be probed keeps the
  transparency but no backdrop blur. Everything else is unaffected.
- Overriding `--dsw-alias-bg-base` also makes small controls that use that token
  translucent …that is the price of seeing the wallpaper through the content
  area; use "global dim" and pane blur to keep text readable.
- Videos are never re-encoded; cropping stores framing parameters. Files above
  320 MB are refused …compress them first.

MIT License.
