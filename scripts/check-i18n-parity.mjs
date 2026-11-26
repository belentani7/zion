#!/usr/bin/env node
/**
 * check-i18n-parity — paridad de claves entre los 4 idiomas del workspace.
 *
 * El protocolo fija el orden PT > ES > EN > CA y exige que TODO contenido
 * multilingüe exista en los cuatro idiomas. Una clave huérfana no rompe el
 * build (TypeScript no tipa el objeto `translations` contra un contrato
 * explícito por idioma): rompe la interfaz en runtime mostrando `undefined`.
 *
 * Uso:
 *   node scripts/check-i18n-parity.mjs              # informe humano
 *   node scripts/check-i18n-parity.mjs --json       # salida máquina
 *   node scripts/check-i18n-parity.mjs --unused     # listar claves sin uso
 *   node scripts/check-i18n-parity.mjs --help
 *
 * Códigos de salida: 0 paridad ok · 1 hay desviaciones · 2 error de uso
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const HELP = `check-i18n-parity — paridad de claves i18n (pt, es, en, ca)

Uso:
  node scripts/check-i18n-parity.mjs [opciones]

Opciones:
  --file <ruta>   Fichero de traducciones (por defecto: src/locales/i18n.ts)
  --src <dir>     Carpeta con los componentes que consumen t.<clave> (src)
  --json          Emitir JSON
  --unused        Incluir en el informe las claves definidas pero no usadas
  -h, --help      Mostrar esta ayuda

Salida: 0 si los cuatro idiomas tienen exactamente las mismas claves, no hay
valores vacíos y toda clave usada en los componentes existe. 1 en caso
contrario.
`;

const EXPECTED_ORDER = ['pt', 'es', 'en', 'ca'];

function parseArgs(argv) {
  const options = {
    file: 'src/locales/i18n.ts',
    src: 'src',
    json: false,
    unused: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(HELP);
      process.exit(0);
    } else if (arg === '--json') options.json = true;
    else if (arg === '--unused') options.unused = true;
    else if (arg === '--file') options.file = argv[++i] ?? options.file;
    else if (arg === '--src') options.src = argv[++i] ?? options.src;
    else {
      process.stderr.write(`Opcion desconocida: ${arg}\n\n${HELP}`);
      process.exit(2);
    }
  }
  return options;
}

/** Split `export const translations = { ... }` into per-language blocks. */
function extractLanguageBlocks(source) {
  const start = source.indexOf('export const translations = {');
  if (start === -1) throw new Error('no se encontro `export const translations = {`');

  const blocks = new Map();
  const headerRe = /^ {2}([a-z]{2}): \{$/gm;
  let match;
  while ((match = headerRe.exec(source)) !== null) {
    const lang = match[1];
    const bodyStart = match.index + match[0].length;
    const closeRe = /^ {2}\},?$/gm;
    closeRe.lastIndex = bodyStart;
    const close = closeRe.exec(source);
    if (!close) throw new Error(`bloque ${lang} sin cerrar`);
    blocks.set(lang, source.slice(bodyStart, close.index));
  }
  return blocks;
}

function extractKeys(block) {
  const keys = [];
  const keyRe = /^ {4}([A-Za-z0-9_]+):(.*)$/gm;
  let match;
  while ((match = keyRe.exec(block)) !== null) {
    keys.push({ key: match[1], rawValue: match[2].trim().replace(/,$/, '') });
  }
  return keys;
}

function walkSourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'test') continue;
      out.push(...walkSourceFiles(full));
    } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function collectUsedKeys(srcDir, i18nFile) {
  const used = new Map();
  for (const file of walkSourceFiles(srcDir)) {
    const source = readFileSync(file, 'utf8');
    const isI18nFile = resolve(file) === resolve(i18nFile);
    // Only files that bind `const t = translations[lang]` use the `t.` accessor.
    // The catalogue itself is scanned too: `NAV_TAB_LABELS` consumes keys
    // through `(t) => t.navFoo` arrow functions.
    if (!isI18nFile && !/translations\[/.test(source)) continue;
    for (const match of source.matchAll(/\bt\.([A-Za-z][A-Za-z0-9_]*)\b/g)) {
      if (!used.has(match[1])) used.set(match[1], new Set());
      used.get(match[1]).add(relative(process.cwd(), file));
    }
  }
  return used;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const i18nPath = resolve(process.cwd(), options.file);
  if (!existsSync(i18nPath)) {
    process.stderr.write(`No existe ${options.file}\n`);
    process.exit(2);
  }

  const source = readFileSync(i18nPath, 'utf8');
  const blocks = extractLanguageBlocks(source);
  const languages = [...blocks.keys()];

  const problems = [];

  if (languages.join(',') !== EXPECTED_ORDER.join(',')) {
    problems.push({
      type: 'order',
      message: `orden de idiomas ${languages.join(' > ')} distinto del canonical ${EXPECTED_ORDER.join(' > ')}`,
    });
  }

  const perLanguage = new Map();
  for (const lang of languages) {
    const entries = extractKeys(blocks.get(lang));
    const keys = entries.map((entry) => entry.key);
    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
    const empty = entries
      .filter((entry) => entry.rawValue === "''" || entry.rawValue === '""')
      .map((entry) => entry.key);

    if (duplicates.length > 0) {
      problems.push({ type: 'duplicate', lang, keys: [...new Set(duplicates)] });
    }
    if (empty.length > 0) {
      problems.push({ type: 'empty', lang, keys: empty });
    }
    perLanguage.set(lang, new Set(keys));
  }

  const reference = perLanguage.get('es') ?? new Set();
  for (const lang of languages) {
    const keys = perLanguage.get(lang);
    const missing = [...reference].filter((key) => !keys.has(key));
    const extra = [...keys].filter((key) => !reference.has(key));
    if (missing.length > 0) problems.push({ type: 'missing', lang, keys: missing });
    if (extra.length > 0) problems.push({ type: 'extra', lang, keys: extra });
  }

  const used = collectUsedKeys(resolve(process.cwd(), options.src), i18nPath);
  const usedButUndefined = [...used.keys()].filter((key) => !reference.has(key));
  if (usedButUndefined.length > 0) {
    problems.push({
      type: 'used-undefined',
      keys: usedButUndefined.map((key) => ({ key, files: [...used.get(key)] })),
    });
  }

  const unusedKeys = [...reference].filter((key) => !used.has(key));

  const report = {
    file: options.file,
    languages: languages.map((lang) => ({ lang, keys: perLanguage.get(lang).size })),
    usedKeys: used.size,
    unusedKeys,
    problems,
    ok: problems.length === 0,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    const lines = [];
    lines.push('I18N PARITY · src/locales/i18n.ts');
    lines.push(
      `Idiomas: ${report.languages.map((entry) => `${entry.lang}(${entry.keys})`).join(' · ')}`,
    );
    lines.push(`Claves usadas por los componentes: ${report.usedKeys}`);
    if (options.unused) {
      lines.push(`Claves definidas sin uso (${unusedKeys.length}): ${unusedKeys.join(', ') || '—'}`);
    }
    if (problems.length === 0) {
      lines.push('RESULTADO: paridad correcta en los 4 idiomas');
    } else {
      lines.push('');
      lines.push('DESVIACIONES');
      for (const problem of problems) {
        if (problem.type === 'order') lines.push(`  · orden: ${problem.message}`);
        else if (problem.type === 'used-undefined') {
          for (const entry of problem.keys) {
            lines.push(`  · usada sin definir: t.${entry.key} en ${entry.files.join(', ')}`);
          }
        } else {
          lines.push(`  · ${problem.type} [${problem.lang}]: ${problem.keys.join(', ')}`);
        }
      }
    }
    process.stdout.write(`${lines.join('\n')}\n`);
  }

  if (!report.ok) process.exit(1);
}

main();
