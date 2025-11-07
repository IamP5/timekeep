# Testing Guide

## Work Hours Configuration

The application now supports configurable work hours, making it easier to test the time tracking and notification features without waiting for actual hours to pass.

### Quick Start for Testing

To test with shorter work hours:

1. **Copy the example configuration**:
   ```bash
   cp src/app/app.config.testing.example.ts src/app/app.config.testing.ts
   ```

2. **Update your `main.ts`** to use the testing config:
   ```typescript
   import { appConfigTesting } from './app/app.config.testing';

   bootstrapApplication(AppComponent, appConfigTesting);
   ```

3. **Choose a testing scenario** by uncommenting the desired configuration in `app.config.testing.ts`

### Available Testing Scenarios

#### 1. Quick Test (6 minutes)
Perfect for rapid testing of the complete workflow.

```typescript
{
  targetHours: 0.1,              // 6 minutes total
  notificationOffsetHours: 0.05  // Notify at 3 minutes
}
```

**Timeline**:
- Clock in at 00:00
- First notification at 03:00
- Target reached notification at 06:00

#### 2. Short Test (30 minutes)
Good for testing with a bit more time between events.

```typescript
{
  targetHours: 0.5,              // 30 minutes total
  notificationOffsetHours: 0.05  // Notify at 27 minutes
}
```

**Timeline**:
- Clock in at 00:00
- First notification at 27:00
- Target reached notification at 30:00

#### 3. Medium Test (1 hour)
Useful for testing longer sessions without full production time.

```typescript
{
  targetHours: 1,                // 1 hour total
  notificationOffsetHours: 0.0833 // Notify at 55 minutes (5 min before)
}
```

**Timeline**:
- Clock in at 00:00
- First notification at 55:00
- Target reached notification at 01:00:00

#### 4. Production (Default)
The actual production configuration.

```typescript
{
  targetHours: 8,                // 8 hours total
  notificationOffsetHours: 0.5   // Notify at 7.5 hours (30 min before)
}
```

**Timeline**:
- Clock in at 09:00
- First notification at 16:30
- Target reached notification at 17:00

### Configuration in Different Environments

You can also create environment-specific configurations:

#### Development Environment
Create `src/app/app.config.development.ts`:

```typescript
import { WORK_HOURS_CONFIG } from './core/config/work-hours.config';

export const appConfigDevelopment: ApplicationConfig = {
  providers: [
    // ... other providers
    {
      provide: WORK_HOURS_CONFIG,
      useValue: {
        targetHours: 0.1,
        notificationOffsetHours: 0.05
      }
    }
  ]
};
```

#### Testing Component Features

If you need to test specific scenarios in your components or tests:

```typescript
import { TestBed } from '@angular/core/testing';
import { WORK_HOURS_CONFIG } from './core/config/work-hours.config';

TestBed.configureTestingModule({
  providers: [
    {
      provide: WORK_HOURS_CONFIG,
      useValue: {
        targetHours: 0.01,  // 36 seconds for very quick tests
        notificationOffsetHours: 0.005  // Notify at 18 seconds
      }
    }
  ]
});
```

### Helper Functions

The configuration module also exports helper functions:

```typescript
import { hoursToMilliseconds, millisecondsToHours } from './core/config/work-hours.config';

// Convert 30 minutes to milliseconds
const thirtyMinutesMs = hoursToMilliseconds(0.5); // 1800000

// Convert milliseconds back to hours
const hours = millisecondsToHours(1800000); // 0.5
```

### Time Conversion Reference

For quick reference when configuring test times:

| Hours | Minutes | Decimal Hours | Milliseconds |
|-------|---------|---------------|--------------|
| 36 sec | 0.6 min | 0.01 | 36,000 |
| 6 min | 6 min | 0.1 | 360,000 |
| 15 min | 15 min | 0.25 | 900,000 |
| 30 min | 30 min | 0.5 | 1,800,000 |
| 1 hour | 60 min | 1.0 | 3,600,000 |
| 4 hours | 240 min | 4.0 | 14,400,000 |
| 8 hours | 480 min | 8.0 | 28,800,000 |

### Testing Notifications

To test notifications:

1. Grant notification permissions in your browser
2. Clock in to start tracking
3. Keep the browser tab open (or use the service worker for background notifications)
4. Wait for the configured notification threshold
5. Verify the notification shows the correct target hours

### Resetting for New Tests

To reset the application state:

1. Clear localStorage in browser DevTools:
   ```javascript
   localStorage.clear();
   ```

2. Or use the service method (if exposed in development):
   ```typescript
   timeTrackingService.clearAllData();
   ```

3. Refresh the page

### Tips for Testing

1. **Browser DevTools Console**: Check the console for any warnings or errors related to notifications
2. **Network Tab**: Monitor if service worker is properly registered
3. **Application Tab**: Check localStorage to see stored clock entries
4. **Notification Permissions**: Ensure notifications are allowed for thorough testing

### Switching Back to Production

To switch back to production configuration:

1. Revert `main.ts` to use the default `appConfig` (or remove the testing config override)
2. Clear localStorage to remove test data
3. Rebuild the application

```typescript
// main.ts (production)
import { appConfig } from './app/app.config';

bootstrapApplication(AppComponent, appConfig);
```
