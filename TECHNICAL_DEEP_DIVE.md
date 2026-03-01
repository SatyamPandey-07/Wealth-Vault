# Technical Deep Dive: Promise Concurrency Control Fix

## Root Cause Analysis

### The Bug
The `processEventsInParallel` method in `outboxDispatcher.js` attempted to implement manual concurrency control using `Promise.race()` with a naive promise removal strategy:

```javascript
// BUGGY CODE (lines 141-158)
async processEventsInParallel(events, concurrency) {
    const processing = [];
    
    for (const event of events) {
        const promise = this.processEvent(event);
        processing.push(promise);

        // Wait if we've reached concurrency limit
        if (processing.length >= concurrency) {
            await Promise.race(processing);  // ❌ Problem 1
            // Remove completed promises
            processing.splice(0, processing.findIndex(p => p.settled) + 1);  // ❌ Problem 2
        }
    }

    // Wait for remaining events
    await Promise.allSettled(processing);
}
```

### Problem 1: Misuse of `Promise.race()`

```javascript
await Promise.race(processing);  // Waits only for the FIRST promise
```

**Expected behavior (incorrect assumption):**
- Wait for all 10 concurrent promises to complete

**Actual behavior (what really happens):**
- The race resolves as soon as ONE promise settles
- Returns immediately even if 9 other promises are still pending
- No concurrency control - the queue grows unbounded

**Evidence:**
```javascript
const promises = [
    new Promise(r => setTimeout(() => r(1), 100)),  // Settles first
    new Promise(r => setTimeout(() => r(2), 200)),
    new Promise(r => setTimeout(() => r(3), 300)),
];

const winner = await Promise.race(promises);
console.log(winner); // 1 (the fastest one)
// But the other two are still pending!
```

### Problem 2: Non-existent `.settled` Property

```javascript
processing.findIndex(p => p.settled) + 1  // Always returns 0 or 1
```

**Why this fails:**

JavaScript Promise objects do NOT have a `.settled` property. The promise spec defines:
- **States:** pending, fulfilled, or rejected (internal, not accessible)
- **Methods:** `.then()`, `.catch()`, `.finally()`
- **No properties:** No way to directly read state or check if settled

```javascript
const promise = new Promise(r => r(42));
console.log(promise.settled);  // undefined
console.log(promise.then);     // [Function] ✓

// Even after resolution:
setTimeout(() => {
    console.log(promise.settled);  // Still undefined!
}, 0);
```

**So what happens:**
```javascript
findIndex(p => p.settled)  // Checks for undefined, always truthy = undefined is not truthy
                           // Returns -1 when no match found for `undefined`

splice(0, -1 + 1)         // = splice(0, 0)
                           // Removes ZERO elements!
```

### Problem 3: Cascading Memory Leak

**Timeline:**
1. First 10 iteratons: `processing` has 10 promises ✓
2. 10th iteration: `Promise.race()` settles as soon as ONE completes
3. `splice(0, 0)` removes NOTHING - still 10 promises
4. 11th iteration: Push another promise → 11 in array
5. Condition: `11 >= 10` → true → Race+splice again
6. After 1000 events: `processing` has **1000 promises in memory**

```javascript
// Simulating the memory leak
const processing = [];
for (let i = 0; i < 1000; i++) {
    processing.push(createPromise());
    if (processing.length >= 10) {
        await Promise.race(processing);  // Only first one completes
        processing.splice(0, processing.findIndex(p => p.settled) + 1);
        // ↑ Removes nothing because findIndex returns -1
    }
}
console.log(processing.length);  // 1000! (Memory leak)
```

## Solution Architecture

### The Semaphore Pattern

The fix implements a classic **semaphore** (also called **mutex** or **concurrency limiter**):

```
┌─────────────────────────────────────────────┐
│         ConcurrencyLimiter                  │
├─────────────────────────────────────────────┤
│ Concurrency: 5                              │
│                                             │
│ ┌──────────────────────────────────────┐   │
│ │ Active Promises (Running)             │   │
│ │ [Promise1, Promise2, Promise3]        │   │
│ │ Count: 3/5                            │   │
│ └──────────────────────────────────────┘   │
│                                             │
│ ┌──────────────────────────────────────┐   │
│ │ Pending Queue (Waiting)               │   │
│ │ [{fn, context, resolve, reject},...] │   │
│ │ Count: 12                             │   │
│ └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### Key Components

#### 1. Active Promise Tracking (Map-based)

```javascript
this.activePromises = new Map();  // Track by unique ID

_generateId() {
    const id = `promise_${Date.now()}_${Math.random()}`;
    this.activePromises.set(id, true);  // Mark as active
    return id;
}

// In finally block:
finally {
    this.activePromises.delete(id);  // Mark as inactive
}
```

**Why Map instead of Array?**
- **O(1) deletion** by ID (not O(n) like array splice)
- Avoids shifting all array elements
- No need for tracking promise settlement state

#### 2. Queue Management

```javascript
this.queue = [];  // Pending tasks waiting for capacity

run(fn, context) {
    if (this.activePromises.size < this.concurrency) {
        // Slot available - execute immediately
        return this._executeAndTrack(fn, context);
    }
    
    // No capacity - queue the task
    return new Promise((resolve, reject) => {
        this.queue.push({ fn, context, resolve, reject });
        this._processQueue();
    });
}

_processQueue() {
    if (this.activePromises.size >= this.concurrency || this.queue.length === 0) {
        return;  // Still at capacity or queue empty
    }
    
    const next = this.queue.shift();
    this._executeAndTrack(next.fn, next.context)
        .then(next.resolve)
        .catch(next.reject);
}
```

**Flow Diagram:**
```
New task arrives
    ↓
Is there capacity? (activePromises.size < concurrency)
    ├─ YES → Execute immediately
    │        Add to activePromises
    │        When done: Remove from activePromises
    │                   Process next from queue
    │
    └─ NO  → Add to queue
             Wait for capacity
             (When active promise finishes, queue processes)
```

#### 3. Completion Tracking

```javascript
async _executeAndTrack(fn, context) {
    const id = this._generateId();  // Register as active
    
    try {
        const result = await (context ? fn.call(context) : fn());
        this.totalProcessed++;
        return result;
    } catch (error) {
        this.totalFailed++;
        throw error;
    } finally {
        this.activePromises.delete(id);  // Unregister
        this._processQueue();              // Process next queued item
    }
}
```

**Why this works:**
- Promise state tracked by its presence in `activePromises`
- No need to read promise state (impossible anyway)
- Atomic operations: Add/delete from Map
- Automatic cleanup in `finally` block (always runs)

### Circuit Breaker Implementation

Prevents cascading failures:

```javascript
_checkCircuitBreaker() {
    const total = this.totalProcessed + this.totalFailed;
    
    if (total > 0) {
        const failureRate = this.totalFailed / total;
        
        // Open circuit if failure rate >= 50%
        if (failureRate >= this.circuitBreakerThreshold) {
            this.isBroken = true;
        }
    }
}

run(fn, context) {
    if (this.isBroken) {
        throw new Error('Circuit breaker is open');
    }
    // ... rest of execution
}
```

**States:**
```
CLOSED (normal)
    ↓
    [Failure Rate >= 50%]
    ↓
OPEN (reject all new requests)
    ↓
    [Manual reset or monitor detects issue fixed]
    ↓
CLOSED (normal)
```

### Memory Monitoring Strategy

```javascript
_startMemoryMonitoring() {
    this.memoryCheckId = setInterval(() => {
        const memUsage = process.memoryUsage();
        const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
        
        // Alert threshold: 90% heap usage
        if (heapUsedPercent > 90) {
            logger.warn('High memory usage');
            this.emit('memory:high', stats);
            
            // Optional: Trigger GC
            if (global.gc) {
                global.gc();  // Requires: node --expose-gc
            }
        }
    }, 10000);  // Every 10 seconds
}
```

## Comparison: Promise Settlement Methods

### Method 1: Polling Promise State (IMPOSSIBLE)
```javascript
// ❌ This doesn't exist!
const state = promise.state;  // undefined
const settled = promise.settled;  // undefined
```

Reason: Promise spec (ECMAScript) intentionally hides internal state
- Prevents tampering with promise behavior
- Ensures proper semantics

### Method 2: External Tracking (CORRECT) ✅
```javascript
// Track promises by ID
const activePromises = new Map();
const id = generateId();
activePromises.set(id, true);

try {
    await promise;
} finally {
    activePromises.delete(id);  // We KNOW it settled
}

const activeCount = activePromises.size;
```

### Method 3: Promise Wrapper (ALSO CORRECT)
```javascript
// Wrap promise to track settlement
function trackPromise(promise) {
    let settled = false;
    const tracked = promise.finally(() => { settled = true; });
    return { promise: tracked, settled: () => settled };
}

const { promise, settled } = trackPromise(somePromise);
await Promise.race(/* array of promises */);
// Check which were settled
```

## Performance Characteristics

### Time Complexity
| Operation | Old Code | New Code |
|-----------|----------|----------|
| Add task | O(1) | O(1) |
| Remove task | O(n) ❌ | O(1) ✅ |
| Queue check | O(1) | O(1) |
| Find completed | O(n) | O(1) |
| Process N items | O(n²) | O(n) |

### Space Complexity
| Measurement | Old Code | New Code |
|-------------|----------|----------|
| 100 events | 100 promises in memory | 10 active + 90 queued |
| 1000 events | ~1000 promises memory leak | 10 active + 990 queued |
| Cleanup | Never | Automatic in finally |

### Memory Impact Summary
```
Old code processing 10,000 events:
- All 10,000 promises in memory simultaneously
- Estimated: 10,000 × ~150 bytes = 1.5 MB minimum
- PLUS continuation data: ~5-10 MB total leak

New code with concurrency=10:
- Max 10 active promises
- Queue structure overhead only
- Total: ~10 KB overhead (negligible)
- Cleanup: Automatic via finally blocks
```

## Thread Safety & Node.js Event Loop

**Important:** Node.js is single-threaded, so atomic operations aren't strictly necessary, but they're good practice:

```javascript
// All JavaScript execution in Node is atomic at the JavaScript level
// (The event loop runs one callback at a time)

async myFunc() {
    // This executes atomically as a unit
    const id = this._generateId();
    this.activePromises.set(id, true);
    
    // ↓ Here we relinquish control (await)
    // Event loop can run other callbacks here
    const result = await someAsyncFn();
    
    // ↓ Back in this function's context
    // No race condition - still atomic w.r.t. other JS code
    this.activePromises.delete(id);
}
```

## Integration with OutboxDispatcher

### Before
```javascript
// Outbox dispatcher had its own broken concurrency logic
async processEventsInParallel(events, concurrency) {
    // Manual promise array + Promise.race + splice
    // Memory leak + broken concurrency
}
```

### After
```javascript
// Outbox dispatcher delegates to ConcurrencyLimiter
async processEventsInParallel(events, concurrency) {
    const results = await this.concurrencyLimiter.runAllSettled(
        events,
        (event) => this.processEvent(event)
    );
    // Clean, safe, memory-efficient
}
```

## Testing Strategy

### Unit Tests
- Concurrency enforcement
- Memory cleanup
- Error handling
- Circuit breaker logic

### Integration Tests
- Outbox dispatcher integration
- Memory monitoring
- Event processing
- Graceful shutdown

### Regression Tests
- Verify old `Promise.race()` pattern doesn't exist
- Ensure no memory leaks with large batches
- Test drain() and reset() methods

## Deployment Checklist

- [ ] Deploy `ConcurrencyLimiter.js`
- [ ] Update `outboxDispatcher.js` with new implementation
- [ ] Run test suite
- [ ] Monitor memory usage in production (should be stable)
- [ ] Verify event processing throughput (should be same or better)
- [ ] Setup alerts on `memory:high` and `circuit-breaker:opened` events
- [ ] Document in team wiki

## References

- ECMAScript Promise Specification: https://tc39.es/ecma262/#sec-promise-objects
- Node.js Memory Management: https://nodejs.org/en/docs/guides/simple-profiling/
- Promise State Opacity: https://github.com/promises-aplus/promises-spec
- Semaphore/Mutex Pattern: https://en.wikipedia.org/wiki/Semaphore_(programming)
- Circuit Breaker Pattern: https://martinfowler.com/bliki/CircuitBreaker.html
