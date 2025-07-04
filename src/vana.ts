import { VanaConfig } from './types';
import { InvalidConfigurationError } from './errors';
import { PermissionsController, ControllerContext } from './controllers/permissions';
import { DataController } from './controllers/data';
import { ProtocolController } from './controllers/protocol';

/**
 * The main Vana SDK client class.
 * 
 * This class serves as the primary entry point into the Vana ecosystem.
 * It is an orchestrator that provides access to all protocol functionality
 * through namespaced resource controllers.
 * 
 * @example
 * ```typescript
 * import { Vana } from 'vana-sdk';
 * import { createWalletClient, http } from 'viem';
 * import { privateKeyToAccount } from 'viem/accounts';
 * import { mokshaTestnet } from 'vana-sdk/chains';
 * 
 * const account = privateKeyToAccount('0x...');
 * const walletClient = createWalletClient({
 *   account,
 *   chain: mokshaTestnet,
 *   transport: http()
 * });
 * 
 * const vana = new Vana({
 *   walletClient,
 *   relayerUrl: 'https://relayer.vana.org' // optional
 * });
 * 
 * // Grant permission
 * const txHash = await vana.permissions.grant({
 *   to: '0x...',
 *   operation: 'llm_inference',
 *   parameters: { prompt: 'Hello world' }
 * });
 * 
 * // Get user files
 * const files = await vana.data.getUserFiles({
 *   owner: '0x...'
 * });
 * 
 * // Get contract info
 * const contract = vana.protocol.getContract('DataRegistry');
 * ```
 */
export class Vana {
  /** Controller for managing data access permissions */
  public readonly permissions: PermissionsController;
  
  /** Controller for managing user data assets */
  public readonly data: DataController;
  
  /** Controller providing low-level access to protocol contracts */
  public readonly protocol: ProtocolController;

  private readonly DEFAULT_RELAYER_URL = 'https://relayer.vana.org';

  /**
   * Creates a new Vana SDK client instance.
   * 
   * @param config - Configuration object containing wallet client and optional relayer URL
   * @throws InvalidConfigurationError if the configuration is invalid
   */
  constructor(config: VanaConfig) {
    // Validate configuration
    this.validateConfig(config);

    // Create shared context for all controllers
    const sharedContext: ControllerContext = {
      walletClient: config.walletClient,
      relayerUrl: config.relayerUrl || this.DEFAULT_RELAYER_URL
    };

    // Initialize controllers
    this.permissions = new PermissionsController(sharedContext);
    this.data = new DataController(sharedContext);
    this.protocol = new ProtocolController(sharedContext);
  }

  /**
   * Validates the configuration object.
   * 
   * @param config - The configuration to validate
   * @throws InvalidConfigurationError if the configuration is invalid
   */
  private validateConfig(config: VanaConfig): void {
    if (!config) {
      throw new InvalidConfigurationError('Configuration object is required');
    }

    if (!config.walletClient) {
      throw new InvalidConfigurationError('walletClient is required');
    }

    // Validate that walletClient is actually a WalletClient
    if (typeof config.walletClient !== 'object' || !config.walletClient.signTypedData) {
      throw new InvalidConfigurationError('walletClient must be a valid viem WalletClient');
    }

    // Validate relayerUrl if provided
    if (config.relayerUrl !== undefined) {
      if (typeof config.relayerUrl !== 'string') {
        throw new InvalidConfigurationError('relayerUrl must be a string');
      }
      
      if (config.relayerUrl.trim() === '') {
        throw new InvalidConfigurationError('relayerUrl cannot be empty');
      }
      
      // Basic URL validation
      try {
        new URL(config.relayerUrl);
      } catch {
        throw new InvalidConfigurationError('relayerUrl must be a valid URL');
      }
    }

    // Validate that wallet client has a chain
    if (!config.walletClient.chain) {
      throw new InvalidConfigurationError('walletClient must have a chain configured');
    }

    // Validate that the chain is supported
    const supportedChainIds = [14800, 1480]; // Moksha testnet and Vana mainnet
    if (!supportedChainIds.includes(config.walletClient.chain.id)) {
      throw new InvalidConfigurationError(
        `Unsupported chain ID: ${config.walletClient.chain.id}. Supported chains: ${supportedChainIds.join(', ')}`
      );
    }
  }

  /**
   * Gets the current chain ID from the wallet client.
   * 
   * @returns The chain ID
   */
  get chainId(): number {
    return this.protocol.getChainId();
  }

  /**
   * Gets the current chain name from the wallet client.
   * 
   * @returns The chain name
   */
  get chainName(): string {
    return this.protocol.getChainName();
  }

  /**
   * Gets the user's address from the wallet client.
   * 
   * @returns Promise resolving to the user's address
   */
  async getUserAddress() {
    const addresses = await this.permissions['getUserAddress']();
    return addresses;
  }

  /**
   * Gets information about the current configuration.
   * 
   * @returns Configuration summary
   */
  getConfig() {
    return {
      chainId: this.chainId,
      chainName: this.chainName,
      relayerUrl: (this.permissions as any).context.relayerUrl
    };
  }
}