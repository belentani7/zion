#!/usr/bin/env node
/**
 * perf-report — medidor de presupuestos de carga para belentani-workspace.
 *
 * Mide la salida de `vite build` (raw / gzip / brotli), separa lo que el
 * navegador descarga en el primer paint de lo que llega bajo demanda, detecta
 * assets estáticos duplicados por contenido y falla si se supera un presupuesto.
 *
 * Uso:
 *   node scripts/perf-report.mjs                # informe humano + presupuestos
 *   node scripts/perf-report.mjs --json         # informe legible por máquina
 *   node scripts/perf-report.mjs --dist dist    # otra carpeta de build
 *   node scripts/perf-report.mjs --no-fail      # solo informa, nunca falla
 *   node scripts/perf-report.mjs --help
 *
 * Sin dependencias externas: node:fs, node:zlib, node:crypto y node:path.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { brotliCompressSync, gzipSync, constants as zlibConstants } from 'node:zlib';
import { join, relative, resolve, extname } from 'node:path';

const HELP = `perf-report — presupuestos de rendimiento del build

Uso:
  node scripts/perf-report.mjs [opciones]

Opciones:
  --dist <dir>    Carpeta de build a medir (por defecto: dist)
  --json          Emitir JSON en lugar del informe humano
  --no-fail       Informar sin fallar aunque se superen los presupuestos
  --budget <k=v>  Sobrescribir un presupuesto (ej. --budget initialJsGzip=120000)
  -h, --help      Mostrar esta ayuda

Presupuestos por defecto (bytes):
  initialJsGzip        120000   JS descargado en el primer paint (gzip)
  initialJsBrotli      100000   JS descargado en el primer paint (brotli)
  initialCssGzip        25000   CSS del primer paint (gzip)
  largestChunkGzip     150000   Chunk individual más grande (gzip)
  initialRequests           8   Recursos JS/CSS del primer paint
  duplicateStaticAssets     0   Assets estáticos con contenido idéntico

Códigos de salida: 0 ok · 1 presupuesto superado · 2 error de uso o build ausente
`;

const DEFAULT_BUDGETS = {
  initialJsGzip: 120_000,
  initialJsBrotli: 100_000,
  initialCssGzip: 25_000,
  largestChunkGzip: 150_000,
  initialRequests: 8,
  duplicateStaticAssets: 0,
};

function parseArgs(argv) {
  const options = { dist: 'dist', json: false, fail: true, budgets: { ...DEFAULT_BUDGETS } };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(HELP);
      process.exit(0);
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--no-fail') {
      options.fail = false;
    } else if (arg === '--dist') {
      options.dist = argv[++i] ?? '';
    } else if (arg === '--budget') {
      const pair = argv[++i] ?? '';
      const [key, value] = pair.split('=');
      if (!key || Number.isNaN(Number(value))) {
        process.stderr.write(`--budget espera <clave>=<numero>, recibido: ${pair}\n`);
        process.exit(2);
      }
      if (!(key in DEFAULT_BUDGETS)) {
        process.stderr.write(`Presupuesto desconocido: ${key}\nClaves validas: ${Object.keys(DEFAULT_BUDGETS).join(', ')}\n`);
        process.exit(2);
      }
      options.budgets[key] = Number(value);
    } else {
      process.stderr.write(`Opcion desconocida: ${arg}\n\n${HELP}`);
      process.exit(2);
    }
  }
  if (!options.dist) {
    process.stderr.write('--dist necesita un directorio\n');
    process.exit(2);
  }
  return options;
}

function walk(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push({ path: full, relative: relative(base, full), size: statSync(full).size });
  }
  return out;
}

function measure(file) {
  const raw = readFileSync(file.path);
  const gzip = gzipSync(raw, { level: 9 });
  const brotli = brotliCompressSync(raw, {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: zlibConstants.BROTLI_MAX_QUALITY,
      [zlibConstants.BROTLI_PARAM_SIZE_HINT]: raw.length,
    },
  });
  return {
    file: file.relative.replaceAll('\\', '/'),
    bytes: raw.length,
    gzip: gzip.length,
    brotli: brotli.length,
    sha256: createHash('sha256').update(raw).digest('hex'),
  };
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`;
}

function initialResourcesFromHtml(distDir) {
  const htmlPath = join(distDir, 'index.html');
  if (!existsSync(htmlPath)) return { scripts: [], preloads: [], styles: [] };
  const html = readFileSync(htmlPath, 'utf8');
  const pick = (re) => [...html.matchAll(re)].map((m) => m[1]).filter(Boolean);
  return {
    scripts: pick(/<script[^>]+type="module"[^>]+src="([^"]+)"/g),
    preloads: pick(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g),
    styles: pick(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g),
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const distDir = resolve(process.cwd(), options.dist);

  if (!existsSync(distDir)) {
    process.stderr.write(
      `No existe ${options.dist}/. Ejecuta primero \`npm run build\`.\n`,
    );
    process.exit(2);
  }

  const files = walk(distDir);
  const measured = files
    .filter((file) => ['.js', '.css', '.mjs'].includes(extname(file.path)))
    .map(measure);

  const initial = initialResourcesFromHtml(distDir);
  const initialNames = new Set(
    [...initial.scripts, ...initial.preloads, ...initial.styles].map((url) =>
      url.replace(/^\//, ''),
    ),
  );

  const byName = new Map(measured.map((entry) => [entry.file, entry]));
  const initialEntries = [...initialNames].map((name) => byName.get(name)).filter(Boolean);
  const lazyEntries = measured.filter((entry) => !initialNames.has(entry.file));

  const sum = (entries, key) => entries.reduce((total, entry) => total + entry[key], 0);

  const initialJs = initialEntries.filter((entry) => entry.file.endsWith('.js'));
  const initialCss = initialEntries.filter((entry) => entry.file.endsWith('.css'));

  // Static assets (images, fonts, HTML dumps): duplicated content wastes repo
  // space and bandwidth, so it is reported by sha256.
  const staticFiles = files.filter(
    (file) => !['.js', '.css', '.mjs', '.map'].includes(extname(file.path)),
  );
  const hashes = new Map();
  for (const file of staticFiles) {
    const digest = createHash('sha256').update(readFileSync(file.path)).digest('hex');
    if (!hashes.has(digest)) hashes.set(digest, []);
    hashes.get(digest).push(file.relative.replaceAll('\\', '/'));
  }
  const duplicates = [...hashes.values()].filter((group) => group.length > 1);

  const largest = [...measured].sort((a, b) => b.gzip - a.gzip)[0] ?? null;

  const report = {
    generatedAt: new Date().toISOString(),
    dist: options.dist,
    totals: {
      files: files.length,
      distBytes: sum(
        files.map((file) => ({ gzip: 0, brotli: 0, bytes: file.size })),
        'bytes',
      ),
      jsChunks: measured.filter((entry) => entry.file.endsWith('.js')).length,
      staticAssets: staticFiles.length,
    },
    initial: {
      requests: initialEntries.length,
      jsBytes: sum(initialJs, 'bytes'),
      jsGzip: sum(initialJs, 'gzip'),
      jsBrotli: sum(initialJs, 'brotli'),
      cssBytes: sum(initialCss, 'bytes'),
      cssGzip: sum(initialCss, 'gzip'),
      cssBrotli: sum(initialCss, 'brotli'),
      assets: initialEntries.map((entry) => entry.file),
    },
    lazy: {
      chunks: lazyEntries.length,
      jsBytes: sum(
        lazyEntries.filter((entry) => entry.file.endsWith('.js')),
        'bytes',
      ),
      jsGzip: sum(
        lazyEntries.filter((entry) => entry.file.endsWith('.js')),
        'gzip',
      ),
      largest: largest ? { file: largest.file, gzip: largest.gzip, brotli: largest.brotli } : null,
    },
    duplicateStaticAssets: duplicates.map((group) => group),
    budgets: options.budgets,
  };

  const checks = [
    {
      key: 'initialJsGzip',
      label: 'JS inicial (gzip)',
      actual: report.initial.jsGzip,
      budget: options.budgets.initialJsGzip,
    },
    {
      key: 'initialJsBrotli',
      label: 'JS inicial (brotli)',
      actual: report.initial.jsBrotli,
      budget: options.budgets.initialJsBrotli,
    },
    {
      key: 'initialCssGzip',
      label: 'CSS inicial (gzip)',
      actual: report.initial.cssGzip,
      budget: options.budgets.initialCssGzip,
    },
    {
      key: 'largestChunkGzip',
      label: 'Chunk mayor (gzip)',
      actual: largest ? largest.gzip : 0,
      budget: options.budgets.largestChunkGzip,
    },
    {
      key: 'initialRequests',
      label: 'Peticiones iniciales',
      actual: report.initial.requests,
      budget: options.budgets.initialRequests,
    },
    {
      key: 'duplicateStaticAssets',
      label: 'Assets duplicados',
      actual: report.duplicateStaticAssets.length,
      budget: options.budgets.duplicateStaticAssets,
    },
  ].map((check) => ({ ...check, ok: check.actual <= check.budget }));

  report.checks = checks;
  report.ok = checks.every((check) => check.ok);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    const lines = [];
    lines.push('PERF REPORT · belentani-workspace');
    lines.push(`Build: ${options.dist} · ${report.totals.files} ficheros · ${kb(report.totals.distBytes)}`);
    lines.push('');
    lines.push('PRIMER PAINT');
    for (const entry of initialEntries) {
      lines.push(
        `  ${entry.file.padEnd(46)} ${kb(entry.bytes).padStart(11)} · gzip ${kb(entry.gzip).padStart(10)} · br ${kb(entry.brotli).padStart(10)}`,
      );
    }
    lines.push(
      `  ${'TOTAL JS'.padEnd(46)} ${kb(report.initial.jsBytes).padStart(11)} · gzip ${kb(report.initial.jsGzip).padStart(10)} · br ${kb(report.initial.jsBrotli).padStart(10)}`,
    );
    lines.push(
      `  ${'TOTAL CSS'.padEnd(46)} ${kb(report.initial.cssBytes).padStart(11)} · gzip ${kb(report.initial.cssGzip).padStart(10)} · br ${kb(report.initial.cssBrotli).padStart(10)}`,
    );
    lines.push('');
    lines.push('BAJO DEMANDA (lazy)');
    for (const entry of lazyEntries.sort((a, b) => b.gzip - a.gzip)) {
      lines.push(
        `  ${entry.file.padEnd(46)} ${kb(entry.bytes).padStart(11)} · gzip ${kb(entry.gzip).padStart(10)} · br ${kb(entry.brotli).padStart(10)}`,
      );
    }
    lines.push('');
    lines.push('PRESUPUESTOS');
    for (const check of checks) {
      const mark = check.ok ? 'ok  ' : 'FAIL';
      lines.push(
        `  [${mark}] ${check.label.padEnd(24)} ${String(check.actual).padStart(9)} <= ${String(check.budget).padStart(9)}`,
      );
    }
    if (report.duplicateStaticAssets.length > 0) {
      lines.push('');
      lines.push('ASSETS DUPLICADOS (mismo sha256)');
      for (const group of report.duplicateStaticAssets) {
        for (const file of group) lines.push(`  ${file}`);
        lines.push('  ---');
      }
    }
    lines.push('');
    lines.push(report.ok ? 'RESULTADO: dentro de presupuestos' : 'RESULTADO: presupuestos superados');
    process.stdout.write(`${lines.join('\n')}\n`);
  }

  if (!report.ok && options.fail) process.exit(1);
}

main();
