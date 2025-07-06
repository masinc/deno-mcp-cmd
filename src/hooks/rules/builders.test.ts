import { assert } from "@std/assert";
import {
  createCommandRule,
  createPatternRule,
  blockCommand,
  confirmCommand,
  approveCommand,
  blockCommands,
  confirmCommands,
  approveCommands,
  blockCommandWithFlags,
  blockOutsideCurrentDirectory,
  createRule,
  blockCommandPattern,
  confirmCommandPattern,
  approveCommandPattern,
} from "./builders.ts";
import type { RuleContext } from "./types.ts";

const createContext = (
  command: string,
  args?: string[],
  cwd?: string
): RuleContext => ({
  toolInput: { command, args, cwd },
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
    const rule = createCommandRule("confirm", ["curl", "wget"], "Network commands");
    
    const result1 = rule.condition(createContext("curl"));
    assert(result1?.action === "confirm");
    assert(result1?.reason === "Network commands");
    
    const result2 = rule.condition(createContext("wget"));
    assert(result2?.action === "confirm");
    
    const result3 = rule.condition(createContext("ls"));
    assert(result3 === null);
  });

  await t.step("createPatternRule should work with regex patterns", () => {
    const rule = createPatternRule("approve", /^(ls|cat)$/, "Safe commands");
    
    const result1 = rule.condition(createContext("ls"));
    assert(result1?.action === "approve");
    assert(result1?.reason === "Safe commands");
    
    const result2 = rule.condition(createContext("rm"));
    assert(result2 === null);
  });

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

  await t.step("blockCommandWithFlags should block commands with dangerous flags", () => {
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
  });

  await t.step("blockOutsideCurrentDirectory should block path operations outside cwd", () => {
    const rule = blockOutsideCurrentDirectory();
    
    // Should block absolute paths outside current directory
    const result1 = rule.condition(createContext("ls", ["/etc/passwd"], "/home/user"));
    assert(result1?.action === "block");
    
    // Should allow relative paths within current directory
    const result2 = rule.condition(createContext("ls", ["./file.txt"], "/home/user"));
    assert(result2 === null);
    
    // Should not check commands without args
    const result3 = rule.condition(createContext("ls", [], "/home/user"));
    assert(result3 === null);
  });


  await t.step("createRule should create custom rules", () => {
    const rule = createRule(
      "test_rule",
      "confirm",
      (ctx) => ctx.toolInput.command.startsWith("test"),
      "Test commands need confirmation"
    );
    
    const result1 = rule.condition(createContext("test-command"));
    assert(result1?.action === "confirm");
    assert(result1?.reason === "Test commands need confirmation");
    
    const result2 = rule.condition(createContext("ls"));
    assert(result2 === null);
  });

  await t.step("blockCommandPattern should block commands matching regex", () => {
    const rule = blockCommandPattern(/^(rm|del).*/, "Deletion commands blocked");
    
    const result1 = rule.condition(createContext("rm"));
    assert(result1?.action === "block");
    
    const result2 = rule.condition(createContext("delete"));
    assert(result2?.action === "block");
    
    const result3 = rule.condition(createContext("ls"));
    assert(result3 === null);
  });

  await t.step("confirmCommandPattern should confirm commands matching regex", () => {
    const rule = confirmCommandPattern(/^(curl|wget|nc)$/, "Network commands");
    
    const result1 = rule.condition(createContext("curl"));
    assert(result1?.action === "confirm");
    
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

  await t.step("approveCommandPattern should approve commands matching regex", () => {
    const rule = approveCommandPattern(/^(ls|cat|head|tail)$/, "Safe read commands");
    
    const result1 = rule.condition(createContext("ls"));
    assert(result1?.action === "approve");
    
    const result2 = rule.condition(createContext("rm"));
    assert(result2 === null);
  });

  await t.step("rules should have correct names", () => {
    assert(blockCommand("rm").name === "block_rm");
    assert(confirmCommand("curl").name === "confirm_curl");
    assert(approveCommand("ls").name === "approve_ls");
    assert(blockCommands(["sudo", "su"]).name === "block_commands_sudo_su");
    assert(approveCommands(["ls", "cat"]).name === "approve_commands_ls_cat");
    assert(blockCommandWithFlags("rm", ["-rf"]).name === "block_rm_with_flags");
    assert(blockOutsideCurrentDirectory().name === "block_outside_current_directory");
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

  await t.step("createPatternRule with complex patterns", () => {
    // Test case sensitivity
    const caseSensitive = createPatternRule("block", /^Test$/, "Case sensitive");
    assert(caseSensitive.condition(createContext("Test"))?.action === "block");
    assert(caseSensitive.condition(createContext("test")) === null);
    
    // Test case insensitive
    const caseInsensitive = createPatternRule("confirm", /^test$/i, "Case insensitive");
    assert(caseInsensitive.condition(createContext("Test"))?.action === "confirm");
    assert(caseInsensitive.condition(createContext("test"))?.action === "confirm");
    
    // Complex patterns
    const complex = createPatternRule("approve", /^(get|fetch|download).*$/);
    assert(complex.condition(createContext("get-data"))?.action === "approve");
    assert(complex.condition(createContext("fetch-url"))?.action === "approve");
    assert(complex.condition(createContext("upload-file")) === null);
  });

  await t.step("blockCommandWithFlags edge cases", () => {
    const rule = blockCommandWithFlags("test", ["-x", "--dangerous"], "Custom reason");
    
    // Multiple dangerous flags
    const result1 = rule.condition(createContext("test", ["-x", "--dangerous", "file"]));
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
    const result1 = rule.condition(createContext("cp", ["file1.txt", "file2.txt"], testCwd));
    assert(result1 === null);
    
    // Dangerous paths
    const result2 = rule.condition(createContext("cp", ["file.txt", "/tmp/out.txt"], testCwd));
    assert(result2?.action === "block");
    assert(result2?.reason === "Security policy");
    
    // Mixed safe and dangerous
    const result3 = rule.condition(createContext("cp", ["src/file.txt", "../backup/"], testCwd));
    assert(result3?.action === "block");
    
    // No args (should not trigger)
    const result4 = rule.condition(createContext("pwd", [], testCwd));
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
      "Complex installation command"
    );
    
    const result1 = complexRule.condition(createContext("npm-install", ["package1", "package2", "package3"]));
    assert(result1?.action === "confirm");
    assert(result1?.reason === "Complex installation command");
    
    const result2 = complexRule.condition(createContext("install", ["pkg"])); // Too short command
    assert(result2 === null);
    
    const result3 = complexRule.condition(createContext("download", ["a", "b", "c"])); // No "install"
    assert(result3 === null);
  });

  await t.step("Rule name generation", () => {
    // Single command
    assert(createCommandRule("block", "test").name === "block_test");
    assert(createCommandRule("approve", "ls").name === "approve_ls");
    
    // Multiple commands
    assert(createCommandRule("confirm", ["a", "b"]).name === "confirm_commands_a_b");
    assert(createCommandRule("block", ["x", "y", "z"]).name === "block_commands_x_y_z");
    
    // Pattern rules
    assert(createPatternRule("block", /test/).name === "block_pattern_test");
    assert(createPatternRule("approve", /^get.*/).name === "approve_pattern_^get.*");
    
    // Command with flags
    assert(blockCommandWithFlags("rm", ["-rf"]).name === "block_rm_with_flags");
    
    // Custom rule
    assert(createRule("my_custom", "skip", () => true).name === "my_custom");
  });

  await t.step("Error handling and edge cases", () => {
    // Empty command list (should still work)
    const emptyRule = createCommandRule("block", []);
    const result1 = emptyRule.condition(createContext("any"));
    assert(result1 === null); // Empty list matches nothing
    
    // Empty pattern (matches empty string)
    const emptyPattern = createPatternRule("approve", /^$/);
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
        cwd: "/path"
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

Deno.test("Eta template support", async (t) => {
  await t.step("createCommandRule with eta templates", () => {
    const rule = createCommandRule(
      "block",
      "test",
      "Command '<%= it.command %>' blocked in session <%= it.sessionId %>"
    );
    
    const result = rule.condition(createContext("test"));
    assert(result?.action === "block");
    assert(result?.reason === "Command 'test' blocked in session test-session");
  });

  await t.step("createPatternRule with eta templates", () => {
    const rule = createPatternRule(
      "confirm",
      /^install/,
      "Install command '<%= it.command %>' matches pattern <%= it.pattern %>"
    );
    
    const result = rule.condition(createContext("install-package"));
    assert(result?.action === "confirm");
    assert(result?.reason === "Install command 'install-package' matches pattern ^install");
  });

  await t.step("blockCommandWithFlags with eta templates", () => {
    const rule = blockCommandWithFlags(
      "rm",
      ["-rf", "--force"],
      "Dangerous rm command with <%= it.flagCount %> dangerous flags: <%= it.dangerousFlags.join(', ') %>"
    );
    
    const result = rule.condition(createContext("rm", ["-rf", "file.txt"]));
    assert(result?.action === "block");
    assert(result?.reason === "Dangerous rm command with 1 dangerous flags: -rf");
  });

  await t.step("blockOutsideCurrentDirectory with eta templates", () => {
    const rule = blockOutsideCurrentDirectory(
      "Blocked <%= it.command %> with <%= it.argCount %> arguments in <%= it.cwd %>"
    );
    
    const result = rule.condition(createContext("cp", ["../file.txt", "dest.txt"], "/home/user"));
    assert(result?.action === "block");
    assert(result?.reason === "Blocked cp with 2 arguments in /home/user");
  });

  await t.step("createRule with eta templates", () => {
    const rule = createRule(
      "test_rule",
      "approve",
      (ctx) => ctx.toolInput.command.startsWith("safe"),
      "Custom rule '<%= it.ruleName %>' approved command '<%= it.command %>'"
    );
    
    const result = rule.condition(createContext("safe-command"));
    assert(result?.action === "approve");
    assert(result?.reason === "Custom rule 'test_rule' approved command 'safe-command'");
  });

  await t.step("Template with complex data", () => {
    const rule = createCommandRule(
      "confirm",
      "complex",
      "Command: <%= it.command %>, Args: <%= (it.args || []).length %>, CWD: <%= it.cwd || 'unknown' %>"
    );
    
    const result = rule.condition(createContext("complex", ["arg1", "arg2"], "/workspace"));
    assert(result?.action === "confirm");
    assert(result?.reason === "Command: complex, Args: 2, CWD: /workspace");
  });

  await t.step("Template error handling - invalid template", () => {
    const rule = createCommandRule(
      "block",
      "test",
      "Invalid template: <%= it.nonexistent.field.access %>"
    );
    
    const result = rule.condition(createContext("test"));
    assert(result?.action === "block");
    // Should fallback to the template string itself on error
    assert(result?.reason === "Invalid template: <%= it.nonexistent.field.access %>");
  });

  await t.step("Template with no reason should use default", () => {
    const rule = createCommandRule("confirm", "test");
    
    const result = rule.condition(createContext("test"));
    assert(result?.action === "confirm");
    assert(result?.reason === "test command requires confirmation");
  });
});