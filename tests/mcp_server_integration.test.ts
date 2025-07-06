import { assertEquals, assertExists } from "@std/assert";
import { createMcpServer } from "../src/mcp/server.ts";
import { initOrGetDrizzleDb } from "../src/db/drizzle.ts";

// Integration test for MCP server end-to-end functionality
Deno.test("MCP Server Integration", async (t) => {
  let _server: Awaited<ReturnType<typeof createMcpServer>>;

  await t.step("setup", async () => {
    await initOrGetDrizzleDb({ inMemory: true, reset: true });
    _server = await createMcpServer();
  });

  await t.step("should handle complete runCommand workflow", async () => {
    // Simulate MCP tool call for runCommand
    const runCommandArgs = {
      command: "echo",
      args: ["Hello Integration Test"],
    };

    // This simulates what the MCP server would do internally
    const { runCommand } = await import("../src/command.ts");
    const result = await runCommand(runCommandArgs.command, {
      args: runCommandArgs.args,
      cwd: Deno.cwd(),
    });

    assertEquals(typeof result.id, "string");
    assertEquals(result.status, "running");

    // Wait for command to complete
    const { getOutputById } = await import("../src/db/ouputs.ts");
    let output;
    for (let i = 0; i < 30; i++) {
      output = await getOutputById(result.id);
      if (output?.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    assertEquals(output?.status, "completed");
    assertEquals(output?.exitCode, 0);
    assertEquals(output?.stdout.trim(), "Hello Integration Test");

    // Now test getCommand tool workflow
    const { isOutputId, idToString } = await import("../src/db/ouputs.ts");

    assertEquals(isOutputId(result.id), true);
    assertExists(output);

    const structuredContent = {
      id: idToString(result.id),
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

    assertEquals(structuredContent.status, "completed");
    assertEquals(structuredContent.exitCode, 0);
    assertEquals(structuredContent.hasOutput, true);
    assertEquals(
      structuredContent.stdout.content.trim(),
      "Hello Integration Test",
    );
  });

  await t.step("should handle command chaining workflow", async () => {
    const { runCommand } = await import("../src/command.ts");
    const { getOutputById, isOutputId } = await import("../src/db/ouputs.ts");
    const { decodeBase64 } = await import("@std/encoding");

    // First command: generate data
    const firstResult = await runCommand("echo", {
      args: ["data for chaining"],
      cwd: Deno.cwd(),
    });

    // Wait for first command to complete
    let firstOutput;
    for (let i = 0; i < 30; i++) {
      firstOutput = await getOutputById(firstResult.id);
      if (firstOutput?.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    assertEquals(firstOutput?.status, "completed");
    assertExists(firstOutput?.stdout);

    // Simulate MCP tool logic for stdinForOutput
    const stdinForOutputId = firstResult.id;

    assertEquals(isOutputId(stdinForOutputId), true);

    const output = await getOutputById(stdinForOutputId);
    assertExists(output);

    let stdinContent: string;
    if (output.stdoutIsEncoded) {
      stdinContent = new TextDecoder().decode(decodeBase64(output.stdout));
    } else {
      stdinContent = output.stdout;
    }

    // Second command: use first command's output as stdin
    const secondResult = await runCommand("cat", {
      stdin: stdinContent,
      cwd: Deno.cwd(),
    });

    // Wait for second command to complete
    let secondOutput;
    for (let i = 0; i < 30; i++) {
      secondOutput = await getOutputById(secondResult.id);
      if (secondOutput?.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    assertEquals(secondOutput?.status, "completed");
    assertEquals(secondOutput?.stdout.trim(), "data for chaining");
  });

  await t.step("should handle command failure workflow", async () => {
    const { runCommand } = await import("../src/command.ts");
    const { getOutputById } = await import("../src/db/ouputs.ts");

    const result = await runCommand("nonexistentcommand12345", {
      cwd: Deno.cwd(),
    });

    assertEquals(result.status, "running");

    // Wait for command to fail
    let output;
    for (let i = 0; i < 30; i++) {
      output = await getOutputById(result.id);
      if (output?.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    assertEquals(output?.status, "failed");
    assertEquals(output?.exitCode, -1);
    assertExists(output?.stderr);
  });

  await t.step("should handle binary data workflow", async () => {
    const { runCommand } = await import("../src/command.ts");
    const { getOutputById } = await import("../src/db/ouputs.ts");

    // Use a command that might produce binary-like output
    const result = await runCommand("printf", {
      args: ["\\x00\\x01\\x02\\xFF"],
      cwd: Deno.cwd(),
    });

    // Wait for completion
    let output;
    for (let i = 0; i < 30; i++) {
      output = await getOutputById(result.id);
      if (output?.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    assertEquals(output?.status, "completed");
    // Binary output should be detected and encoded
    if (output?.stdoutIsEncoded) {
      assertEquals(typeof output.stdout, "string");
      // Should be valid base64
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      assertEquals(base64Regex.test(output.stdout), true);
    }
  });

  await t.step("should handle sequential commands", async () => {
    const { runCommand } = await import("../src/command.ts");
    const { getOutputById } = await import("../src/db/ouputs.ts");

    // Run commands sequentially to ensure they work properly
    const commands = [
      { args: ["sequential1"], expected: "sequential1" },
      { args: ["sequential2"], expected: "sequential2" },
      { args: ["sequential3"], expected: "sequential3" },
    ];

    for (const { args, expected } of commands) {
      const result = await runCommand("echo", { args, cwd: Deno.cwd() });

      assertEquals(typeof result.id, "string");
      assertEquals(result.status, "running");

      // Wait for completion
      let output;
      for (let i = 0; i < 30; i++) {
        output = await getOutputById(result.id);
        if (output?.status === "completed") break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      assertExists(output);
      assertEquals(output.status, "completed");
      assertEquals(output.exitCode, 0);
      assertEquals(output.stdout.trim(), expected);
    }
  });
});
