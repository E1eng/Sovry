/**
 * Conditional logger for production builds
 * - Suppresses debug logs in production
 * - Always logs errors/warnings for monitoring
 */

export const logger = {
  /**
   * Debug/info logging - suppressed in production
   */
  log: (...args: any[]) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(...args);
    }
  },

  /**
   * Warning logging - always shown
   */
  warn: (...args: any[]) => {
    console.warn(...args);
  },

  /**
   * Error logging - always shown
   */
  error: (...args: any[]) => {
    console.error(...args);
  },

  /**
   * Info logging - suppressed in production
   */
  info: (...args: any[]) => {
    if (process.env.NODE_ENV !== 'production') {
      console.info(...args);
    }
  },
};
