import { Injectable, effect, inject, afterNextRender } from '@angular/core';
import { WINDOW } from '../tokens/browser.tokens';
import { WORK_HOURS_CONFIG, millisecondsToHours } from '../config/work-hours.config';
import { TimeTrackingService } from './time-tracking.service';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly window = inject(WINDOW);
  private readonly timeTracking = inject(TimeTrackingService);
  private readonly workHoursConfig = inject(WORK_HOURS_CONFIG);

  private notificationShown = false;
  private targetReachedNotificationShown = false;
  private checkInterval: any;

  constructor() {
    // Monitor work time and show notification (effect must be in constructor - injection context)
    effect(() => {
      // Only run in browser
      if (!this.window) return;

      const shouldNotify = this.timeTracking.shouldNotify();
      const isClockedIn = this.timeTracking.isClockedIn();
      const hoursWorked = millisecondsToHours(this.timeTracking.totalWorkTimeToday());
      const targetHours = this.workHoursConfig.targetHours;
      const notificationThreshold = targetHours - this.workHoursConfig.notificationOffsetHours;

      console.log('[Notifications] Effect triggered:', {
        shouldNotify,
        isClockedIn,
        hoursWorked: hoursWorked.toFixed(4),
        notificationThreshold: notificationThreshold.toFixed(4),
        targetHours: targetHours.toFixed(4),
        notificationShown: this.notificationShown
      });

      if (shouldNotify && isClockedIn && !this.notificationShown) {
        console.log('[Notifications] Triggering work hours notification');
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
      console.warn('[Notifications] This browser does not support notifications');
      return;
    }

    console.log('[Notifications] Initializing notification system');

    // Request permission immediately
    const permission = await this.requestPermission();
    console.log('[Notifications] Permission status:', permission);

    // Start periodic check for work hours
    this.startPeriodicCheck();
  }

  async requestPermission(): Promise<NotificationPermission> {
    if (!this.window || !('Notification' in this.window)) {
      console.log('[Notifications] Window or Notification API not available');
      return 'denied';
    }

    // Access Notification from the global window object
    const NotificationAPI = this.window.Notification as typeof Notification;

    console.log('[Notifications] Current permission:', NotificationAPI.permission);

    if (NotificationAPI.permission === 'granted') {
      return 'granted';
    }

    if (NotificationAPI.permission !== 'denied') {
      console.log('[Notifications] Requesting permission...');
      const permission = await NotificationAPI.requestPermission();
      console.log('[Notifications] Permission result:', permission);
      return permission;
    }

    return NotificationAPI.permission;
  }

  private async showWorkHoursNotification(hoursWorked: number): Promise<void> {
    if (!this.window || !('Notification' in this.window)) {
      console.log('[Notifications] Cannot show notification - no window or Notification API');
      return;
    }

    const permission = await this.requestPermission();

    if (permission !== 'granted') {
      console.warn('[Notifications] Notification permission not granted:', permission);
      return;
    }

    const targetHours = this.workHoursConfig.targetHours;
    const hoursRemaining = targetHours - hoursWorked;
    const minutesRemaining = Math.round(hoursRemaining * 60);
    const secondsRemaining = Math.round(hoursRemaining * 3600);

    console.log('[Notifications] Showing work hours notification:', {
      hoursWorked,
      targetHours,
      hoursRemaining,
      minutesRemaining,
      secondsRemaining
    });

    const NotificationAPI = this.window.Notification as typeof Notification;
    const notification = new NotificationAPI('TimeKeep - Work Hours Alert', {
      body: `You've worked ${secondsRemaining < 60 ? secondsRemaining + ' seconds' : minutesRemaining + ' minutes'}. ${secondsRemaining < 60 ? secondsRemaining : minutesRemaining} ${secondsRemaining < 60 ? 'seconds' : 'minutes'} until you reach ${targetHours.toFixed(2)} hours target!`,
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

    this.notificationShown = true;
    console.log('[Notifications] Notification shown successfully');
  }

  async showClockInNotification(): Promise<void> {
    if (!this.window || !('Notification' in this.window)) return;

    const permission = await this.requestPermission();

    if (permission !== 'granted') return;

    const NotificationAPI = this.window.Notification as typeof Notification;
    new NotificationAPI('TimeKeep', {
      body: 'Clocked in successfully! Have a productive day.',
      icon: '/icons/icon-192x192.png',
      tag: 'clock-in',
      requireInteraction: false
    });
  }

  async showClockOutNotification(hoursWorked: number): Promise<void> {
    if (!this.window || !('Notification' in this.window)) return;

    const permission = await this.requestPermission();

    if (permission !== 'granted') return;

    const NotificationAPI = this.window.Notification as typeof Notification;
    new NotificationAPI('TimeKeep', {
      body: `Clocked out! You worked ${hoursWorked.toFixed(2)} hours today.`,
      icon: '/icons/icon-192x192.png',
      tag: 'clock-out',
      requireInteraction: false
    });

    // Reset the notification flags for the next session
    this.notificationShown = false;
    this.targetReachedNotificationShown = false;
  }

  private startPeriodicCheck(): void {
    console.log('[Notifications] Starting periodic check (every 5 seconds)');

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

      console.log('[Notifications] Periodic check:', {
        isClockedIn,
        completedTime: completedTime,
        currentSessionTime: currentSessionTime,
        totalMilliseconds: totalMilliseconds,
        hoursWorked: hoursWorked.toFixed(4),
        notificationThreshold: notificationThreshold.toFixed(4),
        targetHours: targetHours.toFixed(4),
        notificationShown: this.notificationShown,
        targetReachedNotificationShown: this.targetReachedNotificationShown
      });

      // Send notification at threshold if not already sent
      if (isClockedIn && hoursWorked >= notificationThreshold && !this.notificationShown) {
        console.log('[Notifications] Periodic check triggering work hours notification');
        this.showWorkHoursNotification(hoursWorked);
      }

      // Send another notification at target hours if still working
      if (isClockedIn && hoursWorked >= targetHours && this.notificationShown && !this.targetReachedNotificationShown) {
        console.log('[Notifications] Periodic check triggering target reached notification');
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
    if (!this.window || !('Notification' in this.window)) return;

    const permission = await this.requestPermission();

    if (permission !== 'granted') return;

    const targetHours = this.workHoursConfig.targetHours;
    const NotificationAPI = this.window.Notification as typeof Notification;
    new NotificationAPI(`TimeKeep - ${targetHours} Hours Reached!`, {
      body: `You've completed your ${targetHours}-hour workday! Don't forget to clock out.`,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      tag: 'target-reached',
      requireInteraction: true
    });
  }

  ngOnDestroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }
}
