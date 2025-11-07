import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  isDevMode,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideServiceWorker } from '@angular/service-worker';
import { WORK_HOURS_CONFIG, WorkHoursConfig } from './core/config/work-hours.config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
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
