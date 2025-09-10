import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Vana } from '@opendatalabs/vana-sdk/node';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { publicKeyToAddress } from 'viem/utils';
import type { Hash } from 'viem';
import type { LoadTestConfig } from '../config/types.js';

/**
 * API Server for Load Testing
 * Provides the necessary endpoints that the DataPortabilityFlow expects:
 * - /api/relay - Gasless transaction relay
 * - /api/trusted-server - AI inference request submission  
 * - /api/trusted-server/poll - AI inference result polling
 */
export class LoadTestApiServer {
  private app: express.Application;
  private vana: any; // VanaInstance - will be properly typed when we implement real Vana config
  private config: LoadTestConfig;
  private port: number;
  private operations: Map<string, any> = new Map(); // Mock operation storage
  private server?: any; // HTTP server instance

  constructor(config: LoadTestConfig, port: number = 3001) {
    this.config = config;
    this.port = port;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.initializeVana();
  }

  /**
   * Get Vana SDK instance for real API calls
   */
  private getVanaInstance() {
    if (!this.config.apiServerPrivateKey) {
      throw new Error('API_SERVER_PRIVATE_KEY is required for real Vana server operations');
    }

    // Ensure private key is properly formatted
    let formattedPrivateKey: `0x${string}`;
    
    if (this.config.apiServerPrivateKey.startsWith('0x')) {
      formattedPrivateKey = this.config.apiServerPrivateKey as `0x${string}`;
    } else {
      formattedPrivateKey = `0x${this.config.apiServerPrivateKey}` as `0x${string}`;
    }
    
    // Validate private key length (should be 66 chars: 0x + 64 hex chars)
    if (formattedPrivateKey.length !== 66) {
      throw new Error(`Invalid API_SERVER_PRIVATE_KEY length: expected 66 characters (0x + 64 hex), got ${formattedPrivateKey.length}`);
    }

    const applicationAccount = privateKeyToAccount(formattedPrivateKey);

    return Vana({
      chainId: 14800, // Moksha testnet
      account: applicationAccount,
      defaultPersonalServerUrl: this.config.personalServerUrl,
    });
  }

  private setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      if (this.config.enableDebugLogs) {
        console.log(`[API] ${req.method} ${req.path}`);
      }
      next();
    });
  }

  private initializeVana() {
    // Initialize Vana SDK instance for API operations
    // For load testing, we'll use a minimal config or skip initialization
    // In real implementation, this would be properly configured with:
    // - network: 'moksha'
    // - privateKey: process.env.FUNDING_WALLET_PRIVATE_KEY
    // - etc.
    
    // For now, we'll skip Vana initialization since we're mocking the responses
    this.vana = null;
  }

  private setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // Identity endpoint for personal server operations
    // NOTE: This endpoint is mainly for debugging. In production, the VanaLoadTestClient
    // uses vana.server.getIdentity() directly which connects to the real personal server
    this.app.get('/identity', async (req: Request, res: Response) => {
      const { address } = req.query;
      
      if (!address) {
        return res.status(400).json({
          success: false,
          error: "Missing address parameter"
        });
      }

      try {
        // Use real Vana server if configured, otherwise fall back to mock
        if (this.config.personalServerUrl && this.config.apiServerPrivateKey) {
          try {
            const vana = this.getVanaInstance();
            const serverInfo = await vana.server.getIdentity({
              userAddress: address as `0x${string}`,
            });

            if (this.config.enableDebugLogs) {
              console.log(`[API] Real server identity retrieved for user ${address}`);
            }

            return res.json(serverInfo);
          } catch (error) {
            if (process.env.FORCE_REAL_SYSTEMS === 'true') {
              throw new Error(`❌ REAL SYSTEMS REQUIRED: Identity resolution failed: ${error}`);
            }
            console.error('[API] Real identity resolution failed, falling back to mock:', error);
            // Fall through to mock implementation
          }
        }

        // Mock implementation fallback
        const serverPrivateKey = generatePrivateKey();
        const serverAccount = privateKeyToAccount(serverPrivateKey);
        // Format public key properly - viem returns raw coordinates (64 bytes)
        // but SDK expects uncompressed format with 04 prefix (65 bytes)
        const publicKey = `0x04${serverAccount.publicKey.slice(2)}`;
        
        if (this.config.enableDebugLogs) {
          console.log(`[API] Generated mock server identity for user ${address}`);
        }

        res.json({
          kind: "Identity",
          user_address: address,
          personal_server: {
            kind: "PersonalServer", 
            address: serverAccount.address,
            public_key: publicKey,
          }
        });
      } catch (error) {
        console.error('[API] Error with identity resolution:', error);
        res.status(500).json({
          success: false,
          error: "Failed to resolve server identity"
        });
      }
    });

    // Relay endpoint - handles gasless transactions
    this.app.post('/api/relay', async (req: Request, res: Response) => {
      try {
        const {
          typedData,
          signature,
          expectedUserAddress,
        }: {
          typedData: any; // Would be GenericTypedData in real implementation
          signature: Hash;
          expectedUserAddress?: string;
        } = req.body;

        if (!typedData || !signature) {
          return res.status(400).json({
            success: false,
            error: "Missing typedData or signature"
          });
        }

        // For load testing, we'll simulate the relay operation
        const mockTxHash = this.generateMockTxHash();
        
        // Simulate relay processing time (disabled for load testing)
        // await this.sleep(500 + Math.random() * 1000); // 500ms-1.5s

        if (this.config.enableDebugLogs) {
          console.log(`[API] Relay transaction simulated: ${mockTxHash}`);
        }

        res.json({
          success: true,
          transactionHash: mockTxHash,
        });

      } catch (error) {
        console.error("Error relaying transaction:", error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Trusted server endpoint - submit AI inference requests
    this.app.post('/api/trusted-server', async (req: Request, res: Response) => {
      try {
        const { permissionId } = req.body;

        if (!permissionId) {
          return res.status(400).json({
            success: false,
            error: "Missing permissionId field"
          });
        }

        // Use real Vana server if configured, otherwise fall back to mock
        if (this.config.personalServerUrl && this.config.apiServerPrivateKey) {
          try {
            const vana = this.getVanaInstance();
            const response = await vana.server.createOperation({
              permissionId: +permissionId,
            });

            if (this.config.enableDebugLogs) {
              console.log(`[API] Real inference request created: ${response.id} for permission ${permissionId}`);
            }

            return res.json({
              success: true,
              data: response,
            });
          } catch (error) {
            if (process.env.FORCE_REAL_SYSTEMS === 'true') {
              throw new Error(`❌ REAL SYSTEMS REQUIRED: AI inference failed: ${error}`);
            }
            console.error('[API] Real inference failed, falling back to mock:', error);
            // Fall through to mock implementation
          }
        }

        // Mock implementation fallback
        const operationId = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        this.operations.set(operationId, {
          permissionId: +permissionId,
          status: 'processing',
          createdAt: Date.now(),
          completesAt: Date.now() + (10000 + Math.random() * 20000), // Complete in 10-30 seconds
        });

        // await this.sleep(200 + Math.random() * 500); // 200-700ms (disabled for load testing)

        if (this.config.enableDebugLogs) {
          console.log(`[API] Mock inference request created: ${operationId} for permission ${permissionId}`);
        }

        res.json({
          success: true,
          data: { id: operationId },
        });

      } catch (error) {
        console.error("Trusted server request failed:", error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Trusted server polling endpoint - get AI inference results
    this.app.post('/api/trusted-server/poll', async (req: Request, res: Response) => {
      try {
        const { operationId, chainId } = req.body;

        if (!operationId) {
          return res.status(400).json({
            success: false,
            error: "Missing operationId field"
          });
        }

        // Use real Vana server if configured, otherwise fall back to mock
        if (this.config.personalServerUrl && this.config.apiServerPrivateKey) {
          try {
            const vana = this.getVanaInstance();
            const response = await vana.server.getOperation(operationId);

            if (this.config.enableDebugLogs) {
              console.log(`[API] Real polling result for ${operationId}:`, response.status);
            }

            return res.json({
              success: true,
              data: response,
            });
          } catch (error) {
            if (process.env.FORCE_REAL_SYSTEMS === 'true') {
              throw new Error(`❌ REAL SYSTEMS REQUIRED: Polling failed: ${error}`);
            }
            console.error('[API] Real polling failed, falling back to mock:', error);
            // Fall through to mock implementation
          }
        }

        // Mock implementation fallback
        const operation = this.operations.get(operationId);
        if (!operation) {
          return res.status(404).json({
            success: false,
            error: "Operation not found"
          });
        }

        // await this.sleep(100 + Math.random() * 200); // 100-300ms (disabled for load testing)

        const now = Date.now();
        const isComplete = now >= operation.completesAt;

        if (isComplete && operation.status === 'processing') {
          operation.status = 'completed';
          operation.result = {
            analysis: `Mock AI analysis completed for operation ${operationId}`,
            confidence: 0.85 + Math.random() * 0.15,
            processingTime: now - operation.createdAt,
            model: 'mock-gpt-4-turbo',
            tokens: Math.floor(100 + Math.random() * 400),
            permissionId: operation.permissionId,
          };

          if (this.config.enableDebugLogs) {
            console.log(`[API] Mock operation ${operationId} completed`);
          }
        }

        res.json({
          success: true,
          data: {
            status: operation.status,
            result: operation.result || null,
          },
        });

      } catch (error) {
        console.error("Polling request failed:", error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Cleanup endpoint for completed operations (optional)
    this.app.post('/api/cleanup', (req: Request, res: Response) => {
      const beforeCount = this.operations.size;
      const cutoff = Date.now() - (60 * 60 * 1000); // 1 hour ago
      
      for (const [id, operation] of this.operations.entries()) {
        if (operation.createdAt < cutoff) {
          this.operations.delete(id);
        }
      }
      
      const afterCount = this.operations.size;
      res.json({
        success: true,
        cleaned: beforeCount - afterCount,
        remaining: afterCount,
      });
    });
  }

  private generateMockTxHash(): string {
    return `0x${Math.random().toString(16).substr(2, 64).padStart(64, '0')}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`[LoadTestApiServer] Running on port ${this.port}`);
        console.log(`[LoadTestApiServer] Endpoints:`);
        console.log(`  GET  /health`);
        console.log(`  GET  /identity`);
        console.log(`  POST /api/relay`);
        console.log(`  POST /api/trusted-server`);
        console.log(`  POST /api/trusted-server/poll`);
        console.log(`  POST /api/cleanup`);
        resolve();
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log(`[LoadTestApiServer] Server stopped`);
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  public getStats() {
    return {
      activeOperations: this.operations.size,
      port: this.port,
      uptime: process.uptime(),
    };
  }
}
