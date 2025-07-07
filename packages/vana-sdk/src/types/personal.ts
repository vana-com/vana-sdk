import type { Address } from "viem";

/**
 * Parameters for the `vana.personal.postRequest` method.
 */
export interface PostRequestParams {
  /** The permission ID */
  permissionId: number;
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
  input: Record<string, any>;
  /** Optional output if computation is complete */
  output?: any;
  /** Optional error if computation failed */
  error?: string;
}
