import { Injectable, effect, inject, afterNextRender } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SwPush } from '@angular/service-worker';
import { WINDOW } from '../tokens/browser.tokens';
import { WORK_HOURS_CONFIG, millisecondsToHours } from '../config/work-hours.config';
import { TimeTrackingService } from './time-tracking.service';
import { environment } from '../../../environments/environment';
import { firstValueFrom } from 'rxjs';

const PERMISSION_STORAGE_KEY = 'timekeep_notification_permission';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly window = inject(WINDOW);
  private readonly swPush = inject(SwPush);
  private readonly http = inject(HttpClient);
  private readonly timeTracking = inject(TimeTrackingService);
  private readonly workHoursConfig = inject(WORK_HOURS_CONFIG);

  private notificationShown = false;
  private targetReachedNotificationShown = false;
  private checkInterval: any;
  private permissionGranted = false;
  private readonly vapidPublicKey = environment.vapidPublicKey;

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
    // Check if push notifications are supported via SwPush
    if (!this.swPush.isEnabled) {
      console.warn('[Notifications] Push notifications not supported');
      return;
    }

    // Check stored permission
    const storedPermission = this.getStoredPermission();
    if (storedPermission === 'granted') {
      this.permissionGranted = true;
    }

    // Check current permission without prompting
    const currentPermission = this.getPermissionState();
    if (currentPermission === 'granted') {
      this.permissionGranted = true;
      this.storePermission('granted');
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

  /* Get current notification permission state */
  getPermissionState(): NotificationPermission {
    if (!this.swPush.isEnabled) return 'denied';
    if (!this.window || !('Notification' in this.window)) return 'denied';

    const NotificationAPI = this.window.Notification as typeof Notification;
    return NotificationAPI.permission;
  }

  async requestPermission(): Promise<NotificationPermission> {
    // Check if push notifications are supported
    if (!this.swPush.isEnabled) {
      console.warn('[Notifications] ❌ Push notifications not supported');
      return 'denied';
    }

    if (!this.window || !('Notification' in this.window)) {
      return 'denied';
    }

    const isIOS = this.isIOS();
    const isStandalone = this.isStandalone();

    // Check current permission state
    const currentPermission = this.getPermissionState();

    if (currentPermission === 'granted') {
      this.permissionGranted = true;
      this.storePermission('granted');
      /* Subscribe to push notifications with VAPID */
      await this.subscribeToPushNotifications();
      return 'granted';
    }

    if (currentPermission === 'denied') {
      console.warn('[Notifications] ❌ Permission previously denied');
      if (isIOS && !isStandalone) {
        alert('Notifications only work when the app is installed to your home screen. Please add TimeKeep to your home screen and grant permission there.');
      }
      return 'denied';
    }

    try {
      // Access Notification from the global window object to request permission
      const NotificationAPI = this.window.Notification as typeof Notification;
      const permission = await NotificationAPI.requestPermission();

      if (permission === 'granted') {
        this.permissionGranted = true;
        this.storePermission('granted');

        /* Subscribe to push notifications with VAPID */
        await this.subscribeToPushNotifications();

        // Show a test notification on iOS to confirm it works
        if (isIOS && isStandalone) {
          setTimeout(() => this.sendTestNotification(), 500);
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
          pushEnabled: this.swPush.isEnabled
        });
      }
      return 'denied';
    }
  }

  /* Subscribe to Web Push Notifications using VAPID */
  async subscribeToPushNotifications(): Promise<void> {
    try {
      const subscription = await this.swPush.requestSubscription({
        serverPublicKey: this.vapidPublicKey
      });

      /* Send subscription to backend API */
      await firstValueFrom(this.http.post('/api/push-subscriptions', subscription));

      console.log('[Push Notifications] ✓ Successfully subscribed to push notifications');

      /* Listen for push notification messages */
      this.swPush.messages.subscribe((message) => {
        console.log('[Push Notifications] Received message:', message);
      });

      /* Listen for notification clicks */
      this.swPush.notificationClicks.subscribe(({ action, notification }) => {
        console.log('[Push Notifications] Notification clicked:', action, notification);
        // Navigate to the app when notification is clicked
        if (this.window) {
          this.window.focus();
        }
      });
    } catch (error) {
      console.error('[Push Notifications] ❌ Failed to subscribe:', error);
    }
  }

  /* Send a push notification via the server API */
  private async sendPushNotification(title: string, body: string, data?: any): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/send-push-notification', {
        title,
        body,
        icon: '/icons/icon-192x192.png',
        data: data || { url: '/' }
      }));

      console.log('[Push Notifications] ✓ Notification sent via server');
    } catch (error) {
      console.error('[Push Notifications] ❌ Failed to send notification via server:', error);
      throw error;
    }
  }

  /* Send a test notification via server to confirm setup */
  private async sendTestNotification(): Promise<void> {
    try {
      await this.sendPushNotification(
        'TimeKeep',
        'Notifications are enabled! You\'ll receive work hour alerts.',
        { url: '/' }
      );
      console.log('[Notifications] ✓ Test notification sent');
    } catch (error) {
      console.error('[Notifications] ❌ Failed to send test notification:', error);
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
      // Send notification via server-side push API
      await this.sendPushNotification(
        'TimeKeep - Work Hours Alert',
        `You've worked ${timeText}. Almost at your ${targetHours.toFixed(2)} hours target!`,
        { url: '/' }
      );

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
      // Send notification via server-side push API
      await this.sendPushNotification(
        'TimeKeep',
        'Clocked in successfully! Have a productive day.',
        { url: '/' }
      );
    } catch (error) {
      console.error('[Notifications] Error showing clock in notification:', error);
    }
  }

  async showClockOutNotification(hoursWorked: number): Promise<void> {
    if (!this.permissionGranted) return;

    try {
      const hours = hoursWorked.toFixed(2);
      // Send notification via server-side push API
      await this.sendPushNotification(
        'TimeKeep',
        `Clocked out! You worked ${hours} hours today.`,
        { url: '/' }
      );
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
      // Send notification via server-side push API
      await this.sendPushNotification(
        `TimeKeep - ${targetHours} Hours Reached!`,
        `You've completed your ${targetHours}-hour workday! Don't forget to clock out.`,
        { url: '/' }
      );
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
