import { Injectable, inject, signal, effect } from '@angular/core';
import { WINDOW } from '../tokens/browser.tokens';

type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'timekeep_theme';

@Injectable({
  providedIn: 'root'
})
export class DarkModeService {
  private readonly window = inject(WINDOW);

  // Signal to track current theme
  private readonly currentTheme = signal<Theme>('light');

  constructor() {
    // Apply theme whenever it changes
    effect(() => {
      this.applyTheme(this.currentTheme());
    });
  }

  /**
   * Initialize theme based on saved preference or system settings
   * Should be called on app startup
   */
  initTheme(): void {
    if (!this.window) return;

    // Check for saved theme preference
    const savedTheme = this.getSavedTheme();

    if (savedTheme) {
      this.currentTheme.set(savedTheme);
    } else {
      // Fall back to system preference
      const prefersDark = this.window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.currentTheme.set(prefersDark ? 'dark' : 'light');
    }

    // Listen for system theme changes
    this.window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      // Only apply system preference if user hasn't set a manual preference
      if (!this.getSavedTheme()) {
        this.currentTheme.set(e.matches ? 'dark' : 'light');
      }
    });
  }

  /**
   * Toggle between light and dark themes
   */
  toggleTheme(): void {
    const newTheme: Theme = this.currentTheme() === 'light' ? 'dark' : 'light';
    this.currentTheme.set(newTheme);
    this.saveTheme(newTheme);
  }

  /**
   * Get the current theme
   */
  getCurrentTheme(): Theme {
    return this.currentTheme();
  }

  /**
   * Check if dark mode is currently active
   */
  isDarkMode(): boolean {
    return this.currentTheme() === 'dark';
  }

  /**
   * Apply theme by toggling the .dark class on the root HTML element
   */
  private applyTheme(theme: Theme): void {
    if (!this.window?.document) return;

    const htmlElement = this.window.document.documentElement;

    if (theme === 'dark') {
      htmlElement.classList.add('dark');
    } else {
      htmlElement.classList.remove('dark');
    }
  }

  /**
   * Save theme preference to localStorage
   */
  private saveTheme(theme: Theme): void {
    if (!this.window?.localStorage) return;
    this.window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }

  /**
   * Get saved theme preference from localStorage
   */
  private getSavedTheme(): Theme | null {
    if (!this.window?.localStorage) return null;
    const saved = this.window.localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : null;
  }
}
