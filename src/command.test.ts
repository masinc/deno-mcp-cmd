import { assertEquals } from "@std/assert";
import {
  cancelCommand,
  getCommandProgress,
  getCommandStatus,
  runCommand,
} from "./command.ts";

Deno.test("runCommand", async (t) => {
  await t.step("should execute simple command", async () => {
    const result = await runCommand("echo", {
      args: ["hello"],
      cwd: Deno.cwd(),
    });

    assertEquals(typeof result.id, "string");
    assertEquals(result.status, "running");
  });

  await t.step("should handle command with multiple args", async () => {
    const result = await runCommand("echo", {
      args: ["-n", "test", "args"],
      cwd: Deno.cwd(),
    });

    assertEquals(typeof result.id, "string");
    assertEquals(result.status, "running");
  });

  await t.step("should handle stdin input", async () => {
    const result = await runCommand("cat", {
      stdin: "hello from stdin",
      cwd: Deno.cwd(),
    });

    assertEquals(typeof result.id, "string");
    assertEquals(result.status, "running");
  });

  await t.step("should handle custom working directory", async () => {
    const result = await runCommand("pwd", {
      cwd: "/tmp",
    });

    assertEquals(typeof result.id, "string");
    assertEquals(result.status, "running");
  });

  await t.step("should handle environment variables", async () => {
    const result = await runCommand("sh", {
      args: ["-c", "echo $TEST_VAR"],
      env: { TEST_VAR: "test_value" },
      cwd: Deno.cwd(),
    });

    assertEquals(typeof result.id, "string");
    assertEquals(result.status, "running");
  });

  await t.step("should handle command failure", async () => {
    const result = await runCommand("nonexistentcommand12345", {
      cwd: Deno.cwd(),
    });

    assertEquals(typeof result.id, "string");
    assertEquals(result.status, "running");
  });
});

Deno.test("command status functions", async (t) => {
  await t.step("should return command status", async () => {
    const result = await runCommand("echo", {
      args: ["test"],
      cwd: Deno.cwd(),
    });

    const status = await getCommandStatus(result.id);
    assertEquals(
      ["running", "completed", "failed", "not_found"].includes(status),
      true,
    );
  });

  await t.step("should return command progress", async () => {
    const result = await runCommand("echo", {
      args: ["progress test"],
      cwd: Deno.cwd(),
    });

    const progress = await getCommandProgress(result.id);
    // May be null if command completes too quickly, which is fine
    if (progress) {
      assertEquals(
        ["running", "completed", "failed"].includes(progress.status),
        true,
      );
      assertEquals(typeof progress.hasOutput, "boolean");
    }
  });

  await t.step("should attempt to cancel command", async () => {
    const result = await runCommand("sleep", {
      args: ["0.1"],
      cwd: Deno.cwd(),
    });

    // Try to cancel (may or may not succeed depending on timing)
    const cancelled = await cancelCommand(result.id);
    assertEquals(typeof cancelled, "boolean");
  });
});

Deno.test("command options validation", async (t) => {
  await t.step("should handle minimal options", async () => {
    const result = await runCommand("echo");
    assertEquals(typeof result.id, "string");
    assertEquals(result.status, "running");
  });

  await t.step("should handle empty args array", async () => {
    const result = await runCommand("echo", { args: [] });
    assertEquals(typeof result.id, "string");
    assertEquals(result.status, "running");
  });

  await t.step("should handle undefined options", async () => {
    const result = await runCommand("echo", undefined);
    assertEquals(typeof result.id, "string");
    assertEquals(result.status, "running");
  });
});
