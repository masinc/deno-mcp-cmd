import type { OutputId } from "../db/types.ts";
import type { StreamData, WorkerMessage, WorkerResponse } from "./types.ts";

// 実行中のプロセス管理
const runningProcesses = new Map<OutputId, Deno.ChildProcess>();

// Worker環境のグローバル変数を型定義
declare const self: WorkerGlobalScope;

interface WorkerGlobalScope {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (message: WorkerResponse) => void;
  onerror: ((error: ErrorEvent) => void) | null;
  onunhandledrejection: ((event: PromiseRejectionEvent) => void) | null;
}

// メインスレッドからのメッセージ処理
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
    // プロセス開始通知
    self.postMessage({
      type: "started",
      id,
    } as WorkerResponse);

    // Deno.Commandでプロセス実行
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

    // stdin処理
    if (options?.stdin && process.stdin) {
      const writer = process.stdin.getWriter();
      try {
        await writer.write(new TextEncoder().encode(options.stdin));
        await writer.close();
      } catch (error) {
        console.error(`Failed to write stdin for ${id}:`, error);
      }
    }

    // ストリーム処理を並列実行
    const streamPromises = [];

    if (process.stdout) {
      streamPromises.push(processStream(process.stdout, "stdout", id));
    }

    if (process.stderr) {
      streamPromises.push(processStream(process.stderr, "stderr", id));
    }

    // ストリーム処理完了待機
    await Promise.all(streamPromises);

    // プロセス完了待機
    const status = await process.status;

    // 完了通知
    self.postMessage({
      type: "complete",
      id,
      exitCode: status.code,
    } as WorkerResponse);
  } catch (error) {
    // エラー通知
    self.postMessage({
      type: "error",
      id,
      error: error instanceof Error ? error.message : "Unknown error",
    } as WorkerResponse);
  } finally {
    runningProcesses.delete(id);
  }
}

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

      // バイナリデータの検出
      const isEncoded = isBinaryData(value);
      const content = isEncoded ? btoa(String.fromCharCode(...value)) : text;

      // データ通知
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

function cancelCommand(id: OutputId) {
  const process = runningProcesses.get(id);
  if (process) {
    try {
      process.kill("SIGTERM");
      runningProcesses.delete(id);

      // キャンセル通知
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

// バイナリデータの検出
function isBinaryData(data: Uint8Array): boolean {
  if (data.length === 0) return false;

  // NULL文字が含まれているか確認
  for (let i = 0; i < Math.min(data.length, 1024); i++) {
    if (data[i] === 0) return true;
  }

  // 制御文字の割合が高いか確認
  let controlChars = 0;
  for (let i = 0; i < Math.min(data.length, 1024); i++) {
    const byte = data[i];
    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
      controlChars++;
    }
  }

  return controlChars > data.length * 0.1; // 10%以上が制御文字
}

// エラーハンドリング
self.onerror = (error: ErrorEvent) => {
  console.error("Worker error:", error);
};

self.onunhandledrejection = (event: PromiseRejectionEvent) => {
  console.error("Unhandled promise rejection in worker:", event.reason);
};
