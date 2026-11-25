# `scripts/` — herramienta interna del workspace

Tres utilidades de auditoría escritas en Node puro (sin dependencias más allá
de `node:fs`, `node:zlib`, `node:crypto`, `node:path` y `node:child_process`).
Todas comparten el mismo contrato:

- `--help` / `-h` imprime el uso completo.
- `--json` emite el informe legible por máquina.
- El código de salida es significativo: `0` correcto, `1` comprobación fallida,
  `2` error de uso. Eso las hace directamente utilizables en CI.

| Script | `npm run` | Qué decide |
| --- | --- | --- |
| `perf-report.mjs` | `perf` | Si el bundle respeta los presupuestos de carga. |
| `check-i18n-parity.mjs` | `check:i18n` | Si los 4 idiomas tienen las mismas claves. |
| `audit-production-readiness.mjs` | `audit` / `audit:full` | Si el repo cumple `PRODUCTION_CHECKLIST.md`. |

---

## `perf-report.mjs`

Mide la salida de `vite build`: tamaño raw, gzip (nivel 9) y brotli (calidad
máxima) de cada chunk, y distingue **primer paint** (lo que referencia
`dist/index.html` mediante `<script type="module">`, `modulepreload` y
`stylesheet`) de **lazy** (chunks que sólo se descargan al abrir una vista).
Además busca assets estáticos con el mismo `sha256` (duplicados que sólo gastan
repo y ancho de banda).

```bash
npm run build
node scripts/perf-report.mjs              # informe humano + veredicto
node scripts/perf-report.mjs --json       # para CI o dashboards
node scripts/perf-report.mjs --dist dist --no-fail
node scripts/perf-report.mjs --budget initialJsGzip=90000   # endurecer
```

Presupuestos por defecto (bytes):

| Clave | Valor | Qué mide |
| --- | --- | --- |
| `initialJsGzip` | 120 000 | JS del primer paint, gzip |
| `initialJsBrotli` | 100 000 | JS del primer paint, brotli |
| `initialCssGzip` | 25 000 | CSS del primer paint, gzip |
| `largestChunkGzip` | 150 000 | Chunk individual mayor (aunque sea lazy) |
| `initialRequests` | 8 | Recursos JS/CSS del primer paint |
| `duplicateStaticAssets` | 0 | Grupos de assets con contenido idéntico |

---

## `check-i18n-parity.mjs`

El protocolo fija el orden **PT > ES > EN > CA** y exige que todo contenido
multilingüe exista en los cuatro idiomas. Una clave huérfana no rompe el build:
rompe la interfaz en runtime mostrando `undefined`. El script parsea
`src/locales/i18n.ts`, extrae los cuatro bloques y comprueba:

1. Orden de idiomas igual al canonical.
2. Mismo conjunto de claves en los cuatro (faltantes y sobrantes).
3. Sin claves duplicadas ni valores vacíos dentro de un mismo idioma.
4. Toda clave consumida por un componente (`t.clave`) existe — incluidos los
   accesos a través de `NAV_TAB_LABELS`.

```bash
node scripts/check-i18n-parity.mjs            # informe humano
node scripts/check-i18n-parity.mjs --unused   # + claves definidas sin uso
node scripts/check-i18n-parity.mjs --json
node scripts/check-i18n-parity.mjs --file src/locales/i18n.ts --src src
```

---

## `audit-production-readiness.mjs`

Automatiza los **30 criterios** de `PRODUCTION_CHECKLIST.md` y dice, por nivel,
si el repositorio está listo para producción. Sustituye la referencia muerta
`tools/audit-production-readiness.py` que el propio checklist citaba: el comando
ahora existe, se ejecuta y su salida es verificable.

Cuatro estados por criterio:

- `pass` — verificado automáticamente y se cumple.
- `fail` — verificado automáticamente y **no** se cumple (bloquea el nivel).
- `manual` — exige un dashboard, una red o una cuenta externa; se imprime el
  comando exacto para comprobarlo.
- `skip` — necesita una bandera adicional (`--run-checks` o `--url`).

```bash
node scripts/audit-production-readiness.mjs                    # nivel 2, estático
node scripts/audit-production-readiness.mjs --level 1          # sólo nivel 0-1
node scripts/audit-production-readiness.mjs --run-checks       # + typecheck/build/tests
node scripts/audit-production-readiness.mjs --url https://belentani.es
node scripts/audit-production-readiness.mjs --json --quiet
```

Qué verifica sin ayuda externa: remote `origin`, `.gitignore`, escaneo de
patrones de secretos sobre los ficheros trackeados, lockfile, scripts de
`package.json`, `strict` en `tsconfig.json`, convencionalidad de los últimos 50
commits, configuración de deploy, cabeceras de cache declaradas, robots/sitemap/
OG/Twitter, suite de accesibilidad con axe-core, README (install, run, build,
deploy, env), CHANGELOG, SPEC con criterios EARS y logs estructurados.

Con `--url` comprueba además la URL viva y `/api/health`. Con `--run-checks`
ejecuta `npm run build`, `npm run lint` y `npm test` y evalúa los criterios 10,
12 y 13 con su código de salida real.

---

## Añadir una herramienta nueva

1. Fichero `.mjs` en `scripts/`, con shebang `#!/usr/bin/env node`.
2. `--help` obligatorio y `--json` recomendado.
3. Códigos de salida `0`/`1`/`2` y ningún `process.exit(0)` encubriendo fallos.
4. Alta en `package.json` (`scripts`) y en esta tabla.
5. Sin dependencias nuevas salvo necesidad justificada: el objetivo es que la
   herramienta funcione en un clone limpio con `npm ci`.
