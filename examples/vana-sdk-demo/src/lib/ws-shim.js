/* eslint-env node */
// WebSocket shim for browser environments
// This module provides a stub for the 'ws' package when used in browsers
// Since we only use HTTP transport, WebSocket functionality is not needed

// eslint-disable-next-line no-undef
module.exports = class WebSocketShim {
  constructor() {
    throw new Error(
      "WebSocket transport is not supported in browser environments. Use HTTP transport instead.",
    );
  }
};
