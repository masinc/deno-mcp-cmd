import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// MCP SDK compatibility: Using Zod v3 for inputSchema compatibility
import * as zV3 from "zod";
import { runCommand } from "../command.ts";
import {
  getOutputById,
  isOutputId,
} from "../db/ouputs.ts";
import { OutputIdSchemaV3 } from "./schemas.ts";
import type { OutputId } from "../db/schema.ts";
import { decodeBase64 } from "@std/encoding";

/**
 * Resolves stdin content from either direct string input or output ID reference
 * @param stdin - Direct string input for stdin
 * @param stdinForOutput - Output ID to use stdout as stdin
 * @returns Promise resolving to stdin content or undefined
 * @throws Error if both parameters are provided or if output ID is invalid/not found
 */
async function resolveStdinContent(
  stdin?: string,
  stdinForOutput?: string,
): Promise<string | undefined> {
  if (stdin && stdinForOutput) {
    throw new Error(
      "Cannot use both stdin and stdinForOutput at the same time.",
    );
  }

  if (stdin && !stdinForOutput) {
    return stdin;
  }

  if (!stdinForOutput) {
    return undefined;
  }

  const validatedId = validateAndConvertOutputId(stdinForOutput);

  const output = await getOutputById(validatedId);
  if (!output) {
    throw new Error(`Output with ID ${stdinForOutput} not found.`);
  }

  if (output.stdoutIsEncoded) {
    return new TextDecoder().decode(decodeBase64(output.stdout));
  }

  return output.stdout;
}

/**
 * Creates a standardized MCP tool response
 * @param content - The content object to return
 * @returns Standardized MCP response format
 */
function createToolResponse(content: Record<string, unknown>) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(content),
      } as const,
    ],
    structuredContent: content as Record<string, unknown>,
  };
}

/**
 * Validates that a string is a valid output ID and converts to branded type
 * 
 * This function bridges Zod v3 (MCP) and Zod v4 (app) type systems.
 * It validates using the v3 schema but returns the v4 branded type.
 * 
 * @param id - The ID to validate (from Zod v3 MCP schema)
 * @throws Error if ID is invalid
 * @returns The validated ID as OutputId branded type (for Zod v4 app layer)
 */
function validateAndConvertOutputId(id: string): OutputId {
  if (!isOutputId(id)) {
    throw new Error(`Invalid output ID: ${id}`);
  }
  return id as OutputId;
}

/**
 * Creates and configures an MCP (Model Context Protocol) server for command execution
 *
 * IMPORTANT: This file uses Zod v3 for MCP SDK compatibility.
 * The MCP SDK requires v3-compatible inputSchema types, so we cannot use Zod v4 here.
 * For type conversion between v3 and v4, see validateAndConvertOutputId() function.
 *
 * The server provides two main tools:
 * 1. runCommand - Execute shell commands with various options
 * 2. getCommand - Retrieve command execution results
 *
 * Features:
 * - Command execution with stdout/stderr capture
 * - Binary data support with base64 encoding
 * - Command chaining through output IDs
 * - Working directory and stdin support
 * - Warning acknowledgment system
 *
 * @returns Promise resolving to configured MCP server instance
 */
export async function createMcpServer(): Promise<McpServer> {

  const mcpServer = new McpServer({
    name: "mcp-cmd",
    version: "0.1.0",
    description:
      `A Model Context Protocol server for executing shell commands and managing their outputs. Provides tools to run commands (runCommand), retrieve stdout (getStdoutById), and retrieve stderr (getStderrById). Supports binary data, stdin input, and command chaining through output IDs.`,
  });

  mcpServer.registerTool(
    "runCommand",
    {
      title: "Run Command",
      description: `Execute a shell command and capture both stdout and stderr.
Returns an output ID that can be used with getCommand to retrieve the results later.
Supports binary data (automatically base64 encoded) and stdin input.
Use this for running any command like "ls", "curl", "git", etc.`,

      inputSchema: {
        command: zV3.string().describe(
          `The base command to execute (e.g. "ls", "curl", "git", "python", "node").
Do not include arguments here - use the "args" parameter for arguments.`,
        ),
        args: zV3.array(zV3.string()).optional().describe(
          `Array of command-line arguments (e.g. ["-l", "-a"] for "ls -l -a", or ["--version"] for version checks).
Each argument should be a separate string in the array.`,
        ),
        stdin: zV3.string().optional().describe(
          `Text input to send to the command's stdin.
Use this for interactive commands that expect input, or to pipe data into commands like "grep" or "sort".
Cannot be used together with stdinForOutput.`,
        ),

        stdinForOutput: OutputIdSchemaV3.optional().describe(
          `9-digit numeric output ID of a previous command's output to use as stdin for this command. This enables command chaining - the stdout from the referenced command will be fed into this command's stdin.
Cannot be used together with stdin.`,
        ),
        cwd: zV3.string().optional().describe(
          `Working directory for the command execution.
If not provided, uses the current working directory.`,
        ),
        acknowledgeWarnings: zV3.array(zV3.string()).optional().describe(
          `Array of warning names to acknowledge (e.g. ["warn-shell-expansion", "warn-dangerous-flags"]).
Used to bypass specific warnings after understanding the risks.`,
        ),
      },
    },
    async (
      {
        command,
        args,
        stdin,
        stdinForOutput,
        cwd,
        acknowledgeWarnings: _acknowledgeWarnings,
      },
    ) => {
      // acknowledgeWarnings is only used for rule checking, not passed to actual command execution
      const stdinContent = await resolveStdinContent(stdin, stdinForOutput);

      const result = await runCommand(command, {
        args,
        cwd: cwd || Deno.cwd(),
        stdin: stdinContent,
      });

      const responseContent = {
        id: result.id,
      };

      return createToolResponse(responseContent);
    },
  );

  mcpServer.registerTool("getCommand", {
    title: "Get Command Result",
    description:
      `Retrieve information about a command execution including status, exit code, and metadata. Optionally include stdout/stderr content.
Use includeStdout=false and includeStderr=false to save tokens when you only need status information.
This is the primary tool for checking command results after running a command with runCommand.`,

    inputSchema: {
      id: OutputIdSchemaV3.describe(
        `The 9-digit numeric output ID returned from a previous runCommand execution.
Use this to get all information about the command execution.`,
      ),
      includeStdout: zV3.boolean().optional().describe(
        `Whether to include stdout content in the response. Defaults to true. Set to false to save tokens when you only need status/metadata/stderr.`,
      ),
      includeStderr: zV3.boolean().optional().describe(
        `Whether to include stderr content in the response. Defaults to true. Set to false to save tokens when you only need status/metadata/stdout.`,
      ),
    },
  }, async ({ id, includeStdout = true, includeStderr = true }) => {
    const validatedId = validateAndConvertOutputId(id);

    const output = await getOutputById(validatedId);
    if (!output) {
      throw new Error(`Command with ID ${id} not found.`);
    }

    const responseContent: Record<string, unknown> = {
      status: output.status,
      exitCode: output.exitCode,
      hasOutput: output.stdout.length > 0 || output.stderr.length > 0,
      cwd: output.cwd,
      createdAt: output.createdAt,
    };

    if (includeStdout) {
      responseContent.stdout = {
        content: output.stdout,
        isEncoded: output.stdoutIsEncoded,
      };
    }

    if (includeStderr) {
      responseContent.stderr = {
        content: output.stderr,
        isEncoded: output.stderrIsEncoded,
      };
    }

    return createToolResponse(responseContent);
  });

  return mcpServer;
}
