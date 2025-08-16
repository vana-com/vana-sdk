import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    target: 'esnext',
    minify: false,
    rollupOptions: {
      input: './src/main.js',
    }
  },
  optimizeDeps: {
    exclude: ['@opendatalabs/vana-sdk']
  },
  resolve: {
    alias: {
      // Force eccrypto-js to use browser implementation
      'eccrypto-js/dist/cjs/lib/node': 'eccrypto-js/dist/cjs/lib/browser',
      'eccrypto-js/dist/cjs/lib/secp256k1': 'eccrypto-js/dist/cjs/lib/elliptic',
    }
  }
});