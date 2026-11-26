import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Global test setup.
 *
 * The suite mixes jsdom files (components) with node files (the Express kernel),
 * and Vitest applies `setupFiles` to both. Everything browser-specific below is
 * therefore guarded: in the node environment there is no `window` and touching
 * one throws before the first test runs.
 *
 * jsdom implements the DOM but not the browser APIs this app leans on: media
 * queries, ResizeObserver, object URLs, the clipboard, canvas contexts and Web
 * Audio. Each stub is the minimum needed for a component to mount, and each is
 * deliberately "capability absent" rather than faked behaviour — the tests must
 * exercise the same degradation paths a user hits on a browser without WebGL2
 * or without AudioContext.
 */

afterEach(() => {
  cleanup();
});

const hasBrowserApis = typeof window !== 'undefined' && typeof document !== 'undefined';

if (hasBrowserApis) {
  /* --- matchMedia -------------------------------------------------------- */

  type MediaQueryListStub = {
    matches: boolean;
    media: string;
    onchange: null;
    addListener: () => void;
    removeListener: () => void;
    addEventListener: () => void;
    removeEventListener: () => void;
    dispatchEvent: () => boolean;
  };

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): MediaQueryListStub => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  /* --- Observers --------------------------------------------------------- */

  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }

  class IntersectionObserverStub {
    root = null;
    rootMargin = '';
    thresholds: number[] = [];
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): [] {
      return [];
    }
  }

  Object.defineProperty(window, 'ResizeObserver', { writable: true, value: ResizeObserverStub });
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    value: IntersectionObserverStub,
  });

  /* --- Object URLs (used by every export button) ------------------------- */

  const objectUrls: string[] = [];

  Object.defineProperty(URL, 'createObjectURL', {
    writable: true,
    value: vi.fn((blob?: Blob) => {
      void blob;
      const url = `blob:vitest/${objectUrls.length + 1}`;
      objectUrls.push(url);
      return url;
    }),
  });

  Object.defineProperty(URL, 'revokeObjectURL', {
    writable: true,
    value: vi.fn((url: string) => {
      const index = objectUrls.indexOf(url);
      if (index >= 0) objectUrls.splice(index, 1);
    }),
  });

  /* --- Clipboard --------------------------------------------------------- */

  Object.defineProperty(navigator, 'clipboard', {
    writable: true,
    // user-event replaces this descriptor with a non-configurable one during
    // setup(); allowing redefinition here keeps both usable in the same file.
    configurable: true,
    value: { writeText: vi.fn(async () => undefined), readText: vi.fn(async () => '') },
  });

  /* --- Misc DOM APIs jsdom does not implement ---------------------------- */

  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

  /* --- Canvas: no 2D and no WebGL context (capability-absent mode) ------- */

  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    writable: true,
    value: vi.fn(() => null),
  });

  Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
    writable: true,
    value: vi.fn(() => 'data:image/png;base64,'),
  });
}

/**
 * Web Audio is deliberately NOT stubbed: jsdom has no AudioContext, which is
 * the same situation as a browser with audio disabled, and Audio432Engine
 * already returns `false`/`null` on that path. Tests assert on that contract.
 */
