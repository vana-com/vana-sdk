# Vana Data Wallet Demo

A minimal demonstration of data portability using the Vana SDK. This app shows how users can encrypt their data, upload it to Google Drive, and grant permissions for AI inference in their personal server.

## Features

- Connect Para wallet for authentication
- Encrypt and upload files to Google Drive
- Grant permissions to trusted servers
- Run AI inference on encrypted data
- Display inference results

## Prerequisites

- Node.js and npm
- Para wallet browser extension
- Google Drive API credentials

## Installation

1. Install dependencies:

   ```bash
   npm install
   ```

2. Set up environment variables (copy `.env.example` to `.env` and fill in values)

3. Run the development server:
   ```bash
   npm run dev
   ```

## How It Works

### Data Portability Flow

1. **Connect Para Wallet** - Authenticate using Para wallet integration ([examples](https://github.com/getpara/examples-hub))

2. **Google Drive Integration** - Log in using OAuth, and store the access token and refresh token in localStorage

3. **File Encryption** - Encrypt demo file using wallet signature:
   - Demo file: [model_prices_and_context_window.json](https://raw.githubusercontent.com/BerriAI/litellm/refs/heads/main/model_prices_and_context_window.json)
   - Uses vana-sdk encryption methods

4. **Upload to Google Drive** - Store encrypted file with public accessibility

5. **Grant Permissions** - Use gasless relayer pattern to execute batch operation:

   ```typescript
   const batchTxHash = await handleBatchServerFilesAndPermissions({
     operation: "llm_inference",
     fileUrl,
     serverAddress: personalServerInfo.address as `0x${string}`,
     serverUrl: personalServerInfo.serverUrl,
     serverPublicKey: personalServerInfo.publicKey || "",
     parameters: {
       prompt:
         "What is the best light weight model to use for coding?: {{data}}",
     },
   });
   ```

6. **AI Inference** - Poll trusted server endpoint until results are available

### Configuration

- Default Grantee ID: 1
- Grant URL: vibes.vana.com
- Trusted server information is automatically retrieved

## Development

- TypeScript with strict type checking
- Minimal code without excessive logging
- Real implementation (no mocks)
- Must compile without errors before commits

## References

- Main SDK examples: `vana-sdk/examples/vana-sdk-demo`
- Vibes integration: `datawallet/apps/vibes.vana.com`
