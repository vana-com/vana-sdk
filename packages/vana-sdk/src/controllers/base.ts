/**
 * Base controller class providing common functionality for all controllers.
 *
 * @remarks
 * This abstract class establishes the foundation for all Vana SDK controllers,
 * providing shared utilities like wallet validation and context management.
 * All controllers should extend this base class to ensure consistency and
 * shared behavior across the SDK.
 *
 * The class follows the Single Responsibility Principle by handling only
 * the core controller concerns while leaving specific functionality to
 * implementing classes.
 *
 * @category Controllers
 */

import type { WalletClient } from "viem";
import type { ControllerContext } from "../types/controller-context";
import { ReadOnlyError } from "../errors";

/**
 * Abstract base controller that all Vana SDK controllers extend.
 *
 * @remarks
 * Provides common functionality and patterns used across all controllers,
 * including wallet validation and context management. This ensures
 * consistency and reduces code duplication throughout the SDK.
 *
 * Key features:
 * - Wallet client validation with TypeScript assertion signatures
 * - Consistent error handling for read-only scenarios
 * - Shared context management patterns
 * - Type-safe wallet operations
 *
 * @example
 * ```typescript
 * class MyController extends BaseController {
 *   async performWalletOperation() {
 *     this.assertWallet(); // Ensures wallet is available
 *     // Now this.context.walletClient is guaranteed to be available
 *     const address = await this.context.walletClient.getAddresses();
 *     return address[0];
 *   }
 * }
 * ```
 */
export abstract class BaseController {
  /**
   * Creates a new controller instance with the provided context.
   *
   * @param context - The controller context containing clients and configuration
   */
  constructor(protected readonly context: ControllerContext) {}

  /**
   * Asserts that a wallet client is available for operations requiring signing.
   *
   * @remarks
   * This method uses TypeScript assertion signatures to narrow the type of
   * `this.context` to guarantee that `walletClient` is available after the
   * call succeeds. This provides compile-time safety for wallet operations
   * while enabling clear error messages for read-only scenarios.
   *
   * The assertion signature ensures that after calling this method,
   * TypeScript knows that `this.context.walletClient` is definitely available.
   *
   * @throws {ReadOnlyError} When no wallet client is configured
   *
   * @example
   * ```typescript
   * async performWalletOperation() {
   *   this.assertWallet(); // Type assertion + runtime check
   *
   *   // TypeScript now knows walletClient is available
   *   const accounts = await this.context.walletClient.getAddresses();
   *   return accounts[0];
   * }
   * ```
   */
  protected assertWallet(): asserts this is {
    context: ControllerContext & { walletClient: WalletClient };
  } {
    if (!this.context.walletClient) {
      // Get the calling method name from the stack trace for better error messages
      const stack = new Error().stack;
      const callingMethod =
        stack?.split("\n")[2]?.match(/at \w+\.(\w+)/)?.[1] ?? "this operation";

      throw new ReadOnlyError(
        callingMethod,
        "Initialize the SDK with a walletClient to perform this operation",
      );
    }
  }
}
