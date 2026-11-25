import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WEBGL_UNAVAILABLE_MESSAGE,
  prefersReducedMotion,
  probeWebGL,
  probeWebGLSupport,
  resolvePixelRatio,
  subscribeToVisibility,
} from './webgl';

/** Minimal stand-in for a WebGL context, enough for the probe. */
function fakeContext(renderer: string, options: { failExtension?: boolean } = {}) {
  return {
    getExtension: vi.fn((name: string) => {
      if (name !== 'WEBGL_debug_renderer_info') return null;
      if (options.failExtension) throw new Error('extension blocked by privacy settings');
      return { UNMASKED_RENDERER_WEBGL: 0x9246 };
    }),
    getParameter: vi.fn(() => renderer),
  };
}

function canvasWith(
  getContext: (type: string) => unknown,
): HTMLCanvasElement {
  return { getContext } as unknown as HTMLCanvasElement;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('probeWebGL — equivalence classes', () => {
  it('reports WebGL2 when the browser exposes it', () => {
    const probe = probeWebGL(canvasWith((type) => (type === 'webgl2' ? fakeContext('GPU') : null)));

    expect(probe.supported).toBe(true);
    expect(probe.version).toBe(2);
    expect(probe.rendererInfo).toBe('GPU');
    expect(probe.isSoftwareRenderer).toBe(false);
    expect(probe.reason).toBeUndefined();
  });

  it('falls back to WebGL1 and reports version 1', () => {
    const probe = probeWebGL(
      canvasWith((type) => (type === 'webgl' ? fakeContext('GPU') : null)),
    );

    expect(probe.supported).toBe(true);
    expect(probe.version).toBe(1);
  });

  it('accepts the legacy experimental-webgl alias', () => {
    const probe = probeWebGL(
      canvasWith((type) => (type === 'experimental-webgl' ? fakeContext('GPU') : null)),
    );

    expect(probe.supported).toBe(true);
    expect(probe.version).toBe(1);
  });

  it('detects software rasterisers', () => {
    const software = probeWebGL(canvasWith(() => fakeContext('Google SwiftShader')));
    const mesa = probeWebGL(canvasWith(() => fakeContext('llvmpipe (LLVM 15.0.7, 256 bits)')));
    const hardware = probeWebGL(
      canvasWith(() => fakeContext('ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11)')),
    );

    expect(software.isSoftwareRenderer).toBe(true);
    expect(mesa.isSoftwareRenderer).toBe(true);
    expect(hardware.isSoftwareRenderer).toBe(false);
  });

  it('reports unsupported when no context can be created (jsdom / disabled GPU)', () => {
    const probe = probeWebGL(canvasWith(() => null));

    expect(probe.supported).toBe(false);
    expect(probe.version).toBe(0);
    expect(probe.reason).toBe(WEBGL_UNAVAILABLE_MESSAGE);
    expect(probe.rendererInfo).toBe('');
    expect(() => probe.release()).not.toThrow();
  });

  it('reports unsupported for a null canvas', () => {
    const probe = probeWebGL(null);
    expect(probe.supported).toBe(false);
    expect(probe.reason).toBe(WEBGL_UNAVAILABLE_MESSAGE);
  });

  it('never throws when getContext itself throws (system error class)', () => {
    const probe = probeWebGL(
      canvasWith(() => {
        throw new Error('SecurityError: canvas tainted');
      }),
    );

    expect(probe.supported).toBe(false);
    expect(probe.reason).toBe(WEBGL_UNAVAILABLE_MESSAGE);
  });

  it('keeps working when the debug extension is refused', () => {
    const probe = probeWebGL(
      canvasWith(() => fakeContext('ignored', { failExtension: true })),
    );

    expect(probe.supported).toBe(true);
    expect(probe.rendererInfo).toBe('');
    expect(probe.isSoftwareRenderer).toBe(false);
  });

  it('releases the probing context through WEBGL_lose_context', () => {
    const loseContext = vi.fn();
    const context = {
      ...fakeContext('GPU'),
      getExtension: vi.fn((name: string) =>
        name === 'WEBGL_debug_renderer_info'
          ? { UNMASKED_RENDERER_WEBGL: 0x9246 }
          : name === 'WEBGL_lose_context'
            ? { loseContext }
            : null,
      ),
    };
    const probe = probeWebGL(canvasWith(() => context));

    probe.release();
    expect(loseContext).toHaveBeenCalledTimes(1);
  });
});

describe('probeWebGLSupport — throwaway probe', () => {
  it('probes a 1x1 canvas and returns the capability verdict', () => {
    const created: string[] = [];
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        created.push(tag);
        return canvasWith(() => null) as unknown as HTMLElement;
      });

    const probe = probeWebGLSupport();

    expect(created).toEqual(['canvas']);
    expect(probe.supported).toBe(false);
    createElement.mockRestore();
  });
});

describe('resolvePixelRatio — boundary values', () => {
  const setDpr = (value: number) => {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      writable: true,
      value,
    });
  };

  it('always returns 1 for software rasterisers', () => {
    setDpr(3);
    expect(resolvePixelRatio(true)).toBe(1);
  });

  it.each([
    [1, 1],
    [1.5, 1.5],
    [1.75, 1.75],
    [1.76, 1.75],
    [2, 1.75],
    [3, 1.75],
  ])('clamps devicePixelRatio %i to %i', (dpr, expected) => {
    setDpr(dpr);
    expect(resolvePixelRatio(false)).toBe(expected);
  });

  it('substitutes the fallback when devicePixelRatio is 0 or missing, still capped', () => {
    setDpr(0);
    // 0 || fallback → 2, then the 1.75 cap applies exactly as with a real 2x panel.
    expect(resolvePixelRatio(false, 2)).toBe(1.75);
    expect(resolvePixelRatio(false, 1)).toBe(1);
  });
});

describe('prefersReducedMotion', () => {
  it('is false with the default jsdom media query stub', () => {
    expect(prefersReducedMotion()).toBe(false);
  });

  it('is true when the OS asks to reduce motion', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn(() => ({ matches: true, media: '(prefers-reduced-motion: reduce)' })),
    });

    expect(prefersReducedMotion()).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });

  it('is false when matchMedia is unavailable (system error class)', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: undefined,
    });

    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('subscribeToVisibility — render loop pause', () => {
  const setVisibility = (state: DocumentVisibilityState) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => state,
    });
  };

  it('notifies hidden=true when the tab goes to the background', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToVisibility(onChange);

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(onChange).toHaveBeenCalledWith(true);
    unsubscribe();
  });

  it('notifies hidden=false when the tab becomes visible again', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToVisibility(onChange);

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(onChange).toHaveBeenCalledWith(false);
    unsubscribe();
  });

  it('stops notifying after unsubscribe', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToVisibility(onChange);
    unsubscribe();

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(onChange).not.toHaveBeenCalled();
  });
});
