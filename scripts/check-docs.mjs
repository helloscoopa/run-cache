#!/usr/bin/env node
/**
 * Checks the code samples in the docs against the package's public API.
 *
 * It reads fenced js/ts code blocks from README.md, CLAUDE.md and gitbook/
 * (the live "next" docs), plus every file in examples/, and reports:
 *   - named imports from 'run-cache' that the package entry does not export
 *   - RunCache.<member> calls that the RunCache class does not have
 *   - library internals (exported inside src/ but not from the package) used by name
 *   - async RunCache calls in statement or assignment position without `await`
 *   - a few known-stale patterns (see STALE_PATTERNS)
 *
 * The exported surface is read from src/, so the check follows the code.
 * Frozen docs in gitbook-versions/ are not checked: they describe what shipped.
 *
 * To skip one block on purpose, put `<!-- docs-check-ignore -->` on the line
 * directly above its opening fence.
 *
 * Usage: node scripts/check-docs.mjs [files...]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

function walk(dir, filter) {
  const out = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const p = join(dir, name);
    if (statSync(join(ROOT, p)).isDirectory()) out.push(...walk(p, filter));
    else if (filter(p)) out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API, read from src/
// ---------------------------------------------------------------------------

const isSource = (p) => p.endsWith(".ts") && !p.endsWith(".d.ts") && !p.includes(".test.") && !p.startsWith(join("src", "examples"));
const sourceFiles = walk("src", isSource);

function exportedNames(file) {
  const src = read(file);
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:declare\s+)?(?:abstract\s+)?(?:class|const|let|function|interface|type|enum)\s+(\w+)/g)) {
    names.add(m[1]);
  }
  for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  return names;
}

// Package entry: its own export lists plus everything reached through `export * from`.
function resolveExports(file, seen = new Set()) {
  if (seen.has(file)) return new Set();
  seen.add(file);
  const names = exportedNames(file);
  for (const m of read(file).matchAll(/export\s+\*\s+from\s+['"](.+?)['"]/g)) {
    for (const n of resolveExports(`${join(file, "..", m[1])}.ts`, seen)) names.add(n);
  }
  return names;
}
const publicExports = resolveExports(join("src", "index.ts"));
publicExports.add("default");

// Names exported somewhere in src/ but not from the package entry.
const internalNames = new Set();
for (const f of sourceFiles) for (const n of exportedNames(f)) if (!publicExports.has(n)) internalNames.add(n);
// Generic words that are also ordinary identifiers in sample code.
for (const n of ["Logger", "ExpiryTimer", "SourceFn", "CacheState"]) internalNames.add(n);

// RunCache static members, and which of them are async.
const runCacheSrc = read(join("src", "run-cache.ts"));
const classBody = runCacheSrc.slice(runCacheSrc.indexOf("export class RunCache"), runCacheSrc.indexOf("export class TypedCacheInterface"));
const runCacheMembers = new Map();
for (const m of classBody.matchAll(/^\s+(?:public\s+)?static\s+(async\s+)?(\w+)\s*[<(]/gm)) {
  runCacheMembers.set(m[2], Boolean(m[1]));
}
for (const m of classBody.matchAll(/^\s+private\s+static\s+(?:async\s+)?(\w+)/gm)) runCacheMembers.delete(m[1]);

// ---------------------------------------------------------------------------
// Known-stale patterns that the API checks above cannot see
// ---------------------------------------------------------------------------

const STALE_PATTERNS = [
  [/\bvalidator\s*:/, "no RunCache method takes a `validator` option"],
  [/(?:value|sourceFn)\s*:.*JSON\.stringify\(/, "non-string values are serialized for you; pass the value itself"],
  [/JSON\.parse\(\s*(?:await\s+)?[\w.]*\.get\(/, "get() already returns the stored value (objects are parsed); do not JSON.parse it"],
  [/\binternalCache\b|\bgetInternalCache\b/, "the cache's internals are not public API"],
  [/\b(?:event|e|evt)\.(?:metadata|timestamp|reason|oldValue|newValue|duration|operation)\b/, "event payloads only have key, value, ttl, createdAt, updatedAt, tag, dependencyKey and error"],
  [/\.refetch\(\s*[^,()]+(?:\([^()]*\))?\s*,/, "refetch() takes only a key"],
  [/context\.operation\s*===?\s*['"](?:save|load)['"]/, "middleware does not run on save/load; operations are get, set, delete, has and refetch"],
];

// ---------------------------------------------------------------------------
// Code block extraction
// ---------------------------------------------------------------------------

const CODE_LANGS = new Set(["js", "javascript", "ts", "typescript", "jsx", "tsx", "mjs"]);

function codeBlocks(file) {
  const text = read(file);
  if (!file.endsWith(".md")) return [{ line: 1, code: text }];
  const lines = text.split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(/^(\s*)(```+|~~~+)\s*([\w-]*)/);
    if (!open) continue;
    const fence = open[2];
    const lang = open[3].toLowerCase();
    const start = i;
    // A closing fence uses the same character, is at least as long, and has only
    // spaces or tabs after it (CommonMark), so `~~~ payload` inside a block is content.
    const closing = new RegExp(`^\\s*${fence[0] === "`" ? "`" : "~"}{${fence.length},}[ \\t]*$`);
    let j = i + 1;
    while (j < lines.length && !closing.test(lines[j])) j++;
    const ignored = start > 0 && lines[start - 1].includes("docs-check-ignore");
    if (CODE_LANGS.has(lang) && !ignored) {
      blocks.push({ line: start + 2, code: lines.slice(start + 1, j).join("\n") });
    }
    i = j;
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function stripComments(line) {
  // Good enough for samples: drop `// ...` that is not inside a string or URL.
  return line.replace(/(^|[^:'"`\\])\/\/.*$/, "$1");
}

/** True if the call whose `(` is at lines[line][col] is followed by `.then`/`.catch`/`.finally`. */
function isChained(lines, line, col) {
  let depth = 0;
  let quote = null; // open string delimiter; parentheses inside strings do not count
  for (let l = line; l < lines.length; l++) {
    const text = lines[l];
    if (quote && quote !== "`") quote = null; // '...' and "..." strings end with the line
    for (let c = l === line ? col : 0; c < text.length; c++) {
      const ch = text[c];
      if (quote) {
        if (ch === "\\") c++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === "`") quote = ch;
      else if (ch === "(") depth++;
      else if (ch === ")" && --depth === 0) {
        const rest = [text.slice(c + 1), ...lines.slice(l + 1, l + 3)].join("\n");
        return /^\s*\.(?:then|catch|finally)\(/.test(rest);
      }
    }
  }
  return false;
}

/**
 * True if line i is a property of the options object passed directly to a
 * `.set(`/`.refetch(` call that starts a few lines above. Properties of nested
 * objects (such as `value: { metadata: ... }`) do not count.
 */
function insideCacheCall(lines, i) {
  let parens = 0;
  let braces = 0; // closed `{...}` pairs seen while walking back
  let openBraces = 0; // unclosed `{` between line i and the call
  for (let j = i - 1; j >= Math.max(0, i - 15); j--) {
    const text = lines[j];
    for (let c = text.length - 1; c >= 0; c--) {
      const ch = text[c];
      if (ch === ")") parens++;
      else if (ch === "}") braces++;
      else if (ch === "{") {
        if (braces > 0) braces--;
        else openBraces++;
      } else if (ch === "(") {
        if (parens === 0) {
          return openBraces === 1 && /\.(?:set|refetch)\s*(?:<[^>]*>)?$/.test(text.slice(0, c));
        }
        parens--;
      }
    }
  }
  return false;
}

function previousCodeLine(lines, i) {
  for (let j = i - 1; j >= 0; j--) if (lines[j].trim()) return stripComments(lines[j]);
  return "";
}

function checkBlock(code) {
  const problems = [];
  const lines = code.split("\n");
  const add = (i, msg) => problems.push({ offset: i, msg });

  // Imports (may span lines).
  for (const m of code.matchAll(/import\s+(?:type\s+)?(?:\w+\s*,\s*)?\{([^}]*)\}\s*from\s*['"]run-cache['"]/g)) {
    const offset = code.slice(0, m.index).split("\n").length - 1;
    for (const raw of m[1].split(",")) {
      const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
      if (name && !publicExports.has(name)) add(offset, `'${name}' is not exported by 'run-cache'`);
    }
  }
  for (const m of code.matchAll(/require\(\s*['"]run-cache['"]\s*\)/g)) void m; // CommonJS default is fine

  // Variables that hold a get() result, to catch `JSON.parse(thatVariable)` later on.
  const getResults = new Set();
  for (const m of code.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*\(?\s*await\s+[\w.]*\.get\s*(?:<[^>]*>)?\(/g)) {
    getResults.add(m[1]);
  }

  let inBlockComment = false;
  lines.forEach((rawLine, i) => {
    let line = rawLine;
    if (inBlockComment) {
      if (!line.includes("*/")) return;
      line = line.slice(line.indexOf("*/") + 2);
      inBlockComment = false;
    }
    if (line.includes("/*") && !line.includes("*/")) {
      inBlockComment = true;
      line = line.slice(0, line.indexOf("/*"));
    }
    line = stripComments(line);
    if (/^\s*\*/.test(line)) return;

    for (const m of line.matchAll(/\bRunCache\.(\w+)/g)) {
      const name = m[1];
      if (name === "prototype") continue;
      if (!runCacheMembers.has(name)) {
        add(i, `RunCache.${name} does not exist`);
        continue;
      }
    }

    // Un-awaited async call as a statement or the right side of an assignment.
    // Calls whose promise is chained (`.then`/`.catch` after the call) or that are the
    // body of a concise arrow function (`() =>` ending the previous line) are handled.
    const stmt = line.match(/^\s*(?:(?:const|let|var)\s+[\w{}\s,[\]]+=\s*|[\w.[\]]+\s*=\s*)?RunCache\.(\w+)\s*(?:<[^>]*>)?\(/);
    if (stmt && runCacheMembers.get(stmt[1])
        && !isChained(lines, i, stmt.index + stmt[0].length - 1)
        && !/=>\s*$/.test(previousCodeLine(lines, i))) {
      add(i, `RunCache.${stmt[1]}() is async; await it (or return/collect the promise)`);
    }

    for (const name of internalNames) {
      if (new RegExp(`(^|[^\\w.'"\`])${name}\\b(?!['"\`])`).test(line)) {
        add(i, `'${name}' is internal and not exported by 'run-cache'`);
      }
    }

    for (const [re, msg] of STALE_PATTERNS) if (re.test(line)) add(i, msg);
    for (const m of line.matchAll(/JSON\.parse\(\s*(\w+)\s*\)/g)) {
      if (getResults.has(m[1]) && !new RegExp(`typeof\\s+${m[1]}\\s*===?\\s*['"]string['"]`).test(code)) add(i, `'${m[1]}' holds a get() result, which is already parsed; do not JSON.parse it`);
    }
    // `metadata:` only matters inside a set()/refetch() call, not in the reader's own objects.
    if (/^\s*metadata\s*:/.test(line) && insideCacheCall(lines, i)) {
      add(i, "cache entries have no metadata option");
    }
  });
  return problems;
}

const args = process.argv.slice(2);
const files = args.length
  ? args.map((p) => relative(ROOT, resolve(p)))
  : [
      "README.md",
      "CLAUDE.md",
      ...walk("gitbook", (p) => p.endsWith(".md")),
      ...walk("examples", (p) => [".js", ".ts", ".mjs"].includes(extname(p))),
    ];

let count = 0;
for (const file of files) {
  for (const block of codeBlocks(file)) {
    for (const p of checkBlock(block.code)) {
      count++;
      console.log(`${file}:${block.line + p.offset}: ${p.msg}`);
    }
  }
}

if (count) {
  console.log(`\n${count} problem(s) in doc code samples.`);
  process.exit(1);
}
console.log(`Doc code samples match the public API (${files.length} files checked).`);
