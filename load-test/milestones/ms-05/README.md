# Milestone 5: Full Scale Streaming Load Test

## Overview

**Goal**: Execute realistic, high-throughput load testing with streaming user arrival patterns and background resource management.

**Key Innovations**:
- 🌊 **Streaming Architecture**: Continuous user arrival (no artificial batching)
- 🔄 **Background Funding**: Wallets funded continuously while tests run
- 💾 **Memory Efficient**: Handles 1000+ users without loading all wallets into memory
- 📊 **Real-time Metrics**: Live throughput, success rates, and performance monitoring
- 🎯 **Realistic Traffic**: Poisson arrival process mimics real user behavior

## Architecture Changes from MS-4

| Aspect | MS-4 (Controlled) | MS-5 (Streaming) |
|--------|-------------------|------------------|
| **User Arrival** | Batches with delays | Poisson distribution |
| **Funding** | All upfront (8+ min for 1000 users) | Background worker |
| **Memory** | All wallets in memory | Streaming wallet pool |
| **Throughput** | 0.04 users/sec | 5-10 users/sec |
| **Realism** | Artificial load waves | Continuous realistic traffic |

## Prerequisites

- ✅ MS-04 completed (controlled load testing validated)
- ✅ Environment configured with GCS and relayer funding
- ✅ Personal server deployment with sufficient rate limits

## Test Configuration

### Default Settings
```typescript
interface StreamingConfig {
  // Traffic Pattern
  totalUsers: 1000;
  arrivalRateUsersPerSecond: 3.0;
  testDurationMinutes: 10;
  
  // Resource Management  
  maxConcurrentUsers: 50;
  walletPoolSize: 100;
  fundingWorkerConcurrency: 5;
  
  // Performance Targets
  targetThroughput: 2.5; // users/sec sustained
  maxResponseTimeP95: 45000; // 45 seconds
  minSuccessRate: 0.85; // 85%
}
```

### Scaling Options
```bash
# Small scale (development)
npx tsx milestones/ms-05/test-streaming-load.ts --users 100 --rate 1.0 --duration 5

# Medium scale (staging validation)  
npx tsx milestones/ms-05/test-streaming-load.ts --users 500 --rate 2.0 --duration 10

# Full scale (production simulation)
npx tsx milestones/ms-05/test-streaming-load.ts --users 1000 --rate 3.0 --duration 15
```

## Key Components

### 1. User Arrival Stream
```typescript
class UserArrivalStream extends EventEmitter {
  private arrivalRate: number; // users per second
  private totalUsers: number;
  private usersSpawned: number = 0;
  
  start() {
    // Poisson process for realistic arrival timing
    const scheduleNext = () => {
      if (this.usersSpawned < this.totalUsers) {
        const delay = this.getNextArrivalDelay();
        setTimeout(() => {
          this.emit('userArrival', this.generateUser());
          this.usersSpawned++;
          scheduleNext();
        }, delay);
      }
    };
    scheduleNext();
  }
  
  private getNextArrivalDelay(): number {
    // Exponential distribution for Poisson process
    return -Math.log(Math.random()) / this.arrivalRate * 1000;
  }
}
```

### 2. Background Wallet Funding Worker
```typescript
class BackgroundFundingWorker {
  private fundingQueue: WalletRequest[] = [];
  private isRunning: boolean = false;
  private concurrency: number = 5;
  
  async start() {
    // Start multiple funding workers to prevent bottlenecks
    const workers = Array.from({ length: this.concurrency }, () => 
      this.fundingWorkerLoop()
    );
    await Promise.all(workers);
  }
  
  private async fundingWorkerLoop() {
    while (this.isRunning) {
      const request = this.fundingQueue.shift();
      if (request) {
        await this.fundWallet(request);
        // Stagger funding to prevent nonce collisions
        await this.sleep(100 + Math.random() * 200);
      } else {
        await this.sleep(500); // Wait for more requests
      }
    }
  }
}
```

### 3. Memory-Efficient Wallet Pool
```typescript
class StreamingWalletPool {
  private funded: WalletInfo[] = [];
  private unfunded: WalletInfo[] = [];
  private maxPoolSize: number = 100;
  
  async getWallet(): Promise<WalletInfo> {
    // Ensure we always have funded wallets available
    if (this.funded.length < 10) {
      await this.requestMoreFunding();
    }
    
    return this.funded.shift() || await this.waitForFunding();
  }
  
  private async requestMoreFunding() {
    // Generate wallets on-demand instead of pre-generating thousands
    const newWallets = this.generateWallets(50);
    this.fundingWorker.queueForFunding(newWallets);
  }
}
```

### 4. Real-time Metrics Dashboard
```typescript
class StreamingMetrics {
  private metrics = {
    usersPerSecond: new RollingAverage(60), // 1-minute window
    responseTimeP95: new Percentile(0.95),
    successRate: new RollingAverage(100),
    activeUsers: 0,
    totalCompleted: 0
  };
  
  startDashboard() {
    setInterval(() => {
      this.displayLiveMetrics();
    }, 2000); // Update every 2 seconds
  }
  
  private displayLiveMetrics() {
    console.clear();
    console.log(chalk.cyan('🌊 Streaming Load Test - Live Metrics'));
    console.log(`📈 Throughput: ${this.metrics.usersPerSecond.current().toFixed(2)} users/sec`);
    console.log(`⏱️  P95 Response: ${(this.metrics.responseTimeP95.current() / 1000).toFixed(1)}s`);
    console.log(`✅ Success Rate: ${(this.metrics.successRate.current() * 100).toFixed(1)}%`);
    console.log(`🔄 Active Users: ${this.metrics.activeUsers}`);
    console.log(`🎯 Completed: ${this.metrics.totalCompleted}`);
  }
}
```

## Success Criteria

### Performance Targets
- ✅ **Sustained Throughput**: ≥2.5 users/second over 10+ minutes
- ✅ **Peak Throughput**: ≥5.0 users/second during traffic spikes  
- ✅ **Response Time P95**: ≤45 seconds
- ✅ **Success Rate**: ≥85% of all user flows complete successfully
- ✅ **Memory Usage**: <1GB RAM for 1000+ user test
- ✅ **Funding Latency**: <30 seconds for any user to receive funded wallet

### Scalability Validation
- ✅ **1000 Users**: Complete 1000-user test in <20 minutes
- ✅ **No Memory Leaks**: Memory usage remains stable throughout test
- ✅ **Graceful Degradation**: System handles rate limiting without cascading failures
- ✅ **Resource Efficiency**: <5% CPU usage on load test client

## Expected Results

### Small Scale (100 users, 5 minutes)
```
🌊 Streaming Load Test Results
📊 Total Users: 100
✅ Successful: 87 (87.0%)
❌ Failed: 13 (13.0%)
⏱️  Average Response: 28.5s
📈 Peak Throughput: 4.2 users/sec
🎯 Test Duration: 4m 32s
💾 Peak Memory: 245MB
```

### Full Scale (1000 users, 15 minutes)  
```
🌊 Streaming Load Test Results
📊 Total Users: 1000
✅ Successful: 856 (85.6%)
❌ Failed: 144 (14.4%)
⏱️  Average Response: 31.2s
📈 Peak Throughput: 6.8 users/sec
🎯 Test Duration: 14m 18s
💾 Peak Memory: 892MB
```

## Running the Test

### Quick Start
```bash
# Development test (fast validation)
npx tsx milestones/ms-05/test-streaming-load.ts --users 50 --rate 2.0 --duration 3

# Production simulation
npx tsx milestones/ms-05/test-streaming-load.ts --users 1000 --rate 3.0 --duration 15
```

### Advanced Options
```bash
# Custom configuration
npx tsx milestones/ms-05/test-streaming-load.ts \
  --users 500 \
  --rate 2.5 \
  --duration 10 \
  --concurrency 30 \
  --pool-size 75 \
  --funding-workers 3
```

## Troubleshooting

### Low Throughput (<2 users/sec)
- **Check**: Personal server rate limiting
- **Fix**: Reduce `arrivalRate` or increase `maxConcurrentUsers`

### High Memory Usage (>1GB)
- **Check**: `walletPoolSize` and `maxConcurrentUsers` settings
- **Fix**: Reduce pool size, increase garbage collection frequency

### Funding Bottlenecks
- **Check**: `fundingWorkerConcurrency` setting
- **Fix**: Increase funding workers, check relayer wallet balance

### Rate Limiting Errors
- **Check**: Personal server deployment capacity
- **Fix**: Implement exponential backoff, reduce arrival rate

## Next Steps After MS-05

1. **Artillery Integration**: Convert streaming architecture to Artillery.js
2. **Distributed Testing**: Multi-machine load generation
3. **Performance Baselines**: Establish SLA targets for production
4. **Monitoring Integration**: Connect to Grafana/Prometheus
5. **Chaos Engineering**: Failure injection and recovery testing

---

**Status**: 🚧 **IN DEVELOPMENT**  
**Estimated Completion**: Next implementation cycle  
**Dependencies**: MS-04 completion, streaming architecture implementation
