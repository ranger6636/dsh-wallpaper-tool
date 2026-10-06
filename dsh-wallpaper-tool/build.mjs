/**
 * Build for Wallpaper Studio.
 *
 * The plugin is authored in TypeScript but the DSH Web GUI loads a plain browser
 * bundle, so this script compiles `src/**.ts` into the two artifacts the package
 * manifest points at:
 *
 *   index.js   – Host half  (src/index.ts)
 *   client.js  – Client half (src/client/main.ts), one self-contained bundle that
 *                registers itself through `window.__ModuleLoader__.load`.
 *
 * No bundler dependency is available in this deployment, so the bundler below is
 * built on Node's own TypeScript type stripping (`module.stripTypeScriptTypes`)
 * plus a small, deliberately restricted module inliner:
 *
 *   - only relative, single-line `import` statements are supported,
 *   - `import { a, b as c }` and `import * as ns` are supported,
 *   - only named exports of the form `export function|const|let|var|class` are
 *     supported (no default exports, no `export {}` lists, no re-exports),
 *   - import cycles are rejected.
 *
 * Anything outside that subset fails the build loudly instead of emitting a
 * broken bundle. Run `node build.mjs --check` to build and then syntax-check the
 * artifacts without writing them.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = dirname(fileURLToPath(import.meta.url));
const CHECK_ONLY = process.argv.includes('--check');

const IMPORT_RE = /^[ \t]*import[ \t]+([\s\S]*?)[ \t]+from[ \t]*['"]([^'"]+)['"][ \t]*;?[ \t]*$/gm;
const SIDE_EFFECT_IMPORT_RE = /^[ \t]*import[ \t]*['"]([^'"]+)['"][ \t]*;?[ \t]*$/gm;
const EXPORT_DECL_RE = /^[ \t]*export[ \t]+(?=(?:async[ \t]+)?(?:function|const|let|var|class)\b)/gm;
const EXPORT_DECL_SCAN_RE = /^[ \t]*export[ \t]+(?=(?:async[ \t]+)?(?:function|const|let|var|class)\b)/gm;
const NAMED_DECL_RE = /^(?:async[ \t]+)?(?:function|const|let|var|class)[ \t]+([A-Za-z_$][\w$]*)/;

/** Skip a quoted string / template literal starting at `index`; returns its last index. */
function skipQuoted(source, index) {
  const quote = source[index];
  let cursor = index + 1;
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === '\\') {
      cursor += 2;
      continue;
    }
    if (char === quote) return cursor;
    cursor += 1;
  }
  return source.length - 1;
}

/**
 * Find the end of the statement that starts at `start`, ignoring brackets and
 * strings, so a declarator list can be split on its own top-level commas.
 */
function statementEnd(source, start) {
  let depth = 0;
  for (let cursor = start; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (char === '"' || char === "'" || char === '`') {
      cursor = skipQuoted(source, cursor);
      continue;
    }
    if (char === '/' && source[cursor + 1] === '/') {
      const newline = source.indexOf('\n', cursor);
      if (newline < 0) return source.length;
      cursor = newline;
      continue;
    }
    if (char === '/' && source[cursor + 1] === '*') {
      const end = source.indexOf('*/', cursor);
      if (end < 0) return source.length;
      cursor = end + 1;
      continue;
    }
    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') depth -= 1;
    else if (char === ';' && depth <= 0) return cursor + 1;
  }
  return source.length;
}

/** Split a declarator list on its top-level commas. */
function splitTopLevel(text) {
  const parts = [];
  let current = '';
  let depth = 0;
  for (let cursor = 0; cursor < text.length; cursor += 1) {
    const char = text[cursor];
    if (char === '"' || char === "'" || char === '`') {
      const end = skipQuoted(text, cursor);
      current += text.slice(cursor, end + 1);
      cursor = end;
      continue;
    }
    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

/**
 * Collect the names one `export` declaration introduces.
 *
 * A declarator list is supported (`export const a = 1, b = 2` yields both), and
 * anything the emitter cannot reproduce faithfully fails the build instead of
 * silently dropping a binding from the returned object.
 */
function collectExportNames(statement, file) {
  const head = statement.match(/^(?:async[ \t]+)?(function|class|const|let|var)\b[ \t]*\*?[ \t]*/);
  if (!head) return [];
  const rest = statement.slice(head[0].length);
  if (head[1] === 'function' || head[1] === 'class') {
    const named = rest.match(/^([A-Za-z_$][\w$]*)/);
    if (!named) fail(`cannot read the exported name in "${statement.trim().slice(0, 60)}" (${relative(ROOT, file)})`);
    return [named[1]];
  }
  return splitTopLevel(rest).map((part) => {
    const named = part.trim().match(/^([A-Za-z_$][\w$]*)/);
    if (!named) {
      fail(
        `${relative(ROOT, file)} exports a destructuring pattern ("${part.trim().slice(0, 40)}"); ` +
          'declare the bindings first and export them by name',
      );
    }
    return named[1];
  });
}

/** Strip TypeScript-only syntax, keeping ESM import/export keywords intact. */
function transpile(source, file) {
  try {
    // A package-relative source URL keeps browser stack traces pointing at the
    // TypeScript source without leaking this machine's absolute paths.
    return stripTypeScriptTypes(source, { mode: 'strip', sourceUrl: relative(ROOT, file).replace(/\\/g, '/') });
  } catch (error) {
    throw new Error(`[build] TypeScript could not strip ${relative(ROOT, file)}: ${error.message}`);
  }
}

function fail(message) {
  throw new Error(`[build] ${message}`);
}

/** Resolve a relative import specifier to a source file on disk. */
function resolveSpecifier(fromFile, specifier) {
  if (!specifier.startsWith('.')) {
    fail(`non-relative import "${specifier}" in ${relative(ROOT, fromFile)}; only relative imports can be bundled`);
  }
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [
    base.replace(/\.js$/, '.ts'),
    base.replace(/\.mjs$/, '.mts'),
    `${base}.ts`,
    join(base, 'index.ts'),
    // A plain-JavaScript module is accepted too: type stripping is a no-op on it.
    join(base, 'index.js'),
    join(base, 'index.mjs'),
  ];
  for (const candidate of candidates) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      /* keep looking */
    }
  }
  fail(`cannot resolve "${specifier}" from ${relative(ROOT, fromFile)}`);
}

/**
 * Turn one TypeScript module into a factory body plus the names it imports and
 * exports.
 */
function compileModule(file) {
  const raw = readFileSync(file, 'utf8');
  const js = transpile(raw, file);
  const imports = [];
  const exportNames = [];

  let body = js.replace(IMPORT_RE, (_match, clause, specifier) => {
    const trimmed = clause.trim();
    const sideEffectFree = trimmed.startsWith('type ') || trimmed === '';
    if (sideEffectFree) return '';
    if (trimmed.startsWith('*')) {
      const ns = trimmed.slice(1).replace(/^[ \t]*as[ \t]+/, '').trim();
      imports.push({ specifier, statement: `const ${ns} = __require(${JSON.stringify(specifier)});` });
      return '';
    }
    if (!trimmed.startsWith('{')) {
      fail(`unsupported import clause "${trimmed}" in ${relative(ROOT, file)}; use named or namespace imports`);
    }
    const inner = trimmed.slice(1, trimmed.lastIndexOf('}'));
    const bindings = [];
    for (const part of inner.split(',')) {
      const piece = part.trim();
      if (piece === '' || piece.startsWith('type ')) continue;
      const alias = piece.split(/[ \t]+as[ \t]+/);
      bindings.push(alias.length === 2 ? `${alias[0].trim()}: ${alias[1].trim()}` : piece);
    }
    if (bindings.length > 0) {
      imports.push({ specifier, statement: `const { ${bindings.join(', ')} } = __require(${JSON.stringify(specifier)});` });
    }
    return '';
  });

  body = body.replace(SIDE_EFFECT_IMPORT_RE, (_match, specifier) => {
    imports.push({ specifier, statement: `__require(${JSON.stringify(specifier)});` });
    return '';
  });

  body = body.replace(EXPORT_DECL_RE, '');
  for (const match of js.matchAll(EXPORT_DECL_SCAN_RE)) {
    const start = match.index + match[0].length;
    const statement = js.slice(start, statementEnd(js, start));
    for (const name of collectExportNames(statement, file)) exportNames.push(name);
  }
  if (exportNames.length !== new Set(exportNames).size) {
    fail(`${relative(ROOT, file)} exports the same name twice; the returned object would collide`);
  }
  if (/^[ \t]*export[ \t]*\{/m.test(js) || /^[ \t]*export[ \t]+default\b/m.test(js)) {
    fail(`${relative(ROOT, file)} uses an unsupported export form; use "export function|const|class" declarations`);
  }
  if (/^[ \t]*export[ \t]+\*/m.test(js)) {
    fail(`${relative(ROOT, file)} re-exports another module; that is not supported`);
  }

  return { file, imports, exportNames, body };
}

/** Walk the module graph from `entry`, rejecting cycles. */
function collect(entry) {
  const modules = new Map();
  const stack = [];

  const visit = (file) => {
    // The stack is checked first on purpose: `modules.set` below happens before
    // the recursion, so a module already on the stack is also already in
    // `modules`. Checking `modules` first would make this branch unreachable and
    // let A -> B -> A through — which the emitted `__require` cannot survive,
    // because it has no partial-exports placeholder and would recurse forever.
    if (stack.includes(file)) {
      fail(`import cycle: ${[...stack, file].map((entry) => relative(ROOT, entry)).join(' -> ')}`);
    }
    if (modules.has(file)) return;
    stack.push(file);
    const compiled = compileModule(file);
    for (const item of compiled.imports) {
      item.file = resolveSpecifier(file, item.specifier);
    }
    modules.set(file, compiled);
    for (const item of compiled.imports) visit(item.file);
    stack.pop();
  };

  visit(entry);
  return modules;
}

function moduleId(file) {
  return relative(ROOT, file).replace(/\\/g, '/');
}

function emitBundle(entry) {
  const modules = collect(entry);
  const chunks = [];
  chunks.push('/* Wallpaper Studio — generated bundle. Edit src/ and run `node build.mjs`. */');
  chunks.push('(function () {');
  chunks.push("  'use strict';");
  chunks.push('  var __factories = {};');
  chunks.push('  var __cache = {};');
  chunks.push('  var __loading = {};');
  chunks.push('  function __require(id) {');
  chunks.push('    if (Object.prototype.hasOwnProperty.call(__cache, id)) return __cache[id];');
  chunks.push('    var factory = __factories[id];');
  chunks.push("    if (!factory) throw new Error('[wallpaper-studio] module not found: ' + id);");
  chunks.push("    if (__loading[id]) throw new Error('[wallpaper-studio] circular import: ' + id);");
  chunks.push('    __loading[id] = true;');
  chunks.push('    try {');
  chunks.push('      var exports = factory();');
  chunks.push('      __cache[id] = exports;');
  chunks.push('      return exports;');
  chunks.push('    } finally {');
  chunks.push('      delete __loading[id];');
  chunks.push('    }');
  chunks.push('  }');

  for (const [file, compiled] of modules) {
    const id = moduleId(file);
    chunks.push(`  __factories[${JSON.stringify(id)}] = function () {`);
    for (const item of compiled.imports) {
      chunks.push(`    ${item.statement.replace(JSON.stringify(item.specifier), JSON.stringify(moduleId(item.file)))}`);
    }
    // Indent the module body so the generated bundle stays readable.
    for (const line of compiled.body.split('\n')) chunks.push(line.length > 0 ? `    ${line}` : '');
    chunks.push(`    return { ${compiled.exportNames.join(', ')} };`);
    chunks.push('  };');
  }

  chunks.push(`  __require(${JSON.stringify(moduleId(entry))});`);
  chunks.push('})();');
  return chunks.join('\n');
}

/**
 * The Host half is written out verbatim (after type stripping) rather than
 * wrapped: the Loader `import()`s this file and needs its real
 * `export function apply`, so the ESM keywords must survive.
 */
function emitHost(entry) {
  const source = transpile(readFileSync(entry, 'utf8'), entry);
  if (/^[ \t]*import[ \t]/m.test(source)) fail('the Host half must not import other modules');
  const otherForm = source.match(/^[ \t]*export[ \t]+(default|\*|\{)/m);
  if (otherForm) {
    fail(`the Host half must use "export function apply" (found "export ${otherForm[1]}"); the Loader imports apply()`);
  }
  if (!/^[ \t]*export[ \t]+(?:async[ \t]+)?function[ \t]+apply\b/m.test(source)) {
    fail('the Host half must export apply() as a function declaration');
  }
  return `/* Wallpaper Studio — generated Host half. Edit src/index.ts and run \`node build.mjs\`. */\n${source.trim()}\n`;
}

const targets = [
  { label: 'client.js', entry: resolve(ROOT, 'src/client/main.ts'), emit: emitBundle, esm: 'bundled' },
  { label: 'index.js', entry: resolve(ROOT, 'src/index.ts'), emit: emitHost, esm: 'kept' },
];

const results = [];
const { version: PACKAGE_VERSION } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
for (const target of targets) {
  const code = target.emit(target.entry).replace(/__PLUGIN_VERSION__/g, PACKAGE_VERSION);
  // Compile-check without executing: a syntax error surfaces here, not in the browser.
  try {
    // eslint-disable-next-line no-new-func
    new Function(code.replace(/^[ \t]*export[ \t]+/gm, ''));
  } catch (error) {
    fail(`${target.label} failed syntax check: ${error.message}`);
  }
  if (target.esm === 'bundled') {
    const leftover = code.match(/^[ \t]*(?:import|export)[ \t]/m);
    if (leftover) fail(`${target.label} still contains an ESM statement: ${leftover[0].trim()}`);
  } else if (!/^[ \t]*export[ \t]+function[ \t]+apply\b/m.test(code)) {
    fail(`${target.label} must export apply()`);
  }
  results.push({ ...target, code });
}

for (const result of results) {
  const bytes = Buffer.byteLength(result.code, 'utf8');
  if (CHECK_ONLY) {
    console.log(`[build] ok ${result.label} (${bytes} bytes, not written: --check)`);
    continue;
  }
  const out = join(ROOT, result.label);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, result.code, 'utf8');
  console.log(`[build] wrote ${result.label} (${bytes} bytes)`);
}

runGuardSelfTest();

/**
 * Exercise the bundler's own guards on throwaway fixtures.
 *
 * These checks exist because a guard that silently stops firing is worse than
 * no guard: the cycle detector was once written with its two lookups in the
 * wrong order and never ran again. Running the fixtures on every build keeps
 * that from happening a second time.
 */
function runGuardSelfTest() {
  const dir = join(ROOT, '.build-selftest');
  const write = (name, source) => {
    const file = join(dir, name);
    writeFileSync(file, source, 'utf8');
    return file;
  };
  const expectFailure = (label, run, needle) => {
    let message = null;
    try {
      run();
    } catch (error) {
      message = error.message;
    }
    if (message === null) fail(`self-test: ${label} should have failed the build`);
    for (const wanted of Array.isArray(needle) ? needle : [needle]) {
      if (wanted && !message.includes(wanted)) {
        fail(`self-test: ${label} failed with an unexpected message (missing "${wanted}"): ${message}`);
      }
    }
  };

  try {
    mkdirSync(dir, { recursive: true });

    // 1. A cycle must be rejected at build time, with the chain in the message.
    const a = write('cycle-a.ts', "import { b } from './cycle-b.js';\nexport const a = () => b;\n");
    write('cycle-b.ts', "import { a } from './cycle-a.js';\nexport const b = () => a;\n");
    expectFailure('an import cycle', () => collect(a), ['import cycle', 'cycle-a.ts', 'cycle-b.ts']);

    // 2. A self-import is a cycle too.
    const self = write('self.ts', "import { s } from './self.js';\nexport const s = s;\n");
    expectFailure('a self import', () => collect(self), 'import cycle');

    // 3. One export declaration with several declarators keeps every name.
    const multi = compileModule(write('multi.ts', 'export const a = 1, b = 2, c = [3, 4];\n'));
    const wanted = ['a', 'b', 'c'];
    if (multi.exportNames.join(',') !== wanted.join(',')) {
      fail(`self-test: multi-declarator export collected "${multi.exportNames.join(',')}" instead of "${wanted.join(',')}"`);
    }
    const call = compileModule(write('call.ts', 'export const pair = make(1, 2), other = 3;\n'));
    if (call.exportNames.join(',') !== 'pair,other') {
      fail(`self-test: a call argument was mistaken for a declarator: ${call.exportNames.join(',')}`);
    }

    // 4. Destructuring exports are refused rather than silently mis-emitted.
    expectFailure('a destructuring export', () => compileModule(write('destructure.ts', 'export const { a, b } = pair;\n')), 'destructuring');

    // 5. Unsupported export forms are refused.
    expectFailure('export {}', () => compileModule(write('list.ts', 'const a = 1;\nexport { a };\n')), 'unsupported export form');
    expectFailure('export default', () => compileModule(write('default.ts', 'export default 1;\n')), 'unsupported export form');

    // 6. The Host half must keep a real `export function apply`.
    const hostFile = write('host.ts', 'export function apply() {}\n');
    if (!emitHost(hostFile).includes('export function apply')) fail('self-test: emitHost dropped the export');
    expectFailure('a Host half without an export', () => emitHost(write('host-none.ts', 'function apply() {}\n')), 'must export apply()');
    expectFailure('a Host half with export {}', () => emitHost(write('host-list.ts', 'function apply() {}\nexport { apply };\n')), 'must use "export function apply"');

    console.log('[build] guard self-test passed (cycle detection, export collection, Host export form)');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
