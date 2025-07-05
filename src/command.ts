import {
  createOutputId,
  getOutputById,
  insertOutput,
  updateOutput,
  updateStreamOutput,
} from "./db/ouputs.ts";
import type { CommandStatus, OutputId } from "./db/types.ts";
import { encodeBase64 } from "@std/encoding";

type StreamChunk = {
  content: string | Uint8Array;
  displayText: string;
  timestamp: number;
  type: "stdout" | "stderr";
};

type CommandOptions = {
  args?: string[];
  stdin?: string | Uint8Array;
  cwd?: string;
  env?: Record<string, string>;
};

function isBinaryData(content: string | Uint8Array): content is Uint8Array {
  return content instanceof Uint8Array;
}

function isStringData(content: string | Uint8Array): content is string {
  return typeof content === "string";
}

function combineBinaryChunks(chunks: Uint8Array[]): Uint8Array {
  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(totalSize);
  let offset = 0;

  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  return combined;
}

async function writeStdinData(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  data: string | Uint8Array,
) {
  try {
    const stdinData = typeof data === "string"
      ? new TextEncoder().encode(data)
      : data;
    await writer.write(stdinData);
    await writer.close();
  } catch (error) {
    await writer.abort();
    throw new Error(
      `Failed to write stdin: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

async function processStream(
  stream: ReadableStream<Uint8Array>,
  type: "stdout" | "stderr",
  outputId: OutputId,
) {
  const chunks: StreamChunk[] = [];

  await stream.pipeTo(
    new WritableStream({
      write(chunk) {
        try {
          const content = new TextDecoder("utf-8", { fatal: true }).decode(
            chunk,
          );
          const chunkData = {
            content,
            displayText: content,
            timestamp: performance.now(),
            type,
          };
          chunks.push(chunkData);

          // リアルタイムでDB更新
          updateStreamOutput(outputId, type, content, false).catch(error => {
            console.error(`Failed to update stream output: ${error}`);
          });
        } catch (_error) {
          const displayText = `[Binary data: ${chunk.length} bytes]`;
          const chunkData = {
            content: chunk,
            displayText,
            timestamp: performance.now(),
            type,
          };
          chunks.push(chunkData);

          // リアルタイムでDB更新（バイナリデータ）
          updateStreamOutput(outputId, type, chunk, true).catch(error => {
            console.error(`Failed to update stream output: ${error}`);
          });
        }
      },
    }),
  );

  return chunks;
}

function processOutputData(
  outputs: (string | Uint8Array)[],
): { data: string; isEncoded: boolean } {
  const hasBinary = outputs.some(isBinaryData);

  if (hasBinary) {
    const binaryChunks = outputs.filter(isBinaryData);
    return {
      data: encodeBase64(combineBinaryChunks(binaryChunks)),
      isEncoded: true,
    };
  } else {
    const textChunks = outputs.filter(isStringData);
    return {
      data: textChunks.join("\n"),
      isEncoded: false,
    };
  }
}

async function executeCommandAsync(
  id: OutputId,
  command: string,
  options?: CommandOptions,
): Promise<void> {
  const cmd = new Deno.Command(command, {
    args: options?.args || [],
    cwd: options?.cwd,
    env: options?.env,
    stdout: "piped",
    stderr: "piped",
    stdin: options?.stdin ? "piped" : "null",
  });

  const child = cmd.spawn();

  // stdin処理
  if (options?.stdin) {
    await writeStdinData(child.stdin.getWriter(), options.stdin);
  }

  // ストリーム処理
  const [stdoutChunks, stderrChunks, status] = await Promise.all([
    processStream(child.stdout, "stdout", id),
    processStream(child.stderr, "stderr", id),
    child.status,
  ]);

  // 全チャンクを時系列順にソート
  const allChunks = [...stdoutChunks, ...stderrChunks].sort((a, b) =>
    a.timestamp - b.timestamp
  );


  // DB保存用データの処理（type別に分離）
  const stdoutContents = allChunks.filter((chunk) => chunk.type === "stdout")
    .map((chunk) => chunk.content);
  const stderrContents = allChunks.filter((chunk) => chunk.type === "stderr")
    .map((chunk) => chunk.content);

  const stdoutData = processOutputData(stdoutContents);
  const stderrData = processOutputData(stderrContents);

  // データベースを更新（完了状態に）
  try {
    await updateOutput({
      id,
      stdout: stdoutData.data,
      stdoutIsEncoded: stdoutData.isEncoded,
      stderr: stderrData.data,
      stderrIsEncoded: stderrData.isEncoded,
      status: status.success ? "completed" : "failed",
      exitCode: status.code,
    });
  } catch (error) {
    console.error(`Failed to save command output for ID ${id}:`, error);
  }
}

export function runCommand(
  command: string,
  options?: CommandOptions,
): {
  id: OutputId;
  status: "started";
} {
  const id = createOutputId();

  // 初期状態でDBレコード作成
  insertOutput({
    id,
    stdout: "",
    stderr: "",
    status: "running",
    exitCode: null,
  }).catch(error => {
    console.error(`Failed to create initial record for ID ${id}:`, error);
  });

  // バックグラウンドで非同期実行（メインスレッドをブロックしない）
  setTimeout(() => {
    executeCommandAsync(id, command, options).catch((error) => {
      console.error(`Command execution failed for ID ${id}:`, error);
      // エラー時はfailed状態に更新
      updateOutput({
        id,
        stderr: error instanceof Error ? error.message : "Unknown error",
        status: "failed",
        exitCode: -1,
      }).catch(dbError => {
        console.error(`Failed to update error status for ID ${id}:`, dbError);
      });
    });
  }, 0);

  return {
    id,
    status: "started",
  };
}

export async function getCommandStatus(id: OutputId): Promise<CommandStatus | "not_found"> {
  try {
    const output = await getOutputById(id);
    return output?.status || "not_found";
  } catch {
    return "not_found";
  }
}

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
