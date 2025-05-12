/**
 * This example demonstrates how to use RunCache middleware
 * to add custom processing to cache operations.
 */

const { RunCache } = require('../dist');

// Create a simple logging middleware
RunCache.use(async (value, context, next) => {
  console.log(`[Middleware] ${context.operation} operation for key: ${context.key}`);
  return next(value);
});

// Add an encryption middleware
RunCache.use(async (value, context, next) => {
  if (context.operation === 'set' && value) {
    // Simple "encryption" for demonstration (base64 encoding)
    console.log(`[Encryption] Encoding value for key: ${context.key}`);
    const encodedValue = Buffer.from(value).toString('base64');
    return next(encodedValue);
  } else if (context.operation === 'get' && value) {
    // Get the encrypted value and decrypt it
    const encryptedValue = await next(value);
    if (encryptedValue) {
      console.log(`[Encryption] Decoding value for key: ${context.key}`);
      return Buffer.from(encryptedValue, 'base64').toString('utf-8');
    }
    return encryptedValue;
  }
  return next(value);
});

// Set a value in the cache
(async () => {
  // Cache some data
  await RunCache.set({ 
    key: 'user:123', 
    value: JSON.stringify({ name: 'John Doe', email: 'john@example.com' }),
    ttl: 10000 // 10 seconds
  });
  
  // Retrieve the data - it will be automatically decrypted
  const userData = await RunCache.get('user:123');
  console.log('Retrieved user data:', userData);
  
  // Check what's actually stored in the cache (encrypted)
  console.log('Raw stored value is base64 encoded');
  
  // Clear middleware to demonstrate how middleware works
  console.log('\nClearing middleware to show the difference:');
  RunCache.clearMiddleware();
  
  // Now retrieve the data without decryption middleware
  const encryptedData = await RunCache.get('user:123');
  console.log('Raw stored value:', encryptedData);
  
  // Manually decode to show it's the same data
  const decodedData = Buffer.from(encryptedData, 'base64').toString('utf-8');
  console.log('Manually decoded:', decodedData);
})(); 