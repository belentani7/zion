/**
 * Capability probing for the GPU and motion layers.
 *
 * Pure, side-effect-free helpers shared by the two Three.js canvases
 * (`OmegaCosmosCanvas` and `VisualEngineCanvas`) so the degradation contract
 * is defined once and can be unit tested without a browser:
 *
 * - `probeWebGL` decides whether WebGL2 / WebGL1 is usable and whether the
 *   context is a software renderer (SwiftShader / llvmpipe / Mesa), which
 *   drives the pixel-ratio and post-processing budget.
 * - `prefersReducedMotion` honours the WCAG 2.1 AA `prefers-reduced-motion`
 *   media feature.
 * - `subscribeToVisibility` pauses the render loop when the tab is hidden.
 */

export type WebGLVersion = 2 | 1 | 0;

export interface WebGLProbe {
  /** True when a real GL context could be created. */
  supported: boolean;
  /** Highest context version obtained; 0 when unsupported. */
  version: WebGLVersion;
  /** UNMASKED_RENDERER_WEBGL when the debug extension is exposed. */
  rendererInfo: string;
  /** True for software rasterisers, where the frame budget must shrink. */
  isSoftwareRenderer: boolean;
  /** Human readable cause, only present when `supported` is false. */
  reason?: string;
  /**
   * Frees the probing context. Browsers cap the number of live WebGL contexts
   * per page (typically 8-16), so a probe canvas must be released before the
   * real renderer is created.
   */
  release: () => void;
}

/** Message shown by the fallback panel when no GL context is available. */
export const WEBGL_UNAVAILABLE_MESSAGE = 'WebGL no está disponible en este entorno.';

/** Software rasterisers detected through WEBGL_debug_renderer_info. */
const SOFTWARE_RENDERER_RE = /SwiftShader|llvmpipe|Software|Mesa/i;

/**
 * Probe the WebGL support of a canvas element.
 *
 * Never throws: a browser that rejects `getContext` (privacy settings,
 * disabled hardware acceleration, jsdom) is reported as `supported: false`
 * with the reason, so callers can render a fallback instead of crashing.
 */
export function probeWebGL(canvas: HTMLCanvasElement | null): WebGLProbe {
  const noop = () => {};

  if (!canvas) {
    return {
      supported: false,
      version: 0,
      rendererInfo: '',
      isSoftwareRenderer: false,
      reason: WEBGL_UNAVAILABLE_MESSAGE,
      release: noop,
    };
  }

  let gl2: WebGL2RenderingContext | null = null;
  let gl1: WebGLRenderingContext | null = null;

  try {
    gl2 = canvas.getContext('webgl2');
  } catch {
    gl2 = null;
  }
  if (!gl2) {
    try {
      gl1 = canvas.getContext('webgl') || (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    } catch {
      gl1 = null;
    }
  }

  const gl = gl2 ?? gl1;
  if (!gl) {
    return {
      supported: false,
      version: 0,
      rendererInfo: '',
      isSoftwareRenderer: false,
      reason: WEBGL_UNAVAILABLE_MESSAGE,
      release: noop,
    };
  }

  const release = () => {
    try {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      // Nothing else to do: the context is garbage collected with the canvas.
    }
  };

  let rendererInfo = '';
  try {
    const debugExtension = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugExtension) {
      rendererInfo = String(gl.getParameter(debugExtension.UNMASKED_RENDERER_WEBGL) ?? '');
    }
  } catch {
    rendererInfo = '';
  }

  return {
    supported: true,
    version: gl2 ? 2 : 1,
    rendererInfo,
    isSoftwareRenderer: SOFTWARE_RENDERER_RE.test(rendererInfo),
    release,
  };
}

/**
 * Probe WebGL on a throwaway canvas and release it immediately.
 * Used by renderers that create their own canvas element (Three.js does).
 */
export function probeWebGLSupport(): WebGLProbe {
  if (typeof document === 'undefined') {
    return {
      supported: false,
      version: 0,
      rendererInfo: '',
      isSoftwareRenderer: false,
      reason: WEBGL_UNAVAILABLE_MESSAGE,
      release: () => {},
    };
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const probe = probeWebGL(canvas);
  probe.release();
  return probe;
}

/**
 * Device pixel ratio capped for the given renderer class.
 * Software rasterisers render at 1x; hardware is capped to avoid burning the
 * frame budget on 3x retina panels.
 */
export function resolvePixelRatio(isSoftwareRenderer: boolean, fallbackRatio = 1): number {
  if (isSoftwareRenderer) return 1;
  const ratio = typeof window === 'undefined' ? fallbackRatio : window.devicePixelRatio || fallbackRatio;
  return Math.min(ratio, 1.75);
}

/** True when the user asked the OS to reduce motion (WCAG 2.1 AA). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Subscribe to tab visibility changes and return the unsubscribe function.
 * Used to stop the requestAnimationFrame loop while the tab is hidden, which
 * is the single cheapest GPU/battery saving available to a WebGL page.
 */
export function subscribeToVisibility(onChange: (hidden: boolean) => void): () => void {
  if (typeof document === 'undefined') return () => {};
  const handler = () => onChange(document.visibilityState === 'hidden');
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}

/* -------------------------------------------------------------------------- */
/* Interacción orbital (VisualEngineCanvas)                                    */
/* -------------------------------------------------------------------------- */

export const MIN_CAMERA_DISTANCE = 10;
export const MAX_CAMERA_DISTANCE = 90;
export const MAX_CAMERA_PITCH = Math.PI / 2.2;

/** Órbita y distancia de la cámara orbital del generador procedural. */
export interface OrbitalCamera {
  rotation: { x: number; y: number };
  distance: number;
}

/**
 * Acota la distancia orbital al rango utilizable.
 *
 * Un valor no finito (NaN o ±Infinity, posible cuando un deltaY llega corrupto)
 * colapsa a la distancia mínima: un resultado determinista y dentro de rango,
 * nunca un NaN que dejaría la cámara en el origen. Análisis de valores límite
 * en `src/lib/webgl.test.ts`.
 */
export function clampCameraDistance(value: number): number {
  if (!Number.isFinite(value)) return MIN_CAMERA_DISTANCE;
  return Math.min(MAX_CAMERA_DISTANCE, Math.max(MIN_CAMERA_DISTANCE, value));
}

/** Incremento de zoom por notch de rueda (deltaY positivo = alejar). */
export function zoomFromWheel(camera: OrbitalCamera, deltaY: number): OrbitalCamera {
  return { ...camera, distance: clampCameraDistance(camera.distance + deltaY * 0.05) };
}

const ROTATION_STEP = 0.08;
const ZOOM_STEP = 4;

/**
 * Traduce una tecla a un movimiento de cámara. Devuelve `null` cuando la tecla
 * no pertenece al esquema (el componente no llama entonces a preventDefault, así
 * que Tab y los atajos del navegador siguen funcionando).
 */
export function orbitFromKey(camera: OrbitalCamera, key: string): OrbitalCamera | null {
  const { rotation, distance } = camera;
  switch (key) {
    case 'ArrowLeft':
      return { rotation: { ...rotation, y: rotation.y + ROTATION_STEP }, distance };
    case 'ArrowRight':
      return { rotation: { ...rotation, y: rotation.y - ROTATION_STEP }, distance };
    case 'ArrowUp':
      return {
        rotation: { ...rotation, x: Math.min(MAX_CAMERA_PITCH, rotation.x + ROTATION_STEP) },
        distance,
      };
    case 'ArrowDown':
      return {
        rotation: { ...rotation, x: Math.max(-MAX_CAMERA_PITCH, rotation.x - ROTATION_STEP) },
        distance,
      };
    case '+':
    case '=':
      return { rotation, distance: clampCameraDistance(distance - ZOOM_STEP) };
    case '-':
    case '_':
      return { rotation, distance: clampCameraDistance(distance + ZOOM_STEP) };
    case 'Home':
      return { rotation: { x: 0.3, y: 0.5 }, distance: 40 };
    default:
      return null;
  }
}

/**
 * Resultado de la exportación de un snapshot PNG desde el Visual Engine.
 *
 * El canvas no conoce idiomas (guardrail 3: la dependencia va de la vista al
 * componente técnico, nunca al revés), así que eleva el resultado y es la vista
 * la que lo anuncia traducido.
 */
export type SnapshotResult = { ok: true; fileName: string } | { ok: false };

/**
 * Nombre de fichero del snapshot exportado. Formato histórico del motor:
 * `belentani-<generador>-seed<semilla>-<timestamp>.png`.
 */
export function snapshotFileName(generator: string, seed: number, timestamp: number): string {
  return `belentani-${generator}-seed${seed}-${timestamp}.png`;
}

/**
 * Texto que la región `role="status"` de la vista debe anunciar para un resultado
 * de snapshot. Devuelve cadena vacía mientras no haya resultado, para no anunciar
 * nada en frío.
 */
export function describeSnapshot(
  result: SnapshotResult | null,
  labels: { ok: string; error: string },
): string {
  if (result === null) return '';
  return result.ok ? labels.ok : labels.error;
}
