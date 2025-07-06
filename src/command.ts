import {
  createOutputId,
  getOutputById,
  insertOutput,
  updateOutput,
} from "./db/ouputs.ts";
import type { CommandStatus, OutputId } from "./db/types.ts";
import { getWorkerPool, terminateWorkerPool } from "./workers/worker-pool.ts";
import type { CommandOptions, TaskResult } from "./workers/types.ts";
import { homedir } from "node:os";
import { resolve } from "@std/path";

export type { CommandOptions };

/**
 * Normalizes a path by expanding tilde (~) and resolving relative paths
 * @param path - The path to normalize
 * @returns The normalized absolute path
 */
function normalizePath(path: string): string {
  if (path.startsWith("~/")) {
    return resolve(homedir(), path.slice(2));
  } else if (path === "~") {
    return homedir();
  }
  return resolve(path);
}

/**
 * Executes a shell command using the worker pool with database tracking
 *
 * Creates a database record for tracking execution progress and manages
 * the command lifecycle through the worker pool system.
 *
 * @param command - The command to execute
 * @param options - Optional command execution options (args, cwd, stdin)
 * @returns Promise resolving to task result with execution ID and status
 * @throws Error if command execution fails
 */
export async function runCommand(
  command: string,
  options?: CommandOptions,
): Promise<TaskResult> {
  const id = createOutputId();

  // Normalize cwd path (tilde expansion + path resolution)
  const normalizedOptions = options
    ? {
      ...options,
      cwd: options.cwd ? normalizePath(options.cwd) : options.cwd,
    }
    : options;

  // Create initial database record
  await insertOutput({
    id,
    stdout: "",
    stderr: "",
    status: "running",
    exitCode: null,
    cwd: normalizedOptions?.cwd || Deno.cwd(),
  });

  try {
    // Execute command using worker pool
    const workerPool = getWorkerPool();
    const result = await workerPool.executeCommand(
      id,
      command,
      normalizedOptions?.args,
      normalizedOptions,
    );

    return result;
  } catch (error) {
    console.error(`Command execution failed for ID ${id}:`, error);

    // Update to failed status on error
    await updateOutput({
      id,
      stderr: error instanceof Error ? error.message : "Unknown error",
      status: "failed",
      exitCode: -1,
    });

    throw error;
  }
}

/**
 * Cancels a running command by its output ID
 *
 * Attempts to cancel the command execution and updates the database
 * with cancellation status.
 *
 * @param id - The output ID of the command to cancel
 * @returns Promise resolving to true if command was cancelled, false otherwise
 */
export async function cancelCommand(id: OutputId): Promise<boolean> {
  const workerPool = getWorkerPool();
  const cancelled = workerPool.cancelCommand(id);

  if (cancelled) {
    await updateOutput({
      id,
      status: "failed",
      exitCode: -1,
      stderr: "Command cancelled by user",
    });
  }

  return cancelled;
}

/**
 * Retrieves the current status of a command execution
 *
 * @param id - The output ID of the command
 * @returns Promise resolving to command status or "not_found" if command doesn't exist
 */
export async function getCommandStatus(
  id: OutputId,
): Promise<CommandStatus | "not_found"> {
  try {
    const output = await getOutputById(id);
    if (!output) return "not_found";

    return output.status;
  } catch {
    return "not_found";
  }
}

/**
 * Retrieves detailed progress information for a command execution
 *
 * @param id - The output ID of the command
 * @returns Promise resolving to progress information including status, output, and metadata, or null if not found
 */
export async function getCommandProgress(id: OutputId) {
  try {
    const output = await getOutputById(id);
    if (!output) return null;

    return {
      status: output.status,
      exitCode: output.exitCode,
      hasOutput: output.stdout.length > 0 || output.stderr.length > 0,
      currentOutput: {
        stdout: output.stdout,
        stderr: output.stderr,
        stdoutIsEncoded: output.stdoutIsEncoded,
        stderrIsEncoded: output.stderrIsEncoded,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Gets the current status of the worker pool
 *
 * @returns Current worker pool status including active workers and queued tasks
 */
export function getWorkerPoolStatus() {
  const workerPool = getWorkerPool();
  return workerPool.getStatus();
}

/**
 * Waits for all currently running and queued commands to complete
 *
 * Uses polling to check worker pool status until all tasks are finished.
 *
 * @returns Promise that resolves when all commands are complete
 */
export async function waitForAllCommands(): Promise<void> {
  const workerPool = getWorkerPool();
  const status = workerPool.getStatus();

  if (status.busyWorkers === 0 && status.queuedTasks === 0) {
    return;
  }

  // Simple polling implementation
  while (true) {
    const currentStatus = workerPool.getStatus();
    if (currentStatus.busyWorkers === 0 && currentStatus.queuedTasks === 0) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * Cleans up command execution resources
 *
 * Terminates the worker pool and performs cleanup operations.
 * Called automatically on process signals (SIGINT, SIGTERM).
 *
 * @returns Promise that resolves when cleanup is complete
 */
export async function cleanup(): Promise<void> {
  console.log("Cleaning up command execution resources...");
  await terminateWorkerPool();
  console.log("Command execution cleanup completed");
}

// Automatic cleanup on process termination
if (typeof Deno !== "undefined") {
  // Cleanup for Deno environment
  Deno.addSignalListener("SIGINT", async () => {
    console.log("Received SIGINT, cleaning up...");
    await cleanup();
    Deno.exit(0);
  });

  Deno.addSignalListener("SIGTERM", async () => {
    console.log("Received SIGTERM, cleaning up...");
    await cleanup();
    Deno.exit(0);
  });
}
