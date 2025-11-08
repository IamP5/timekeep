import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  isDevMode,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling, withViewTransitions } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay, withI18nSupport, withIncrementalHydration } from '@angular/platform-browser';
import { provideServiceWorker } from '@angular/service-worker';
import { WORK_HOURS_CONFIG, WorkHoursConfig } from './core/config/work-hours.config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // Enhanced router with view transitions and scroll restoration
    provideRouter(
      routes,
      withViewTransitions(),
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled'
      })
    ),
    // Enhanced hydration with event replay and i18n support
    // Note: Incremental hydration is automatically enabled with defer blocks in Angular 20+
    provideClientHydration(
      withIncrementalHydration(),
      withEventReplay(),
      withI18nSupport()
    ),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    {
      provide: WORK_HOURS_CONFIG,
      useValue: {
        targetHours: 1 / 60,    // 1 minute total (0.01667 hours)
        notificationOffsetHours: 0.5 / 60  // Notify 30 seconds before (at 30 seconds worked = 0.00833 hours)
      } satisfies WorkHoursConfig
    },
  ],
};
