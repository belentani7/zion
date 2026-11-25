/// <reference types="vite/client" />

/**
 * Ambient types for the Vite runtime.
 *
 * The triple-slash reference above pulls in `vite/client`, which declares the
 * side-effect CSS imports (`import './index.css'`), the static asset imports
 * and the typed `import.meta.env` bag (`MODE`, `DEV`, `PROD`, `BASE_URL` plus
 * any custom `VITE_*` variable).
 *
 * TypeScript 7 rejects a side-effect import of an undeclared module (TS2882),
 * so this file is required for `tsc --noEmit` to cover `src/main.tsx`.
 */
