// Module hooks that let node --test import the app's real components:
// resolves the '@/' alias to the repo root and transforms .jsx through
// esbuild (already a dependency) on the fly. Registered by _jsx.mjs.
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const target = path.join(root, specifier.slice(2));
    return resolveWithExtensions(target, context, nextResolve);
  }
  // Relative imports inside components omit no extensions in this repo,
  // but guard anyway: try as-given first.
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (specifier.startsWith('.') && context.parentURL) {
      const base = fileURLToPath(new URL(specifier, context.parentURL));
      return resolveWithExtensions(base, context, nextResolve);
    }
    // Bare subpaths without an exports map (next/server -> next/server.js),
    // which Next resolves itself at build time.
    if (/^[a-z@][^:]*\/[^.]*$/i.test(specifier) && !specifier.endsWith('.js')) {
      try {
        return await nextResolve(`${specifier}.js`, context);
      } catch {}
    }
    throw err;
  }
}

async function resolveWithExtensions(base, context, nextResolve) {
  const candidates = [base, `${base}.jsx`, `${base}.js`, `${base}.mjs`];
  for (const c of candidates) {
    try {
      return await nextResolve(pathToFileURL(c).href, context);
    } catch {}
  }
  return nextResolve(pathToFileURL(base).href, context);
}

export async function load(url, context, nextLoad) {
  // Render tests assert semantics; real CSS/layout is checked in the browser.
  if (url.endsWith('.module.css')) return { format: 'module', source: 'export default {};', shortCircuit: true };
  if (url.endsWith('.jsx')) {
    const source = await readFile(fileURLToPath(url), 'utf8');
    const { code } = await esbuild.transform(source, {
      loader: 'jsx',
      format: 'esm',
      jsx: 'automatic',
    });
    return { format: 'module', source: code, shortCircuit: true };
  }
  return nextLoad(url, context);
}
