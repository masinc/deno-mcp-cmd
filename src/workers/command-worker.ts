/**
 * Command execution worker for running shell commands in isolated threads
 *
 * This worker handles:
 * - Command execution with stdout/stderr streaming
 * - Binary data detection and base64 encoding
 * - Process cancellation and cleanup
 * - Error handling and reporting
 */

import type { OutputId } from "../db/schema.ts";
import type { StreamData, WorkerMessage, WorkerResponse } from "./types.ts";

// Track running processes for cancellation
const runningProcesses = new Map<OutputId, Deno.ChildProcess>();

/**
 * Worker global scope type definition for proper TypeScript support
 */
declare const self: WorkerGlobalScope;

interface WorkerGlobalScope {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (message: WorkerResponse) => void;
  onerror: ((error: ErrorEvent) => void) | null;
  onunhandledrejection: ((event: PromiseRejectionEvent) => void) | null;
}

/**
 * Message handler for communication with main thread
 * Handles 'execute' and 'cancel' message types
 */
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  switch (message.type) {
    case "execute":
      executeCommand(message);
      break;
    case "cancel":
      cancelCommand(message.id);
      break;
  }
};

/**
 * Executes a shell command with streaming output
 *
 * @param message - Worker message containing command details
 */
async function executeCommand(message: WorkerMessage) {
  const { id, command, args, options } = message;

  if (!command) {
    self.postMessage({
      type: "error",
      id,
      error: "Command is required",
    } as WorkerResponse);
    return;
  }

  try {
    // Notify process start
    self.postMessage({
      type: "started",
      id,
    } as WorkerResponse);

    // Execute process using Deno.Command
    const cmd = new Deno.Command(command, {
      args: args || [],
      cwd: options?.cwd || Deno.cwd(),
      stdout: "piped",
      stderr: "piped",
      stdin: options?.stdin ? "piped" : "null",
      env: options?.env,
    });

    const process = cmd.spawn();
    runningProcesses.set(id, process);

    // Handle stdin input
    if (options?.stdin && process.stdin) {
      const writer = process.stdin.getWriter();
      try {
        await writer.write(new TextEncoder().encode(options.stdin));
        await writer.close();
      } catch (error) {
        console.error(`Failed to write stdin for ${id}:`, error);
      }
    }

    // Process streams in parallel
    const streamPromises = [];

    if (process.stdout) {
      streamPromises.push(processStream(process.stdout, "stdout", id));
    }

    if (process.stderr) {
      streamPromises.push(processStream(process.stderr, "stderr", id));
    }

    // Wait for stream processing completion
    await Promise.all(streamPromises);

    // Wait for process completion
    const status = await process.status;

    // Send completion notification
    self.postMessage({
      type: "complete",
      id,
      exitCode: status.code,
    } as WorkerResponse);
  } catch (error) {
    // Send error notification
    self.postMessage({
      type: "error",
      id,
      error: error instanceof Error ? error.message : "Unknown error",
    } as WorkerResponse);
  } finally {
    runningProcesses.delete(id);
  }
}

/**
 * Processes a readable stream and sends data chunks to main thread
 *
 * Handles both text and binary data, automatically detecting and
 * base64-encoding binary content.
 *
 * @param stream - The readable stream to process
 * @param streamType - Type of stream (stdout or stderr)
 * @param id - Output ID for tracking
 */
async function processStream(
  stream: ReadableStream<Uint8Array>,
  streamType: "stdout" | "stderr",
  id: OutputId,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });

      // Detect binary data
      const isEncoded = isBinaryData(value);
      const content = isEncoded ? btoa(String.fromCharCode(...value)) : text;

      // Send data notification
      const streamData: StreamData = {
        stream: streamType,
        content,
        isEncoded,
      };

      self.postMessage({
        type: "data",
        id,
        data: streamData,
      } as WorkerResponse);
    }
  } catch (error) {
    console.error(`Stream processing error for ${id}:`, error);
  } finally {
    reader.releaseLock();
  }
}

/**
 * Cancels a running command by terminating its process
 * @param id - Output ID of the command to cancel
 */
function cancelCommand(id: OutputId) {
  const process = runningProcesses.get(id);
  if (process) {
    try {
      process.kill("SIGTERM");
      runningProcesses.delete(id);

      // Send cancellation notification
      self.postMessage({
        type: "error",
        id,
        error: "Command cancelled",
      } as WorkerResponse);
    } catch (error) {
      console.error(`Failed to cancel process ${id}:`, error);
    }
  }
}

/**
 * Detects if data contains binary content
 *
 * Uses heuristics to determine if the data is binary:
 * 1. Presence of NULL bytes
 * 2. High percentage of control characters
 *
 * @param data - Byte array to analyze
 * @returns true if data appears to be binary
 */
function isBinaryData(data: Uint8Array): boolean {
  if (data.length === 0) return false;

  // Check for NULL characters
  for (let i = 0; i < Math.min(data.length, 1024); i++) {
    if (data[i] === 0) return true;
  }

  // Check for high percentage of control characters
  let controlChars = 0;
  for (let i = 0; i < Math.min(data.length, 1024); i++) {
    const byte = data[i];
    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
      controlChars++;
    }
  }

  return controlChars > data.length * 0.1; // More than 10% control characters
}

/**
 * Global error handlers for the worker
 *
 * These handlers catch and log any unhandled errors or promise rejections
 * that occur during worker execution.
 */
self.onerror = (error: ErrorEvent) => {
  console.error("Worker error:", error);
};

self.onunhandledrejection = (event: PromiseRejectionEvent) => {
  console.error("Unhandled promise rejection in worker:", event.reason);
};
