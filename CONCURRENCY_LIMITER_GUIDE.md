# ConcurrencyLimiter - Quick Reference Guide

Fast reference for using the fixed concurrency control system.

## Installation

The `ConcurrencyLimiter` is already available in `backend/utils/ConcurrencyLimiter.js`

## Basic Usage

### Simple Sequential Processing with Concurrency Limit

```javascript
import ConcurrencyLimiter from '../utils/ConcurrencyLimiter.js';

const limiter = new ConcurrencyLimiter(5); // Max 5 concurrent

// Method 1: Process items
const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const results = await limiter.runAll(items, async (item) => {
    const result = await someAsyncOperation(item);
    return result;
});

// results is an array of {status: 'fulfilled', value: X} or {status: 'rejected', reason: Error}
```

### Direct Function Execution

```javascript
// When you don't need to process multiple items
const result = await limiter.run(async () => {
    return await expensiveOperation();
});
```

### With Context Binding

```javascript
const limiter = new ConcurrencyLimiter(3);
const service = {
    name: 'DataService',
    async process(data) {
        return data.toUpperCase();
    }
};

// Use 'this' inside the function
const results = await limiter.runAll(
    ['a', 'b', 'c'],
    async function(item) {
        // 'this' refers to the service object
        return this.process(item);
    },
    service // Pass the context as third parameter
);
```

## Advanced Usage

### Monitoring Performance

```javascript
const limiter = new ConcurrencyLimiter(10);

// Get real-time statistics
const stats = limiter.getMemoryStats();
console.log(stats);
// {
//   activePromises: 3,
//   queuedPromises: 15,
//   totalProcessed: 1050,
//   totalFailed: 12,
//   failureRate: 0.0112,
//   circuitBreakerOpen: false,
//   heapUsed: '85MB',
//   heapTotal: '512MB'
// }
```

### Graceful Shutdown

```javascript
// Wait for all in-flight requests to complete
await limiter.drain();

// Then reset if you want to reuse the limiter
await limiter.reset();
```

### Circuit Breaker Pattern

```javascript
const limiter = new ConcurrencyLimiter(5);

try {
    const results = await limiter.runAll(items, asyncFn);
} catch (error) {
    if (limiter.isBroken) {
        console.log('Circuit breaker is open - too many failures');
        // Handle gracefully
        limiter.resetCircuitBreaker(); // Manual reset if needed
    }
}
```

### Error Handling

```javascript
const results = await limiter.runAll(items, async (item) => {
    // Errors are caught and you get settled results
    if (!item.isValid) {
        throw new Error(`Invalid item: ${item.id}`);
    }
    return await process(item);
});

// Check results
const failures = results.filter(r => r.status === 'rejected');
const successes = results.filter(r => r.status === 'fulfilled');

console.log(`Success: ${successes.length}, Failed: ${failures.length}`);

failures.forEach(failure => {
    console.log('Error:', failure.reason.message);
});
```

## Comparison: Before vs After

### ❌ Before (Broken Pattern)

```javascript
// OLD CODE - DO NOT USE
const processing = [];

for (const item of items) {
    const promise = processItem(item);
    processing.push(promise);

    if (processing.length >= concurrency) {
        // Problem 1: Promise.race() only waits for first to complete
        await Promise.race(processing);
        
        // Problem 2: Promises don't have .settled property
        // findIndex() returns -1, so splice(0, 0) does nothing
        processing.splice(0, processing.findIndex(p => p.settled) + 1);
    }
}

// Problem 3: Memory leak - promises never removed
await Promise.allSettled(processing);
```

### ✅ After (Fixed Pattern)

```javascript
// NEW CODE - USE THIS
import ConcurrencyLimiter from '../utils/ConcurrencyLimiter.js';

const limiter = new ConcurrencyLimiter(10);
const results = await limiter.runAll(items, async (item) => {
    return await processItem(item);
});

// All promises properly cleaned up, no memory leak
const stats = limiter.getMemoryStats();
console.log('Active:', stats.activePromises, 'Queued:', stats.queuedPromises);
```

## Common Patterns

### Pattern 1: Batch Processing

```javascript
async function processBatch(items, batchSize = 50) {
    const limiter = new ConcurrencyLimiter(10);
    const results = [];

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await limiter.runAll(batch, processItem);
        results.push(...batchResults);

        console.log(`Processed ${Math.min(i + batchSize, items.length)}/${items.length}`);
    }

    return results;
}
```

### Pattern 2: Retry with Concurrency

```javascript
async function processWithRetry(items, maxRetries = 3) {
    const limiter = new ConcurrencyLimiter(5);

    const results = await limiter.runAll(items, async (item, retryCount = 0) => {
        try {
            return await riskyOperation(item);
        } catch (error) {
            if (retryCount < maxRetries) {
                // Retry - sleep before retry
                await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retryCount)));
                return processWithRetry([item], maxRetries).then(r => r[0]);
            }
            throw error;
        }
    });

    return results;
}
```

### Pattern 3: Stream Processing

```javascript
async function* streamProcess(largeDataSet) {
    const limiter = new ConcurrencyLimiter(10);
    let buffer = [];

    for await (const item of largeDataSet) {
        const promise = limiter.run(async () => {
            return await transformItem(item);
        });

        buffer.push(promise);

        if (buffer.length >= 100) {
            const results = await Promise.all(buffer);
            for (const result of results) {
                yield result;
            }
            buffer = [];
        }
    }

    // Yield remaining
    const results = await Promise.all(buffer);
    for (const result of results) {
        yield result;
    }
}
```

### Pattern 4: Database Bulk Operations

```javascript
async function bulkInsert(records, concurrency = 5) {
    const limiter = new ConcurrencyLimiter(concurrency);
    
    const results = await limiter.runAll(records, async (record) => {
        return await db.insert(table).values(record).returning();
    });

    const stats = limiter.getMemoryStats();
    console.log(`Inserted ${stats.totalProcessed} records`);
    console.log(`Failed: ${stats.totalFailed}`);

    return results.filter(r => r.status === 'fulfilled').map(r => r.value);
}
```

### Pattern 5: API Rate Limiting

```javascript
async function callExternalAPI(endpoints, rateLimit = 10) {
    const limiter = new ConcurrencyLimiter(rateLimit);
    
    return limiter.runAll(endpoints, async (endpoint) => {
        const response = await fetch(endpoint);
        return response.json();
    });
}
```

## Configuration Tips

### Memory Conscious Setup
```javascript
// Reduce concurrency for memory-heavy operations
const limiter = new ConcurrencyLimiter(3); // Lower concurrency
```

### Speed Optimized Setup
```javascript
// Increase concurrency for I/O operations
const limiter = new ConcurrencyLimiter(50); // Higher concurrency
```

### Monitoring Setup
```javascript
const limiter = new ConcurrencyLimiter(10);

// Check stats regularly
setInterval(() => {
    const stats = limiter.getMemoryStats();
    if (stats.failureRate > 0.10) {
        console.warn('High failure rate:', stats.failureRate);
    }
    if (stats.queuedPromises > 100) {
        console.warn('Large queue:', stats.queuedPromises);
    }
}, 5000);
```

## Integration with OutboxDispatcher

```javascript
// The OutboxDispatcher already uses ConcurrencyLimiter internally
import dispatcher from '../jobs/outboxDispatcher.js';

dispatcher.on('memory:high', (stats) => {
    console.warn('Dispatcher memory usage high:', stats);
});

dispatcher.on('circuit-breaker:opened', (stats) => {
    console.error('Dispatcher circuit breaker opened:', stats.failureRate);
});

const status = dispatcher.getStatus();
console.log('Concurrency stats:', status.concurrencyStats);
```

## Performance Tips

1. **Choose concurrency wisely**
   - I/O bound: Higher concurrency (20-50)
   - CPU bound: Lower concurrency (number of CPU cores)
   - Memory bound: Even lower (3-5)

2. **Monitor memory growth**
   - Use `getMemoryStats()` regularly
   - Set up alerts on `memory:high` event
   - Reduce concurrency if memory grows

3. **Handle errors properly**
   - Always check `results` for rejected status
   - Implement retry logic manually if needed
   - Log failures for debugging

4. **Graceful shutdown**
   - Always call `drain()` before destroying limiter
   - Clean up event listeners
   - Allow in-flight requests to complete

## Troubleshooting

### Q: Why is memory still growing?
A: Check if you're properly handling completed promises. Verify `getMemoryStats()` shows `activePromises: 0` and `queuedPromises: 0` after processing.

### Q: Circuit breaker keeps opening?
A: Failure rate is too high. Either reduce concurrency or fix the underlying errors. Use `failureRate` stat to diagnose.

### Q: Why is throughput low?
A: You might have your concurrency limit too low. Try increasing it, but monitor memory usage.

### Q: How do I resume after circuit breaker opens?
A: Call `limiter.resetCircuitBreaker()` to allow new work. Or let it auto-reset after you fix the underlying issue.
