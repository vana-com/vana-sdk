import { Vana } from '@opendatalabs/vana-sdk/browser';

console.log('Testing Vana SDK Browser Build...');

try {
  // Test basic import without initialization (requires config)
  console.log('Vana function imported successfully:', typeof Vana);
  
  document.getElementById('app').innerHTML = `
    <h1>Vana SDK Browser Test</h1>
    <p>✅ SDK imported successfully</p>
    <p>Type of Vana: ${typeof Vana}</p>
  `;
} catch (error) {
  console.error('Failed to import Vana SDK:', error);
  document.getElementById('app').innerHTML = `
    <h1>Vana SDK Browser Test</h1>
    <p>❌ Failed to import: ${error.message}</p>
  `;
}