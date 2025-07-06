import type { OutputId } from "../db/types.ts";
import { updateOutput, updateStreamOutput } from "../db/ouputs.ts";
import type {
  CommandOptions,
  QueuedTask,
  StreamData,
  TaskCompletionResult,
  TaskResult,
  WorkerInstance,
  WorkerMessage,
  WorkerPoolStatus,
  WorkerResponse,
} from "./types.ts";

/**
 * Worker pool for managing concurrent command execution
 * 
 * Manages a pool of worker threads to execute shell commands concurrently.
 * Handles task queuing, worker lifecycle, and result tracking.
 */
export class CommandWorkerPool {
  private workers: WorkerInstance[] = [];
  private queue: QueuedTask[] = [];
  private maxWorkers: number;
  private currentWorkers = 0;
  private taskResults = new Map<OutputId, TaskCompletionResult>();

  /**
   * Creates a new CommandWorkerPool instance
   * @param maxWorkers - Maximum number of workers (defaults to half of CPU cores)
   */
  constructor(maxWorkers?: number) {
    // Determine worker count based on CPU cores
    this.maxWorkers = maxWorkers ||
      Math.max(1, Math.floor((navigator.hardwareConcurrency || 4) / 2));
    console.log(
      `CommandWorkerPool initialized with ${this.maxWorkers} max workers`,
    );
  }

  /**
   * Executes a command using the worker pool
   * 
   * @param id - Unique output ID for tracking
   * @param command - Command to execute
   * @param args - Optional command arguments
   * @param options - Optional execution options
   * @returns Promise resolving to task result
   */
  executeCommand(
    id: OutputId,
    command: string,
    args?: string[],
    options?: CommandOptions,
  ): Promise<TaskResult> {
    return new Promise((resolve, reject) => {
      const task: QueuedTask = {
        id,
        command,
        args,
        options,
        resolve,
        reject,
      };

      this.queue.push(task);
      this.processQueue();
    });
  }

  /**
   * Processes the task queue by assigning tasks to available workers
   */
  private processQueue(): void {
    if (this.queue.length === 0) return;

    // Find an available worker
    let worker = this.workers.find((w) => !w.busy);

    // Create a new worker if none available and under limit
    if (!worker && this.currentWorkers < this.maxWorkers) {
      try {
        worker = this.createWorker();
      } catch (error) {
        console.error("Failed to create worker:", error);
        return;
      }
    }

    if (!worker) return; // All workers are busy

    const task = this.queue.shift()!;
    worker.busy = true;
    worker.currentTask = task.id;

    // Send task to worker
    worker.worker.postMessage({
      type: "execute",
      id: task.id,
      command: task.command,
      args: task.args,
      options: task.options,
    } as WorkerMessage);

    // Track task completion
    this.setupTaskHandlers(worker, task);
  }

  /**
   * Sets up event handlers for a worker task
   * @param worker - Worker instance handling the task
   * @param task - Task being processed
   */
  private setupTaskHandlers(worker: WorkerInstance, task: QueuedTask): void {
    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;

      // 他のタスクからのメッセージは無視
      if (message.id !== task.id) return;

      switch (message.type) {
        case "started":
          task.resolve({ id: message.id, status: "running" });
          break;

        case "data":
          if (message.data) {
            this.handleStreamData(message.id, message.data).catch((error) => {
              console.error(
                `Failed to handle stream data for ${message.id}:`,
                error,
              );
            });
          }
          break;

        case "complete":
          this.taskResults.set(message.id, { exitCode: message.exitCode });
          // Update database with completion status
          this.updateTaskCompletion(message.id, message.exitCode).catch(
            (error) => {
              console.error(
                `Failed to update task completion for ${message.id}:`,
                error,
              );
            },
          );
          this.finishTask(worker);
          break;

        case "error":
          this.taskResults.set(message.id, { error: message.error });
          // Update database with error status
          this.updateTaskError(message.id, message.error).catch((error) => {
            console.error(
              `Failed to update task error for ${message.id}:`,
              error,
            );
          });
          task.reject(new Error(message.error || "Unknown worker error"));
          this.finishTask(worker);
          break;
      }
    };

    const onError = (error: ErrorEvent) => {
      console.error(`Worker ${worker.id} error:`, error);
      task.reject(new Error(`Worker error: ${error.message}`));
      this.finishTask(worker);
    };

    worker.worker.addEventListener("message", onMessage);
    worker.worker.addEventListener("error", onError);

    // Cleanup on task completion
    const cleanup = () => {
      worker.worker.removeEventListener("message", onMessage);
      worker.worker.removeEventListener("error", onError);
    };

    // Execute cleanup on completion
    const originalFinish = this.finishTask.bind(this);
    this.finishTask = (w: WorkerInstance) => {
      if (w === worker) {
        cleanup();
        this.finishTask = originalFinish;
      }
      originalFinish(w);
    };
  }

  /**
   * Marks a task as finished and processes the next task in queue
   * @param worker - Worker instance that finished the task
   */
  private finishTask(worker: WorkerInstance): void {
    worker.busy = false;
    worker.currentTask = undefined;

    // Process next task in queue
    this.processQueue();
  }

  /**
   * Creates a new worker instance with proper permissions and error handling
   * @returns New worker instance
   */
  private createWorker(): WorkerInstance {
    const workerUrl = new URL("./command-worker.ts", import.meta.url);

    const worker = new Worker(workerUrl, {
      type: "module",
      deno: {
        permissions: {
          run: true,
          read: true,
          write: true,
          env: true,
          sys: true,
        },
      },
    });

    const workerInstance: WorkerInstance = {
      worker,
      busy: false,
      id: this.currentWorkers++,
    };

    // Worker error handling
    worker.onerror = (error) => {
      console.error(`Worker ${workerInstance.id} error:`, error);
      this.removeWorker(workerInstance);
    };

    worker.onmessageerror = (error) => {
      console.error(`Worker ${workerInstance.id} message error:`, error);
      this.removeWorker(workerInstance);
    };

    this.workers.push(workerInstance);
    console.log(
      `Created worker ${workerInstance.id}, total workers: ${this.workers.length}`,
    );

    return workerInstance;
  }

  /**
   * Removes a worker from the pool
   * @param workerInstance - Worker instance to remove
   */
  private removeWorker(workerInstance: WorkerInstance): void {
    const index = this.workers.indexOf(workerInstance);
    if (index !== -1) {
      this.workers.splice(index, 1);
      console.log(
        `Removed worker ${workerInstance.id}, remaining workers: ${this.workers.length}`,
      );
    }
  }

  /**
   * Handles streaming data from worker and updates database
   * @param id - Output ID for the command
   * @param data - Stream data to process
   */
  private async handleStreamData(
    id: OutputId,
    data: StreamData,
  ): Promise<void> {
    try {
      await updateStreamOutput(id, data.stream, data.content, data.isEncoded);
    } catch (error) {
      console.error(`Failed to update stream output for ${id}:`, error);
    }
  }

  /**
   * Cancels a command by removing it from queue or signaling running worker
   * @param id - Output ID of the command to cancel
   * @returns true if command was found and cancelled, false otherwise
   */
  cancelCommand(id: OutputId): boolean {
    // Remove task from queue
    const queueIndex = this.queue.findIndex((task) => task.id === id);
    if (queueIndex !== -1) {
      const task = this.queue.splice(queueIndex, 1)[0];
      task.reject(new Error("Command cancelled"));
      return true;
    }

    // Cancel running task
    const worker = this.workers.find((w) => w.currentTask === id);
    if (worker) {
      worker.worker.postMessage({
        type: "cancel",
        id,
      } as WorkerMessage);
      return true;
    }

    return false;
  }

  /**
   * Gets the completion result for a task
   * @param id - Output ID of the task
   * @returns Task completion result or undefined if not found
   */
  getTaskResult(id: OutputId): TaskCompletionResult | undefined {
    return this.taskResults.get(id);
  }

  /**
   * Gets the current status of the worker pool
   * @returns Current pool status including worker counts and queue size
   */
  getStatus(): WorkerPoolStatus {
    return {
      totalWorkers: this.workers.length,
      busyWorkers: this.workers.filter((w) => w.busy).length,
      queuedTasks: this.queue.length,
      maxWorkers: this.maxWorkers,
    };
  }

  /**
   * Terminates all workers and cleans up resources
   * @returns Promise that resolves when termination is complete
   */
  async terminate(): Promise<void> {
    console.log("Terminating worker pool...");

    // Terminate all workers
    await Promise.all(
      this.workers.map((w) => {
        try {
          w.worker.terminate();
          return Promise.resolve();
        } catch (error) {
          console.error(`Failed to terminate worker ${w.id}:`, error);
          return Promise.resolve();
        }
      }),
    );

    // Reject pending tasks
    this.queue.forEach((task) => {
      task.reject(new Error("Worker pool terminated"));
    });

    // Clear state
    this.workers = [];
    this.queue = [];
    this.currentWorkers = 0;
    this.taskResults.clear();

    console.log("Worker pool terminated");
  }

  /**
   * Updates database with task completion status
   * @param id - Output ID of the completed task
   * @param exitCode - Exit code of the completed command
   */
  private async updateTaskCompletion(
    id: OutputId,
    exitCode?: number,
  ): Promise<void> {
    try {
      await updateOutput({
        id,
        status: "completed",
        exitCode: exitCode ?? null,
      });
    } catch (error) {
      console.error(`Failed to update task completion for ${id}:`, error);
    }
  }

  /**
   * Updates database with task error status
   * @param id - Output ID of the failed task
   * @param error - Error message
   */
  private async updateTaskError(id: OutputId, error?: string): Promise<void> {
    try {
      await updateOutput({
        id,
        status: "failed",
        stderr: error ?? "Unknown error",
        exitCode: -1,
      });
    } catch (updateError) {
      console.error(`Failed to update task error for ${id}:`, updateError);
    }
  }
}

// Singleton instance
let workerPool: CommandWorkerPool | null = null;

/**
 * Gets the singleton worker pool instance, creating it if necessary
 * @returns The worker pool instance
 */
export function getWorkerPool(): CommandWorkerPool {
  if (!workerPool) {
    workerPool = new CommandWorkerPool();
  }
  return workerPool;
}

/**
 * Terminates the singleton worker pool if it exists
 * @returns Promise that resolves when termination is complete
 */
export async function terminateWorkerPool(): Promise<void> {
  if (workerPool) {
    await workerPool.terminate();
    workerPool = null;
  }
}
