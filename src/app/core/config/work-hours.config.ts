import { InjectionToken } from '@angular/core';

/**
 * Configuration interface for work hours settings
 */
export interface WorkHoursConfig {
  /**
   * Target work hours per day (in hours)
   * @default 8
   */
  targetHours: number;

  /**
   * Hours before target to show notification (in hours)
   * @default 0.5 (30 minutes before target)
   */
  notificationOffsetHours: number;
}

/**
 * Default work hours configuration
 */
export const DEFAULT_WORK_HOURS_CONFIG: WorkHoursConfig = {
  targetHours: 8,
  notificationOffsetHours: 0.5
};

/**
 * Injection token for work hours configuration
 *
 * @example
 * // In your app.config.ts or specific environment config
 * ```typescript
 * import { WORK_HOURS_CONFIG, WorkHoursConfig } from './core/config/work-hours.config';
 *
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     // Override default work hours for testing
 *     {
 *       provide: WORK_HOURS_CONFIG,
 *       useValue: {
 *         targetHours: 0.1, // 6 minutes for quick testing
 *         notificationOffsetHours: 0.05 // 3 minutes before target
 *       } as WorkHoursConfig
 *     }
 *   ]
 * };
 * ```
 */
export const WORK_HOURS_CONFIG = new InjectionToken<WorkHoursConfig>(
  'WorkHoursConfig',
  {
    providedIn: 'root',
    factory: () => DEFAULT_WORK_HOURS_CONFIG
  }
);

/**
 * Helper function to convert hours to milliseconds
 */
export function hoursToMilliseconds(hours: number): number {
  return hours * 60 * 60 * 1000;
}

/**
 * Helper function to convert milliseconds to hours
 */
export function millisecondsToHours(milliseconds: number): number {
  return milliseconds / (1000 * 60 * 60);
}
