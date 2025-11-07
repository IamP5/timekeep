import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/clock/clock.component').then(m => m.ClockComponent)
  }
];
