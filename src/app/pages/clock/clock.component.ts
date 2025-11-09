import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SwPush } from '@angular/service-worker';
import { TimeTrackingService } from '@app/core/services/time-tracking.service';
import { NotificationService } from '@app/core/services/notification.service';
import { DarkModeService } from '@app/core/services/dark-mode.service';
import { hoursToMilliseconds, millisecondsToHours } from '@app/core/config/work-hours.config';
import { ZardCardComponent } from '@shared/components/card/card.component';
import { ZardIconComponent } from '@shared/components/icon/icon.component';
import { ZardSkeletonComponent } from '@shared/components/skeleton/skeleton.component';
import { ZardLoaderComponent } from '@shared/components/loader/loader.component';
import { ZardAlertDialogService } from '@shared/components/alert-dialog/alert-dialog.service';
import { WINDOW } from '@app/core/tokens/browser.tokens';

@Component({
  selector: 'app-clock',
  imports: [
    CommonModule,
    ZardCardComponent,
    ZardIconComponent,
    ZardSkeletonComponent,
    ZardLoaderComponent
  ],
  templateUrl: './clock.component.html',
  styleUrl: './clock.component.css'
})
export class ClockComponent {
  private readonly window = inject(WINDOW);
  private readonly swPush = inject(SwPush);
  private timeTracking = inject(TimeTrackingService);
  private notificationService = inject(NotificationService);
  private darkModeService = inject(DarkModeService);
  private alertDialogService = inject(ZardAlertDialogService);

  currentTime = signal(new Date());
  private timeInterval: any;

  readonly isClockedIn = this.timeTracking.isClockedIn;
  readonly todaySessions = this.timeTracking.todaySessions;
  readonly todayEntries = this.timeTracking.todayEntries;
  readonly targetHours = this.timeTracking.targetHours;

  // Make currentSessionDuration reactive to currentTime for live updates
  readonly currentSessionDuration = computed(() => {
    // Reference currentTime to make this reactive
    this.currentTime();

    if (!this.isClockedIn()) return 0;

    const entries = this.todayEntries();
    const sorted = [...entries].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    if (sorted.length === 0) return 0;

    const lastEntry = sorted[sorted.length - 1];
    const now = new Date().getTime();
    return now - new Date(lastEntry.timestamp).getTime();
  });

  // Calculate total work time reactively
  readonly totalWorkTimeToday = computed(() => {
    // Reference currentTime to make this reactive
    this.currentTime();

    const completedTime = this.timeTracking.todaySessions().reduce((sum, session) => sum + session.duration, 0);
    const currentTime = this.isClockedIn() ? this.currentSessionDuration() : 0;
    return completedTime + currentTime;
  });

  readonly formattedTotalHours = computed(() => {
    return this.formatDuration(this.totalWorkTimeToday());
  });

  readonly formattedCurrentSession = computed(() => {
    return this.formatDuration(this.currentSessionDuration());
  });

  readonly progressPercentage = computed(() => {
    const total = this.totalWorkTimeToday();
    const target = hoursToMilliseconds(this.targetHours());
    return Math.min((total / target) * 100, 100);
  });

  readonly hoursUntilTarget = computed(() => {
    const target = hoursToMilliseconds(this.targetHours());
    const remaining = target - this.totalWorkTimeToday();
    return Math.max(0, millisecondsToHours(remaining));
  });

  readonly statusMessage = computed(() => {
    if (this.isClockedIn()) {
      const remaining = this.hoursUntilTarget();
      const targetHours = this.targetHours();
      if (remaining <= 0) {
        return `You've reached your ${targetHours}-hour target! 🎉`;
      }
      const hours = Math.floor(remaining);
      const minutes = Math.round((remaining - hours) * 60);
      return `${hours}h ${minutes}m until target`;
    }
    return 'Ready to start tracking';
  });

  readonly showNotificationButton = signal(false);

  constructor() {
    // Update current time every second
    this.timeInterval = setInterval(() => {
      this.currentTime.set(new Date());
    }, 1000);

    // Note: Notification permission is now requested on first clock in (user interaction)
    // This is required for iOS PWA compatibility

    // Show notification button for manual permission request (helpful for iOS)
    // Check if push notifications are supported and permission hasn't been granted yet
    if (this.swPush.isEnabled) {
      const permissionState = this.notificationService.getPermissionState();
      if (permissionState === 'default') {
        this.showNotificationButton.set(true);
      }
    }
  }

  async onRequestNotifications(): Promise<void> {
    const permission = await this.notificationService.requestPermission();
    if (permission === 'granted') {
      this.showNotificationButton.set(false);
    }
  }

  onToggleTheme(): void {
    this.darkModeService.toggleTheme();
  }

  isDarkMode(): boolean {
    return this.darkModeService.isDarkMode();
  }

  onResetToday(): void {
    const dialogRef = this.alertDialogService.confirm({
      zTitle: 'Reset Today\'s Data',
      zDescription: 'Are you sure you want to reset all time tracking data for today? This action cannot be undone.',
      zOkText: 'Reset',
      zCancelText: 'Cancel',
      zOkDestructive: true,
      zIcon: 'triangle-alert',
      zOnOk: () => {
        this.timeTracking.resetTodayData();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.timeInterval) {
      clearInterval(this.timeInterval);
    }
  }

  async onToggleClock(): Promise<void> {
    const wasClockedIn = this.isClockedIn();

    // If clocking in for the first time, request permission first
    if (!wasClockedIn) {
      const permission = await this.notificationService.requestPermission();

      // Hide the manual notification button if permission was granted
      if (permission === 'granted') {
        this.showNotificationButton.set(false);
      }

      // Now toggle the clock after permission is handled
      this.timeTracking.toggleClock();

      // Show clock in notification
      await this.notificationService.showClockInNotification();
    } else {
      // Clocking out - toggle immediately
      this.timeTracking.toggleClock();

      // Show clock out notification
      await this.notificationService.showClockOutNotification(
        millisecondsToHours(this.timeTracking.totalWorkTimeToday())
      );
    }
  }

  formatDuration(ms: number): string {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}
