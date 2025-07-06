import {
  type PreToolUseOutput,
  PreToolUseOutputSchema,
  type SimpleOutput,
  SimpleOutputSchema,
} from "./types.ts";

/**
 * Writes the output to stdout as JSON and exits the process
 *
 * This function handles two types of output formats:
 * 1. SimpleOutput: Contains a message and optional exit code
 * 2. PreToolUseOutput: Contains hook decision data for tool execution
 *
 * The function validates the output format and exits with appropriate status codes.
 *
 * @param output - The output data to write (either SimpleOutput or PreToolUseOutput)
 * @throws Never returns - always exits the process
 */
export function writeOutputAndExit(
  output: PreToolUseOutput | SimpleOutput,
): never {
  // Try to parse as SimpleOutput first
  {
    const parsedOutput = SimpleOutputSchema.safeParse(output);
    if (parsedOutput.success) {
      console.log(JSON.stringify(parsedOutput.data));
      Deno.exit(parsedOutput.data.exitCode ?? 0);
    }
  }

  // Try to parse as PreToolUseOutput
  {
    const parsedOutput = PreToolUseOutputSchema.safeParse(output);
    if (parsedOutput.success) {
      console.log(JSON.stringify(parsedOutput.data));
      Deno.exit();
    }
  }

  // If neither format matches, exit with error
  console.error("Invalid output format:", output);
  Deno.exit(1);
}
