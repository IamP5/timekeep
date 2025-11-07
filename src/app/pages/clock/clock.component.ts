import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimeTrackingService } from '@app/core/services/time-tracking.service';
import { NotificationService } from '@app/core/services/notification.service';
import { hoursToMilliseconds, millisecondsToHours } from '@app/core/config/work-hours.config';
import { ZardCardComponent } from '@shared/components/card/card.component';
import { ZardIconComponent } from '@shared/components/icon/icon.component';

@Component({
  selector: 'app-clock',
  imports: [
    CommonModule,
    ZardCardComponent,
    ZardIconComponent
  ],
  templateUrl: './clock.component.html',
  styleUrls: ['./clock.component.scss']
})
export class ClockComponent {
  private timeTracking = inject(TimeTrackingService);
  private notificationService = inject(NotificationService);

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

  constructor() {
    // Update current time every second
    this.timeInterval = setInterval(() => {
      this.currentTime.set(new Date());
    }, 1000);

    // Request notification permission on component init
    this.notificationService.requestPermission();
  }

  ngOnDestroy(): void {
    if (this.timeInterval) {
      clearInterval(this.timeInterval);
    }
  }

  async onToggleClock(): Promise<void> {
    const wasClockedIn = this.isClockedIn();

    this.timeTracking.toggleClock();

    // Show notifications
    if (wasClockedIn) {
      await this.notificationService.showClockOutNotification(
        millisecondsToHours(this.timeTracking.totalWorkTimeToday())
      );
    } else {
      await this.notificationService.showClockInNotification();
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
