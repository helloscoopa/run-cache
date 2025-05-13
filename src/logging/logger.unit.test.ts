import { Logger } from './logger';
import { CacheConfig } from '../types/cache-config';

describe('Logger', () => {
  let logger: Logger;
  let consoleInfoSpy: jest.SpyInstance;
  let consoleDebugSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Create spies for console methods
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const config: CacheConfig = {
      debug: false,
    };

    logger = new Logger(config);
  });

  afterEach(() => {
    // Restore original console methods
    consoleInfoSpy.mockRestore();
    consoleDebugSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should not log when debug is disabled', () => {
    logger.log('info', 'Test message');

    expect(console.info).not.toHaveBeenCalled();
  });

  it('should log when debug is enabled', () => {
    // Update config to enable debug
    logger.updateConfig({ debug: true });

    logger.log('info', 'Test message');

    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining('[INFO]'),
      'Test message',
    );
  });

  it('should include additional data in log message', () => {
    logger.updateConfig({ debug: true });

    const data = { foo: 'bar' };
    logger.log('info', 'Test message with data', data);

    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining('[INFO]'),
      'Test message with data',
      data,
    );
  });

  it('should log at the proper log level', () => {
    logger.updateConfig({ debug: true });

    logger.log('info', 'Info message');
    logger.log('debug', 'Debug message');
    logger.log('warn', 'Warning message');
    logger.log('error', 'Error message');

    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.debug).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);

    expect(console.info).toHaveBeenCalledWith(expect.any(String), 'Info message');
    expect(console.debug).toHaveBeenCalledWith(expect.any(String), 'Debug message');
    expect(console.warn).toHaveBeenCalledWith(expect.any(String), 'Warning message');
    expect(console.error).toHaveBeenCalledWith(expect.any(String), 'Error message');
  });

  it('should update configuration properly', () => {
    // Start with debug: false
    expect(console.info).not.toHaveBeenCalled();

    logger.log('info', 'Should not log');
    expect(console.info).not.toHaveBeenCalled();

    // Update to debug: true
    logger.updateConfig({ debug: true });

    logger.log('info', 'Should log now');
    expect(console.info).toHaveBeenCalledTimes(1);

    // Update back to debug: false
    logger.updateConfig({ debug: false });

    logger.log('info', 'Should not log again');
    expect(console.info).toHaveBeenCalledTimes(1); // Still 1, no new calls
  });
});
