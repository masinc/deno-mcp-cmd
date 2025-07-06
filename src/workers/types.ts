import type { OutputId } from "../db/schema.ts";

// コマンド実行オプション
export interface CommandOptions {
  args?: string[];
  cwd?: string;
  stdin?: string;
  env?: Record<string, string>;
}

// ワーカーに送信するメッセージ型
export interface WorkerMessage {
  type: "execute" | "cancel";
  id: OutputId;
  command?: string;
  args?: string[];
  options?: CommandOptions;
}

// ワーカーからの応答型
export interface WorkerResponse {
  type: "started" | "data" | "error" | "complete";
  id: OutputId;
  data?: StreamData;
  error?: string;
  exitCode?: number;
}

// ストリームデータ型
export interface StreamData {
  stream: "stdout" | "stderr";
  content: string;
  isEncoded: boolean;
}

// ワーカーインスタンス型
export interface WorkerInstance {
  worker: Worker;
  busy: boolean;
  id: number;
  currentTask?: OutputId;
}

// キューイングされたタスク型
export interface QueuedTask {
  id: OutputId;
  command: string;
  args?: string[];
  options?: CommandOptions;
  resolve: (value: TaskResult) => void;
  reject: (error: Error) => void;
}

// タスク実行結果型
export interface TaskResult {
  id: OutputId;
  status: "running";
}

// タスク完了結果型
export interface TaskCompletionResult {
  exitCode?: number;
  error?: string;
}

// ワーカープールステータス型
export interface WorkerPoolStatus {
  totalWorkers: number;
  busyWorkers: number;
  queuedTasks: number;
  maxWorkers: number;
}

// 実行中コマンド管理型
export interface RunningCommand {
  promise: Promise<void>;
  controller: AbortController;
}

// ワーカープール設定型
export interface WorkerPoolConfig {
  maxWorkers?: number;
  workerTimeout?: number;
  retryAttempts?: number;
}

// バイナリデータ検出設定型
export interface BinaryDetectionConfig {
  maxSampleSize: number;
  controlCharThreshold: number;
}

// ストリーム処理設定型
export interface StreamProcessingConfig {
  bufferSize?: number;
  flushInterval?: number;
  encoding?: string;
}

// コマンド実行統計型
export interface CommandExecutionStats {
  totalExecuted: number;
  currentlyRunning: number;
  successfulCompletions: number;
  failedExecutions: number;
  cancelledExecutions: number;
  averageExecutionTime: number;
}

// エラー型定義
export class WorkerError extends Error {
  constructor(
    message: string,
    public readonly workerId: number,
    public readonly taskId?: OutputId,
  ) {
    super(message);
    this.name = "WorkerError";
  }
}

export class TaskCancelledError extends Error {
  constructor(public readonly taskId: OutputId) {
    super(`Task ${taskId} was cancelled`);
    this.name = "TaskCancelledError";
  }
}

export class WorkerPoolError extends Error {
  constructor(message: string, public readonly poolStatus: WorkerPoolStatus) {
    super(message);
    this.name = "WorkerPoolError";
  }
}

// コマンド実行状態型
export type CommandExecutionState =
  | "pending"
  | "starting"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

// ワーカー状態型
export type WorkerState = "idle" | "busy" | "error" | "terminated";

// 実行優先度型
export type ExecutionPriority = "low" | "normal" | "high" | "urgent";

// ワーカー作成オプション型
export interface WorkerCreationOptions {
  permissions?: {
    run?: boolean;
    read?: boolean;
    write?: boolean;
    env?: boolean;
    net?: boolean;
  };
  type?: "module" | "classic";
  credentials?: "omit" | "same-origin" | "include";
}

// パフォーマンス監視メトリクス型
export interface PerformanceMetrics {
  workerCreationTime: number;
  taskQueueTime: number;
  executionTime: number;
  memoryUsage: number;
  cpuUsage: number;
}

// デバッグ情報型
export interface DebugInfo {
  workerId: number;
  taskId: OutputId;
  startTime: number;
  endTime?: number;
  memorySnapshot?: number;
  errorDetails?: string;
}
