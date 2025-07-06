import {
  type PreToolUseOutput,
  PreToolUseOutputSchema,
  type SimpleOutput,
  SimpleOutputSchema,
} from "./types.ts";

export function writeOutputAndExit(
  output: PreToolUseOutput | SimpleOutput,
): never {
  {
    const parsedOutput = SimpleOutputSchema.safeParse(output);
    if (parsedOutput.success) {
      console.log(JSON.stringify(parsedOutput.data));
      Deno.exit(parsedOutput.data.exitCode ?? 0);
    }
  }

  {
    const parsedOutput = PreToolUseOutputSchema.safeParse(output);
    if (parsedOutput.success) {
      console.log(JSON.stringify(parsedOutput.data));
      Deno.exit();
    }
  }

  console.error("Invalid output format:", output);
  Deno.exit(1);
}
