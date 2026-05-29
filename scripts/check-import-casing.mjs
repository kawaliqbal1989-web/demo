import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const SCAN_ROOTS = ["frontend", "src", "deploy/src", "tests"];
const CODE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const CHECK_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".css"]);
const IGNORE_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", "coverage"]);

const IMPORT_PATTERNS = [
  /(?:import\s+(?:[^\"'`;]+?\s+from\s+)?|export\s+[^\"'`;]*?from\s+|import\s*\(\s*)[\"']([^\"']+)[\"']/g,
  /require\(\s*[\"']([^\"']+)[\"']\s*\)/g,
  /@import\s+(?:url\()?\s*[\"']([^\"']+)[\"']\s*\)?/g
];

function toPosix(p) {
  return p.replace(/\\/g, "/");
}

function fileExistsCaseSensitive(absPath) {
  if (!fs.existsSync(absPath)) {
    return false;
  }

  const rel = toPosix(path.relative(ROOT, absPath));
  if (!rel || rel.startsWith("..")) {
    return true;
  }

  const segments = rel.split("/").filter(Boolean);
  let current = ROOT;

  for (const segment of segments) {
    const entries = fs.readdirSync(current);
    if (!entries.includes(segment)) {
      return false;
    }
    current = path.join(current, segment);
  }

  return true;
}

function safeReadDir(absDir) {
  try {
    return fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function collectFiles(rootRel) {
  const files = [];
  const start = path.join(ROOT, rootRel);
  if (!fs.existsSync(start)) return files;

  function walk(absDir) {
    for (const entry of safeReadDir(absDir)) {
      if (entry.name.startsWith(".")) {
        if (entry.name !== ".eslintrc.js") {
          if (entry.isDirectory()) continue;
        }
      }
      if (entry.isDirectory() && IGNORE_DIRS.has(entry.name)) continue;

      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }

      const ext = path.extname(entry.name);
      if (!CHECK_EXTENSIONS.has(ext)) continue;
      files.push(toPosix(path.relative(ROOT, abs)));
    }
  }

  walk(start);
  return files;
}

function extractImports(source) {
  const specs = [];
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const spec = String(match[1] || "").trim();
      if (spec) specs.push(spec);
    }
  }
  return specs;
}

function resolveRelativeImport(importerAbs, specifier) {
  const importerDir = path.dirname(importerAbs);
  const baseAbs = path.resolve(importerDir, specifier);
  const ext = path.extname(baseAbs);
  const hasKnownCodeExt = CODE_EXTENSIONS.has(ext);

  const candidates = [];
  if (hasKnownCodeExt) {
    candidates.push(baseAbs);
  } else {
    // Support extension-less and dotted stems like "foo.shared" -> "foo.shared.js".
    candidates.push(baseAbs);
    for (const ext of CODE_EXTENSIONS) {
      candidates.push(baseAbs + ext);
    }
    for (const ext of CODE_EXTENSIONS) {
      candidates.push(path.join(baseAbs, "index" + ext));
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function findCaseMismatchedSegment(importerAbs, targetAbs, specifier) {
  const resolvedFromImport = path.resolve(path.dirname(importerAbs), specifier);
  const rel = toPosix(path.relative(ROOT, resolvedFromImport));
  if (rel.startsWith("..")) return null;

  const targetRel = toPosix(path.relative(ROOT, targetAbs));
  const targetDir = toPosix(path.dirname(targetRel));
  const targetBase = path.basename(targetRel);

  const importExt = path.extname(specifier);
  const hasRealImportExt = CODE_EXTENSIONS.has(importExt) || importExt === ".css";

  if (hasRealImportExt) {
    return rel === targetRel ? null : { expected: targetRel, actual: rel };
  }

  const relNoExt = rel.replace(/\.(jsx?|tsx?|mjs|cjs)$/i, "").replace(/\/index$/i, "");
  const targetNoExt = targetRel.replace(/\.(jsx?|tsx?|mjs|cjs)$/i, "").replace(/\/index$/i, "");
  if (relNoExt !== targetNoExt) {
    return { expected: targetNoExt, actual: relNoExt };
  }

  const absTargetDir = path.join(ROOT, targetDir === "." ? "" : targetDir);
  const actualEntries = safeReadDir(absTargetDir).map((entry) => entry.name);
  if (!actualEntries.includes(targetBase)) {
    return { expected: targetRel, actual: rel };
  }

  return null;
}

function getTrackedFiles() {
  const output = execSync("git ls-files", { encoding: "utf8" });
  return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function duplicateCasePaths(trackedFiles) {
  const grouped = new Map();
  for (const file of trackedFiles) {
    const key = file.toLowerCase();
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(file);
  }
  return [...grouped.values()].filter((group) => group.length > 1);
}

function main() {
  const trackedFiles = getTrackedFiles();
  const duplicates = duplicateCasePaths(trackedFiles);

  const filesToScan = [];
  for (const relRoot of SCAN_ROOTS) {
    filesToScan.push(...collectFiles(relRoot));
  }

  const missingImports = [];
  const caseMismatches = [];

  for (const relFile of filesToScan) {
    const absFile = path.join(ROOT, relFile);
    const ext = path.extname(relFile);
    if (!CHECK_EXTENSIONS.has(ext)) continue;

    const source = fs.readFileSync(absFile, "utf8");
    const specs = extractImports(source);

    for (const spec of specs) {
      if (!(spec.startsWith("./") || spec.startsWith("../"))) continue;

      const targetAbs = resolveRelativeImport(absFile, spec);
      if (!targetAbs) {
        missingImports.push({ file: relFile, spec });
        continue;
      }

      if (!fileExistsCaseSensitive(targetAbs)) {
        caseMismatches.push({ file: relFile, spec, resolved: toPosix(path.relative(ROOT, targetAbs)) });
        continue;
      }

      const mismatch = findCaseMismatchedSegment(absFile, targetAbs, spec);
      if (mismatch) {
        caseMismatches.push({ file: relFile, spec, resolved: mismatch.expected, actual: mismatch.actual });
      }
    }
  }

  if (duplicates.length > 0) {
    console.error("\nDuplicate tracked paths differing only by case:");
    for (const group of duplicates) {
      console.error(`- ${group.join(" | ")}`);
    }
  }

  if (caseMismatches.length > 0) {
    console.error("\nImport path case mismatches:");
    for (const item of caseMismatches) {
      const detail = item.actual ? ` (actual: ${item.actual})` : "";
      console.error(`- ${item.file}: ${item.spec} -> ${item.resolved}${detail}`);
    }
  }

  if (missingImports.length > 0) {
    console.error("\nMissing relative imports:");
    for (const item of missingImports) {
      console.error(`- ${item.file}: ${item.spec}`);
    }
  }

  if (duplicates.length === 0 && caseMismatches.length === 0 && missingImports.length === 0) {
    console.log("Import casing audit passed with no mismatches.");
    return;
  }

  process.exitCode = 1;
}

main();
