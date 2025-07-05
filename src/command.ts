import { insertOutput } from "./db/ouputs.ts";
import type { OutputId } from "./db/types.ts";
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

async function writeStdinData(writer: WritableStreamDefaultWriter<Uint8Array>, data: string | Uint8Array) {
  try {
    const stdinData = typeof data === "string" 
      ? new TextEncoder().encode(data)
      : data;
    await writer.write(stdinData);
    await writer.close();
  } catch (error) {
    await writer.abort();
    throw new Error(`Failed to write stdin: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function processStream(stream: ReadableStream<Uint8Array>, type: "stdout" | "stderr") {
  const chunks: StreamChunk[] = [];
  
  await stream.pipeTo(new WritableStream({
    write(chunk) {
      try {
        const content = new TextDecoder("utf-8", { fatal: true }).decode(chunk);
        chunks.push({
          content,
          displayText: content,
          timestamp: performance.now(),
          type,
        });
      } catch (_error) {
        chunks.push({
          content: chunk,
          displayText: `[Binary data: ${chunk.length} bytes]`,
          timestamp: performance.now(),
          type,
        });
      }
    },
  }));
  
  return chunks;
}

function processOutputData(outputs: (string | Uint8Array)[]): { data: string; isEncoded: boolean } {
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

export async function runCommand(
  command: string,
  options?: CommandOptions,
): Promise<{
  id: OutputId;
  output: string;
}> {
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
    processStream(child.stdout, "stdout"),
    processStream(child.stderr, "stderr"),
    child.status,
  ]);

  // 全チャンクを時系列順にソート
  const allChunks = [...stdoutChunks, ...stderrChunks].sort((a, b) => a.timestamp - b.timestamp);

  // 表示用出力の生成（時系列順）
  const displayOutput = allChunks.map(chunk => chunk.displayText);

  // DB保存用データの処理（type別に分離）
  const stdoutContents = allChunks.filter(chunk => chunk.type === "stdout").map(chunk => chunk.content);
  const stderrContents = allChunks.filter(chunk => chunk.type === "stderr").map(chunk => chunk.content);

  const stdoutData = processOutputData(stdoutContents);
  const stderrData = processOutputData(stderrContents);

  // データベースに保存
  const id = insertOutput({
    stdout: stdoutData.data,
    stdoutIsEncoded: stdoutData.isEncoded,
    stderr: stderrData.data,
    stderrIsEncoded: stderrData.isEncoded,
  });

  if (!status.success) {
    throw new Error(
      `Command failed with exit code ${status.code}. Output ID: ${id}`,
    );
  }

  return {
    id,
    output: displayOutput.join("\n"),
  };
}
