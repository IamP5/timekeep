import { Injectable, signal, computed, effect, inject, afterNextRender } from '@angular/core';
import { LOCAL_STORAGE } from '../tokens/browser.tokens';
import { WORK_HOURS_CONFIG, hoursToMilliseconds, millisecondsToHours } from '../config/work-hours.config';

export interface ClockEntry {
  id: string;
  timestamp: Date;
  type: 'in' | 'out';
}

export interface WorkSession {
  clockIn: Date;
  clockOut?: Date;
  duration: number; // in milliseconds
}

const STORAGE_KEY = 'timekeep_entries';
const LAST_ACCESS_KEY = 'timekeep_last_access';

@Injectable({
  providedIn: 'root'
})
export class TimeTrackingService {
  private readonly localStorage = inject(LOCAL_STORAGE);
  private readonly workHoursConfig = inject(WORK_HOURS_CONFIG);
  private entries = signal<ClockEntry[]>([]);
  private isDataLoaded = false;

  // Computed config values in milliseconds
  private readonly workHoursTarget = computed(() =>
    hoursToMilliseconds(this.workHoursConfig.targetHours)
  );

  private readonly notificationThreshold = computed(() =>
    hoursToMilliseconds(this.workHoursConfig.targetHours - this.workHoursConfig.notificationOffsetHours)
  );

  // Current state signals
  readonly isClockedIn = computed(() => {
    const sorted = this.getSortedEntries();
    return sorted.length > 0 && sorted[sorted.length - 1].type === 'in';
  });

  readonly todayEntries = computed(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.entries().filter(entry => {
      const entryDate = new Date(entry.timestamp);
      entryDate.setHours(0, 0, 0, 0);
      return entryDate.getTime() === today.getTime();
    });
  });

  readonly todaySessions = computed(() => {
    return this.calculateSessions(this.todayEntries());
  });

  readonly todayTotalHours = computed(() => {
    const total = this.todaySessions().reduce((sum, session) => sum + session.duration, 0);
    return millisecondsToHours(total);
  });

  readonly currentSessionDuration = computed(() => {
    if (!this.isClockedIn()) return 0;

    const sorted = this.getSortedEntries();
    const lastEntry = sorted[sorted.length - 1];
    const now = new Date().getTime();
    return now - new Date(lastEntry.timestamp).getTime();
  });

  readonly totalWorkTimeToday = computed(() => {
    const completedTime = this.todaySessions().reduce((sum, session) => sum + session.duration, 0);
    const currentTime = this.isClockedIn() ? this.currentSessionDuration() : 0;
    return completedTime + currentTime;
  });

  readonly hoursUntilTarget = computed(() => {
    const remaining = this.workHoursTarget() - this.totalWorkTimeToday();
    return Math.max(0, millisecondsToHours(remaining));
  });

  readonly shouldNotify = computed(() => {
    return this.isClockedIn() && this.totalWorkTimeToday() >= this.notificationThreshold();
  });

  // Expose target hours for components to use
  readonly targetHours = computed(() => this.workHoursConfig.targetHours);

  constructor() {
    // Load from storage on the client side only
    afterNextRender(() => {
      this.initializeData();
    });

    // Save to localStorage whenever entries change (only in browser and after initial load)
    effect(() => {
      // IMPORTANT: Always read entries() first to establish the dependency
      const currentEntries = this.entries();

      // Only save if we're in browser and data is loaded
      if (this.localStorage && this.isDataLoaded) {
        this.saveToStorage(currentEntries);
      }
    });
  }

  private initializeData(): void {
    if (!this.localStorage) return;

    try {
      // Check if this is a new day
      const lastAccess = this.localStorage.getItem(LAST_ACCESS_KEY);
      const today = this.getTodayDateString();

      if (lastAccess !== today) {
        // New day detected - clean up old entries from previous days
        this.cleanupOldEntries();
        // Update last access date
        this.localStorage.setItem(LAST_ACCESS_KEY, today);
      }

      // Load data from storage
      this.loadFromStorage();
      this.isDataLoaded = true;
    } catch (error) {
      console.error('Error initializing data:', error);
      this.isDataLoaded = true;
    }
  }

  private getTodayDateString(): string {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }

  private cleanupOldEntries(): void {
    if (!this.localStorage) return;

    try {
      const stored = this.localStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const parsed = JSON.parse(stored);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Keep only today's entries
      const todayEntries = parsed.filter((e: any) => {
        const entryDate = new Date(e.timestamp);
        entryDate.setHours(0, 0, 0, 0);
        return entryDate.getTime() === today.getTime();
      });

      // Save cleaned up entries
      this.localStorage.setItem(STORAGE_KEY, JSON.stringify(todayEntries));
    } catch (error) {
      console.error('Error cleaning up old entries:', error);
    }
  }

  clockIn(): void {
    const entry: ClockEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      type: 'in'
    };

    console.log('[TimeKeeping] Clocking in:', entry);
    this.entries.update(entries => [...entries, entry]);
  }

  clockOut(): void {
    if (!this.isClockedIn()) {
      console.warn('Cannot clock out: not currently clocked in');
      return;
    }

    const entry: ClockEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      type: 'out'
    };

    console.log('[TimeKeeping] Clocking out:', entry);
    this.entries.update(entries => [...entries, entry]);
  }

  toggleClock(): void {
    if (this.isClockedIn()) {
      this.clockOut();
    } else {
      this.clockIn();
    }
  }

  private getSortedEntries(): ClockEntry[] {
    return [...this.entries()].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  private calculateSessions(entries: ClockEntry[]): WorkSession[] {
    const sorted = [...entries].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const sessions: WorkSession[] = [];
    let currentSession: Partial<WorkSession> | null = null;

    for (const entry of sorted) {
      if (entry.type === 'in') {
        currentSession = {
          clockIn: new Date(entry.timestamp)
        };
      } else if (entry.type === 'out' && currentSession?.clockIn) {
        const clockOut = new Date(entry.timestamp);
        sessions.push({
          clockIn: currentSession.clockIn,
          clockOut,
          duration: clockOut.getTime() - currentSession.clockIn.getTime()
        });
        currentSession = null;
      }
    }

    return sessions;
  }

  private loadFromStorage(): void {
    if (!this.localStorage) return;

    try {
      const stored = this.localStorage.getItem(STORAGE_KEY);
      console.log('[TimeKeeping] Loading from localStorage, raw data:', stored);

      if (stored) {
        const parsed = JSON.parse(stored);
        // Convert timestamp strings back to Date objects
        const entries = parsed.map((e: any) => ({
          ...e,
          timestamp: new Date(e.timestamp)
        }));
        console.log(`[TimeKeeping] Loaded ${entries.length} entries from localStorage:`, entries);
        this.entries.set(entries);
      } else {
        console.log('[TimeKeeping] No data found in localStorage');
      }
    } catch (error) {
      console.error('Error loading entries from storage:', error);
    }
  }

  private saveToStorage(entries: ClockEntry[]): void {
    if (!this.localStorage) return;

    try {
      const dataToSave = JSON.stringify(entries);
      this.localStorage.setItem(STORAGE_KEY, dataToSave);
      console.log(`[TimeKeeping] Saved ${entries.length} entries to localStorage:`, entries);
    } catch (error) {
      console.error('Error saving entries to storage:', error);
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Helper method to clear all data (useful for testing)
  clearAllData(): void {
    this.entries.set([]);
    if (this.localStorage) {
      this.localStorage.removeItem(STORAGE_KEY);
      this.localStorage.removeItem(LAST_ACCESS_KEY);
    }
  }

  // Manual method to clear old entries (can be called from UI if needed)
  clearOldEntries(): void {
    if (!this.localStorage) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const currentEntries = this.entries();
    const todayEntries = currentEntries.filter(entry => {
      const entryDate = new Date(entry.timestamp);
      entryDate.setHours(0, 0, 0, 0);
      return entryDate.getTime() === today.getTime();
    });

    this.entries.set(todayEntries);
  }
}
