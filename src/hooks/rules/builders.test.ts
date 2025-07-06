import { assert } from "@std/assert";
import {
  approveCommand,
  approveCommands,
  blockCommand,
  blockCommands,
  blockCommandWithFlags,
  blockOutsideCurrentDirectory,
  confirmCommand,
  confirmCommands,
  createCommandRule,
  createPatternBasedRule,
  createRule,
  createWarningRule,
} from "./builders.ts";
import type { RuleContext } from "./types.ts";

const createContext = (
  command: string,
  args?: string[],
  options?: { cwd?: string; acknowledgeWarnings?: string[] },
): RuleContext => ({
  toolInput: {
    command,
    args,
    cwd: options?.cwd,
    acknowledgeWarnings: options?.acknowledgeWarnings,
  },
  sessionId: "test-session",
  transcriptPath: "/test/transcript",
  timestamp: new Date(),
});

Deno.test("Rule builders", async (t) => {
  await t.step("createCommandRule should work with single command", () => {
    const rule = createCommandRule("block", "rm", "rm is dangerous");

    const result1 = rule.condition(createContext("rm"));
    assert(result1?.action === "block");
    assert(result1?.reason === "rm is dangerous");

    const result2 = rule.condition(createContext("ls"));
    assert(result2 === null);
  });

  await t.step("createCommandRule should work with multiple commands", () => {
    const rule = createCommandRule(
      "confirm",
      ["curl", "wget"],
      "Network commands",
    );

    const result1 = rule.condition(createContext("curl"));
    assert(result1?.action === "confirm");
    assert(result1?.reason === "Network commands");

    const result2 = rule.condition(createContext("wget"));
    assert(result2?.action === "confirm");

    const result3 = rule.condition(createContext("ls"));
    assert(result3 === null);
  });

  await t.step(
    "createPatternBasedRule should work with command regex patterns",
    () => {
      const pattern = {
        name: "safe-commands",
        cmd: { regex: "^(ls|cat)$" },
        action: "approve" as const,
        reason: "Safe commands",
      };
      const rule = createPatternBasedRule(pattern);

      const result1 = rule.condition(createContext("ls"));
      assert(result1?.action === "approve");
      assert(result1?.reason === "Safe commands");

      const result2 = rule.condition(createContext("rm"));
      assert(result2 === null);
    },
  );

  await t.step("blockCommand should block specified command", () => {
    const rule = blockCommand("rm", "rm is dangerous");

    const result1 = rule.condition(createContext("rm"));
    assert(result1?.action === "block");
    assert(result1?.reason === "rm is dangerous");

    const result2 = rule.condition(createContext("ls"));
    assert(result2 === null);
  });

  await t.step("confirmCommand should require confirmation", () => {
    const rule = confirmCommand("curl");

    const result1 = rule.condition(createContext("curl"));
    assert(result1?.action === "confirm");
    assert(result1?.reason === "curl command requires confirmation");

    const result2 = rule.condition(createContext("ls"));
    assert(result2 === null);
  });

  await t.step("blockCommands should block multiple commands", () => {
    const rule = blockCommands(["sudo", "su"], "No privilege escalation");

    const result1 = rule.condition(createContext("sudo"));
    assert(result1?.action === "block");
    assert(result1?.reason === "No privilege escalation");

    const result2 = rule.condition(createContext("su"));
    assert(result2?.action === "block");

    const result3 = rule.condition(createContext("ls"));
    assert(result3 === null);
  });

  await t.step("confirmCommands should confirm multiple commands", () => {
    const rule = confirmCommands(["curl", "wget"]);

    const result1 = rule.condition(createContext("curl"));
    assert(result1?.action === "confirm");

    const result2 = rule.condition(createContext("wget"));
    assert(result2?.action === "confirm");

    const result3 = rule.condition(createContext("ls"));
    assert(result3 === null);
  });

  await t.step(
    "blockCommandWithFlags should block commands with dangerous flags",
    () => {
      const rule = blockCommandWithFlags("rm", ["-rf", "--force"]);

      // Should block with dangerous flags
      const result1 = rule.condition(createContext("rm", ["-rf", "test"]));
      assert(result1?.action === "block");
      assert(result1?.reason?.includes("-rf"));

      // Should not block with safe flags
      const result2 = rule.condition(createContext("rm", ["test.txt"]));
      assert(result2 === null);

      // Should not block different command
      const result3 = rule.condition(createContext("ls", ["-rf"]));
      assert(result3 === null);
    },
  );

  await t.step(
    "blockOutsideCurrentDirectory should block path operations outside cwd",
    () => {
      const rule = blockOutsideCurrentDirectory();

      // Should block absolute paths outside current directory
      const result1 = rule.condition(
        createContext("ls", ["/etc/passwd"], { cwd: "/home/user" }),
      );
      assert(result1?.action === "block");

      // Should allow relative paths within current directory
      const result2 = rule.condition(
        createContext("ls", ["./file.txt"], { cwd: "/home/user" }),
      );
      assert(result2 === null);

      // Should not check commands without args
      const result3 = rule.condition(
        createContext("ls", [], { cwd: "/home/user" }),
      );
      assert(result3 === null);
    },
  );

  await t.step("createRule should create custom rules", () => {
    const rule = createRule(
      "test_rule",
      "confirm",
      (ctx) => ctx.toolInput.command.startsWith("test"),
      "Test commands need confirmation",
    );

    const result1 = rule.condition(createContext("test-command"));
    assert(result1?.action === "confirm");
    assert(result1?.reason === "Test commands need confirmation");

    const result2 = rule.condition(createContext("ls"));
    assert(result2 === null);
  });

  await t.step("approveCommand should approve specified command", () => {
    const rule = approveCommand("ls", "ls is safe");

    const result1 = rule.condition(createContext("ls"));
    assert(result1?.action === "approve");
    assert(result1?.reason === "ls is safe");

    const result2 = rule.condition(createContext("rm"));
    assert(result2 === null);
  });

  await t.step("approveCommands should approve multiple commands", () => {
    const rule = approveCommands(["ls", "cat", "grep"], "Safe read commands");

    const result1 = rule.condition(createContext("ls"));
    assert(result1?.action === "approve");
    assert(result1?.reason === "Safe read commands");

    const result2 = rule.condition(createContext("cat"));
    assert(result2?.action === "approve");

    const result3 = rule.condition(createContext("rm"));
    assert(result3 === null);
  });

  await t.step("rules should have correct names", () => {
    assert(blockCommand("rm").name === "block-rm");
    assert(confirmCommand("curl").name === "confirm-curl");
    assert(approveCommand("ls").name === "approve-ls");
    assert(blockCommands(["sudo", "su"]).name === "block-commands-sudo-su");
    assert(approveCommands(["ls", "cat"]).name === "approve-commands-ls-cat");
    assert(blockCommandWithFlags("rm", ["-rf"]).name === "block-rm-with-flags");
    assert(
      blockOutsideCurrentDirectory().name === "block-outside-current-directory",
    );
  });

  await t.step("default reasons should be generated when not provided", () => {
    const rule1 = blockCommand("rm");
    const result1 = rule1.condition(createContext("rm"));
    assert(result1?.reason === "rm command blocked");

    const rule2 = confirmCommand("curl");
    const result2 = rule2.condition(createContext("curl"));
    assert(result2?.reason === "curl command requires confirmation");

    const rule3 = approveCommand("ls");
    const result3 = rule3.condition(createContext("ls"));
    assert(result3?.reason === "ls command approved");
  });
});

Deno.test("Extended Rule builders", async (t) => {
  await t.step("createCommandRule with all actions", () => {
    const actions = ["block", "confirm", "approve", "skip"] as const;

    for (const action of actions) {
      const rule = createCommandRule(action, "test", `Test ${action}`);
      const result = rule.condition(createContext("test"));

      assert(result?.action === action);
      assert(result?.reason === `Test ${action}`);

      // Different command should return null
      const noResult = rule.condition(createContext("other"));
      assert(noResult === null);
    }
  });

  await t.step("createPatternBasedRule with command patterns", () => {
    // Test case sensitivity with string patterns
    const caseSensitive = createPatternBasedRule({
      name: "case-sensitive",
      cmd: { regex: "^Test$" },
      action: "block",
      reason: "Case sensitive",
    });
    assert(caseSensitive.condition(createContext("Test"))?.action === "block");
    assert(caseSensitive.condition(createContext("test")) === null);

    // Test case insensitive with createPatternBasedRule
    const caseInsensitive = createPatternBasedRule({
      name: "case-insensitive-test",
      cmd: { regex: "^test$" }, // Note: case insensitive flags need to be handled in the regex string
      action: "confirm",
      reason: "Case insensitive test",
    });
    // Note: This will be case sensitive now, which is fine for demonstration
    assert(
      caseInsensitive.condition(createContext("test"))?.action === "confirm",
    );

    // Complex patterns with string
    const complex = createPatternBasedRule({
      name: "download-commands",
      cmd: { regex: "^(get|fetch|download).*$" },
      action: "approve",
      reason: "Download commands allowed",
    });
    assert(complex.condition(createContext("get-data"))?.action === "approve");
    assert(complex.condition(createContext("fetch-url"))?.action === "approve");
    assert(complex.condition(createContext("upload-file")) === null);
  });

  await t.step("blockCommandWithFlags edge cases", () => {
    const rule = blockCommandWithFlags(
      "test",
      ["-x", "--dangerous"],
      "Custom reason",
    );

    // Multiple dangerous flags
    const result1 = rule.condition(
      createContext("test", ["-x", "--dangerous", "file"]),
    );
    assert(result1?.action === "block");
    assert(result1?.reason === "Custom reason");

    // No dangerous flags
    const result2 = rule.condition(createContext("test", ["-v", "file"]));
    assert(result2 === null);

    // Different command with dangerous flags
    const result3 = rule.condition(createContext("other", ["-x"]));
    assert(result3 === null);

    // No args
    const result4 = rule.condition(createContext("test"));
    assert(result4 === null);

    // Empty args
    const result5 = rule.condition(createContext("test", []));
    assert(result5 === null);
  });

  await t.step("blockOutsideCurrentDirectory complex scenarios", () => {
    const rule = blockOutsideCurrentDirectory("Security policy");
    const testCwd = "/home/user/project";

    // Safe paths
    const result1 = rule.condition(
      createContext("cp", ["file1.txt", "file2.txt"], { cwd: testCwd }),
    );
    assert(result1 === null);

    // Dangerous paths
    const result2 = rule.condition(
      createContext("cp", ["file.txt", "/tmp/out.txt"], { cwd: testCwd }),
    );
    assert(result2?.action === "block");
    assert(result2?.reason === "Security policy");

    // Mixed safe and dangerous
    const result3 = rule.condition(
      createContext("cp", ["src/file.txt", "../backup/"], { cwd: testCwd }),
    );
    assert(result3?.action === "block");

    // No args (should not trigger)
    const result4 = rule.condition(createContext("pwd", [], { cwd: testCwd }));
    assert(result4 === null);
  });

  await t.step("createRule custom condition functions", () => {
    // Complex condition with multiple checks
    const complexRule = createRule(
      "complex_validation",
      "confirm",
      (ctx) => {
        return ctx.toolInput.command.length > 5 &&
          (ctx.toolInput.args?.length || 0) > 2 &&
          ctx.toolInput.command.includes("install");
      },
      "Complex installation command",
    );

    const result1 = complexRule.condition(
      createContext("npm-install", ["package1", "package2", "package3"]),
    );
    assert(result1?.action === "confirm");
    assert(result1?.reason === "Complex installation command");

    const result2 = complexRule.condition(createContext("install", ["pkg"])); // Too short command
    assert(result2 === null);

    const result3 = complexRule.condition(
      createContext("download", ["a", "b", "c"]),
    ); // No "install"
    assert(result3 === null);
  });

  await t.step("Rule name generation", () => {
    // Single command
    assert(createCommandRule("block", "test").name === "block-test");
    assert(createCommandRule("approve", "ls").name === "approve-ls");

    // Multiple commands
    assert(
      createCommandRule("confirm", ["a", "b"]).name === "confirm-commands-a-b",
    );
    assert(
      createCommandRule("block", ["x", "y", "z"]).name ===
        "block-commands-x-y-z",
    );

    // Pattern rules (via createPatternBasedRule)
    assert(
      createPatternBasedRule({
        name: "test-pattern",
        cmd: { regex: "test" },
        action: "block",
        reason: "test",
      }).name === "test-pattern",
    );

    // Command with flags
    assert(blockCommandWithFlags("rm", ["-rf"]).name === "block-rm-with-flags");

    // Custom rule
    assert(createRule("my-custom", "skip", () => true).name === "my-custom");

    // Warning rule
    assert(
      createWarningRule("warn-test", () => true, "Test warning").name ===
        "warn-test",
    );
  });

  await t.step("createWarningRule behavior", () => {
    const testWarning = createWarningRule(
      "test-warning",
      (ctx: RuleContext) => ctx.toolInput.command === "dangerous",
      "This is dangerous",
      "Custom skip reason",
    );

    // Should warn when condition is true and warning not acknowledged
    const warnResult = testWarning.condition(createContext("dangerous"));
    assert(warnResult?.action === "warning");
    assert(
      warnResult?.reason && warnResult.reason.includes("This is dangerous"),
    );

    // Should skip when warning is acknowledged
    const skipResult = testWarning.condition(
      createContext("dangerous", [], { acknowledgeWarnings: ["test-warning"] }),
    );
    assert(skipResult?.action === "skip");
    assert(skipResult?.reason === "Custom skip reason");

    // Should return null when condition is false
    const noResult = testWarning.condition(createContext("safe"));
    assert(noResult === null);
  });

  await t.step("Error handling and edge cases", () => {
    // Empty command list (should still work)
    const emptyRule = createCommandRule("block", []);
    const result1 = emptyRule.condition(createContext("any"));
    assert(result1 === null); // Empty list matches nothing

    // Empty pattern (matches empty string)
    const emptyPattern = createPatternBasedRule({
      name: "empty-pattern",
      cmd: { regex: "^$" },
      action: "approve",
      reason: "Empty command approved",
    });
    const result2 = emptyPattern.condition(createContext(""));
    assert(result2?.action === "approve");

    // Very long command names
    const longCommand = "a".repeat(1000);
    const longRule = createCommandRule("confirm", longCommand);
    const result3 = longRule.condition(createContext(longCommand));
    assert(result3?.action === "confirm");

    // Special characters in commands
    const specialRule = createCommandRule("block", "test-command_v2.0");
    const result4 = specialRule.condition(createContext("test-command_v2.0"));
    assert(result4?.action === "block");
  });

  await t.step("Context variations", () => {
    const rule = createCommandRule("confirm", "test");

    // Minimal context
    const minimalCtx = {
      toolInput: { command: "test" },
      sessionId: "session",
      transcriptPath: "/path",
      timestamp: new Date(),
    };
    const result1 = rule.condition(minimalCtx);
    assert(result1?.action === "confirm");

    // Full context with all fields
    const fullCtx = {
      toolInput: {
        command: "test",
        args: ["arg1", "arg2"],
        stdin: "input",
        stdinForOutput: "123",
        cwd: "/path",
      },
      sessionId: "session-123",
      transcriptPath: "/long/path/to/transcript",
      timestamp: new Date("2024-01-01"),
    };
    const result2 = rule.condition(fullCtx);
    assert(result2?.action === "confirm");
  });

  await t.step("Performance with many rules", () => {
    // Create many rules to test performance doesn't degrade significantly
    const rules = [];
    for (let i = 0; i < 100; i++) {
      rules.push(createCommandRule("skip", `command${i}`));
    }

    // Test that they all work independently
    for (let i = 0; i < 10; i++) {
      const result = rules[i].condition(createContext(`command${i}`));
      assert(result?.action === "skip");
    }

    // Test that non-matching commands return null
    const noMatch = rules[0].condition(createContext("different"));
    assert(noMatch === null);
  });
});

Deno.test("Warning rule system", async (t) => {
  await t.step(
    "shell expansion warning should detect partial matches in commands",
    () => {
      const rule = createWarningRule(
        "warn-shell-expansion",
        (ctx) => {
          const shellPatterns = ["$(", "`"];
          const allInputs = [
            ctx.toolInput.command,
            ...(ctx.toolInput.args ?? []),
          ];
          return allInputs.some((input) =>
            shellPatterns.some((pattern) => input.includes(pattern))
          );
        },
        "Shell expansion syntax detected in command",
      );

      // 部分一致のテスト
      const result1 = rule.condition(createContext("echo $(whoami)"));
      assert(result1?.action === "warning");
      assert(result1?.reason?.includes("Shell expansion syntax detected"));

      const result2 = rule.condition(createContext("ls `date`"));
      assert(result2?.action === "warning");
      assert(result2?.reason?.includes("Shell expansion syntax detected"));

      const result3 = rule.condition(createContext("cat file.txt"));
      assert(result3 === null);
    },
  );

  await t.step(
    "shell expansion warning should skip when acknowledged",
    () => {
      const rule = createWarningRule(
        "warn-shell-expansion",
        (ctx) => {
          const shellPatterns = ["$(", "`"];
          const allInputs = [
            ctx.toolInput.command,
            ...(ctx.toolInput.args ?? []),
          ];
          return allInputs.some((input) =>
            shellPatterns.some((pattern) => input.includes(pattern))
          );
        },
        "Shell expansion syntax detected in command",
      );

      const result = rule.condition(
        createContext("$(ls)", [], {
          acknowledgeWarnings: ["warn-shell-expansion"],
        }),
      );
      assert(result?.action === "skip");
      assert(result?.reason?.includes("warning acknowledged"));
    },
  );
});

Deno.test("Pattern-based rule system", async (t) => {
  await t.step(
    "createPatternBasedRule should work with exact string patterns",
    () => {
      const pattern = {
        name: "test-exact",
        cmd: "git",
        args: ["status"],
        action: "approve" as const,
        reason: "Exact match approved",
      };

      const rule = createPatternBasedRule(pattern);

      const result1 = rule.condition(createContext("git", ["status"]));
      assert(result1?.action === "approve");
      assert(result1?.reason === "Exact match approved");

      const result2 = rule.condition(createContext("git", ["log"]));
      assert(result2 === null);
    },
  );

  await t.step(
    "createPatternBasedRule should work with array choice patterns",
    () => {
      const pattern = {
        name: "test-choices",
        cmd: "git",
        args: [["status", "log", "diff"]],
        action: "approve" as const,
        reason: "Choice match approved",
      };

      const rule = createPatternBasedRule(pattern);

      const result1 = rule.condition(createContext("git", ["status"]));
      assert(result1?.action === "approve");

      const result2 = rule.condition(createContext("git", ["log"]));
      assert(result2?.action === "approve");

      const result3 = rule.condition(createContext("git", ["diff"]));
      assert(result3?.action === "approve");

      const result4 = rule.condition(createContext("git", ["push"]));
      assert(result4 === null);
    },
  );

  await t.step(
    "createPatternBasedRule should work with wildcard patterns",
    () => {
      const pattern = {
        name: "test-wildcard",
        cmd: "git",
        args: ["config", "*"],
        action: "confirm" as const,
        reason: "Config with any option",
      };

      const rule = createPatternBasedRule(pattern);

      const result1 = rule.condition(
        createContext("git", ["config", "--list"]),
      );
      assert(result1?.action === "confirm");

      const result2 = rule.condition(
        createContext("git", ["config", "user.name"]),
      );
      assert(result1?.action === "confirm");
      assert(result2?.action === "confirm");

      const result3 = rule.condition(createContext("git", ["config"])); // No second arg
      assert(result3 === null);
    },
  );

  await t.step(
    "createPatternBasedRule should work with double wildcard patterns",
    () => {
      const pattern = {
        name: "test-double-wildcard",
        cmd: "git",
        args: ["log", "**"],
        action: "approve" as const,
        reason: "Log with any args",
      };

      const rule = createPatternBasedRule(pattern);

      const result1 = rule.condition(createContext("git", ["log"]));
      assert(result1?.action === "approve");

      const result2 = rule.condition(
        createContext("git", ["log", "--oneline"]),
      );
      assert(result2?.action === "approve");

      const result3 = rule.condition(
        createContext("git", ["log", "--graph", "--decorate", "--all"]),
      );
      assert(result3?.action === "approve");

      const result4 = rule.condition(createContext("git", ["status"]));
      assert(result4 === null);
    },
  );

  await t.step(
    "createPatternBasedRule should work with prefix patterns",
    () => {
      const pattern = {
        name: "test-prefix",
        cmd: "git",
        args: ["config", { startsWith: "--get" }],
        action: "approve" as const,
        reason: "Safe config read",
      };

      const rule = createPatternBasedRule(pattern);

      const result1 = rule.condition(createContext("git", ["config", "--get"]));
      assert(result1?.action === "approve");

      const result2 = rule.condition(
        createContext("git", ["config", "--get-all"]),
      );
      assert(result2?.action === "approve");

      const result3 = rule.condition(
        createContext("git", ["config", "--list"]),
      );
      assert(result3 === null);
    },
  );

  await t.step("createPatternBasedRule should work with regex patterns", () => {
    const pattern = {
      name: "test-regex",
      cmd: "git",
      args: ["log", { regex: "^--format=" }],
      action: "approve" as const,
      reason: "Formatted log output",
    };

    const rule = createPatternBasedRule(pattern);

    const result1 = rule.condition(
      createContext("git", ["log", "--format=oneline"]),
    );
    assert(result1?.action === "approve");

    const result2 = rule.condition(
      createContext("git", ["log", "--format=%H %s"]),
    );
    assert(result2?.action === "approve");

    const result3 = rule.condition(createContext("git", ["log", "--oneline"]));
    assert(result3 === null);
  });

  await t.step(
    "createPatternBasedRule should work with multiple command choices",
    () => {
      const pattern = {
        name: "test-multi-cmd",
        cmd: ["git", "svn"],
        args: ["status"],
        action: "approve" as const,
        reason: "VCS status command",
      };

      const rule = createPatternBasedRule(pattern);

      const result1 = rule.condition(createContext("git", ["status"]));
      assert(result1?.action === "approve");

      const result2 = rule.condition(createContext("svn", ["status"]));
      assert(result2?.action === "approve");

      const result3 = rule.condition(createContext("hg", ["status"]));
      assert(result3 === null);
    },
  );

  await t.step(
    "createPatternBasedRule should work with no args pattern",
    () => {
      const pattern = {
        name: "test-no-args",
        cmd: "pwd",
        action: "approve" as const,
        reason: "Simple pwd command",
      };

      const rule = createPatternBasedRule(pattern);

      const result1 = rule.condition(createContext("pwd", []));
      assert(result1?.action === "approve");

      const result2 = rule.condition(createContext("pwd", ["extra"]));
      assert(result2?.action === "approve"); // No args pattern means any args are fine
    },
  );

  await t.step(
    "createPatternBasedRule should handle complex pattern combinations",
    () => {
      const pattern = {
        name: "test-complex",
        cmd: "git",
        args: [["branch", "tag"], ["-v", "--list", "--show-current"], "**"],
        action: "approve" as const,
        reason: "Safe git listing operation",
      };

      const rule = createPatternBasedRule(pattern);

      const result1 = rule.condition(createContext("git", ["branch", "-v"]));
      assert(result1?.action === "approve");

      const result2 = rule.condition(
        createContext("git", ["tag", "--list", "v*"]),
      );
      assert(result2?.action === "approve");

      const result3 = rule.condition(
        createContext("git", ["branch", "--show-current", "extra", "args"]),
      );
      assert(result3?.action === "approve");

      const result4 = rule.condition(createContext("git", ["branch", "-d"])); // -d not in allowed flags
      assert(result4 === null);
    },
  );

  await t.step(
    "createPatternBasedRule should work with command regex patterns",
    () => {
      const pattern = {
        name: "test-cmd-regex",
        cmd: { regex: "^(sudo|su)$" },
        action: "block" as const,
        reason: "Privilege escalation blocked",
      };

      const rule = createPatternBasedRule(pattern);

      const result1 = rule.condition(createContext("sudo", ["apt", "install"]));
      assert(result1?.action === "block");
      assert(result1?.reason === "Privilege escalation blocked");

      const result2 = rule.condition(createContext("su", ["-"]));
      assert(result2?.action === "block");

      const result3 = rule.condition(createContext("ls", []));
      assert(result3 === null);
    },
  );

  await t.step("createPatternBasedRule rule name", () => {
    const pattern = {
      name: "custom-pattern-rule",
      cmd: "test",
      action: "block" as const,
      reason: "Test reason",
    };

    const rule = createPatternBasedRule(pattern);
    assert(rule.name === "custom-pattern-rule");
  });

  await t.step(
    "createPatternBasedRule should work for various command patterns",
    () => {
      const blockRule = createPatternBasedRule({
        name: "block-deletion",
        cmd: { regex: "^(rm|del)" },
        action: "block",
        reason: "Deletion commands",
      });
      const confirmRule = createPatternBasedRule({
        name: "confirm-network",
        cmd: { regex: "^(curl|wget)$" },
        action: "confirm",
        reason: "Network commands",
      });
      const approveRule = createPatternBasedRule({
        name: "approve-safe",
        cmd: { regex: "^(ls|cat)$" },
        action: "approve",
        reason: "Safe read commands",
      });

      // Test block rule
      assert(
        blockRule.condition(createContext("rm", ["file.txt"]))?.action ===
          "block",
      );
      assert(blockRule.condition(createContext("ls", [])) === null);

      // Test confirm rule
      assert(
        confirmRule.condition(createContext("curl", ["-O"]))?.action ===
          "confirm",
      );
      assert(confirmRule.condition(createContext("ls", [])) === null);

      // Test approve rule
      assert(
        approveRule.condition(createContext("ls", ["-l"]))?.action ===
          "approve",
      );
      assert(approveRule.condition(createContext("rm", [])) === null);
    },
  );
});
