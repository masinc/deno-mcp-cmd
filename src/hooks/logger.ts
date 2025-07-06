import { configure, getLogger, getStreamSink } from "@logtape/logtape";
import { getFileSink } from "@logtape/file";
import { join } from "@std/path";

/**
 * Configure logging for hook system
 *
 * Sets up file logging in user's cache directory and stderr output for warnings.
 * The log file is stored at ~/.cache/@masinc/mcp-cmd/hook.log
 */

// Create log directory in user's cache
const logDir = join(
  Deno.env.get("HOME") || ".",
  ".cache",
  "@masinc",
  "mcp-cmd",
);
await Deno.mkdir(logDir, { recursive: true });
const logPath = join(logDir, "hook.log");

await configure({
  sinks: {
    file: getFileSink(logPath),
    stderr: getStreamSink(Deno.stderr.writable),
  },
  loggers: [
    {
      category: ["logtape", "meta"],
      sinks: ["stderr"],
      lowestLevel: "warning",
    },
    {
      category: "hook",
      sinks: ["file"],
      lowestLevel: "debug",
    },
  ],
});

/**
 * Logger instance for hook system events
 */
export const logger = getLogger(["hook"]);

/**
 * Logs hook input for debugging purposes
 * @param input - The hook input data to log
 */
export function logHookInput(input: unknown): void {
  logger.info("Received hook: {input}", { input });
}

/**
 * Logs blocked command with reason
 * @param command - The command that was blocked
 * @param reason - The reason why the command was blocked
 */
export function logBlock(command: string, reason: string): void {
  logger.warn("Blocked command: {command} - {reason}", { command, reason });
}

/**
 * Logs allowed command execution
 * @param command - The command that was allowed
 */
export function logAllow(command: string): void {
  logger.info("Allowed command: {command}", { command });
}
