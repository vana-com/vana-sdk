# Milestone 2: Single E2E Flow

## Overview
Execute one complete data portability flow end-to-end to validate the entire workflow with a single user.

## Status: 🚧 NEXT (Requires CLI Implementation)

## Prerequisites
- ✅ Milestone 1 completed successfully
- ❌ CLI scripts implemented (src/index.ts, src/scripts/)
- ❌ Real environment variables configured
- ❌ Test wallet with actual funding

## What This Milestone Tests

### 1. Complete Data Flow 
- Single wallet encryption with real Vana SDK
- Storage upload (Google Drive/IPFS)
- Blockchain transaction execution
- AI inference request submission
- Result polling and retrieval

### 2. API Server Integration
- Real requests to mock API endpoints
- Request/response validation
- Error handling under normal conditions

### 3. Schema Validation (Optional)
- Real schema fetching from blockchain/IPFS
- Data validation against schema
- Error handling for validation failures

### 4. End-to-End Logging
- Detailed status updates throughout flow
- Error reporting and debugging information
- Performance timing measurements

## Implementation Requirements

### Missing Files Needed
```bash
src/index.ts                    # Main entry point
src/scripts/test-single-e2e.ts  # Single E2E test script
```

### Environment Variables Required
```bash
TEST_WALLET_PRIVATE_KEY=0x...           # Real funded wallet
NEXT_PUBLIC_DATA_WALLET_APP_ADDRESS=... # App address
NEXT_PUBLIC_DEFAULT_GRANTEE_ID=...      # Grantee ID
GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON=...   # Google Drive service account JSON
```

## Expected Test Flow

```typescript
// Pseudocode for test-single-e2e.ts
async function testSingleE2E() {
  // 1. Setup
  const config = loadConfigFromEnv();
  const wallet = createTestWallet(config.testWalletPrivateKey);
  const client = new VanaLoadTestClient(wallet, config);
  
  // 2. Start API server
  const server = new LoadTestApiServer(config);
  await server.start();
  
  // 3. Execute E2E flow
  const userData = generateTestData();
  const result = await client.executeDataPortabilityFlow(
    userData,
    "Analyze this user data",
    "test-single-e2e",
    "http://localhost:3001"
  );
  
  // 4. Validate results
  assert(result.success, "E2E flow should succeed");
  assert(result.duration < 60000, "Flow should complete in <60s");
  
  console.log("✅ Single E2E flow completed successfully!");
}
```

## Success Criteria

- ✅ Complete flow executes without errors
- ✅ All status updates logged correctly  
- ✅ Transaction submitted and confirmed
- ✅ AI inference request processed
- ✅ Results retrieved successfully
- ✅ Total execution time < 60 seconds
- ✅ No memory leaks or resource issues

## How to Run (When Implemented)

```bash
# Start API server (in one terminal)
npm run dev

# Run single E2E test (in another terminal)  
npx tsx milestones/ms-02/test-single-e2e.ts
```

## Expected Output

```
🚀 Starting Milestone 2: Single E2E Flow Test

📡 Starting API server on port 3001...
✅ API server ready

👤 Creating test wallet and client...
✅ Test wallet: 0x1234...5678
✅ VanaLoadTestClient initialized

📊 Generating test data...
✅ Test data created (5.2KB)

🔄 Executing complete E2E flow...
  📝 Processing user data...
  🔐 Encrypting file with wallet signature...
  📤 Uploading encrypted file to storage...
  ⛓️  Executing blockchain transaction...
  🤖 Submitting AI inference request...
  ⏳ Polling for results...
  ✅ AI inference completed!

📊 Results:
  ✅ Success: true
  ⏱️  Duration: 45.2 seconds
  🔗 Transaction: 0xabc...def
  🎯 Permission ID: 12345
  📋 AI Result: "Analysis complete..."

🎉 Milestone 2 PASSED! Single E2E flow working correctly.
🚀 Ready to proceed to Milestone 3: Multi-User Validation
```

## Troubleshooting

Common issues and solutions:

1. **Wallet funding**: Ensure test wallet has sufficient VANA tokens
2. **RPC connectivity**: Verify Moksha testnet RPC is accessible
3. **Storage permissions**: Check storage API keys and permissions
4. **Port conflicts**: Ensure port 3001 is available for API server

## Next Steps

Once this milestone passes, proceed to Milestone 3 for multi-user concurrent testing.
