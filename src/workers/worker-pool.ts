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

export class CommandWorkerPool {
  private workers: WorkerInstance[] = [];
  private queue: QueuedTask[] = [];
  private maxWorkers: number;
  private currentWorkers = 0;
  private taskResults = new Map<OutputId, TaskCompletionResult>();

  constructor(maxWorkers?: number) {
    // CPU コア数に基づいてワーカー数を決定
    this.maxWorkers = maxWorkers ||
      Math.max(1, Math.floor((navigator.hardwareConcurrency || 4) / 2));
    console.log(
      `CommandWorkerPool initialized with ${this.maxWorkers} max workers`,
    );
  }

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

  private processQueue(): void {
    if (this.queue.length === 0) return;

    // 空いているワーカーを探す
    let worker = this.workers.find((w) => !w.busy);

    // 空いているワーカーがない場合、新しいワーカーを作成
    if (!worker && this.currentWorkers < this.maxWorkers) {
      try {
        worker = this.createWorker();
      } catch (error) {
        console.error("Failed to create worker:", error);
        return;
      }
    }

    if (!worker) return; // 全てのワーカーが使用中

    const task = this.queue.shift()!;
    worker.busy = true;
    worker.currentTask = task.id;

    // ワーカーにタスクを送信
    worker.worker.postMessage({
      type: "execute",
      id: task.id,
      command: task.command,
      args: task.args,
      options: task.options,
    } as WorkerMessage);

    // タスクの完了を追跡
    this.setupTaskHandlers(worker, task);
  }

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

    // タスク完了時のクリーンアップ
    const cleanup = () => {
      worker.worker.removeEventListener("message", onMessage);
      worker.worker.removeEventListener("error", onError);
    };

    // 完了時にクリーンアップを実行
    const originalFinish = this.finishTask.bind(this);
    this.finishTask = (w: WorkerInstance) => {
      if (w === worker) {
        cleanup();
        this.finishTask = originalFinish;
      }
      originalFinish(w);
    };
  }

  private finishTask(worker: WorkerInstance): void {
    worker.busy = false;
    worker.currentTask = undefined;

    // 次のタスクを処理
    this.processQueue();
  }

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

    // ワーカーのエラーハンドリング
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

  private removeWorker(workerInstance: WorkerInstance): void {
    const index = this.workers.indexOf(workerInstance);
    if (index !== -1) {
      this.workers.splice(index, 1);
      console.log(
        `Removed worker ${workerInstance.id}, remaining workers: ${this.workers.length}`,
      );
    }
  }

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

  cancelCommand(id: OutputId): boolean {
    // キューからタスクを削除
    const queueIndex = this.queue.findIndex((task) => task.id === id);
    if (queueIndex !== -1) {
      const task = this.queue.splice(queueIndex, 1)[0];
      task.reject(new Error("Command cancelled"));
      return true;
    }

    // 実行中のタスクをキャンセル
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

  getTaskResult(id: OutputId): TaskCompletionResult | undefined {
    return this.taskResults.get(id);
  }

  getStatus(): WorkerPoolStatus {
    return {
      totalWorkers: this.workers.length,
      busyWorkers: this.workers.filter((w) => w.busy).length,
      queuedTasks: this.queue.length,
      maxWorkers: this.maxWorkers,
    };
  }

  async terminate(): Promise<void> {
    console.log("Terminating worker pool...");

    // 全てのワーカーを終了
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

    // 待機中のタスクを拒否
    this.queue.forEach((task) => {
      task.reject(new Error("Worker pool terminated"));
    });

    // 状態をクリア
    this.workers = [];
    this.queue = [];
    this.currentWorkers = 0;
    this.taskResults.clear();

    console.log("Worker pool terminated");
  }

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

// シングルトンインスタンス
let workerPool: CommandWorkerPool | null = null;

export function getWorkerPool(): CommandWorkerPool {
  if (!workerPool) {
    workerPool = new CommandWorkerPool();
  }
  return workerPool;
}

export async function terminateWorkerPool(): Promise<void> {
  if (workerPool) {
    await workerPool.terminate();
    workerPool = null;
  }
}
