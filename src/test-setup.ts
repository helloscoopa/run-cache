import { RunCache } from './run-cache';

// Global afterAll hook that ensures RunCache is properly shutdown after all tests
afterAll(() => {
  // Make sure all cached values are cleared
  RunCache.flush();
  
  // Clear event listeners
  RunCache.clearEventListeners();
  
  // Ensure timers are cleared by doing a full shutdown
  RunCache.shutdown();
  
  // Add a small delay to allow any pending promises to resolve
  return new Promise(resolve => setTimeout(resolve, 100));
});

// Jest test setup file
// Add any global test setup configuration here

// Increase timeout for all tests
jest.setTimeout(10000);

// Suppress console output during tests
global.console.log = jest.fn();
global.console.error = jest.fn();
global.console.warn = jest.fn();
global.console.info = jest.fn();
global.console.debug = jest.fn();

// Add any other global test configuration here 