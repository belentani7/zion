# 🌌 ZION · PROTOCOLO OMEGA

> *"En el principio fue el vacío y la resonancia a 432 Hz. De las fracturas selladas en oro nació Zion; en los 44 brazos de la espiral, la memoria eterna de Judas."*
> — **Belentani Codex · Capítulo Omega**

[![Status: Transmuted](https://img.shields.io/badge/COSMOS-OMEGA--PRIME-d4af37.svg?style=for-the-badge)](#)
[![Frecuencia: 432 Hz](https://img.shields.io/badge/SOLFEGGIO-432_Hz-ff0055.svg?style=for-the-badge)](#)
[![TypeScript 7](https://img.shields.io/badge/CODE-TYPESCRIPT_7-3178c6.svg?style=for-the-badge)](#)
[![Tests: 251 unit + 28 e2e](https://img.shields.io/badge/TESTS-251_UNIT_·_28_E2E-16a34a.svg?style=for-the-badge)](#-5-calidad-verificable)
[![Three.js](https://img.shields.io/badge/ENGINE-THREE.JS_WEBGL-000000.svg?style=for-the-badge)](#)

---

## 🪐 1. El Registro Fotográfico del Cosmos

### Lámina I: Planeta Zion (Núcleo Bioeléctrico y Grietas Kintsugi)
![Planeta Zion](docs/screenshots/01_planeta_zion.svg)
*Representación astronómica del núcleo bioeléctrico de Zion en su órbita de resonancia armónica. Las grietas tectónicas cicatrizan en oro puro refractando la luz estelar hacia los anillos de acreción.*

---

### Lámina II: La Galaxia Omega (44 Nodos del Viaje 3D)
![Galaxia Omega](docs/screenshots/02_galaxia_omega.svg)
*Cartografía estelar de la espiral Omega. 44 estaciones dimensionales interconectadas a través del tejido de vacío y niebla prismática del Bosque de Cristal, el Laboratorio IA y el Santuario Sonoro.*

---

## 🔮 2. El Lore del Universo Zion

En el centro del abismo cósmico reside **Zion**, un orbe orgánico-mecánico nacido de la transmutación de la materia tras el sacrificio arquetípico. No es un planeta inerte: late a un pulso rítmico inmutable de **76 BPM**, modulado por ondas sinusoidales a **432 Hz** y armónicos Solfeggio puros (*108, 216, 540 Hz*).

### La Pentada y los Cinco Arquetipos Sagrados
A su alrededor orbitan cinco diamantes de talla brillante y refracción IOR 2.417, guardianes de las identidades del viaje:
1. **Pedro**: El Fundador / Origen (*432 Hz* · Ambar Carmín).
2. **Marcos**: La Estructura y la Geometría (*528 Hz* · Oro Solar).
3. **Santos**: La Mística y la Niebla Prismática (*639 Hz* · Turquesa Profundo).
4. **Belentani**: La Alquimia y la Síntesis Armónica (*741 Hz* · Púrpura Nebular).
5. **Human**: La Consciencia Encarnada (*852 Hz* · Blanco Astral).

---

## ⚡ 3. Arquitectura del Motor (Visual Engine)

- **Shaders GLSL Bioeléctricos**: Deformación procedural de vértices reactiva en tiempo real al análisis espectral FFT del audio.
- **InstancedMesh de Alta Densidad**: 36 placas coraza, 24 agujas de blindaje y 180 fragmentos de espejo reactivos a la apertura del iris sagrado.
- **Navegación Dual**:
  - `Órbita Libre`: Navegación inercial orbital con amortiguación lerp hacia 14 cámaras clave.
  - `Vuelo WASD`: Libertad de desplazamiento espacial con aceleración Boost en `Shift`.
- **Atajos del Navegante**:
  - `[H]`: Ocultar / Desplegar HUD estelar.
  - `[1 - 4]`: Teletransporte a destinos cósmicos (*El Bosque de Cristal, IA Lab, Santuario Musical, Agujero Negro Relativista*).

---

## 🚀 4. Despliegue y Ejecución Local

### Requisitos

Node.js **22.12 o superior** (el proyecto se desarrolla sobre Node 22.22) y npm 10.

```powershell
# Clonar y entrar al santuario
git clone https://github.com/belentani7/zion.git
cd zion

# Instalar dependencias (lockfile npm; bun.lock ya no forma parte del repo)
npm ci

# Compilación y verificación estricta de tipos (tsc && vite build)
npm run build

# Despertar el servidor de desarrollo en el puerto 3000 (Express + middleware Vite)
npm run dev
```

Abre en tu navegador:
```
http://localhost:3000
```

Para servir el build de producción tal y como lo hace el deploy:

```bash
npm run build
NODE_ENV=production npm start     # Express sirve dist/ + /api/*
# o, sólo el front estático:
npm run preview                   # vite preview en 0.0.0.0:3000
```

### Variables de entorno

Copia `.env.example` a `.env` (nunca versiones `.env`: está en `.gitignore` y el
auditor lo comprueba).

| Variable | Obligatoria | Por defecto | Descripción |
| --- | --- | --- | --- |
| `PORT` | no | `3000` | Puerto del kernel Express. |
| `NODE_ENV` | no | `development` | Con `production` se sirve `dist/` estático y se activa HSTS sobre TLS. |
| `GEMINI_API_KEY` | **sí** para `/api/lore` | — | Clave de la Gemini API. Sin ella `/api/lore` responde `503 MISSING_API_KEY` y `/api/health` informa `aiConfigured: false`; el resto del workspace funciona igual. |
| `GEMINI_MODEL` | no | `gemini-4-hydrogen` | Modelo del oráculo de lore. |
| `GEMINI_TIMEOUT_MS` | no | `20000` | Deadline de la llamada upstream (timeout HTTP + `AbortSignal`). |
| `GEMINI_MAX_OUTPUT_TOKENS` | no | `400` | Techo de salida del modelo. |
| `LORE_RATE_LIMIT` | no | `24` | Peticiones de `/api/lore` por IP y ventana de 10 min. |

En la plataforma de deploy las variables se declaran en el dashboard
(Vercel → Settings → Environment Variables), **no** en el repositorio.

### Deploy

El repositorio incluye `vercel.json` (build `npm run build`, salida `dist`,
rewrite SPA, cabeceras de cache `immutable` para `/assets/*` y `no-cache` para
el HTML) y `api/index.ts`, un adaptador serverless que reutiliza el mismo
Express app que `npm start`. Rutas:

- `/api/health` → estado del kernel (`200`, `no-store`).
- `/api/lore` → oráculo de lore Gemini (`POST`, validado, con rate limit).
- cualquier otra ruta → `index.html` (SPA).

---

## 🧪 5. Calidad verificable

El workspace aplica el Protocolo SDD Maestro
([`PROTOCOLO-SDD-MAESTRO.md`](PROTOCOLO-SDD-MAESTRO.md): constitución P1-P5, 7 guardrails
arquitectónicos, ciclo E0-E7 y matriz de deploy), el protocolo del motor visual
(`PROTOCOLO_COMPLETO_BELENTANI_VISUAL_ENGINE.md`) y los 30 criterios de
`PRODUCTION_CHECKLIST.md`. Todo está automatizado:

| Comando | Qué verifica | Sale mal si… |
| --- | --- | --- |
| `npm run lint` / `npm run typecheck` | `tsc --noEmit` sobre `src`, `server.ts`, `api/`, `e2e/` y las configs | hay un error de tipos |
| `npm run build` | typecheck + bundle de producción con code splitting | falla la compilación |
| `npm test` | 251 tests (unitarios, componentes, axe-core WCAG 2.1 AA, shell y servidor Express) | un test falla |
| `npm run test:coverage` | lo anterior con cobertura v8 en `coverage/` | — |
| `npm run test:e2e` | 28 casos Playwright (chromium + móvil) sobre el build de producción | falta un navegador: `npx playwright install --with-deps chromium` |
| `npm run perf` | presupuestos de bundle: primer paint vs lazy, gzip/brotli, duplicados | se supera un presupuesto |
| `npm run check:i18n` | paridad de claves en pt/es/en/ca y claves usadas sin definir | hay desviaciones |
| `npm run audit` | los 30 criterios de producción, nivel 2 | un criterio en `fail` |
| `npm run audit:full` | igual, ejecutando además typecheck, build y tests | — |

Presupuestos de rendimiento vigentes (`scripts/perf-report.mjs`):

| Métrica | Presupuesto | Estado |
| --- | --- | --- |
| JS del primer paint (gzip) | ≤ 120 kB | **81,3 kB** |
| JS del primer paint (brotli) | ≤ 100 kB | **70,1 kB** |
| CSS del primer paint (gzip) | ≤ 25 kB | **11,1 kB** |
| Chunk individual mayor (gzip) | ≤ 150 kB | **134,1 kB** (`vendor-three`, lazy) |
| Peticiones JS/CSS iniciales | ≤ 8 | **4** |
| Assets estáticos duplicados | 0 | **0** |

### Herramientas internas

`scripts/` contiene la herramienta de auditoría del proyecto. Todas aceptan
`--help` y `--json`, devuelven códigos de salida significativos y están
documentadas en [`scripts/README.md`](scripts/README.md):

- `scripts/perf-report.mjs` — mide `dist/`, separa primer paint de chunks lazy
  y hace cumplir los presupuestos.
- `scripts/check-i18n-parity.mjs` — paridad de claves entre los 4 idiomas y
  detección de claves usadas que no existen.
- `scripts/audit-production-readiness.mjs` — sustituye la referencia muerta
  `tools/audit-production-readiness.py` que el checklist citaba: ahora el
  comando existe, se ejecuta y su salida es verificable en CI.

### Documentación del ciclo

- [`PROTOCOLO-SDD-MAESTRO.md`](PROTOCOLO-SDD-MAESTRO.md) — constitución P1-P5, los 7 guardrails
  arquitectónicos, el ciclo E0-E7 con sus gates, la matriz de deploy multistack y el checklist
  de producción de 30 criterios. Es la fuente de la que se nutre la vista SDD Maestro.
- [`SPEC.md`](SPEC.md) — especificación con criterios de aceptación EARS.
- [`CHANGELOG.md`](CHANGELOG.md) — historial Keep a Changelog.
- [`PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md) — matriz de 30 criterios.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) y [`SECURITY.md`](SECURITY.md).

---

<p align="center">
  <sub>Belentani Omega Universe · L'Hospitalet de Llobregat — São Paulo · 2026</sub>
</p>
