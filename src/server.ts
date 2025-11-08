import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import compression from 'compression';
import webpush from 'web-push';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

/* Load VAPID configuration from environment variables */
const vapidPublicKey = process.env['VAPID_PUBLIC_KEY'];
const vapidPrivateKey = process.env['VAPID_PRIVATE_KEY'];
const vapidEmail = process.env['VAPID_EMAIL'];

if (vapidPublicKey && vapidPrivateKey && vapidEmail) {
  webpush.setVapidDetails(
    vapidEmail,
    vapidPublicKey,
    vapidPrivateKey
  );
  console.log('[Push Notifications] ✓ VAPID keys configured successfully from environment');
} else {
  console.warn('[Push Notifications] ⚠️ VAPID configuration missing from environment variables');
  console.warn('  Required: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL');
}

/* In-memory storage for push subscriptions (use database in production) */
const pushSubscriptions = new Map<string, any>();

/**
 * Security and Performance middleware
 */
/* Enable gzip/brotli compression for all responses */
app.use(compression({
  threshold: 0, /* Compress all responses */
  level: 6, /* Balance between speed and compression ratio */
}));

// Add security headers
app.use((req, res, next) => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Enable CORS for service worker
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

  next();
});

/**
 * Push Notification API Endpoints
 */

/* Store a push subscription */
app.post('/api/push-subscriptions', express.json(), (req, res) => {
  const subscription = req.body;

  if (!subscription || !subscription.endpoint) {
    res.status(400).json({ error: 'Invalid subscription object' });
    return;
  }

  /* Use endpoint as unique key */
  const key = subscription.endpoint;
  pushSubscriptions.set(key, subscription);

  console.log('[Push API] ✓ Subscription stored. Total subscriptions:', pushSubscriptions.size);

  res.status(201).json({ message: 'Subscription stored successfully' });
});

/* Send push notification to all subscribers */
app.post('/api/send-push-notification', express.json(), (req, res) => {
  const { title, body, icon, data } = req.body;

  if (!title || !body) {
    res.status(400).json({ error: 'Title and body are required' });
    return;
  }

  const notificationPayload = {
    notification: {
      title,
      body,
      icon: icon || '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      vibrate: [100, 50, 100],
      data: data || {
        dateOfArrival: Date.now(),
        primaryKey: 1
      },
      actions: [{
        action: 'explore',
        title: 'Open TimeKeep'
      }]
    }
  };

  console.log('[Push API] Sending notification to', pushSubscriptions.size, 'subscribers');

  const allSubscriptions = Array.from(pushSubscriptions.values());

  Promise.all(
    allSubscriptions.map(sub =>
      webpush.sendNotification(sub, JSON.stringify(notificationPayload))
        .catch((err: any) => {
          console.error('[Push API] Failed to send to subscription:', err);
          /* Remove invalid subscriptions */
          if (err.statusCode === 410) {
            pushSubscriptions.delete(sub.endpoint);
          }
        })
    )
  )
    .then(() => {
      console.log('[Push API] ✓ Notifications sent successfully');
      res.status(200).json({
        message: 'Notifications sent successfully',
        sent: allSubscriptions.length
      });
    })
    .catch((err: any) => {
      console.error('[Push API] ❌ Error sending notifications:', err);
      res.status(500).json({ error: 'Failed to send notifications' });
    });
});

/* Get subscription count (for debugging) */
app.get('/api/push-subscriptions/count', (req, res) => {
  res.json({ count: pushSubscriptions.size });
});

/**
 * Serve static files from /browser with optimized caching
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
      // Cache static assets aggressively
      if (path.match(/\.(js|css|woff2?|ttf|otf|eot|svg|png|jpg|jpeg|gif|webp|ico)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
      // Cache HTML files with revalidation
      else if (path.endsWith('.html')) {
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      }
    }
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 * This includes server-side rendering with hydration support.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => {
      if (response) {
        // Add cache headers for SSR responses
        const headers = response.headers;
        headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=86400');
        return writeResponseToNodeResponse(response, res);
      }
      return next();
    })
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
