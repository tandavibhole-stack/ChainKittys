import * as Sentry from '@sentry/react';
import posthog from 'posthog-js';

// Initialize Sentry error monitoring
export function initMonitoring() {
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN || 'https://5c91b5c92e704eb8b225a62e3d7a8dc4@o4500000000000000.ingest.sentry.io/4500000000000000';
  
  Sentry.init({
    dsn: sentryDsn,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    // Performance Monitoring
    tracesSampleRate: 1.0, 
    // Session Replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    environment: import.meta.env.MODE || 'development',
  });

  // Initialize PostHog analytics
  const posthogKey = import.meta.env.VITE_POSTHOG_KEY || 'phc_Y2hhaW5raXR0eXRva2VuMTIzNDU2Nzg5MG1vY2s';
  const posthogHost = import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';

  posthog.init(posthogKey, {
    api_host: posthogHost,
    autocapture: true,
    capture_pageview: true,
    persistence: 'localStorage',
  });
}

/**
 * Custom function to track specific business events
 */
export function trackEvent(eventName: string, properties?: Record<string, any>) {
  try {
    posthog.capture(eventName, properties);
  } catch (err) {
    console.error('Failed to track event:', err);
  }
}

/**
 * Custom function to capture exceptions and send them to Sentry
 */
export function captureError(error: Error, context?: string) {
  console.error(`[Captured Error] ${context ? context + ': ' : ''}`, error);
  try {
    Sentry.withScope((scope) => {
      if (context) {
        scope.setTag('context', context);
      }
      Sentry.captureException(error);
    });
  } catch (err) {
    console.error('Failed to capture error in Sentry:', err);
  }
}
