import { configure, getLogger, getStreamSink } from "@logtape/logtape";
import { getFileSink } from "@logtape/file";
import { join } from "@std/path";

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

export const logger = getLogger(["hook"]);

export function logHookInput(input: unknown): void {
  logger.info("Received hook: {input}", { input });
}

export function logBlock(command: string, reason: string): void {
  logger.warn("Blocked command: {command} - {reason}", { command, reason });
}

export function logAllow(command: string): void {
  logger.info("Allowed command: {command}", { command });
}
