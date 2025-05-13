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

// Mock IndexedDB
const mockIDBRequest = {
  result: null as any,
  error: null as any,
  onupgradeneeded: null as ((event: Event) => void) | null,
  onsuccess: null as ((event: Event) => void) | null,
  onerror: null as ((event: Event) => void) | null,
  onblocked: null as ((event: Event) => void) | null,
};

const mockIDBObjectStore = {
  put: jest.fn(),
  get: jest.fn(),
  delete: jest.fn(),
};

const mockIDBTransaction = {
  objectStore: jest.fn().mockReturnValue(mockIDBObjectStore),
  onerror: null as ((event: Event) => void) | null,
  onabort: null as ((event: Event) => void) | null,
};

const mockIDBDatabase = {
  createObjectStore: jest.fn(),
  transaction: jest.fn().mockReturnValue(mockIDBTransaction),
  objectStoreNames: { contains: jest.fn() },
  close: jest.fn(),
  onclose: null as ((event: Event) => void) | null,
  onversionchange: null as ((event: Event) => void) | null,
};

const mockIndexedDB = {
  open: jest.fn().mockReturnValue(mockIDBRequest),
};

// Setup global mocks
Object.defineProperty(window, 'indexedDB', {
  value: mockIndexedDB,
  writable: true,
});

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  mockIDBRequest.result = mockIDBDatabase;
  mockIDBRequest.error = null;

  // Auto-trigger success for database connection
  setTimeout(() => {
    mockIDBRequest.onsuccess?.(new Event('success'));
  }, 0);
});

// Export mocks for use in tests
export {
  mockIDBRequest,
  mockIDBObjectStore,
  mockIDBTransaction,
  mockIDBDatabase,
  mockIndexedDB,
}; 