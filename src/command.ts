import { insertOutput } from "./db/ouputs.ts";
import type { OutputId } from "./db/types.ts";
import { encodeBase64 } from "@std/encoding";

type Output = {
  type: "stdout" | "stderr";
  content: string | Uint8Array;
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

  // stdin が指定されている場合、標準入力に書き込む
  if (options?.stdin) {
    const stdinWriter = child.stdin.getWriter();
    const stdinData = typeof options.stdin === "string" 
      ? new TextEncoder().encode(options.stdin)
      : options.stdin;
    await stdinWriter.write(stdinData);
    await stdinWriter.close();
  }

  const output: Output[] = [];

  // DBデータ格納用の配列
  const rawOutput: Output[] = [];

  const [_stdout, _stderr, status] = await Promise.all([
    child.stdout.pipeTo(
      new WritableStream({
        write(chunk) {
          try {
            const content = new TextDecoder("utf-8", { fatal: true }).decode(
              chunk,
            );

            output.push({
              type: "stdout",
              content,
            });

            rawOutput.push({
              type: "stdout",
              content,
            });
          } catch (_error) {
            // バイナリデータの場合は base64 エンコード
            const content = `[Binary data: ${chunk.length} bytes]`;
            output.push({
              type: "stdout",
              content,
            });

            rawOutput.push({
              type: "stdout",
              content: chunk,
            });
          }
        },
      }),
    ),
    child.stderr.pipeTo(
      new WritableStream({
        write(chunk) {
          try {
            const content = new TextDecoder("utf-8", { fatal: true }).decode(
              chunk,
            );

            output.push({
              type: "stderr",
              content,
            });

            rawOutput.push({
              type: "stderr",
              content,
            });
          } catch (_error) {
            // バイナリデータの場合は base64 エンコード
            const content = `[Binary data: ${chunk.length} bytes]`;

            output.push({
              type: "stderr",
              content,
            });

            rawOutput.push({
              type: "stderr",
              content: chunk,
            });
          }
        },
      }),
    ),
    child.status,
  ]);

  const stdouts = rawOutput.filter((o) => o.type === "stdout").map((o) =>
    o.content
  );

  const isStdoutBinary = stdouts.some((s) =>
    typeof s === "object" && s instanceof Uint8Array
  );

  const stderrs = rawOutput.filter((o) => o.type === "stderr").map((o) =>
    o.content
  );

  const isStderrBinary = stderrs.some((s) =>
    typeof s === "object" && s instanceof Uint8Array
  );

  const stdoutData = isStdoutBinary
    ? encodeBase64(combineBinaryChunks(stdouts.filter(isBinaryData)))
    : stdouts.filter(isStringData).join("\n");

  const stderrData = isStderrBinary
    ? encodeBase64(combineBinaryChunks(stderrs.filter(isBinaryData)))
    : stderrs.filter(isStringData).join("\n");

  const id = insertOutput({
    stdout: stdoutData,
    stdoutIsEncoded: isStdoutBinary,
    stderr: stderrData,
    stderrIsEncoded: isStderrBinary,
  });

  if (!status.success) {
    throw new Error(
      `Command failed with exit code ${status.code}. Output ID: ${id}`,
    );
  }

  return {
    id,
    output: output.map((o) => o.content).join("\n"),
  };
}
