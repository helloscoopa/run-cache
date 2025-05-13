import { RunCache, LocalStorageAdapter, IndexedDBAdapter, FilesystemAdapter, EvictionPolicy } from '../src';

// Example 1: Using localStorage persistence (browser environments)
async function localStorageExample() {
  console.log('Running localStorage persistence example...');
  
  // Configure RunCache with localStorage adapter
  RunCache.configure({
    maxEntries: 100,
    evictionPolicy: EvictionPolicy.LRU,
    storageAdapter: new LocalStorageAdapter({
      storageKey: 'run-cache-example'
    })
  });
  
  // Set up auto-save every 30 seconds
  RunCache.setupAutoSave(30000);
  
  // Set some data in the cache
  await RunCache.set({ key: 'user:1', value: JSON.stringify({ name: 'John Doe', email: 'john@example.com' }) });
  await RunCache.set({ key: 'settings', value: JSON.stringify({ theme: 'dark', notifications: true }) });
  
  console.log('Cache data set and persisted to localStorage');
  console.log('Manually saving to storage...');
  
  // Manually save to storage
  await RunCache.saveToStorage();
  
  console.log('To test persistence:');
  console.log('1. Refresh the page');
  console.log('2. The cached data will be automatically loaded');
  console.log('3. You can verify by checking localStorage in DevTools');
}

// Example 2: Using IndexedDB persistence (browser environments)
async function indexedDBExample() {
  console.log('Running IndexedDB persistence example...');
  
  // Configure RunCache with IndexedDB adapter
  RunCache.configure({
    maxEntries: 1000,
    evictionPolicy: EvictionPolicy.LFU,
    storageAdapter: new IndexedDBAdapter({
      storageKey: 'run-cache-example'
    })
  });
  
  // Set some data in the cache
  await RunCache.set({ key: 'products', value: JSON.stringify([
    { id: 1, name: 'Product 1', price: 10.99 },
    { id: 2, name: 'Product 2', price: 19.99 },
    { id: 3, name: 'Product 3', price: 5.99 }
  ])});
  
  console.log('Cache data set and persisted to IndexedDB');
  console.log('Manually saving to storage...');
  
  // Manually save to storage
  await RunCache.saveToStorage();
  
  console.log('To test persistence:');
  console.log('1. Refresh the page');
  console.log('2. The cached data will be automatically loaded');
  console.log('3. You can verify by checking IndexedDB in DevTools');
}

// Example 3: Using filesystem persistence (Node.js environments)
async function filesystemExample() {
  console.log('Running filesystem persistence example...');
  
  // Configure RunCache with filesystem adapter
  RunCache.configure({
    maxEntries: 500,
    evictionPolicy: EvictionPolicy.LRU,
    storageAdapter: new FilesystemAdapter({
      filePath: './cache-data.json'
    })
  });
  
  // Set some data in the cache
  await RunCache.set({ key: 'logs', value: JSON.stringify([
    { timestamp: Date.now(), message: 'Application started' },
    { timestamp: Date.now() + 1000, message: 'User logged in' }
  ])});
  
  // Set data with TTL (will be restored with correct TTL)
  await RunCache.set({ 
    key: 'session', 
    value: JSON.stringify({ token: 'abc123', user: 'admin' }),
    ttl: 3600000 // 1 hour
  });
  
  console.log('Cache data set and persisted to filesystem');
  console.log('Manually saving to storage...');
  
  // Manually save to storage
  await RunCache.saveToStorage();
  
  console.log('To test persistence:');
  console.log('1. Restart the application');
  console.log('2. The cached data will be automatically loaded');
  console.log('3. You can verify by checking the cache-data.json file');
  
  // Set interval to periodically check session expiry
  const interval = setInterval(async () => {
    const session = await RunCache.get('session');
    if (!session) {
      console.log('Session expired');
      clearInterval(interval);
    } else {
      console.log('Session still valid');
    }
  }, 10000);

  // Ensure interval is cleared on application shutdown
  if (typeof process !== 'undefined' && process && process.on && typeof process.on === 'function') {
    try {
      process.on('SIGINT', () => {
        clearInterval(interval);
        console.log('Cleared session check interval');
        process.exit(0);
      });
      
      process.on('SIGTERM', () => {
        clearInterval(interval);
        console.log('Cleared session check interval');
      });
    } catch (error) {
      console.error('Failed to register process handlers:', error);
    }
  }
}

// Detect environment and run appropriate example
if (typeof window !== 'undefined') {
  console.log('Browser environment detected');
  
  // Create buttons for the examples
  const createExampleUI = () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <h1>RunCache Persistence Examples</h1>
      <button id="local-storage-btn">Run LocalStorage Example</button>
      <button id="indexed-db-btn">Run IndexedDB Example</button>
      <div id="results" style="margin-top: 20px; padding: 10px; background: #f0f0f0;"></div>
    `;
    document.body.appendChild(container);
    
    const resultsEl = document.getElementById('results');
    
    // Add console.log override
    const originalLog = console.log;
    console.log = function(...args) {
      originalLog.apply(console, args);
      if (resultsEl) {
        resultsEl.innerHTML += `<p>${args.join(' ')}</p>`;
      }
    };
    
    // Add event listeners
    document.getElementById('local-storage-btn')?.addEventListener('click', () => {
      if (resultsEl) resultsEl.innerHTML = '';
      localStorageExample();
    });
    
    document.getElementById('indexed-db-btn')?.addEventListener('click', () => {
      if (resultsEl) resultsEl.innerHTML = '';
      indexedDBExample();
    });
  };
  
  // Wait for DOM content to be loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createExampleUI);
  } else {
    createExampleUI();
  }
} else {
  console.log('Node.js environment detected');
  filesystemExample();
} 