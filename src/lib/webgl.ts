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
