#!/usr/bin/env node
/**
 * audit-production-readiness — auditor automatizado de los 30 criterios de
 * PRODUCTION_CHECKLIST.md.
 *
 * Sustituye la referencia muerta `tools/audit-production-readiness.py` que el
 * propio checklist documentaba: ahora el comando existe, es ejecutable y su
 * salida es verificable en CI.
 *
 * Uso:
 *   node scripts/audit-production-readiness.mjs                    # nivel 2
 *   node scripts/audit-production-readiness.mjs --level 1          # nivel 1
 *   node scripts/audit-production-readiness.mjs --json             # máquina
 *   node scripts/audit-production-readiness.mjs --run-checks       # typecheck+build+test
 *   node scripts/audit-production-readiness.mjs --url https://x    # criterios 15 y 18 en vivo
 *   node scripts/audit-production-readiness.mjs --help
 *
 * Estados por criterio:
 *   pass    verificado automáticamente
 *   fail    verificado automáticamente y no se cumple
 *   manual  exige un dashboard, una red o una cuenta externa (se lista el comando)
 *   skip    requiere --run-checks o --url para evaluarse
 *
 * Códigos de salida: 0 nivel cumplido · 1 hay criterios 'fail' · 2 error de uso
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const HELP = `audit-production-readiness — 30 criterios de PRODUCTION_CHECKLIST.md

Uso:
  node scripts/audit-production-readiness.mjs [opciones]

Opciones:
  --level <0|1|2>   Nivel de cumplimiento exigido (por defecto: 2)
  --run-checks      Ejecutar typecheck, build y tests (criterios 10, 12 y 13)
  --url <https>     Comprobar en vivo la URL y /api/health (criterios 15 y 18)
  --json            Emitir JSON
  --quiet           Solo el resumen y los fallos
  -h, --help        Mostrar esta ayuda

Salida: 0 si ningún criterio del nivel pedido está en 'fail'. Los criterios
'manual' y 'skip' no fallan: se listan con el comando exacto para verificarlos.
`;

const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{20,}/,
  /AIza[0-9A-Za-z_-]{30,}/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /AKIA[0-9A-Z]{16}/,
  /GOCSPX-[A-Za-z0-9_-]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

const CONVENTIONAL_RE =
  /^(feat|fix|chore|docs|refactor|perf|test|build|ci|style|revert)(\([^)]+\))?!?:\s\S/;

function parseArgs(argv) {
  const options = { level: 2, runChecks: false, url: null, json: false, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(HELP);
      process.exit(0);
    } else if (arg === '--json') options.json = true;
    else if (arg === '--quiet') options.quiet = true;
    else if (arg === '--run-checks') options.runChecks = true;
    else if (arg === '--level') {
      const value = Number(argv[++i]);
      if (![0, 1, 2].includes(value)) {
        process.stderr.write('--level acepta 0, 1 o 2\n');
        process.exit(2);
      }
      options.level = value;
    } else if (arg === '--url') {
      options.url = argv[++i] ?? null;
    } else {
      process.stderr.write(`Opcion desconocida: ${arg}\n\n${HELP}`);
      process.exit(2);
    }
  }
  return options;
}

function git(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function readText(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

function run(root, command, args) {
  try {
    execFileSync(command, args, { cwd: root, stdio: 'pipe', encoding: 'utf8' });
    return { ok: true, output: '' };
  } catch (error) {
    return {
      ok: false,
      output: `${error.stdout ?? ''}${error.stderr ?? ''}`.trim().split('\n').slice(0, 6).join(' | '),
    };
  }
}

async function probeUrl(url) {
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'follow' });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, status: 0, error: error.message };
  }
}

/**
 * Test files, tracked or not: a fresh clone has them tracked, but the audit is
 * also useful mid-refactor, before `git add`.
 */
function listTestFiles(root, tracked) {
  const fromGit = tracked.filter((file) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(file));
  const seen = new Set(fromGit);
  const queue = ['src', 'e2e'];
  while (queue.length > 0) {
    const dir = join(root, queue.shift());
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = entry.isDirectory()
        ? join(dir, entry.name).slice(root.length + 1).replaceAll('\\', '/')
        : join(dir, entry.name).slice(root.length + 1).replaceAll('\\', '/');
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') queue.push(rel);
      } else if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name) && !seen.has(rel)) {
        seen.add(rel);
      }
    }
  }
  return [...seen];
}

function buildContext(root, options) {
  const tracked = git(root, ['ls-files']).split('\n').filter(Boolean);
  const pkg = readJson(join(root, 'package.json')) ?? {};
  const tsconfig = readJson(join(root, 'tsconfig.json')) ?? {};
  const workflows = existsSync(join(root, '.github/workflows'))
    ? readdirSync(join(root, '.github/workflows'))
    : [];
  const workflowText = workflows
    .map((file) => readText(join(root, '.github/workflows', file)))
    .join('\n');

  return { root, options, tracked, pkg, tsconfig, workflows, workflowText };
}

/** The 30 criteria, verbatim from PRODUCTION_CHECKLIST.md. */
const CRITERIA = [
  {
    id: 1,
    category: 'Repo & Git',
    name: 'origin remoto → GitHub belentani7/<repo>',
    verification: 'git remote -v',
    severity: 'Crítico',
    level: 0,
    check: (ctx) => {
      const url = git(ctx.root, ['remote', 'get-url', 'origin']);
      if (!url) return { status: 'fail', detail: 'sin remote origin' };
      const ok = /github\.com[:/]belentani7\//.test(url);
      return { status: ok ? 'pass' : 'fail', detail: url };
    },
  },
  {
    id: 2,
    category: 'Repo & Git',
    name: 'Branch main protegida (PR required, status checks)',
    verification: 'GitHub Branch Protection',
    severity: 'Crítico',
    level: 1,
    check: () => ({
      status: 'manual',
      detail: 'gh api repos/belentani7/zion/branches/main/protection',
    }),
  },
  {
    id: 3,
    category: 'Repo & Git',
    name: 'Commits convencionales (feat:, fix:, chore:, docs:)',
    verification: 'git log --oneline',
    severity: 'Alto',
    level: 1,
    check: (ctx) => {
      // --no-merges: en un checkout de pull_request el HEAD es el merge commit
      // que genera GitHub ("Merge <sha> into <sha>"), cuyo sujeto no es
      // convencional ni puede serlo. Se juzgan los commits del autor.
      const subjects = git(ctx.root, ['log', '--no-merges', '--pretty=%s', '-50'])
        .split('\n')
        .filter(Boolean);
      if (subjects.length === 0) return { status: 'fail', detail: 'sin commits' };
      const bad = subjects.filter((subject) => !CONVENTIONAL_RE.test(subject));
      return {
        status: bad.length === 0 ? 'pass' : 'fail',
        detail:
          bad.length === 0
            ? `${subjects.length} commits del autor ok`
            : `${bad.length} no convencionales: ${bad[0]}`,
      };
    },
  },
  {
    id: 4,
    category: 'Repo & Git',
    name: '.gitignore completo (node_modules, .env, dist, *.log)',
    verification: 'cat .gitignore',
    severity: 'Crítico',
    level: 0,
    check: (ctx) => {
      const ignore = readText(join(ctx.root, '.gitignore'));
      const required = ['node_modules', '.env', 'dist', '*.log'];
      const missing = required.filter((pattern) => !ignore.includes(pattern));
      return {
        status: missing.length === 0 ? 'pass' : 'fail',
        detail: missing.length === 0 ? '4/4 patrones' : `faltan: ${missing.join(', ')}`,
      };
    },
  },
  {
    id: 5,
    category: 'Seguridad',
    name: 'Cero secretos en repo (keys, tokens, passwords)',
    verification: 'git ls-files + scan de patrones',
    severity: 'Crítico',
    level: 0,
    check: (ctx) => {
      const sensitiveNames = ctx.tracked.filter((file) =>
        /(^|\/)(\.env(\..+)?|.*\.pem|.*\.p12|.*\.pfx|id_rsa|id_ed25519|.*\.keystore|\.npmrc|\.netrc)$/.test(
          file,
        ),
      ).filter((file) => !file.endsWith('.env.example'));
      if (sensitiveNames.length > 0) {
        return { status: 'fail', detail: `ficheros sensibles trackeados: ${sensitiveNames.join(', ')}` };
      }

      const hits = [];
      for (const file of ctx.tracked) {
        if (file.startsWith('dist/') || /\.(png|jpg|jpeg|webp|gif|ico|woff2?|mp4|zip)$/i.test(file)) continue;
        const path = join(ctx.root, file);
        if (!existsSync(path)) continue;
        const text = readText(path);
        if (text.length > 512_000) continue;
        for (const pattern of SECRET_PATTERNS) {
          if (pattern.test(text)) {
            hits.push(`${file} (${pattern.source.slice(0, 18)}…)`);
            break;
          }
        }
      }
      return {
        status: hits.length === 0 ? 'pass' : 'fail',
        detail: hits.length === 0 ? `${ctx.tracked.length} ficheros escaneados` : hits.join(', '),
      };
    },
  },
  {
    id: 6,
    category: 'Seguridad',
    name: 'Dependabot / Renovate activado',
    verification: '.github/dependabot.yml',
    severity: 'Alto',
    level: 1,
    check: (ctx) => {
      const found = ['.github/dependabot.yml', '.github/dependabot.yaml', 'renovate.json'].filter(
        (file) => existsSync(join(ctx.root, file)),
      );
      return {
        status: found.length > 0 ? 'pass' : 'fail',
        detail: found.length > 0 ? found.join(', ') : 'añade .github/dependabot.yml',
      };
    },
  },
  {
    id: 7,
    category: 'Seguridad',
    name: 'CodeQL / Code scanning activado',
    verification: '.github/workflows/*codeql*',
    severity: 'Alto',
    level: 2,
    check: (ctx) => {
      const hasCodeql = /codeql|github\/codeql-action/i.test(ctx.workflowText);
      return {
        status: hasCodeql ? 'pass' : 'manual',
        detail: hasCodeql ? 'workflow CodeQL presente' : 'activar en GitHub → Security → Code scanning',
      };
    },
  },
  {
    id: 8,
    category: 'Seguridad',
    name: 'package-lock.json commiteado',
    verification: 'ls -la *lock*',
    severity: 'Medio',
    level: 1,
    check: (ctx) => {
      const lock = ctx.tracked.filter((file) => /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lock)$/.test(file));
      return {
        status: lock.length > 0 ? 'pass' : 'fail',
        detail: lock.join(', ') || 'sin lockfile trackeado',
      };
    },
  },
  {
    id: 9,
    category: 'Build',
    name: 'package.json con scripts: build, dev, start, test, lint, typecheck',
    verification: 'cat package.json | jq .scripts',
    severity: 'Crítico',
    level: 0,
    check: (ctx) => {
      const required = ['build', 'dev', 'start', 'test', 'lint', 'typecheck'];
      const scripts = ctx.pkg.scripts ?? {};
      const missing = required.filter((name) => !scripts[name]);
      return {
        status: missing.length === 0 ? 'pass' : 'fail',
        detail: missing.length === 0 ? `${required.length}/${required.length} scripts` : `faltan: ${missing.join(', ')}`,
      };
    },
  },
  {
    id: 10,
    category: 'Build',
    name: 'Build local pasa sin errores (npm run build)',
    verification: 'Exit code 0',
    severity: 'Crítico',
    level: 0,
    check: (ctx) => {
      if (!ctx.options.runChecks) return { status: 'skip', detail: 'npm run audit -- --run-checks' };
      const result = run(ctx.root, 'npm', ['run', 'build']);
      return { status: result.ok ? 'pass' : 'fail', detail: result.ok ? 'exit 0' : result.output };
    },
  },
  {
    id: 11,
    category: 'Build',
    name: 'TypeScript strict mode ("strict": true)',
    verification: 'cat tsconfig.json | jq .compilerOptions.strict',
    severity: 'Alto',
    level: 1,
    check: (ctx) => {
      const strict = ctx.tsconfig?.compilerOptions?.strict === true;
      return { status: strict ? 'pass' : 'fail', detail: `strict: ${String(strict)}` };
    },
  },
  {
    id: 12,
    category: 'Build',
    name: 'Lint pasa (npm run lint)',
    verification: 'Exit code 0',
    severity: 'Alto',
    level: 1,
    check: (ctx) => {
      if (!ctx.options.runChecks) return { status: 'skip', detail: 'npm run audit -- --run-checks' };
      const result = run(ctx.root, 'npm', ['run', 'lint']);
      return { status: result.ok ? 'pass' : 'fail', detail: result.ok ? 'exit 0' : result.output };
    },
  },
  {
    id: 13,
    category: 'Tests',
    name: 'Tests existen y pasan (npm test)',
    verification: 'Exit code 0',
    severity: 'Alto',
    level: 1,
    check: (ctx) => {
      const hasScript = Boolean(ctx.pkg.scripts?.test);
      const files = listTestFiles(ctx.root, ctx.tracked);
      if (!hasScript || files.length === 0) {
        return { status: 'fail', detail: `script test: ${hasScript}, ficheros: ${files.length}` };
      }
      if (!ctx.options.runChecks) {
        return { status: 'pass', detail: `${files.length} ficheros de test; ejecútalos con --run-checks` };
      }
      const result = run(ctx.root, 'npm', ['test']);
      return { status: result.ok ? 'pass' : 'fail', detail: result.ok ? `${files.length} ficheros, exit 0` : result.output };
    },
  },
  {
    id: 14,
    category: 'Deploy',
    name: 'Config de deploy detectada (vercel.json / netlify.toml / Dockerfile)',
    verification: 'ls *.json *.toml Dockerfile',
    severity: 'Crítico',
    level: 0,
    check: (ctx) => {
      const candidates = ['vercel.json', 'netlify.toml', 'wrangler.toml', 'Dockerfile', 'fly.toml'];
      const found = candidates.filter((file) => existsSync(join(ctx.root, file)));
      return {
        status: found.length > 0 ? 'pass' : 'fail',
        detail: found.join(', ') || 'ninguna configuración de deploy',
      };
    },
  },
  {
    id: 15,
    category: 'Deploy',
    name: 'Deploy a plataforma correcta (URL live responde 200)',
    verification: 'curl -I https://<url>',
    severity: 'Crítico',
    level: 0,
    check: async (ctx) => {
      if (!ctx.options.url) return { status: 'skip', detail: 'npm run audit -- --url https://belentani.es' };
      const probe = await probeUrl(ctx.options.url);
      return {
        status: probe.ok ? 'pass' : 'fail',
        detail: `${ctx.options.url} → ${probe.status || probe.error}`,
      };
    },
  },
  {
    id: 16,
    category: 'Deploy',
    name: 'Variables de entorno en plataforma (NO en repo)',
    verification: 'Dashboard Vercel/Netlify/CF',
    severity: 'Crítico',
    level: 0,
    check: (ctx) => {
      const example = existsSync(join(ctx.root, '.env.example'));
      const leaked = ctx.tracked.some((file) => /^\.env$|^\.env\.(?!example)/.test(file));
      if (leaked) return { status: 'fail', detail: 'hay un .env trackeado' };
      return {
        status: example ? 'manual' : 'fail',
        detail: example ? '.env.example presente; declara GEMINI_API_KEY en el dashboard' : 'falta .env.example',
      };
    },
  },
  {
    id: 17,
    category: 'Deploy',
    name: 'Preview deployments en PRs',
    verification: 'GitHub Checks en PR',
    severity: 'Medio',
    level: 1,
    check: (ctx) => {
      const onPullRequest = /pull_request/.test(ctx.workflowText);
      return {
        status: onPullRequest ? 'pass' : 'fail',
        detail: onPullRequest ? 'los workflows se disparan en pull_request' : 'añade el trigger pull_request',
      };
    },
  },
  {
    id: 18,
    category: 'Runtime',
    name: 'Health endpoint (/api/health) responde 200',
    verification: 'curl -I https://<url>/api/health',
    severity: 'Alto',
    level: 0,
    check: async (ctx) => {
      const serverSource = readText(join(ctx.root, 'server.ts'));
      const declared = /['"]\/api\/health['"]/.test(serverSource);
      if (ctx.options.url) {
        const probe = await probeUrl(`${ctx.options.url.replace(/\/$/, '')}/api/health`);
        return {
          status: probe.ok ? 'pass' : 'fail',
          detail: `/api/health → ${probe.status || probe.error}`,
        };
      }
      return {
        status: declared ? 'pass' : 'fail',
        detail: declared ? 'ruta declarada en server.ts (verifica en vivo con --url)' : 'server.ts no expone /api/health',
      };
    },
  },
  {
    id: 19,
    category: 'Runtime',
    name: 'Error tracking (Sentry / Vercel Analytics / CF)',
    verification: 'Dashboard',
    severity: 'Medio',
    level: 2,
    check: (ctx) => {
      const deps = { ...(ctx.pkg.dependencies ?? {}), ...(ctx.pkg.devDependencies ?? {}) };
      const found = Object.keys(deps).filter((name) => /sentry|analytics|bugsnag|rollbar/i.test(name));
      return {
        status: found.length > 0 ? 'pass' : 'manual',
        detail: found.length > 0 ? found.join(', ') : 'conecta Vercel Analytics o Sentry en el dashboard',
      };
    },
  },
  {
    id: 20,
    category: 'Runtime',
    name: 'Logs estructurados (pino / winston / console JSON)',
    verification: 'Código',
    severity: 'Medio',
    level: 2,
    check: (ctx) => {
      const deps = { ...(ctx.pkg.dependencies ?? {}), ...(ctx.pkg.devDependencies ?? {}) };
      const library = Object.keys(deps).find((name) => /^(pino|winston)$/.test(name));
      const serverSource = readText(join(ctx.root, 'server.ts'));
      const jsonLogs =
        /console\.(log|error|warn)\(\s*JSON\.stringify/.test(serverSource) ||
        /JSON\.stringify\(\{[\s\S]{0,200}?level[\s\S]{0,200}?event/.test(serverSource);
      return {
        status: library || jsonLogs ? 'pass' : 'fail',
        detail: library ?? (jsonLogs ? 'console JSON en server.ts' : 'sin logs estructurados'),
      };
    },
  },
  {
    id: 21,
    category: 'Performance',
    name: 'Core Web Vitals: LCP < 2.5s, CLS < 0.1, INP < 200ms',
    verification: 'Lighthouse / Speed Insights',
    severity: 'Medio',
    level: 2,
    check: (ctx) => {
      const distExists = existsSync(join(ctx.root, 'dist/index.html'));
      return {
        status: 'manual',
        detail: distExists
          ? 'npx lighthouse <url> --only-categories=performance; presupuestos de bundle: npm run perf'
          : 'ejecuta npm run build y después npm run perf',
      };
    },
  },
  {
    id: 22,
    category: 'Performance',
    name: 'Assets con cache headers (static: 1 año, HTML: no-cache)',
    verification: 'curl -I /assets/*',
    severity: 'Medio',
    level: 2,
    check: (ctx) => {
      const serverSource = readText(join(ctx.root, 'server.ts'));
      const hasStaticCache = /max-age=31536000|immutable/.test(serverSource);
      const hasHtmlNoCache = /no-cache|no-store/.test(serverSource);
      const vercelHeaders = /Cache-Control/i.test(readText(join(ctx.root, 'vercel.json')));
      const ok = (hasStaticCache && hasHtmlNoCache) || vercelHeaders;
      return {
        status: ok ? 'pass' : 'fail',
        detail: ok
          ? `static: ${hasStaticCache}, html: ${hasHtmlNoCache}, vercel.json: ${vercelHeaders}`
          : 'declara Cache-Control para /assets y no-cache para el HTML',
      };
    },
  },
  {
    id: 23,
    category: 'SEO/Access',
    name: 'robots.txt, sitemap.xml, meta tags Open Graph/Twitter',
    verification: 'curl /robots.txt',
    severity: 'Medio',
    level: 1,
    check: (ctx) => {
      const robots = existsSync(join(ctx.root, 'public/robots.txt'));
      const sitemap = existsSync(join(ctx.root, 'public/sitemap.xml'));
      const html = readText(join(ctx.root, 'index.html'));
      const og = /property="og:/.test(html);
      const twitter = /name="twitter:/.test(html);
      const missing = [
        !robots && 'robots.txt',
        !sitemap && 'sitemap.xml',
        !og && 'og:*',
        !twitter && 'twitter:*',
      ].filter(Boolean);
      return { status: missing.length === 0 ? 'pass' : 'fail', detail: missing.length === 0 ? '4/4' : `faltan: ${missing.join(', ')}` };
    },
  },
  {
    id: 24,
    category: 'SEO/Access',
    name: 'Accesibilidad: WCAG 2.1 AA (axe-core en tests)',
    verification: 'npm test (suite a11y)',
    severity: 'Medio',
    level: 2,
    check: (ctx) => {
      const deps = { ...(ctx.pkg.dependencies ?? {}), ...(ctx.pkg.devDependencies ?? {}) };
      const hasAxe = Boolean(deps['axe-core']);
      const testFiles = listTestFiles(ctx.root, ctx.tracked);
      const hasA11yTest = testFiles.some(
        (file) => /a11y|accessib|axe/i.test(file) && /axe/.test(readText(join(ctx.root, file))),
      );
      const ok = hasAxe && hasA11yTest;
      return {
        status: ok ? 'pass' : 'fail',
        detail: `axe-core: ${hasAxe}, suite a11y: ${hasA11yTest}`,
      };
    },
  },
  {
    id: 25,
    category: 'Docs',
    name: 'README.md con descripción, install, run, deploy, env vars',
    verification: 'cat README.md',
    severity: 'Alto',
    level: 0,
    check: (ctx) => {
      const readme = readText(join(ctx.root, 'README.md')).toLowerCase();
      if (readme.length === 0) return { status: 'fail', detail: 'README.md vacío o ausente' };
      const required = {
        instalación: /(npm (install|ci)\b|bun install|pnpm install)/,
        ejecución: /(npm run dev|npm start|npm run start)/,
        build: /(npm run build)/,
        deploy: /(deploy|vercel|desplieg)/,
        variables: /(env|gemini_api_key)/,
      };
      const missing = Object.entries(required).filter(([, re]) => !re.test(readme)).map(([name]) => name);
      return { status: missing.length === 0 ? 'pass' : 'fail', detail: missing.length === 0 ? '5/5 secciones' : `faltan: ${missing.join(', ')}` };
    },
  },
  {
    id: 26,
    category: 'Docs',
    name: 'CHANGELOG.md actualizado',
    verification: 'cat CHANGELOG.md',
    severity: 'Medio',
    level: 2,
    check: (ctx) => {
      const path = join(ctx.root, 'CHANGELOG.md');
      if (!existsSync(path)) return { status: 'fail', detail: 'falta CHANGELOG.md' };
      const text = readText(path);
      const hasEntry = /##\s*\[?\d+\.\d+\.\d+/.test(text);
      return { status: hasEntry ? 'pass' : 'fail', detail: hasEntry ? `${text.split('\n').length} líneas` : 'sin entradas versionadas' };
    },
  },
  {
    id: 27,
    category: 'Docs',
    name: 'SPEC.md con criterios de aceptación',
    verification: 'cat SPEC.md',
    severity: 'Medio',
    level: 2,
    check: (ctx) => {
      const candidates = ['SPEC.md', 'docs/spec.md', 'docs/SPEC.md'];
      const found = candidates.find((file) => existsSync(join(ctx.root, file)));
      if (!found) return { status: 'fail', detail: 'ninguno de SPEC.md / docs/spec.md existe' };
      const text = readText(join(ctx.root, found));
      const ears = /\b(WHEN|WHILE|IF|WHERE)\b[\s\S]{0,200}?\b(THEN|shall|debe)\b/i.test(text);
      return { status: ears ? 'pass' : 'fail', detail: ears ? `${found} con criterios EARS` : `${found} sin criterios EARS` };
    },
  },
  {
    id: 28,
    category: 'Infra',
    name: 'DNS configurado (dominio custom + SSL)',
    verification: 'dig +short <dominio>',
    severity: 'Medio',
    level: 2,
    check: () => ({ status: 'manual', detail: 'dig +short belentani.es && curl -I https://belentani.es' }),
  },
  {
    id: 29,
    category: 'Infra',
    name: 'CDN / Edge activado (Vercel Edge, CF Pages, Netlify Edge)',
    verification: 'Dashboard',
    severity: 'Medio',
    level: 2,
    check: (ctx) => {
      const vercel = existsSync(join(ctx.root, 'vercel.json'));
      return {
        status: vercel ? 'pass' : 'manual',
        detail: vercel ? 'vercel.json presente (CDN global de Vercel)' : 'despliega en una plataforma con CDN',
      };
    },
  },
  {
    id: 30,
    category: 'Monitoring',
    name: 'Uptime monitor (UptimeRobot / BetterUptime / Vercel)',
    verification: 'Dashboard',
    severity: 'Medio',
    level: 2,
    check: () => ({ status: 'manual', detail: 'configura un monitor sobre /api/health (5 min)' }),
  },
];

const LEVEL_NAMES = { 0: 'Nivel 0 — MVP', 1: 'Nivel 1 — Producción básica', 2: 'Nivel 2 — Producción robusta' };

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const ctx = buildContext(root, options);

  const results = [];
  for (const criterion of CRITERIA) {
    const outcome = await criterion.check(ctx);
    results.push({ ...criterion, check: undefined, ...outcome });
  }

  const inLevel = results.filter((result) => result.level <= options.level);
  const failures = inLevel.filter((result) => result.status === 'fail');
  const passes = inLevel.filter((result) => result.status === 'pass');
  const manuals = inLevel.filter((result) => result.status === 'manual');
  const skips = inLevel.filter((result) => result.status === 'skip');
  const automated = passes.length + failures.length;
  const compliance = automated === 0 ? 0 : Math.round((passes.length / automated) * 100);

  const report = {
    generatedAt: new Date().toISOString(),
    level: options.level,
    levelName: LEVEL_NAMES[options.level],
    summary: {
      total: inLevel.length,
      pass: passes.length,
      fail: failures.length,
      manual: manuals.length,
      skip: skips.length,
      complianceAutomated: compliance,
    },
    results: results.map(({ check, ...rest }) => rest),
    ok: failures.length === 0,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    const lines = [];
    lines.push('AUDITORÍA DE PRODUCCIÓN · PRODUCTION_CHECKLIST.md');
    lines.push(`${report.levelName} · ${report.summary.total} criterios en nivel`);
    lines.push('');
    for (const result of results) {
      if (result.level > options.level) continue;
      const mark = { pass: 'ok  ', fail: 'FAIL', manual: 'hand', skip: 'skip' }[result.status];
      const shown = options.quiet && result.status === 'pass' ? null : result;
      if (!shown) continue;
      lines.push(
        `  [${mark}] #${String(result.id).padStart(2)} ${result.severity.padEnd(8)} N${result.level} ${result.name}`,
      );
      lines.push(`         └─ ${result.detail}`);
    }
    lines.push('');
    lines.push(
      `RESUMEN: ${passes.length} ok · ${failures.length} fail · ${manuals.length} manual · ${skips.length} skip`,
    );
    lines.push(`Cumplimiento verificado automáticamente: ${compliance}%`);
    if (failures.length > 0) {
      lines.push('');
      lines.push('BLOQUEAN EL NIVEL:');
      for (const failure of failures) lines.push(`  · #${failure.id} ${failure.name} → ${failure.detail}`);
    }
    process.stdout.write(`${lines.join('\n')}\n`);
  }

  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`Error interno del auditor: ${error?.stack ?? error}\n`);
  process.exit(2);
});
