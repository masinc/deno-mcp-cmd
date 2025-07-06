#!/usr/bin/env -S deno run --allow-env --allow-read --allow-write

// "mcp__cmd__getCommand",
// "mcp__cmd__runCommand"

import { logHookInput } from "../hooks/logger.ts";
import { writeOutputAndExit } from "../hooks/output.ts";
import {
  type PreToolUseInput,
  PreToolUseInputSchema,
  TOOL_GET,
  TOOL_RUN,
  ToolInputRunSchema,
} from "../hooks/types.ts";

async function readStdin(): Promise<string> {
  const decoder = new TextDecoder();
  const chunks: Uint8Array[] = [];
  for await (const chunk of Deno.stdin.readable) {
    chunks.push(chunk);
  }
  return decoder.decode(
    new Uint8Array(chunks.flatMap((chunk) => Array.from(chunk))),
  );
}

function hookToolRun(input: PreToolUseInput): Promise<never> {
  const toolInputResult = ToolInputRunSchema.safeParse(input.tool_input);
  if (!toolInputResult.success) {
    console.error("Invalid tool input:", toolInputResult.error);
    Deno.exit(1);
  }

  const toolInput = toolInputResult.data;

  if (toolInput.command === "cd") {
    writeOutputAndExit({
      decision: "block",
      reason: "Tool run command 'cd' is not allowed.",
    });
  }

  writeOutputAndExit({});
}

function hookToolGet(_input: PreToolUseInput): Promise<never> {
  writeOutputAndExit({
    decision: "approve",
    reason: "Tool get approved",
  });
}

const toolFunctions: Record<
  string,
  (input: PreToolUseInput) => Promise<never>
> = {
  [TOOL_RUN]: hookToolRun,
  [TOOL_GET]: hookToolGet,
};

async function main() {
  const parsedInput = PreToolUseInputSchema.safeParse(
    JSON.parse(await readStdin()),
  );
  if (!parsedInput.success) {
    console.error("Invalid input:", parsedInput.error);
    Deno.exit(1);
  }

  const input = parsedInput.data;
  logHookInput(input);

  const toolFunction = toolFunctions[input.tool_name];
  if (toolFunction) {
    await toolFunction(input);
  } else {
    writeOutputAndExit({
      message: `Unknown tool name: ${input.tool_name}`,
      exitCode: 1,
    });
  }
}

if (import.meta.main) {
  await main();
}
