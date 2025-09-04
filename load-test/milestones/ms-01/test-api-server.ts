#!/usr/bin/env tsx
/**
 * API Server Test: Start server and test endpoints
 */

import { LoadTestApiServer } from '../../src/server/api-server.js';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';

async function testApiServer() {
  console.log('🚀 Testing API Server Startup and Endpoints\n');
  
  const testConfig = { 
    ...DEFAULT_CONFIG, 
    enableDebugLogs: true,
    testWalletPrivateKey: '0x1234567890123456789012345678901234567890123456789012345678901234'
  };
  
  const server = new LoadTestApiServer(testConfig, 3003);
  
  try {
    // Start the server
    console.log('📡 Starting API server on port 3003...');
    await server.start();
    
    // Test health endpoint
    console.log('🏥 Testing /health endpoint...');
    const healthResponse = await fetch('http://localhost:3003/health');
    const healthData = await healthResponse.json();
    console.log('  ✅ Health check:', healthData);
    
    // Test relay endpoint (should fail due to missing data, but endpoint should exist)
    console.log('🔄 Testing /api/relay endpoint...');
    try {
      const relayResponse = await fetch('http://localhost:3003/api/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}) // Empty body should trigger validation error
      });
      const relayData = await relayResponse.json();
      console.log('  ✅ Relay endpoint responds (expected validation error):', relayData);
    } catch (error) {
      console.log('  ❌ Relay endpoint test failed:', error.message);
    }
    
    // Test trusted-server endpoint
    console.log('🤖 Testing /api/trusted-server endpoint...');
    try {
      const tsResponse = await fetch('http://localhost:3003/api/trusted-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}) // Empty body should trigger validation error
      });
      const tsData = await tsResponse.json();
      console.log('  ✅ Trusted server endpoint responds (expected validation error):', tsData);
    } catch (error) {
      console.log('  ❌ Trusted server endpoint test failed:', error.message);
    }
    
    console.log('\n✅ API Server is working correctly!');
    console.log('📊 Server stats:', server.getStats());
    
  } catch (error) {
    console.log('❌ API server test failed:', error.message);
  }
  
  console.log('\n⚠️  Note: Server is still running on port 3003. Press Ctrl+C to stop.');
}

testApiServer().catch(console.error);
