# Vana SDK Load Testing Plan

## Overview

This document outlines a comprehensive load testing strategy to validate that the Vana network can handle **100,000 users in a single day** through the SDK-based data portability workflow. The test will simulate the complete user journey from data contribution to AI analysis, stressing all critical infrastructure components.

## Test Objectives

### Primary Goals
- **Scalability Validation**: Prove the system can handle 100k concurrent/daily users
- **Performance Baseline**: Establish performance metrics for each component
- **Bottleneck Identification**: Identify and document system limitations
- **Infrastructure Stress Testing**: Test all critical components under load

### Success Metrics
- **Throughput**: 12.5k successful data contributions in 3 hours (sustained)
- **Response Times**: P95 < 30 seconds for complete E2E workflow
- **Error Rate**: < 2% transaction failure rate
- **System Stability**: No critical service failures during concentrated test period

## System Components Under Test

This is a **true end-to-end test** that exercises the complete data portability stack. While we know individual components like RPC nodes, Goldsky, IPFS, and GCS can scale independently, this test validates the entire integrated system under realistic load.

### **Complete E2E Data Flow** 
The test exercises all components as a unified system:

1. **Vana SDK Client** → **Moksha RPC** → **Smart Contracts** 
2. **Encrypted Storage** → **Google Drive/Pinata** → **File Management**
3. **Blockchain Events** → **Goldsky Indexing** → **Permission Tracking**
4. **Cloud Run APIs** → **Trusted Server** → **AI Orchestration**
5. **Replicate Models** → **AI Processing** → **Result Generation**

### **Key Integration Points**
- **SDK ↔ Blockchain**: Transaction submission and event monitoring
- **Storage ↔ Permissions**: File encryption keys and access control
- **Blockchain ↔ AI**: Permission IDs triggering inference requests
- **AI ↔ Results**: Polling and result retrieval through the complete stack

### **What We're Actually Testing**
- **System Integration**: How all components work together under load
- **End-User Experience**: Complete workflow performance from user perspective
- **Bottleneck Discovery**: Which integration points fail first under pressure
- **Real-World Scalability**: Actual user capacity, not theoretical component limits

## Test Architecture

### Load Test Framework
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Driver   │───▶│   Vana SDK      │───▶│  Target System  │
│   (Artillery.io │    │   Test Client   │    │   Components    │
│   or k6)        │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Test Environment
- **Network**: Moksha Testnet (14800)
- **RPC Endpoint**: `https://rpc.moksha.vana.org`
- **Contracts**: Existing Moksha contract addresses
- **Generated Wallets**: 12.5k unique test wallets with funded accounts
- **Fake Data**: Synthetic JSON datasets mimicking real user data

## Single E2E Load Test Scenario

### **One Test to Rule Them All: Complete Data Portability Flow**

Given the **one-day constraint**, we run a single comprehensive test that validates the entire system under realistic load.

**Test Profile**: 12.5k users completing full data portability workflow in 3 hours

**Complete E2E Steps** (per user):
1. Generate funded test wallet
2. Create realistic synthetic user data (JSON)
3. Encrypt data with wallet signature using SDK
4. Upload encrypted data to storage (Google Drive/Pinata)
5. Execute `addFileWithPermissions` blockchain transaction
6. Wait for event indexing (Goldsky)
7. Request TEE validation via `requestContributionProof`
8. Submit AI inference request to trusted server (Cloud Run)
9. AI processing via Replicate models
10. Poll for completion and retrieve results
11. Claim rewards via `claimReward` transaction

**Load Pattern**: 
- **Ramp-up**: 0 → 1000 concurrent users (30 minutes)
- **Sustained Load**: 1000 concurrent users (2 hours) 
- **Ramp-down**: 1000 → 0 users (30 minutes)
- **Total Runtime**: 3 hours
- **Target Throughput**: ~12.5k total completions (burst-heavy, production-realistic)

**Why This Works**:
- **Burst Testing**: 1k concurrent users simulates realistic production bursts
- **Connection Stress**: Tests parallel connection limits (DB, RPC, API endpoints)
- **Buffer Validation**: Proves system can handle well above daily average load
- **Bottleneck Discovery**: High concurrency reveals integration breaking points
- **Production-Realistic**: Matches previous launch patterns and failure modes

## Implementation & Execution

### **Build and Run Strategy**

The load test implementation focuses on building the test script and running it with real-time debugging capabilities.

**Configurable Load Test Parameters**
```typescript
// Load test configuration interface
interface LoadTestConfig {
  // Test Scale Parameters
  totalUsers: number;           // Total users to simulate (default: 12500)
  maxConcurrentUsers: number;   // Peak concurrent users (default: 1000)
  testDurationMinutes: number;  // Total test duration (default: 180)
  
  // Load Pattern Parameters
  rampUpMinutes: number;        // Ramp up duration (default: 30)
  sustainMinutes: number;       // Sustained load duration (default: 120)
  rampDownMinutes: number;      // Ramp down duration (default: 30)
  
  // System Parameters
  maxWallets: number;           // Pre-generated wallets (default: 15000)
  rpcEndpoint: string;          // Moksha RPC URL
  walletFundingAmount: string;  // ETH amount per wallet (default: "0.1")
  
  // Debugging Parameters
  enableDebugLogs: boolean;     // Verbose logging (default: false)
  metricsInterval: number;      // Metrics collection interval (default: 30s)
  failFast: boolean;           // Stop on first critical error (default: false)
}

// Default configuration
const DEFAULT_CONFIG: LoadTestConfig = {
  totalUsers: 12500,
  maxConcurrentUsers: 1000,
  testDurationMinutes: 180,
  rampUpMinutes: 30,
  sustainMinutes: 120,
  rampDownMinutes: 30,
  maxWallets: 15000,
  rpcEndpoint: "https://rpc.moksha.vana.org",
  walletFundingAmount: "0.1",
  enableDebugLogs: false,
  metricsInterval: 30,
  failFast: false
};
```

**Load Test Architecture**
```typescript
// Real implementation based on vana-vibes-demo
export class VanaLoadTestClient {
  private vana: VanaInstance;
  private walletClient: WalletClient;
  private config: LoadTestConfig;
  
  async executeDataPortabilityFlow(
    userData: string,
    prompt: string,
    testId: string,
    serverUrl: string = 'http://localhost:3001'
  ): Promise<TestResult> {
    // Uses real DataPortabilityFlow from vana-vibes-demo
    const flow = new DataPortabilityFlow(
      this.vana,
      this.walletClient,
      this.createCallbacks(testId),
      testId
    );

    await flow.executeCompleteFlow(
      walletAddress,
      userData,
      prompt,
      serverUrl,
      0 // Skip schema validation for load test
    );
  }
}

// API Server for load testing endpoints
export class LoadTestApiServer {
  // Provides required endpoints:
  // POST /api/relay - Gasless transaction relay
  // POST /api/trusted-server - AI inference requests
  // POST /api/trusted-server/poll - Result polling
}
```

**Dynamic Artillery Configuration**
```javascript
// Generate Artillery config from LoadTestConfig
function generateArtilleryConfig(config: LoadTestConfig) {
  const arrivalRate = config.maxConcurrentUsers / (config.rampUpMinutes * 60); // users per second
  
  return {
    config: {
      target: 'http://localhost:3000',
      phases: [
        { 
          duration: `${config.rampUpMinutes}m`, 
          arrivalRate: arrivalRate 
        },
        { 
          duration: `${config.sustainMinutes}m`, 
          arrivalRate: arrivalRate 
        },
        { 
          duration: `${config.rampDownMinutes}m`, 
          arrivalRate: 0 
        }
      ],
      processor: './load-test-processor.js',
      variables: {
        maxConcurrentUsers: config.maxConcurrentUsers,
        totalUsers: config.totalUsers,
        enableDebugLogs: config.enableDebugLogs,
        rpcEndpoint: config.rpcEndpoint
      }
    },
    scenarios: [
      {
        name: 'E2E Data Portability Flow',
        weight: 100,
        engine: 'playwright',
        testFunction: 'executeCompleteFlow'
      }
    ]
  };
}

// Example: High concurrency burst test
const burstTestConfig = generateArtilleryConfig({
  totalUsers: 12500,
  maxConcurrentUsers: 1000,  // High burst load
  testDurationMinutes: 180,
  rampUpMinutes: 30,
  sustainMinutes: 120,
  rampDownMinutes: 30
});

// Example: Conservative test
const conservativeTestConfig = generateArtilleryConfig({
  totalUsers: 5000,
  maxConcurrentUsers: 200,   // Lower concurrent load
  testDurationMinutes: 60,
  rampUpMinutes: 10,
  sustainMinutes: 40,
  rampDownMinutes: 10
});
```

**Real-time Monitoring**
```typescript
// Metrics collection
interface LoadTestMetrics {
  blockchain: {
    transactionThroughput: number;
    gasUsage: bigint[];
    rpcLatency: number[];
    errorRate: number;
  };
  storage: {
    uploadLatency: number[];
    uploadSuccessRate: number;
    storageQuotaUsed: number;
  };
  ai: {
    inferenceLatency: number[];
    queueDepth: number;
    modelAvailability: number;
  };
  endToEnd: {
    flowCompletionTime: number[];
    successRate: number;
    userThroughput: number;
  };
}
```

## Risk Mitigation

### Identified Risks & Mitigations

1. **RPC Rate Limiting**
   - **Risk**: Moksha RPC may throttle requests
   - **Mitigation**: Implement exponential backoff, use multiple RPC endpoints
   - **Fallback**: Distribute load across multiple RPC providers

2. **Gas Estimation Failures**
   - **Risk**: High load may cause gas estimation errors
   - **Mitigation**: Pre-calculate gas limits, implement retry logic
   - **Fallback**: Use fixed gas limits based on historical data

3. **Storage Quota Exhaustion**
   - **Risk**: Test may exceed storage provider limits
   - **Mitigation**: Use multiple storage accounts, cleanup after tests
   - **Fallback**: Implement storage rotation strategy

4. **AI Processing Bottlenecks**
   - **Risk**: Replicate queue may become overwhelmed
   - **Mitigation**: Monitor queue depth, implement circuit breakers
   - **Fallback**: Distribute across multiple AI providers

5. **Memory/Resource Exhaustion**
   - **Risk**: Test runner may run out of resources
   - **Mitigation**: Distributed test execution, resource monitoring
   - **Fallback**: Horizontal scaling of test infrastructure

## Test Data Management

### Synthetic Data Strategy
```typescript
// Realistic test data generation
const createTestDataset = (size: 'small' | 'medium' | 'large') => {
  const sizes = {
    small: 1024,      // 1KB
    medium: 10240,    // 10KB  
    large: 102400     // 100KB
  };
  
  return {
    user_profile: generateUserProfile(),
    activity_logs: generateActivityLogs(sizes[size]),
    preferences: generatePreferences(),
    metadata: {
      generated_at: Date.now(),
      test_run_id: process.env.TEST_RUN_ID,
      data_size: sizes[size]
    }
  };
};
```

### Wallet Management
```typescript
// Test wallet funding and management
class TestWalletManager {
  private wallets: Account[] = [];
  private fundingWallet: Account;
  
  async fundWallet(wallet: Account, amount: bigint): Promise<void> {
    // Fund test wallets with VANA tokens for gas
    const tx = await this.walletClient.sendTransaction({
      to: wallet.address,
      value: amount,
      account: this.fundingWallet
    });
    await this.publicClient.waitForTransactionReceipt({ hash: tx });
  }
  
  async distributeTestFunds(): Promise<void> {
    // Batch fund all test wallets
    const batchSize = 100;
    for (let i = 0; i < this.wallets.length; i += batchSize) {
      const batch = this.wallets.slice(i, i + batchSize);
      await Promise.all(
        batch.map(wallet => this.fundWallet(wallet, parseEther('0.1')))
      );
    }
  }
}
```

## Monitoring & Observability

### Real-time Dashboards
- **System Metrics**: CPU, memory, network usage
- **Application Metrics**: Request rates, error rates, latencies
- **Business Metrics**: Successful flows, revenue generated, user satisfaction

### Alerting Thresholds
- Error rate > 1%
- P95 latency > 5 seconds
- Queue depth > 1000
- RPC success rate < 99%

### Log Aggregation
```typescript
// Structured logging for analysis
const logger = {
  logFlowStart: (walletAddress: string, testId: string) => {
    console.log(JSON.stringify({
      event: 'flow_start',
      wallet: walletAddress,
      test_id: testId,
      timestamp: Date.now()
    }));
  },
  
  logFlowComplete: (walletAddress: string, testId: string, duration: number) => {
    console.log(JSON.stringify({
      event: 'flow_complete',
      wallet: walletAddress,
      test_id: testId,
      duration_ms: duration,
      timestamp: Date.now()
    }));
  }
};
```

## Expected Outcomes

### Performance Baselines
- **End-to-End Flow**: < 60 seconds per user
- **Blockchain Transactions**: < 10 seconds per transaction
- **AI Inference**: < 30 seconds per job
- **Storage Operations**: < 5 seconds per upload

### Capacity Limits
- **Daily Throughput**: 100k+ users
- **Peak Concurrent**: 1000+ simultaneous users
- **Transaction Rate**: 10+ TPS sustained
- **Storage Bandwidth**: 1GB+ per hour

### Infrastructure Recommendations
Based on test results, provide recommendations for:
- RPC endpoint scaling
- Storage infrastructure sizing
- AI processing capacity planning
- Monitoring and alerting setup

## Post-Test Analysis

### Success Criteria Validation
- [ ] 12.5k users completed successfully (simulating 100k/day)
- [ ] Error rate < 2%
- [ ] P95 latency < 30 seconds
- [ ] No critical system failures

### Performance Report
- Detailed metrics for each component
- Bottleneck identification and analysis
- Scaling recommendations
- Cost analysis and optimization opportunities

### Future Improvements
- Infrastructure optimizations identified
- Code improvements for better performance
- Enhanced monitoring and alerting
- Disaster recovery procedures

## Getting Started

### Prerequisites
```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Set environment variables (optional for basic testing)
export MOKSHA_RPC_URL="https://rpc.moksha.vana.org"
export TEST_WALLET_PRIVATE_KEY="0x..."
export GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
```

### Testing Milestones

The project uses iterative milestone testing. See [milestones/README.md](milestones/README.md) for detailed information.

**Current Status**: Milestone 1 (Core Components) ✅ COMPLETED

### Iterative Testing Approach

This project uses milestone-based testing to ensure each component works before building additional features.

#### Quick Start: Test Current Components
```bash
# 1. Install dependencies
npm install

# 2. Build the project
npm run build

# 3. Run Milestone 1: Core Components Validation
npx tsx milestones/ms-01/test-milestone1.ts
```

#### Full Testing Progression
```bash
# Test core components (available now)
npx tsx milestones/ms-01/test-milestone1.ts

# Future milestones (require implementation):
# npx tsx milestones/ms-02/test-single-e2e.ts      # Single E2E flow
# npx tsx milestones/ms-03/test-multi-user.ts      # Multi-user validation  
# npx tsx milestones/ms-04/test-load-patterns.ts   # Load pattern testing
# npx tsx milestones/ms-05/test-full-scale.ts      # Full scale test
```

#### Production Load Testing (Future)
```bash
# 1. Set up environment
cp env.example .env
# Edit .env with your configuration

# 2. Generate and fund test wallets
npm run prepare-wallets

# 3. Start the API server (required for endpoints)
npm run dev  # Starts API server on port 3001

# 4. Run load tests (in separate terminal)
npm run load-test:burst        # 1000 concurrent users
npm run load-test:conservative # 200 concurrent users
npm run load-test:custom -- --concurrent=500 --total=10000

# 5. Monitor results
npm run monitor-results
```

**Environment Configuration**
```bash
# .env file for load test configuration
LOAD_TEST_TOTAL_USERS=12500
LOAD_TEST_MAX_CONCURRENT=1000
LOAD_TEST_DURATION_MINUTES=180
LOAD_TEST_RPC_ENDPOINTS=https://rpc.moksha.vana.org,https://rpc2.moksha.vana.org
LOAD_TEST_WALLET_FUNDING_AMOUNT=0.1
LOAD_TEST_ENABLE_DEBUG=false
LOAD_TEST_FAIL_FAST=false
```

### Execution Checklist
- **[ ] Setup**: Generate 15k test wallets and fund them (buffer for 1k concurrent)
- **[ ] Validate**: Run conservative test (200 concurrent) to validate E2E flow
- **[ ] Execute**: Run burst test (1k concurrent) with real-time monitoring
- **[ ] Debug**: Adjust parameters and fix issues on the fly
- **[ ] Analyze**: Collect final metrics and identify connection/concurrency bottlenecks

---

This focused load testing plan provides a **single-day, end-to-end validation** of Vana's ability to handle 100k users through the complete data portability workflow. By concentrating all testing into one comprehensive 3-hour test, we maximize the value of limited time while stress-testing the real integration points that matter for production scalability.
