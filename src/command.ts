import {
  createOutputId,
  getOutputById,
  insertOutput,
  updateOutput,
} from "./db/ouputs.ts";
import type { CommandStatus, OutputId } from "./db/types.ts";
import { getWorkerPool, terminateWorkerPool } from "./workers/worker-pool.ts";
import type { CommandOptions, TaskResult } from "./workers/types.ts";

export type { CommandOptions };

// ワーカープールベースのコマンド実行
export async function runCommand(
  command: string,
  options?: CommandOptions,
): Promise<TaskResult> {
  const id = createOutputId();

  // 初期状態でDBレコード作成
  await insertOutput({
    id,
    stdout: "",
    stderr: "",
    status: "running",
    exitCode: null,
  });

  try {
    // ワーカープールでコマンド実行
    const workerPool = getWorkerPool();
    const result = await workerPool.executeCommand(
      id,
      command,
      options?.args,
      options,
    );

    return result;
  } catch (error) {
    console.error(`Command execution failed for ID ${id}:`, error);

    // エラー時はfailed状態に更新
    await updateOutput({
      id,
      stderr: error instanceof Error ? error.message : "Unknown error",
      status: "failed",
      exitCode: -1,
    });

    throw error;
  }
}

// コマンドキャンセル機能
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

// コマンド実行状態の取得
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

// コマンド実行進捗の取得
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

// ワーカープールの状態取得
export function getWorkerPoolStatus() {
  const workerPool = getWorkerPool();
  return workerPool.getStatus();
}

// 全てのコマンドの完了を待つ
export async function waitForAllCommands(): Promise<void> {
  const workerPool = getWorkerPool();
  const status = workerPool.getStatus();

  if (status.busyWorkers === 0 && status.queuedTasks === 0) {
    return;
  }

  // 簡易的なポーリング実装
  while (true) {
    const currentStatus = workerPool.getStatus();
    if (currentStatus.busyWorkers === 0 && currentStatus.queuedTasks === 0) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

// クリーンアップ関数
export async function cleanup(): Promise<void> {
  console.log("Cleaning up command execution resources...");
  await terminateWorkerPool();
  console.log("Command execution cleanup completed");
}

// プロセス終了時の自動クリーンアップ
if (typeof Deno !== "undefined") {
  // Deno環境でのクリーンアップ
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
