import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_CAMERA_PITCH,
  WEBGL_UNAVAILABLE_MESSAGE,
  prefersReducedMotion,
  clampCameraDistance,
  orbitFromKey,
  describeSnapshot,
  probeWebGL,
  probeWebGLSupport,
  snapshotFileName,
  resolvePixelRatio,
  subscribeToVisibility,
  zoomFromWheel,
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

describe('clampCameraDistance / zoomFromWheel — límites de la cámara orbital', () => {
  const camera = (distance: number) => ({ rotation: { x: 0.3, y: 0.5 }, distance });

  it.each([
    [9.99, 10],
    [10, 10],
    [40, 40],
    [90, 90],
    [90.01, 90],
    // No finito → distancia mínima: determinista y dentro de rango.
    [Number.NaN, 10],
    [Number.POSITIVE_INFINITY, 10],
    [Number.NEGATIVE_INFINITY, 10],
  ])('acota la distancia %s a %s', (input, expected) => {
    expect(clampCameraDistance(input)).toBe(expected);
  });

  it('aleja con deltaY positivo y acerca con deltaY negativo', () => {
    expect(zoomFromWheel(camera(40), 100).distance).toBe(45);
    expect(zoomFromWheel(camera(40), -100).distance).toBe(35);
  });

  it('no atraviesa los topes por mucho que se acumule la rueda', () => {
    expect(zoomFromWheel(camera(89), 10_000).distance).toBe(90);
    expect(zoomFromWheel(camera(11), -10_000).distance).toBe(10);
  });

  it('no muta la cámara recibida', () => {
    const before = camera(40);
    zoomFromWheel(before, 100);
    expect(before.distance).toBe(40);
  });
});

describe('orbitFromKey — mapa de teclado (WCAG 2.1.1)', () => {
  const camera = { rotation: { x: 0.3, y: 0.5 }, distance: 40 };

  it.each([
    ['ArrowLeft', { rotation: { x: 0.3, y: 0.58 }, distance: 40 }],
    ['ArrowRight', { rotation: { x: 0.3, y: 0.42 }, distance: 40 }],
    ['ArrowUp', { rotation: { x: 0.38, y: 0.5 }, distance: 40 }],
    ['ArrowDown', { rotation: { x: 0.22, y: 0.5 }, distance: 40 }],
    ['+', { rotation: { x: 0.3, y: 0.5 }, distance: 36 }],
    ['=', { rotation: { x: 0.3, y: 0.5 }, distance: 36 }],
    ['-', { rotation: { x: 0.3, y: 0.5 }, distance: 44 }],
    ['_', { rotation: { x: 0.3, y: 0.5 }, distance: 44 }],
    ['Home', { rotation: { x: 0.3, y: 0.5 }, distance: 40 }],
  ])('%s produce %o', (key, expected) => {
    const result = orbitFromKey(camera, key);
    expect(result?.rotation.x).toBeCloseTo(expected.rotation.x, 10);
    expect(result?.rotation.y).toBeCloseTo(expected.rotation.y, 10);
    expect(result?.distance).toBeCloseTo(expected.distance, 10);
  });

  it.each(['Tab', 'Enter', 'Escape', 'a', 'PageDown', ''])('ignora %s (devuelve null)', (key) => {
    expect(orbitFromKey(camera, key)).toBeNull();
  });

  it('acota el cabeceo para que la cámara no dé la vuelta', () => {
    let state = { rotation: { x: 1.4, y: 0 }, distance: 40 };
    for (let step = 0; step < 20; step += 1) {
      state = orbitFromKey(state, 'ArrowUp') as typeof state;
    }
    expect(state.rotation.x).toBeLessThanOrEqual(MAX_CAMERA_PITCH);

    let down = { rotation: { x: -1.4, y: 0 }, distance: 40 };
    for (let step = 0; step < 20; step += 1) {
      down = orbitFromKey(down, 'ArrowDown') as typeof down;
    }
    expect(down.rotation.x).toBeGreaterThanOrEqual(-MAX_CAMERA_PITCH);
  });

  it('Home restaura la órbita inicial incluso desde un estado extremo', () => {
    const result = orbitFromKey({ rotation: { x: -1.2, y: 9.9 }, distance: 88 }, 'Home');
    expect(result).toEqual({ rotation: { x: 0.3, y: 0.5 }, distance: 40 });
  });

  it('no muta la cámara recibida', () => {
    const before = { rotation: { x: 0.3, y: 0.5 }, distance: 40 };
    orbitFromKey(before, 'ArrowLeft');
    expect(before).toEqual({ rotation: { x: 0.3, y: 0.5 }, distance: 40 });
  });
});

describe('snapshotFileName / describeSnapshot — exportación PNG', () => {
  const etiquetas = { ok: 'Snapshot PNG exportado', error: 'No se pudo exportar el snapshot' };

  it('conserva el formato histórico del nombre de fichero', () => {
    expect(snapshotFileName('galaxy', 42, 1700000000000)).toBe(
      'belentani-galaxy-seed42-1700000000000.png',
    );
  });

  it('acepta semilla cero y negativa sin alterar el formato', () => {
    expect(snapshotFileName('nebula', 0, 1)).toBe('belentani-nebula-seed0-1.png');
    expect(snapshotFileName('nebula', -7, 1)).toBe('belentani-nebula-seed-7-1.png');
  });

  it('no anuncia nada mientras no haya resultado', () => {
    expect(describeSnapshot(null, etiquetas)).toBe('');
  });

  it('anuncia el éxito con la etiqueta traducida', () => {
    expect(
      describeSnapshot({ ok: true, fileName: 'belentani-galaxy-seed42-1.png' }, etiquetas),
    ).toBe(etiquetas.ok);
  });

  it('anuncia el fallo sin filtrar el motivo interno (P4)', () => {
    const mensaje = describeSnapshot({ ok: false }, etiquetas);

    expect(mensaje).toBe(etiquetas.error);
    expect(mensaje).not.toMatch(/SecurityError|toDataURL|WebGL|stack/i);
  });

  it('usa las etiquetas del idioma que le pasa la vista, no unas fijas', () => {
    const en = { ok: 'PNG snapshot exported', error: 'Snapshot export failed' };

    expect(describeSnapshot({ ok: false }, en)).toBe('Snapshot export failed');
    expect(describeSnapshot({ ok: true, fileName: 'x.png' }, en)).toBe('PNG snapshot exported');
  });
});
