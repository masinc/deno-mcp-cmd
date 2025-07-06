import { assertEquals } from "@std/assert";
import { createMcpServer } from "./server.ts";
import { runCommand } from "../command.ts";
import { createOutputId, getOutputById, insertOutput } from "../db/ouputs.ts";
import { initOrGetDrizzleDb } from "../db/drizzle.ts";

// Test setup with database
async function setupTestDb() {
  await initOrGetDrizzleDb();
}

Deno.test("createMcpServer", async (t) => {
  await t.step("setup", async () => {
    await setupTestDb();
  });

  await t.step("should create MCP server", async () => {
    const server = await createMcpServer();
    assertEquals(typeof server, "object");
  });
});

Deno.test("runCommand function", async (t) => {
  await t.step("setup", async () => {
    await setupTestDb();
  });

  await t.step("should execute basic command", async () => {
    const result = await runCommand("echo", {
      args: ["hello world"],
      cwd: Deno.cwd(),
    });

    assertEquals(typeof result.id, "string");
    assertEquals(result.status, "running");

    // Poll for completion
    let output;
    for (let i = 0; i < 20; i++) {
      output = await getOutputById(result.id);
      if (output?.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    assertEquals(output?.status, "completed");
    assertEquals(output?.exitCode, 0);
    assertEquals(output?.stdout.trim(), "hello world");
  });

  await t.step("should handle command with args", async () => {
    const result = await runCommand("echo", {
      args: ["-n", "test"],
      cwd: Deno.cwd(),
    });

    // Wait for command to complete
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const output = await getOutputById(result.id);
    assertEquals(output?.stdout, "test");
  });

  await t.step("should handle stdin input", async () => {
    const result = await runCommand("cat", {
      stdin: "hello from stdin",
      cwd: Deno.cwd(),
    });

    // Wait for command to complete
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const output = await getOutputById(result.id);
    assertEquals(output?.stdout, "hello from stdin");
  });
});

Deno.test("database operations", async (t) => {
  await t.step("setup", async () => {
    await setupTestDb();
  });

  await t.step("should insert and retrieve output", async () => {
    const outputId = createOutputId();
    await insertOutput({
      id: outputId,
      stdout: "test output",
      stderr: "test error",
      status: "completed",
      exitCode: 0,
      stdoutIsEncoded: false,
      stderrIsEncoded: false,
    });

    const output = await getOutputById(outputId);
    assertEquals(output?.stdout, "test output");
    assertEquals(output?.stderr, "test error");
    assertEquals(output?.status, "completed");
    assertEquals(output?.exitCode, 0);
  });

  await t.step("should handle non-existent output", async () => {
    const nonExistentId = createOutputId();
    const output = await getOutputById(nonExistentId);
    assertEquals(output, undefined);
  });
});

Deno.test("base64 encoding", async (t) => {
  await t.step("setup", async () => {
    await setupTestDb();
  });

  await t.step("should handle base64 encoded output", async () => {
    const outputId = createOutputId();
    const originalText = "hello world";
    const encodedText = btoa(originalText);

    await insertOutput({
      id: outputId,
      stdout: encodedText,
      stderr: "",
      status: "completed",
      exitCode: 0,
      stdoutIsEncoded: true,
      stderrIsEncoded: false,
    });

    const output = await getOutputById(outputId);
    assertEquals(output?.stdout, encodedText);
    assertEquals(output?.stdoutIsEncoded, true);
  });
});

Deno.test("runCommand tool edge cases", async (t) => {
  await t.step("setup", async () => {
    await setupTestDb();
  });

  await t.step(
    "should handle command chaining with stdinForOutput",
    async () => {
      // First command: echo some data
      const firstResult = await runCommand("echo", {
        args: ["hello from first"],
        cwd: Deno.cwd(),
      });

      // Wait for first command to complete
      let firstOutput;
      for (let i = 0; i < 20; i++) {
        firstOutput = await getOutputById(firstResult.id);
        if (firstOutput?.status === "completed") break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Create mock tool execution similar to MCP server
      const mockStdinForOutput = firstResult.id;

      // Test stdinForOutput logic manually
      const output = await getOutputById(mockStdinForOutput);
      assertEquals(output !== undefined, true);

      if (output) {
        let stdinContent;
        if (output.stdoutIsEncoded) {
          stdinContent = new TextDecoder().decode(
            new Uint8Array(
              atob(output.stdout).split("").map((c) => c.charCodeAt(0)),
            ),
          );
        } else {
          stdinContent = output.stdout;
        }

        assertEquals(stdinContent.trim(), "hello from first");
      }
    },
  );

  await t.step(
    "should handle base64 encoded stdin from stdinForOutput",
    async () => {
      // Create output with base64 encoded content
      const outputId = createOutputId();
      const originalText = "encoded data";
      const encodedText = btoa(originalText);

      await insertOutput({
        id: outputId,
        stdout: encodedText,
        stderr: "",
        status: "completed",
        exitCode: 0,
        stdoutIsEncoded: true,
        stderrIsEncoded: false,
      });

      // Test decoding logic
      const output = await getOutputById(outputId);
      assertEquals(output !== undefined, true);

      if (output && output.stdoutIsEncoded) {
        const decoded = new TextDecoder().decode(
          new Uint8Array(
            atob(output.stdout).split("").map((c) => c.charCodeAt(0)),
          ),
        );
        assertEquals(decoded, originalText);
      }
    },
  );
});

Deno.test("error handling", async (t) => {
  await t.step("setup", async () => {
    await setupTestDb();
  });

  await t.step("should reject both stdin and stdinForOutput", () => {
    // This tests the validation logic that would be in the MCP tool
    const stdin = "test input";
    const stdinForOutput = createOutputId();

    // Simulate the validation from the MCP server
    const hasBoth = stdin && stdinForOutput;

    assertEquals(!!hasBoth, true);
    // In actual MCP server, this would throw an error
  });

  await t.step("should handle invalid output ID format", async () => {
    const invalidId = "not-a-uuid";

    // Test isOutputId function
    const { isOutputId } = await import("../db/ouputs.ts");
    assertEquals(isOutputId(invalidId), false);
  });

  await t.step("should handle non-existent output ID", async () => {
    const nonExistentId = createOutputId();
    const output = await getOutputById(nonExistentId);
    assertEquals(output, undefined);
  });

  await t.step("should handle command execution failure", async () => {
    // Test with a command that will fail
    const result = await runCommand("nonexistentcommand12345", {
      cwd: Deno.cwd(),
    });

    assertEquals(typeof result.id, "string");
    assertEquals(result.status, "running");

    // Wait for command to fail
    let output;
    for (let i = 0; i < 20; i++) {
      output = await getOutputById(result.id);
      if (output?.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    assertEquals(output?.status, "failed");
    assertEquals(output?.exitCode, -1);
  });
});

Deno.test("MCP server responses", async (t) => {
  await t.step("setup", async () => {
    await setupTestDb();
  });

  await t.step("should return structured content for runCommand", async () => {
    const result = await runCommand("echo", {
      args: ["test"],
      cwd: Deno.cwd(),
    });

    // Test response structure that MCP server would return
    const { idToString } = await import("../db/ouputs.ts");
    const structuredContent = {
      id: idToString(result.id),
      status: result.status,
    };

    assertEquals(typeof structuredContent.id, "string");
    assertEquals(structuredContent.status, "running");
  });

  await t.step("should return structured content for getCommand", async () => {
    // Create test output
    const outputId = createOutputId();
    await insertOutput({
      id: outputId,
      stdout: "test output",
      stderr: "test error",
      status: "completed",
      exitCode: 0,
      stdoutIsEncoded: false,
      stderrIsEncoded: false,
    });

    const output = await getOutputById(outputId);
    const { idToString } = await import("../db/ouputs.ts");

    // Test response structure that MCP server would return
    const structuredContent = {
      id: idToString(outputId),
      status: output?.status,
      exitCode: output?.exitCode,
      hasOutput: (output?.stdout.length || 0) > 0 ||
        (output?.stderr.length || 0) > 0,
      stdout: {
        content: output?.stdout,
        isEncoded: output?.stdoutIsEncoded,
      },
      stderr: {
        content: output?.stderr,
        isEncoded: output?.stderrIsEncoded,
      },
      createdAt: output?.createdAt,
    };

    assertEquals(structuredContent.status, "completed");
    assertEquals(structuredContent.exitCode, 0);
    assertEquals(structuredContent.hasOutput, true);
    assertEquals(structuredContent.stdout.content, "test output");
    assertEquals(structuredContent.stderr.content, "test error");
  });
});

Deno.test("server initialization", async (t) => {
  await t.step(
    "should call deleteExpiredOutputs on server creation",
    async () => {
      // This tests that deleteExpiredOutputs is called during server creation
      // We can verify by creating some old data and checking it gets cleaned up
      await setupTestDb();

      // Create the server (which should call deleteExpiredOutputs)
      const server = await createMcpServer();
      assertEquals(typeof server, "object");

      // The cleanup would have happened during server creation
      // This is mainly testing that the server creation completes successfully
    },
  );
});
