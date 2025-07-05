import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runCommand } from "../command.ts";
import {
  deleteExpiredOutputs,
  getOutputById,
  idToString,
  isOutputId,
} from "../db/ouputs.ts";
import { decodeBase64 } from "@std/encoding";

export function createMcpServer() {
  deleteExpiredOutputs();

  const mcpServer = new McpServer({
    name: "mcp-cmd",
    version: "0.1.0",
    description:
      `A Model Context Protocol server for executing shell commands and managing their outputs. Provides tools to run commands (runCommand), retrieve stdout (getStdoutById), and retrieve stderr (getStderrById). Supports binary data, stdin input, and command chaining through output IDs.`,
  });

  mcpServer.registerTool("runCommand", {
    title: "Run Command",
    description: `Execute a shell command and capture both stdout and stderr. Returns an output ID that can be used to retrieve the results later. Supports binary data (automatically base64 encoded) and stdin input. Use this for running any command like 'ls', 'curl', 'git', etc.`,

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

      stdinForOutput: z.string().uuid().optional().describe(
        "UUID of a previous command's output to use as stdin for this command. This enables command chaining - the stdout from the referenced command will be fed into this command's stdin. Cannot be used together with stdin.",
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
        return decodeBase64(output.stdout);
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
      output: result.output,
    };

    return {
      content: [{
        type: "text",
        text: JSON.stringify(structuredContent),
      }],
      structuredContent: structuredContent,
    };
  });

  mcpServer.registerTool("getStdoutById", {
    title: "Get Stdout by ID",
    description: `Retrieve the stdout (standard output) from a previously executed command using its output ID. If the output contains binary data, it will be base64 encoded. Use this to get the main output/results from commands.`,

    inputSchema: {
      id: z.string().uuid().describe("The UUID output ID returned from a previous runCommand execution. Use this to retrieve the stdout (main output) from that command."),
    },
  }, async ({ id }) => {
    if (!isOutputId(id)) {
      throw new Error(`Invalid output ID: ${id}`);
    }

    const output = await getOutputById(id);

    if (!output) {
      throw new Error(`Output with ID ${id} not found.`);
    }

    const structuredContent = {
      base64Encoded: output.stdoutIsEncoded,
      content: output.stdout,
    };

    return {
      content: [{
        type: "text",
        text: JSON.stringify(structuredContent),
      }],
      structuredContent,
    };
  });

  mcpServer.registerTool("getStderrById", {
    title: "Get Stderr by ID",
    description: `Retrieve the stderr (standard error) from a previously executed command using its output ID. If the output contains binary data, it will be base64 encoded. Use this to get error messages, warnings, or diagnostic output from commands.`,

    inputSchema: {
      id: z.string().uuid().describe("The UUID output ID returned from a previous runCommand execution. Use this to retrieve the stderr (error output/warnings) from that command."),
    },
  }, async ({ id }) => {
    if (!isOutputId(id)) {
      throw new Error(`Invalid output ID: ${id}`);
    }

    const output = await getOutputById(id);

    if (!output) {
      throw new Error(`Output with ID ${id} not found.`);
    }

    const structuredContent = {
      base64Encoded: output.stderrIsEncoded,
      content: output.stderr,
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
