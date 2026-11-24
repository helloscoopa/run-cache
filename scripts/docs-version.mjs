#!/usr/bin/env node
/**
 * Versioned GitBook docs for RunCache.
 *
 *   node scripts/docs-version.mjs snapshot <tag>   Freeze the docs of a release tag
 *                                                  into gitbook-versions/vX.Y and
 *                                                  regenerate gitbook-docs.yaml.
 *   node scripts/docs-version.mjs config           Only regenerate gitbook-docs.yaml.
 *
 * Layout (GitBook site Git Sync, project directory = repository root):
 *
 *   gitbook-docs.yaml          one site; every space in it is a version, shown
 *                              to readers in the version menu above the sidebar
 *   gitbook/                   "Next": the docs on main, edited as usual
 *   gitbook-versions/v1.6/     frozen docs of the latest v1.6.x tag
 *   gitbook-versions/v1.5/     ...
 *
 * The newest frozen release is the default version, so visitors land on the
 * docs that match `npm install run-cache`. Releases before v1.6.0 had no
 * gitbook/ folder; their snapshot is that tag's README.md as a single page.
 *
 * No dependencies: Node 18+ and git.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const NEXT_DIR = "gitbook";
const VERSIONS_DIR = "gitbook-versions";
const CONFIG_FILE = "gitbook-docs.yaml";
const SITE_TITLE = "RunCache";

// Files in gitbook/ that belong to legacy tooling (GitBook CLI, Mintlify) or are
// notes for maintainers, not pages for readers. Left out of frozen versions.
const NOT_DOCS = new Set([
  "book.json",
  "mint.json",
  "setup-gitbook.sh",
  "README_GITBOOK.md",
  "README_MAIN.md",
  "DOCUMENTATION_SUMMARY.md",
]);
const NOT_DOCS_DIRS = ["styles/"];

const git = (...args) => execFileSync("git", args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });

function parseTag(tag) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  if (!m) throw new Error(`"${tag}" is not a release tag like v1.6.1`);
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function versionDirs() {
  const dir = path.join(ROOT, VERSIONS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^v\d+\.\d+$/.test(d.name))
    .map((d) => {
      const [major, minor] = d.name.slice(1).split(".").map(Number);
      return { name: d.name, major, minor };
    })
    .sort((a, b) => b.major - a.major || b.minor - a.minor);
}

function banner(line, tag) {
  const spec = `${line.slice(1)}`; // "1.6"
  return [
    '{% hint style="info" %}',
    `These docs are for **RunCache ${line}.x** (last updated at release ${tag}). ` +
      `Install this version with \`npm install run-cache@${spec}\`, or pick another version from the menu above the sidebar.`,
    "{% endhint %}",
    "",
  ].join("\n");
}

/** Put the banner right under the page's first H1, or at the top if there is none. */
function withBanner(markdown, text) {
  const lines = markdown.split("\n");
  const h1 = lines.findIndex((l) => /^# /.test(l));
  if (h1 === -1) return `${text}\n${markdown}`;
  lines.splice(h1 + 1, 0, "", text.trimEnd());
  return lines.join("\n");
}

const GITBOOK_YAML = "root: ./\n\nstructure:\n  readme: README.md\n  summary: SUMMARY.md\n";

function snapshot(tag) {
  const { major, minor } = parseTag(tag);
  const line = `v${major}.${minor}`;
  git("rev-parse", "--verify", "--quiet", `refs/tags/${tag}^{commit}`);

  const dest = path.join(ROOT, VERSIONS_DIR, line);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });

  const files = git("ls-tree", "-r", "--name-only", tag, "--", `${NEXT_DIR}/`)
    .toString()
    .split("\n")
    .filter(Boolean);

  if (files.length > 0) {
    for (const file of files) {
      const rel = file.slice(NEXT_DIR.length + 1);
      if (NOT_DOCS.has(rel) || NOT_DOCS_DIRS.some((d) => rel.startsWith(d))) continue;
      const out = path.join(dest, rel);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, git("show", `${tag}:${file}`));
    }
  } else {
    // Before v1.6.0 the README was the whole documentation.
    fs.writeFileSync(path.join(dest, "README.md"), git("show", `${tag}:README.md`));
    fs.writeFileSync(path.join(dest, "SUMMARY.md"), "# Table of contents\n\n* [RunCache](README.md)\n");
  }

  // Live badges (npm version, CI status) describe main, not this frozen release.
  const readme = path.join(dest, "README.md");
  const text = fs
    .readFileSync(readme, "utf8")
    .split("\n")
    .filter((l) => !/^\[!\[[^\]]*\]\(https:\/\/img\.shields\.io\//.test(l))
    .join("\n")
    .replace(/^\n+/, "");
  fs.writeFileSync(readme, withBanner(text, banner(line, tag)));
  fs.writeFileSync(path.join(dest, ".gitbook.yaml"), GITBOOK_YAML);

  console.log(`Froze ${tag} docs into ${VERSIONS_DIR}/${line}/`);
}

function writeConfig() {
  const versions = versionDirs();
  const space = ({ key, title, slug, dir, isDefault }) =>
    [
      `  - type: space`,
      `    key: ${key}`,
      `    title: "${title}"`,
      `    path: ${slug}`,
      ...(isDefault ? [`    default: true`] : []),
      `    content:`,
      `      directory: ./${dir}`,
      `      language: en`,
    ].join("\n");

  const spaces = [
    ...versions.map((v, i) =>
      space({
        key: `space-v${v.major}-${v.minor}`, // stable: never change once synced
        title: i === 0 ? `${v.name} (latest)` : v.name,
        slug: `v${v.major}-${v.minor}`,
        dir: `${VERSIONS_DIR}/${v.name}`,
        isDefault: i === 0,
      }),
    ),
    space({
      key: "space-next",
      title: "Next (unreleased)",
      slug: "next",
      dir: NEXT_DIR,
      isDefault: versions.length === 0,
    }),
  ];

  const yaml = [
    "# Generated by scripts/docs-version.mjs. Do not edit by hand:",
    "# run `node scripts/docs-version.mjs config` after changing gitbook-versions/.",
    "#",
    "# Each space below is one version of the RunCache docs. GitBook shows them as",
    "# a version menu above the sidebar; the default one opens at the site root.",
    "$schema: https://api.gitbook.com/gitbook-docs.yaml",
    "site:",
    `  title: ${SITE_TITLE}`,
    "  structure:",
    spaces.join("\n").replace(/^/gm, "  "),
    "",
  ].join("\n");

  fs.writeFileSync(path.join(ROOT, CONFIG_FILE), yaml);
  const nextYaml = path.join(ROOT, NEXT_DIR, ".gitbook.yaml");
  if (!fs.existsSync(nextYaml)) fs.writeFileSync(nextYaml, GITBOOK_YAML);
  console.log(`Wrote ${CONFIG_FILE}: ${versions.map((v) => v.name).join(", ") || "(no releases)"} + next`);
}

const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === "snapshot" && arg) {
    snapshot(arg);
    writeConfig();
  } else if (cmd === "config") {
    writeConfig();
  } else {
    console.error("Usage: node scripts/docs-version.mjs snapshot <tag> | config");
    process.exit(1);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
