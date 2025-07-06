import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runCommand } from "../command.ts";
import {
  deleteExpiredOutputs,
  getOutputById,
  idToString,
  isOutputId,
} from "../db/ouputs.ts";
import { OutputIdSchema } from "../db/schema.ts";
import { decodeBase64 } from "@std/encoding";

export async function createMcpServer(): Promise<McpServer> {
  await deleteExpiredOutputs();

  const mcpServer = new McpServer({
    name: "mcp-cmd",
    version: "0.1.0",
    description:
      `A Model Context Protocol server for executing shell commands and managing their outputs. Provides tools to run commands (runCommand), retrieve stdout (getStdoutById), and retrieve stderr (getStderrById). Supports binary data, stdin input, and command chaining through output IDs.`,
  });

  mcpServer.registerTool("runCommand", {
    title: "Run Command",
    description:
      `Execute a shell command and capture both stdout and stderr. Returns an output ID that can be used to retrieve the results later. Supports binary data (automatically base64 encoded) and stdin input. Use this for running any command like 'ls', 'curl', 'git', etc.`,

    inputSchema: {
      command: z.string().describe(
        "The base command to execute (e.g. 'ls', 'curl', 'git', 'python', 'node'). Do not include arguments here - use the 'args' parameter for arguments.",
      ),
      args: z.array(z.string()).optional().describe(
        "Array of command-line arguments (e.g. ['-l', '-a'] for 'ls -l -a', or ['--version'] for version checks). Each argument should be a separate string in the array.",
      ),
      stdin: z.string().optional().describe(
        "Text input to send to the command's stdin. Use this for interactive commands that expect input, or to pipe data into commands like 'grep' or 'sort'. Cannot be used together with stdinForOutput.",
      ),

      stdinForOutput: OutputIdSchema.optional().describe(
        "9-digit numeric output ID of a previous command's output to use as stdin for this command. This enables command chaining - the stdout from the referenced command will be fed into this command's stdin. Cannot be used together with stdin.",
      ),
    },
  }, async ({ command, args, stdin, stdinForOutput }) => {
    const stdinContent = await (async () => {
      if (stdin && stdinForOutput) {
        throw new Error(
          "Cannot use both stdin and stdinForOutput at the same time.",
        );
      }

      if (stdin && !stdinForOutput) {
        return stdin;
      }

      if (!stdinForOutput) {
        return;
      }

      if (!isOutputId(stdinForOutput)) {
        throw new Error(`Invalid output ID: ${stdinForOutput}`);
      }

      const output = await getOutputById(stdinForOutput);
      if (!output) {
        throw new Error(`Output with ID ${stdinForOutput} not found.`);
      }

      if (output.stdoutIsEncoded) {
        return new TextDecoder().decode(decodeBase64(output.stdout));
      }

      return output.stdout;
    })();

    const result = await runCommand(command, {
      args: args,
      cwd: Deno.cwd(),
      stdin: stdinContent,
    });

    const structuredContent = {
      id: idToString(result.id),
      status: result.status,
    };

    return {
      content: [{
        type: "text",
        text: JSON.stringify(structuredContent),
      }],
      structuredContent: structuredContent,
    };
  });

  mcpServer.registerTool("getCommand", {
    title: "Get Command Result",
    description:
      `Retrieve complete information about a command execution including status, exit code, stdout, stderr, and metadata. This is the primary tool for checking command results after running a command with runCommand.`,

    inputSchema: {
      id: OutputIdSchema.describe(
        "The 9-digit numeric output ID returned from a previous runCommand execution. Use this to get all information about the command execution.",
      ),
    },
  }, async ({ id }) => {
    if (!isOutputId(id)) {
      throw new Error(`Invalid output ID: ${id}`);
    }

    const output = await getOutputById(id);

    if (!output) {
      throw new Error(`Command with ID ${id} not found.`);
    }

    const structuredContent = {
      id: idToString(id),
      status: output.status,
      exitCode: output.exitCode,
      hasOutput: output.stdout.length > 0 || output.stderr.length > 0,
      stdout: {
        content: output.stdout,
        isEncoded: output.stdoutIsEncoded,
      },
      stderr: {
        content: output.stderr,
        isEncoded: output.stderrIsEncoded,
      },
      createdAt: output.createdAt,
    };

    return {
      content: [{
        type: "text",
        text: JSON.stringify(structuredContent),
      }],
      structuredContent,
    };
  });

  return mcpServer;
}
