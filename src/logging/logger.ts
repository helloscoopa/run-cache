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
    
    const logMethod = console[level];
    if (data) {
      logMethod(prefix, message, data);
    } else {
      logMethod(prefix, message);
    }
  }
} 