import { assertEquals, assertStringIncludes } from "@std/assert";

// Integration test using MCP Inspector CLI to test the actual MCP server
Deno.test("MCP CLI Integration", async (t) => {
  const cwd = Deno.cwd();

  await t.step("should list available tools", async () => {
    const cmd = new Deno.Command("npx", {
      args: [
        "@modelcontextprotocol/inspector",
        "--cli",
        "deno",
        "run",
        "-A",
        "--unstable-worker-options",
        "src/bin/stdio.ts",
        "--method",
        "tools/list",
      ],
      cwd,
      stdout: "piped",
      stderr: "piped",
    });

    const process = cmd.spawn();
    const { code, stdout } = await process.output();

    const output = new TextDecoder().decode(stdout);

    // Should succeed
    assertEquals(code, 0);

    // Should contain our registered tools
    assertStringIncludes(output, "runCommand");
    assertStringIncludes(output, "getCommand");
  });

  await t.step("should execute runCommand tool", async () => {
    const cmd = new Deno.Command("npx", {
      args: [
        "@modelcontextprotocol/inspector",
        "--cli",
        "deno",
        "run",
        "-A",
        "--unstable-worker-options",
        "src/bin/stdio.ts",
        "--method",
        "tools/call",
        "--tool-name",
        "runCommand",
        "--tool-arg",
        "command=echo",
        "--tool-arg",
        'args=["CLI Integration Test"]',
      ],
      cwd,
      stdout: "piped",
      stderr: "piped",
    });

    const process = cmd.spawn();
    const { code, stdout } = await process.output();

    const output = new TextDecoder().decode(stdout);

    // Should succeed
    assertEquals(code, 0);

    // Should contain a command ID
    assertStringIncludes(output, "id");
    assertStringIncludes(output, "status");

    // Extract the command ID from the output
    const match = output.match(/"id":"([^"]+)"/);
    if (match) {
      const commandId = match[1];

      // Wait a bit for command to complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Now test getCommand with the returned ID
      await t.step(
        "should retrieve command result with getCommand",
        async () => {
          const getCmd = new Deno.Command("npx", {
            args: [
              "@modelcontextprotocol/inspector",
              "--cli",
              "deno",
              "run",
              "-A",
              "--unstable-worker-options",
              "src/bin/stdio.ts",
              "--method",
              "tools/call",
              "--tool-name",
              "getCommand",
              "--tool-arg",
              `id=${commandId}`,
            ],
            cwd,
            stdout: "piped",
            stderr: "piped",
          });

          const getProcess = getCmd.spawn();
          const { code: getCode, stdout: getStdout } = await getProcess
            .output();

          const getOutput = new TextDecoder().decode(getStdout);

          assertEquals(getCode, 0);
          assertStringIncludes(getOutput, "completed");
          assertStringIncludes(getOutput, "CLI Integration Test");
        },
      );
    }
  });

  await t.step("should handle command chaining via CLI", async () => {
    // First command: echo some data
    const firstCmd = new Deno.Command("npx", {
      args: [
        "@modelcontextprotocol/inspector",
        "--cli",
        "deno",
        "run",
        "-A",
        "--unstable-worker-options",
        "src/bin/stdio.ts",
        "--method",
        "tools/call",
        "--tool-name",
        "runCommand",
        "--tool-arg",
        "command=echo",
        "--tool-arg",
        'args=["chain data"]',
      ],
      cwd,
      stdout: "piped",
      stderr: "piped",
    });

    const firstProcess = firstCmd.spawn();
    const { code: firstCode, stdout: firstStdout } = await firstProcess
      .output();

    const firstOutput = new TextDecoder().decode(firstStdout);
    assertEquals(firstCode, 0);

    const firstMatch = firstOutput.match(/"id":"([^"]+)"/);
    if (firstMatch) {
      const firstCommandId = firstMatch[1];

      // Wait for first command to complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Second command: use first command's output as stdin
      const secondCmd = new Deno.Command("npx", {
        args: [
          "@modelcontextprotocol/inspector",
          "--cli",
          "deno",
          "run",
          "-A",
          "--unstable-worker-options",
          "src/bin/stdio.ts",
          "--method",
          "tools/call",
          "--tool-name",
          "runCommand",
          "--tool-arg",
          "command=cat",
          "--tool-arg",
          `stdinForOutput=${firstCommandId}`,
        ],
        cwd,
        stdout: "piped",
        stderr: "piped",
      });

      const secondProcess = secondCmd.spawn();
      const { code: secondCode, stdout: secondStdout } = await secondProcess
        .output();

      const secondOutput = new TextDecoder().decode(secondStdout);
      assertEquals(secondCode, 0);

      const secondMatch = secondOutput.match(/"id":"([^"]+)"/);
      if (secondMatch) {
        const secondCommandId = secondMatch[1];

        // Wait for second command to complete
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Check the result
        const getCmd = new Deno.Command("npx", {
          args: [
            "@modelcontextprotocol/inspector",
            "--cli",
            "deno",
            "run",
            "-A",
            "--unstable-worker-options",
            "src/bin/stdio.ts",
            "--method",
            "tools/call",
            "--tool-name",
            "getCommand",
            "--tool-arg",
            `id=${secondCommandId}`,
          ],
          cwd,
          stdout: "piped",
          stderr: "piped",
        });

        const getProcess = getCmd.spawn();
        const { code: getCode, stdout: getStdout } = await getProcess.output();

        const getOutput = new TextDecoder().decode(getStdout);
        assertEquals(getCode, 0);
        assertStringIncludes(getOutput, "chain data");
      }
    }
  });

  await t.step("should handle tool validation errors", async () => {
    // Test with invalid command (missing required parameter)
    const cmd = new Deno.Command("npx", {
      args: [
        "@modelcontextprotocol/inspector",
        "--cli",
        "deno",
        "run",
        "-A",
        "--unstable-worker-options",
        "src/bin/stdio.ts",
        "--method",
        "tools/call",
        "--tool-name",
        "runCommand",
        // Missing required 'command' parameter
      ],
      cwd,
      stdout: "piped",
      stderr: "piped",
    });

    const process = cmd.spawn();
    const { code } = await process.output();

    // Should fail with validation error
    assertEquals(code !== 0, true);
  });

  await t.step("should handle invalid tool name", async () => {
    const cmd = new Deno.Command("npx", {
      args: [
        "@modelcontextprotocol/inspector",
        "--cli",
        "deno",
        "run",
        "-A",
        "--unstable-worker-options",
        "src/bin/stdio.ts",
        "--method",
        "tools/call",
        "--tool-name",
        "nonexistentTool",
        "--tool-arg",
        "param=value",
      ],
      cwd,
      stdout: "piped",
      stderr: "piped",
    });

    const process = cmd.spawn();
    const { code } = await process.output();

    // Should fail
    assertEquals(code !== 0, true);
  });
});
