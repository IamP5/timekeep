import { inject, InjectionToken, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Injection token for the Window object.
 * Returns the global window object in browser environments, or null on the server.
 *
 * @example
 * ```typescript
 * const window = inject(WINDOW);
 * if (window) {
 *   // Safe to use window APIs
 *   console.log(window.innerWidth);
 * }
 * ```
 */
export const WINDOW = new InjectionToken<Window | null>('Window', {
  providedIn: 'root',
  factory: () => {
    const platformId = inject(PLATFORM_ID);
    return isPlatformBrowser(platformId) ? window : null;
  }
});

/**
 * Injection token for the Document object.
 * Returns the global document object in browser environments, or null on the server.
 *
 * @example
 * ```typescript
 * const document = inject(DOCUMENT_TOKEN);
 * if (document) {
 *   // Safe to use document APIs
 *   const element = document.querySelector('.my-class');
 * }
 * ```
 */
export const DOCUMENT_TOKEN = new InjectionToken<Document | null>('Document', {
  providedIn: 'root',
  factory: () => {
    const platformId = inject(PLATFORM_ID);
    return isPlatformBrowser(platformId) ? document : null;
  }
});

/**
 * Injection token for the Navigator object.
 * Returns the global navigator object in browser environments, or null on the server.
 *
 * @example
 * ```typescript
 * const navigator = inject(NAVIGATOR);
 * if (navigator) {
 *   // Safe to use navigator APIs
 *   console.log(navigator.userAgent);
 * }
 * ```
 */
export const NAVIGATOR = new InjectionToken<Navigator | null>('Navigator', {
  providedIn: 'root',
  factory: () => {
    const platformId = inject(PLATFORM_ID);
    return isPlatformBrowser(platformId) ? navigator : null;
  }
});

/**
 * Injection token for the localStorage object.
 * Returns the global localStorage object in browser environments, or null on the server.
 *
 * @throws {Error} When attempting to access on the server in strict mode
 *
 * @example
 * ```typescript
 * const localStorage = inject(LOCAL_STORAGE);
 * if (localStorage) {
 *   // Safe to use localStorage APIs
 *   localStorage.setItem('key', 'value');
 * }
 * ```
 */
export const LOCAL_STORAGE = new InjectionToken<Storage | null>('LocalStorage', {
  providedIn: 'root',
  factory: () => {
    const platformId = inject(PLATFORM_ID);
    if (isPlatformBrowser(platformId)) {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    }
    return null;
  }
});

/**
 * Injection token for the sessionStorage object.
 * Returns the global sessionStorage object in browser environments, or null on the server.
 *
 * @throws {Error} When attempting to access on the server in strict mode
 *
 * @example
 * ```typescript
 * const sessionStorage = inject(SESSION_STORAGE);
 * if (sessionStorage) {
 *   // Safe to use sessionStorage APIs
 *   sessionStorage.setItem('key', 'value');
 * }
 * ```
 */
export const SESSION_STORAGE = new InjectionToken<Storage | null>('SessionStorage', {
  providedIn: 'root',
  factory: () => {
    const platformId = inject(PLATFORM_ID);
    if (isPlatformBrowser(platformId)) {
      return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
    }
    return null;
  }
});

/**
 * Helper function to ensure browser API access is safe.
 * Throws a descriptive error if the API is accessed on the server.
 *
 * @param api - The browser API to check (can be null)
 * @param apiName - The name of the API for error messaging
 * @returns The API if available
 * @throws {Error} If the API is not available
 *
 * @example
 * ```typescript
 * const window = inject(WINDOW);
 * const safeWindow = requireBrowserApi(window, 'window');
 * // Now you can safely use safeWindow
 * console.log(safeWindow.innerWidth);
 * ```
 */
export function requireBrowserApi<T>(api: T | null, apiName: string): T {
  if (api === null) {
    throw new Error(
      `Attempted to access '${apiName}' in a non-browser environment. ` +
      `This API is only available in the browser. ` +
      `Use 'afterNextRender' or check if the API is null before using it.`
    );
  }
  return api;
}
