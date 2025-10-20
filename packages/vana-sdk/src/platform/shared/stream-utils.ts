/**
 * Shared stream utilities for platform adapters
 *
 * IMPORTANT: This module contains NO IMPORTS to avoid affecting bundle loading.
 * All functions are pure utilities that can be safely shared across platforms.
 */

/**
 * Convert ReadableStream to Uint8Array
 * Used primarily in Node.js environment where OpenPGP may return streams
 *
 * @param stream The ReadableStream to convert
 * @returns Promise resolving to Uint8Array containing all stream data
 */
export async function streamToUint8Array(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  // Concatenate all chunks
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}
