/**
 * Parameters for the `vana.personal.postRequest` method.
 */
export interface PostRequestParams {
  /** The permission ID */
  permissionId: number;
}

/**
 * Parameters for the `vana.personal.initPersonalServer` method.
 */
export interface InitPersonalServerParams {
  /** The user's wallet address */
  userAddress: string;
}

/**
 * Response from the personal server containing a link to get results or cancel computation.
 */
export interface ReplicatePredictionResponse {
  /** The prediction ID for tracking the computation */
  id: string;
  /** The status of the computation */
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  /** URL to check the status and get results */
  urls: {
    get: string;
    cancel: string;
  };
  /** The input parameters used for the computation */
  input: Record<string, unknown>;
  /** Optional output if computation is complete */
  output?: unknown;
  /** Optional error if computation failed */
  error?: string;
}

/**
 * Response from the personal server containing user identity information.
 */
export interface PersonalServerResponse {
  /** The user's wallet address */
  userAddress: string;
  /** The user's identity information */
  identity: {
    /** Additional identity metadata */
    metadata?: {
      /** Derived address for the personal server */
      derivedAddress?: string;
      /** Public key for encryption */
      publicKey?: string;
    } & Record<string, unknown>;
  };
  /** Timestamp when the identity was fetched */
  timestamp: string;
}
