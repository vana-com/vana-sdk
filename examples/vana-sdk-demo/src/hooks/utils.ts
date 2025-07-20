import { addToast } from "@heroui/react";

export interface ApiHandlerOptions<TResult = void> {
  // State setters
  setLoading?: (loading: boolean) => void;
  setStatus?: (status: string) => void;

  // Messages
  loadingMessage?: string;
  successMessage?: string | ((result: TResult) => string);
  errorMessage?: string | ((error: Error) => string);

  // Callbacks
  onSuccess?: (result: TResult) => void | Promise<void>;
  onError?: (error: Error) => void;
  onFinally?: () => void;

  // Toast notifications
  showSuccessToast?: boolean;
  showErrorToast?: boolean;
  toastTitle?: string;
}

/**
 * Creates an async function that handles common API call patterns:
 * - Loading states
 * - Status messages
 * - Error handling
 * - Success/error callbacks
 * - Toast notifications
 */
export function createApiHandler<TArgs extends unknown[], TResult = void>(
  apiCall: (...args: TArgs) => Promise<TResult>,
  options: ApiHandlerOptions<TResult> = {},
) {
  return async (...args: TArgs): Promise<TResult | undefined> => {
    const {
      setLoading,
      setStatus,
      loadingMessage = "Loading...",
      successMessage = "Success!",
      errorMessage = "An error occurred",
      onSuccess,
      onError,
      onFinally,
      showSuccessToast = false,
      showErrorToast = false,
      toastTitle = "Operation",
    } = options;

    // Set loading state
    setLoading?.(true);
    setStatus?.(loadingMessage);

    try {
      // Execute the API call
      const result = await apiCall(...args);

      // Handle success
      const successMsg =
        typeof successMessage === "function"
          ? successMessage(result)
          : successMessage;

      setStatus?.(successMsg);

      if (showSuccessToast) {
        addToast({
          title: toastTitle,
          description: successMsg,
          variant: "solid",
          color: "success",
        });
      }

      // Call success callback
      await onSuccess?.(result);

      return result;
    } catch (error) {
      // Handle error
      const err = error instanceof Error ? error : new Error(String(error));
      const errorMsg =
        typeof errorMessage === "function"
          ? errorMessage(err)
          : `${errorMessage}: ${err.message}`;

      setStatus?.(`❌ ${errorMsg}`);

      if (showErrorToast) {
        addToast({
          title: toastTitle,
          description: errorMsg,
          variant: "solid",
          color: "danger",
        });
      }

      // Call error callback
      onError?.(err);

      // Log error for debugging
      console.error(`${toastTitle}:`, error);

      return undefined;
    } finally {
      // Reset loading state
      setLoading?.(false);

      // Call finally callback
      onFinally?.();
    }
  };
}

/**
 * Simplified API handler for common use cases where you just need
 * loading state and error handling without complex callbacks
 */
export function createSimpleApiHandler<TArgs extends unknown[], TResult = void>(
  apiCall: (...args: TArgs) => Promise<TResult>,
  setLoading: (loading: boolean) => void,
  setStatus: (status: string) => void,
  messages?: {
    loading?: string;
    success?: string | ((result: TResult) => string);
    error?: string;
  },
) {
  return createApiHandler(apiCall, {
    setLoading,
    setStatus,
    loadingMessage: messages?.loading,
    successMessage: messages?.success,
    errorMessage: messages?.error,
  });
}
