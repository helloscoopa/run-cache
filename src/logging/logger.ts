import { RunCacheConfig } from '../types/cache-config';

/**
 * Logger class for handling verbose logging in RunCache
 */
export class Logger {
  private config: RunCacheConfig;

  constructor(config: RunCacheConfig) {
    this.config = config;
  }

  /**
   * Updates the logger configuration
   */
  updateConfig(config: RunCacheConfig): void {
    this.config = config;
  }

  /**
   * Logs a message if verbose mode is enabled
   * @param level Log level (info, debug, warn, error)
   * @param message The message to log
   * @param data Optional data to include in the log
   */
  log(level: 'info' | 'debug' | 'warn' | 'error', message: string, data?: any): void {
    if (!this.config.verbose) return;
    
    // Only log if console is available
    if (typeof console === 'undefined') return;
    
    const timestamp = new Date().toISOString();
    const prefix = `RunCache [${timestamp}] [${level.toUpperCase()}]:`;
    
    switch (level) {
      case 'info':
        if (data) {
          console.info(prefix, message, data);
        } else {
          console.info(prefix, message);
        }
        break;
      case 'debug':
        if (data) {
          console.debug(prefix, message, data);
        } else {
          console.debug(prefix, message);
        }
        break;
      case 'warn':
        if (data) {
          console.warn(prefix, message, data);
        } else {
          console.warn(prefix, message);
        }
        break;
      case 'error':
        if (data) {
          console.error(prefix, message, data);
        } else {
          console.error(prefix, message);
        }
        break;
    }
  }
} 