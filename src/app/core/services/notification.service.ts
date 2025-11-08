import { Injectable, effect, inject, afterNextRender } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { WINDOW } from '../tokens/browser.tokens';
import { WORK_HOURS_CONFIG, millisecondsToHours } from '../config/work-hours.config';
import { TimeTrackingService } from './time-tracking.service';

const PERMISSION_STORAGE_KEY = 'timekeep_notification_permission';
const PERMISSION_REQUESTED_KEY = 'timekeep_notification_requested';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly window = inject(WINDOW);
  private readonly swPush = inject(SwPush);
  private readonly timeTracking = inject(TimeTrackingService);
  private readonly workHoursConfig = inject(WORK_HOURS_CONFIG);

  private notificationShown = false;
  private targetReachedNotificationShown = false;
  private checkInterval: any;
  private permissionGranted = false;

  constructor() {
    // Monitor work time and show notification (effect must be in constructor - injection context)
    effect(() => {
      // Only run in browser
      if (!this.window) return;

      const shouldNotify = this.timeTracking.shouldNotify();
      const isClockedIn = this.timeTracking.isClockedIn();
      const hoursWorked = millisecondsToHours(this.timeTracking.totalWorkTimeToday());

      if (shouldNotify && isClockedIn && !this.notificationShown) {
        this.showWorkHoursNotification(hoursWorked);
      }

      // Reset notification flags when clocked out or new day
      if (!isClockedIn) {
        this.notificationShown = false;
        this.targetReachedNotificationShown = false;
      }
    });

    // Initialize notifications only on the client side
    afterNextRender(() => {
      this.initNotifications();
    });
  }

  private async initNotifications(): Promise<void> {
    // Check if notifications are supported
    if (!this.window || !('Notification' in this.window)) {
      return;
    }

    // Detect iOS and PWA mode
    const isIOS = this.isIOS();
    const isStandalone = this.isStandalone();

    // Check stored permission
    const storedPermission = this.getStoredPermission();
    if (storedPermission === 'granted') {
      this.permissionGranted = true;
    }

    // Check current permission without prompting
    const NotificationAPI = this.window.Notification as typeof Notification;

    if (NotificationAPI.permission === 'granted') {
      this.permissionGranted = true;
      this.storePermission('granted');
    }

    // Wait for service worker on iOS PWA
    if (isIOS && isStandalone && 'serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.ready;
      } catch (error) {
        console.error('[Notifications] Service Worker not ready:', error);
      }
    }

    // Start periodic check for work hours
    this.startPeriodicCheck();
  }

  private isIOS(): boolean {
    if (!this.window) return false;
    const userAgent = this.window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(userAgent);
  }

  private isStandalone(): boolean {
    if (!this.window) return false;
    // Check if running as PWA
    return (this.window.navigator as any).standalone === true ||
      this.window.matchMedia('(display-mode: standalone)').matches;
  }

  private getStoredPermission(): string | null {
    if (!this.window) return null;
    return this.window.localStorage.getItem(PERMISSION_STORAGE_KEY);
  }

  private storePermission(permission: string): void {
    if (!this.window) return;
    this.window.localStorage.setItem(PERMISSION_STORAGE_KEY, permission);
  }

  private hasRequestedPermission(): boolean {
    if (!this.window) return false;
    return this.window.localStorage.getItem(PERMISSION_REQUESTED_KEY) === 'true';
  }

  private markPermissionRequested(): void {
    if (!this.window) return;
    this.window.localStorage.setItem(PERMISSION_REQUESTED_KEY, 'true');
  }

  async requestPermission(): Promise<NotificationPermission> {
    if (!this.window || !('Notification' in this.window)) {
      return 'denied';
    }

    const isIOS = this.isIOS();
    const isStandalone = this.isStandalone();

    // For iOS PWA, ensure service worker is ready first
    if (isIOS && isStandalone && 'serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.ready;
      } catch (error) {
        console.error('[Notifications] iOS PWA - Service Worker not ready:', error);
        alert('Please wait for the app to fully load and try again.');
        return 'denied';
      }
    }

    // Access Notification from the global window object
    const NotificationAPI = this.window.Notification as typeof Notification;

    if (NotificationAPI.permission === 'granted') {
      this.permissionGranted = true;
      this.storePermission('granted');
      return 'granted';
    }

    if (NotificationAPI.permission === 'denied') {
      console.warn('[Notifications] ❌ Permission previously denied');
      if (isIOS && !isStandalone) {
        alert('Notifications only work when the app is installed to your home screen. Please add TimeKeep to your home screen and grant permission there.');
      }
      return 'denied';
    }

    try {
      const permission = await NotificationAPI.requestPermission();

      if (permission === 'granted') {
        this.permissionGranted = true;
        this.storePermission('granted');

        // Show a test notification on iOS to confirm it works
        if (isIOS && isStandalone) {
          setTimeout(() => this.showTestNotification(), 500);
        }
      } else {
        this.storePermission(permission);
        console.warn('[Notifications] ❌ Permission not granted:', permission);
      }

      return permission;
    } catch (error) {
      console.error('[Notifications] ❌ Error requesting permission:', error);
      if (isIOS) {
        console.error('[Notifications] iOS Error details:', {
          error,
          isStandalone,
          serviceWorkerReady: navigator.serviceWorker?.controller !== null
        });
      }
      return 'denied';
    }
  }

  private async showTestNotification(): Promise<void> {
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification('TimeKeep', {
          body: 'Notifications are enabled! You\'ll receive work hour alerts.',
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-96x96.png',
          tag: 'test-notification',
          requireInteraction: false
        } as NotificationOptions);
      }
    } catch (error) {
      console.error('[Notifications] Failed to show test notification:', error);
    }
  }

  private async showWorkHoursNotification(hoursWorked: number): Promise<void> {
    if (!this.permissionGranted) {
      console.warn('[Notifications] Permission not granted, cannot show notification');
      return;
    }

    const targetHours = this.workHoursConfig.targetHours;
    const hoursRemaining = targetHours - hoursWorked;
    const minutesRemaining = Math.round(hoursRemaining * 60);
    const secondsRemaining = Math.round(hoursRemaining * 3600);

    const timeText = secondsRemaining < 60
      ? `${secondsRemaining} seconds`
      : `${minutesRemaining} minutes`;

    try {
      // Try to use Service Worker notification first (better for PWA)
      if (this.swPush.isEnabled && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification('TimeKeep - Work Hours Alert', {
          body: `You've worked ${timeText}. Almost at your ${targetHours.toFixed(2)} hours target!`,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-96x96.png',
          tag: 'work-hours-alert',
          requireInteraction: false,
          silent: false,
          data: { url: '/' }
        } as NotificationOptions);
      } else {
        // Fallback to regular notification
        if (!this.window || !('Notification' in this.window)) return;

        const NotificationAPI = this.window.Notification as typeof Notification;
        const notification = new NotificationAPI('TimeKeep - Work Hours Alert', {
          body: `You've worked ${timeText}. Almost at your ${targetHours.toFixed(2)} hours target!`,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-96x96.png',
          tag: 'work-hours-alert',
          requireInteraction: false,
          silent: false
        });

        notification.onclick = () => {
          this.window?.focus();
          notification.close();
        };
      }

      this.notificationShown = true;
    } catch (error) {
      console.error('[Notifications] Error showing notification:', error);
    }
  }

  async showClockInNotification(): Promise<void> {
    // Request permission on user interaction (clock in)
    const permission = await this.requestPermission();

    if (permission !== 'granted') {
      console.warn('[Notifications] Permission not granted for clock in notification');
      return;
    }

    try {
      if (this.swPush.isEnabled && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification('TimeKeep', {
          body: 'Clocked in successfully! Have a productive day.',
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-96x96.png',
          tag: 'clock-in',
          requireInteraction: false,
          data: { url: '/' }
        } as NotificationOptions);
      } else if (this.window && 'Notification' in this.window) {
        const NotificationAPI = this.window.Notification as typeof Notification;
        new NotificationAPI('TimeKeep', {
          body: 'Clocked in successfully! Have a productive day.',
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-96x96.png',
          tag: 'clock-in',
          requireInteraction: false
        });
      }
    } catch (error) {
      console.error('[Notifications] Error showing clock in notification:', error);
    }
  }

  async showClockOutNotification(hoursWorked: number): Promise<void> {
    if (!this.permissionGranted) return;

    try {
      const hours = hoursWorked.toFixed(2);
      if (this.swPush.isEnabled && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification('TimeKeep', {
          body: `Clocked out! You worked ${hours} hours today.`,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-96x96.png',
          tag: 'clock-out',
          requireInteraction: false,
          data: { url: '/' }
        } as NotificationOptions);
      } else if (this.window && 'Notification' in this.window) {
        const NotificationAPI = this.window.Notification as typeof Notification;
        new NotificationAPI('TimeKeep', {
          body: `Clocked out! You worked ${hours} hours today.`,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-96x96.png',
          tag: 'clock-out',
          requireInteraction: false
        });
      }
    } catch (error) {
      console.error('[Notifications] Error showing clock out notification:', error);
    }

    // Reset the notification flags for the next session
    this.notificationShown = false;
    this.targetReachedNotificationShown = false;
  }

  private startPeriodicCheck(): void {
    // Check every 5 seconds for better responsiveness during testing
    this.checkInterval = setInterval(() => {
      const isClockedIn = this.timeTracking.isClockedIn();

      // Calculate time directly to get real-time updates
      const completedTime = this.timeTracking.todaySessions().reduce((sum, session) => sum + session.duration, 0);
      const currentSessionTime = isClockedIn ? this.calculateCurrentSessionDuration() : 0;
      const totalMilliseconds = completedTime + currentSessionTime;
      const hoursWorked = millisecondsToHours(totalMilliseconds);

      const targetHours = this.workHoursConfig.targetHours;
      const notificationThreshold = targetHours - this.workHoursConfig.notificationOffsetHours;

      // Send notification at threshold if not already sent
      if (isClockedIn && hoursWorked >= notificationThreshold && !this.notificationShown) {
        this.showWorkHoursNotification(hoursWorked);
      }

      // Send another notification at target hours if still working
      if (isClockedIn && hoursWorked >= targetHours && this.notificationShown && !this.targetReachedNotificationShown) {
        this.showTargetReachedNotification();
        this.targetReachedNotificationShown = true;
      }
    }, 5 * 1000); // Check every 5 seconds for testing
  }

  private calculateCurrentSessionDuration(): number {
    const entries = this.timeTracking.todayEntries();
    if (entries.length === 0) return 0;

    const sorted = [...entries].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const lastEntry = sorted[sorted.length - 1];
    if (lastEntry.type !== 'in') return 0;

    const now = new Date().getTime();
    return now - new Date(lastEntry.timestamp).getTime();
  }

  private async showTargetReachedNotification(): Promise<void> {
    if (!this.permissionGranted) return;

    const targetHours = this.workHoursConfig.targetHours;

    try {
      if (this.swPush.isEnabled && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(`TimeKeep - ${targetHours} Hours Reached!`, {
          body: `You've completed your ${targetHours}-hour workday! Don't forget to clock out.`,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-96x96.png',
          tag: 'target-reached',
          requireInteraction: true,
          data: { url: '/' }
        } as NotificationOptions);
      } else if (this.window && 'Notification' in this.window) {
        const NotificationAPI = this.window.Notification as typeof Notification;
        new NotificationAPI(`TimeKeep - ${targetHours} Hours Reached!`, {
          body: `You've completed your ${targetHours}-hour workday! Don't forget to clock out.`,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-96x96.png',
          tag: 'target-reached',
          requireInteraction: true
        });
      }
    } catch (error) {
      console.error('[Notifications] Error showing target reached notification:', error);
    }
  }

  ngOnDestroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }
}
