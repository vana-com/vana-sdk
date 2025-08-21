import { parseEventLogs, type Log, type TransactionReceipt, type Hash } from "viem";
import type { 
  SchemaAddedResult, 
  FileAddedResult,
  PermissionGrantResult,
  RefinerAddedResult
} from "../types/transactionResults";
import { getAbi } from "../generated/abi";

/**
 * Error thrown when expected events are not found in transaction logs
 */
export class EventParsingError extends Error {
  constructor(
    public readonly eventName: string,
    public readonly transactionHash: Hash,
    message?: string
  ) {
    super(message || `Event "${eventName}" not found in transaction ${transactionHash}`);
    this.name = "EventParsingError";
  }
}

/**
 * Parse SchemaAdded event from transaction receipt
 * @throws {EventParsingError} When SchemaAdded event is not found
 */
export function parseSchemaAddedEvent(receipt: TransactionReceipt): SchemaAddedResult {
  const abi = getAbi("DataRefinerRegistry");
  
  const logs = parseEventLogs({
    abi,
    logs: receipt.logs as Log[],
    eventName: "SchemaAdded"
  });

  if (logs.length === 0) {
    throw new EventParsingError("SchemaAdded", receipt.transactionHash);
  }

  const event = logs[0];
  return {
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    schemaId: event.args.schemaId as bigint,
    name: event.args.name as string,
    dialect: event.args.dialect as string,
    definitionUrl: event.args.definitionUrl as string,
  };
}

/**
 * Parse FileAddedV2 event from transaction receipt
 * @throws {EventParsingError} When FileAddedV2 event is not found
 */
export function parseFileAddedEvent(receipt: TransactionReceipt): FileAddedResult {
  const abi = getAbi("DataRegistry");
  
  const logs = parseEventLogs({
    abi,
    logs: receipt.logs as Log[],
    eventName: "FileAddedV2"
  });

  if (logs.length === 0) {
    throw new EventParsingError("FileAddedV2", receipt.transactionHash);
  }

  const event = logs[0];
  return {
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    fileId: event.args.fileId as bigint,
    ownerAddress: event.args.owner as `0x${string}`,
    url: event.args.url as string,
    schemaId: event.args.schemaId as bigint,
  };
}

/**
 * Parse PermissionGranted event from transaction receipt
 * @throws {EventParsingError} When PermissionGranted event is not found
 */
export function parsePermissionGrantedEvent(receipt: TransactionReceipt): PermissionGrantResult {
  const abi = getAbi("DataPortability");
  
  const logs = parseEventLogs({
    abi,
    logs: receipt.logs as Log[],
    eventName: "PermissionGranted"
  });

  if (logs.length === 0) {
    throw new EventParsingError("PermissionGranted", receipt.transactionHash);
  }

  const event = logs[0];
  return {
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    permissionId: event.args.permissionId as bigint,
    owner: event.args.owner as `0x${string}`,
    grantee: event.args.grantee as `0x${string}`,
    expirationTime: event.args.expirationTime as bigint,
  };
}

/**
 * Parse RefinerAdded event from transaction receipt
 * @throws {EventParsingError} When RefinerAdded event is not found
 */
export function parseRefinerAddedEvent(receipt: TransactionReceipt): RefinerAddedResult {
  const abi = getAbi("DataRefinerRegistry");
  
  const logs = parseEventLogs({
    abi,
    logs: receipt.logs as Log[],
    eventName: "RefinerAdded"
  });

  if (logs.length === 0) {
    throw new EventParsingError("RefinerAdded", receipt.transactionHash);
  }

  const event = logs[0];
  return {
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    refinerId: event.args.refinerId as bigint,
    dlpId: event.args.dlpId as bigint,
    name: event.args.name as string,
    schemaId: event.args.schemaId as bigint,
    refinementInstructionUrl: event.args.refinementInstructionUrl as string,
  };
}