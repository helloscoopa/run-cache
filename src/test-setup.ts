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