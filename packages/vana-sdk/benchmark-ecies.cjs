/* eslint-env node */
/* eslint-disable no-console */

const eccrypto = require('eccrypto');
const { NodeECIESProvider } = require('./dist/crypto/ecies/node.cjs');
const { performance } = require('perf_hooks');

async function benchmark() {
  console.log('=== ECIES Performance Benchmark ===\n');
  
  const nodeProvider = new NodeECIESProvider();
  
  // Generate test keypair
  const privateKey = eccrypto.generatePrivate();
  const publicKey = eccrypto.getPublic(privateKey);
  
  // Test messages
  const smallMessage = Buffer.from('Small test message');
  const mediumMessage = Buffer.alloc(1024, 'x'); // 1KB
  
  // Benchmark small message
  console.log('Small message (18 bytes) - 50 iterations:');
  const iterations = 50;
  
  const eccryptoStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    await eccrypto.encrypt(publicKey, smallMessage);
  }
  const eccryptoTime = performance.now() - eccryptoStart;
  
  const ourStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    await nodeProvider.encrypt(publicKey, smallMessage);
  }
  const ourTime = performance.now() - ourStart;
  
  console.log(`  eccrypto:  ${eccryptoTime.toFixed(2)}ms (${(eccryptoTime/iterations).toFixed(2)}ms/op)`);
  console.log(`  our impl:  ${ourTime.toFixed(2)}ms (${(ourTime/iterations).toFixed(2)}ms/op)`);
  console.log(`  speedup:   ${(eccryptoTime/ourTime).toFixed(2)}x\n`);
  
  // Benchmark medium message
  console.log('Medium message (1KB) - 30 iterations:');
  const medIterations = 30;
  
  const eccryptoMedStart = performance.now();
  for (let i = 0; i < medIterations; i++) {
    await eccrypto.encrypt(publicKey, mediumMessage);
  }
  const eccryptoMedTime = performance.now() - eccryptoMedStart;
  
  const ourMedStart = performance.now();
  for (let i = 0; i < medIterations; i++) {
    await nodeProvider.encrypt(publicKey, mediumMessage);
  }
  const ourMedTime = performance.now() - ourMedStart;
  
  console.log(`  eccrypto:  ${eccryptoMedTime.toFixed(2)}ms (${(eccryptoMedTime/medIterations).toFixed(2)}ms/op)`);
  console.log(`  our impl:  ${ourMedTime.toFixed(2)}ms (${(ourMedTime/medIterations).toFixed(2)}ms/op)`);
  console.log(`  speedup:   ${(eccryptoMedTime/ourMedTime).toFixed(2)}x\n`);
  
  // Benchmark decryption
  console.log('Decryption (1KB message) - 30 iterations:');
  const encrypted = await eccrypto.encrypt(publicKey, mediumMessage);
  
  const eccryptoDecStart = performance.now();
  for (let i = 0; i < medIterations; i++) {
    await eccrypto.decrypt(privateKey, encrypted);
  }
  const eccryptoDecTime = performance.now() - eccryptoDecStart;
  
  const ourDecStart = performance.now();
  for (let i = 0; i < medIterations; i++) {
    await nodeProvider.decrypt(privateKey, encrypted);
  }
  const ourDecTime = performance.now() - ourDecStart;
  
  console.log(`  eccrypto:  ${eccryptoDecTime.toFixed(2)}ms (${(eccryptoDecTime/medIterations).toFixed(2)}ms/op)`);
  console.log(`  our impl:  ${ourDecTime.toFixed(2)}ms (${(ourDecTime/medIterations).toFixed(2)}ms/op)`);
  console.log(`  speedup:   ${(eccryptoDecTime/ourDecTime).toFixed(2)}x\n`);
  
  console.log('=== Summary ===');
  console.log('Our implementation improvements:');
  console.log('  - Uses native secp256k1 for ECDH (no elliptic.js)');
  console.log('  - Direct raw X coordinate extraction');
  console.log('  - Optimized buffer operations');
  console.log('  - Better memory management');
}

benchmark().catch(console.error);