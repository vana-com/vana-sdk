import {
  parseEventLogs,
  type Log,
  type TransactionReceipt,
  type Hash,
} from "viem";
import type {
  SchemaAddedResult,
  FileAddedResult,
  RefinerAddedResult,
} from "../types/transactionResults";
import { getAbi } from "../generated/abi";

/**
 * Error thrown when expected events are not found in transaction logs
 */
export class EventParsingError extends Error {
  constructor(
    public readonly eventName: string,
    public readonly transactionHash: Hash,
    message?: string,
  ) {
    super(
      message ||
        `Event "${eventName}" not found in transaction ${transactionHash}`,
    );
    this.name = "EventParsingError";
  }
}

/**
 * Parses SchemaAdded event from a transaction receipt.
 *
 * @param receipt - The transaction receipt containing event logs.
 * @returns A SchemaAddedResult with the schema ID and metadata from the event.
 * @throws {EventParsingError} When the SchemaAdded event is not present in the receipt logs.
 */
export function parseSchemaAddedEvent(
  receipt: TransactionReceipt,
): SchemaAddedResult {
  const abi = getAbi("DataRefinerRegistry");

  const logs = parseEventLogs({
    abi,
    logs: receipt.logs as Log[],
    eventName: "SchemaAdded",
  });

  if (logs.length === 0) {
    throw new EventParsingError("SchemaAdded", receipt.transactionHash);
  }

  const event = logs[0];
  return {
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    schemaId: event.args.schemaId as bigint,
    name: event.args.name as string,
    dialect: event.args.dialect as string,
    definitionUrl: event.args.definitionUrl as string,
  };
}

/**
 * Parses FileAddedV2 event from a transaction receipt.
 *
 * @param receipt - The transaction receipt containing event logs.
 * @returns A FileAddedResult with the file ID and metadata from the event.
 * @throws {EventParsingError} When the FileAddedV2 event is not present in the receipt logs.
 */
export function parseFileAddedEvent(
  receipt: TransactionReceipt,
): FileAddedResult {
  const abi = getAbi("DataRegistry");

  const logs = parseEventLogs({
    abi,
    logs: receipt.logs as Log[],
    eventName: "FileAddedV2",
  });

  if (logs.length === 0) {
    throw new EventParsingError("FileAddedV2", receipt.transactionHash);
  }

  const event = logs[0];
  // FileAddedV2 event has 'ownerAddress' field, not 'owner'
  return {
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    fileId: event.args.fileId as bigint,
    ownerAddress: event.args.ownerAddress as `0x${string}`,
    url: event.args.url as string,
    schemaId: event.args.schemaId as bigint,
  };
}

/**
 * Parses RefinerAdded event from a transaction receipt.
 *
 * @param receipt - The transaction receipt containing event logs.
 * @returns A RefinerAddedResult with the refiner ID and metadata from the event.
 * @throws {EventParsingError} When the RefinerAdded event is not present in the receipt logs.
 */
export function parseRefinerAddedEvent(
  receipt: TransactionReceipt,
): RefinerAddedResult {
  const abi = getAbi("DataRefinerRegistry");

  const logs = parseEventLogs({
    abi,
    logs: receipt.logs as Log[],
    eventName: "RefinerAdded",
  });

  if (logs.length === 0) {
    throw new EventParsingError("RefinerAdded", receipt.transactionHash);
  }

  const event = logs[0];
  return {
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    refinerId: event.args.refinerId as bigint,
    dlpId: event.args.dlpId as bigint,
    name: event.args.name as string,
    schemaId: event.args.schemaId as bigint,
    schemaDefinitionUrl: event.args.schemaDefinitionUrl as string,
    refinementInstructionUrl: event.args.refinementInstructionUrl as string,
  };
}
