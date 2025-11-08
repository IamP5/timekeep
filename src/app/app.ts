import { Component, signal, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NotificationService } from './core/services/notification.service';
import { DarkModeService } from './core/services/dark-mode.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  protected readonly title = signal('timekeep');

  // Initialize services
  private notificationService = inject(NotificationService);
  private darkModeService = inject(DarkModeService);

  ngOnInit(): void {
    // Initialize dark mode theme on app startup
    this.darkModeService.initTheme();
  }
}
