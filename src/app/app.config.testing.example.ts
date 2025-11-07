/**
 * Example configuration for testing with shorter work hours
 *
 * This file demonstrates how to override the default work hours configuration
 * for easier testing. You can create different config files for different scenarios.
 *
 * Usage:
 * 1. Copy this file to `app.config.testing.ts`
 * 2. Import it in your main.ts or use it in specific test environments
 * 3. Adjust the values as needed for your testing scenario
 */

import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideServiceWorker } from '@angular/service-worker';
import { WORK_HOURS_CONFIG, WorkHoursConfig } from './core/config/work-hours.config';

/**
 * Testing Scenarios:
 *
 * 1. Quick Test (6 minutes total, notification at 3 minutes):
 *    - targetHours: 0.1
 *    - notificationOffsetHours: 0.05
 *
 * 2. Short Test (30 minutes total, notification at 27 minutes):
 *    - targetHours: 0.5
 *    - notificationOffsetHours: 0.05
 *
 * 3. Medium Test (1 hour total, notification at 55 minutes):
 *    - targetHours: 1
 *    - notificationOffsetHours: 0.0833 (5 minutes)
 *
 * 4. Production (8 hours total, notification at 7.5 hours):
 *    - targetHours: 8
 *    - notificationOffsetHours: 0.5 (30 minutes) - This is the default
 */

// Example 1: Quick testing configuration (6 minutes)
const testingWorkHoursConfig: WorkHoursConfig = {
  targetHours: 0.1, // 6 minutes
  notificationOffsetHours: 0.05 // Notify 3 minutes before target (at 3 minutes)
};

// Example 2: Short testing configuration (30 minutes)
// const testingWorkHoursConfig: WorkHoursConfig = {
//   targetHours: 0.5, // 30 minutes
//   notificationOffsetHours: 0.05 // Notify 3 minutes before target (at 27 minutes)
// };

// Example 3: Medium testing configuration (1 hour)
// const testingWorkHoursConfig: WorkHoursConfig = {
//   targetHours: 1, // 1 hour
//   notificationOffsetHours: 0.0833 // Notify 5 minutes before target (at 55 minutes)
// };

export const appConfigTesting: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    }),
    // Override the default work hours configuration for testing
    {
      provide: WORK_HOURS_CONFIG,
      useValue: testingWorkHoursConfig
    }
  ]
};
