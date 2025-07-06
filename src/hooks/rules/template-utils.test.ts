import { assert } from "@std/assert";
import {
  createTemplateData,
  createWarningReason,
  getActionVerb,
  renderReason,
} from "./template-utils.ts";
import type { RuleContext } from "./types.ts";

const createContext = (
  command: string,
  args?: string[],
  cwd?: string,
  acknowledgeWarnings?: string[],
): RuleContext => ({
  toolInput: { command, args, cwd, acknowledgeWarnings },
  sessionId: "test-session",
  transcriptPath: "/test/transcript",
  timestamp: new Date(),
});

Deno.test("Template utilities", async (t) => {
  await t.step("getActionVerb should return correct verbs", () => {
    assert(getActionVerb("block") === "blocked");
    assert(getActionVerb("warning") === "warned");
    assert(getActionVerb("confirm") === "requires confirmation");
    assert(getActionVerb("approve") === "approved");
    assert(getActionVerb("skip") === "skipped");
  });

  await t.step("createWarningReason should format warning messages", () => {
    const result = createWarningReason("test-warning", "This is a test warning");
    assert(result.includes("This is a test warning"));
    assert(result.includes('acknowledgeWarnings: ["test-warning"]'));
  });

  await t.step("createTemplateData should create template data from context", () => {
    const ctx = createContext("test", ["arg1", "arg2"], "/home/user");
    const data = createTemplateData(ctx);

    assert(data.command === "test");
    assert(data.args?.length === 2);
    assert(data.args?.[0] === "arg1");
    assert(data.args?.[1] === "arg2");
    assert(data.cwd === "/home/user");
    assert(data.sessionId === "test-session");
    assert(data.argCount === 2);
  });

  await t.step("createTemplateData should auto-generate actionVerb", () => {
    const ctx = createContext("test");
    const data = createTemplateData(ctx, { action: "block" });

    assert(data.action === "block");
    assert(data.actionVerb === "blocked");
  });

  await t.step("createTemplateData should not override provided actionVerb", () => {
    const ctx = createContext("test");
    const data = createTemplateData(ctx, { 
      action: "block", 
      actionVerb: "custom-verb" 
    });

    assert(data.action === "block");
    assert(data.actionVerb === "custom-verb");
  });

  await t.step("renderReason should render eta templates", () => {
    const template = "Command '<%= it.command %>' in session <%= it.sessionId %>";
    const ctx = createContext("test");
    const data = createTemplateData(ctx, { action: "block" });

    const result = renderReason(template, data);
    assert(result === "Command 'test' in session test-session");
  });

  await t.step("renderReason should handle complex templates", () => {
    const template = "Command: <%= it.command %>, Args: <%= (it.args || []).length %>, CWD: <%= it.cwd || 'unknown' %>";
    const ctx = createContext("complex", ["arg1", "arg2"], "/workspace");
    const data = createTemplateData(ctx, { action: "confirm" });

    const result = renderReason(template, data);
    assert(result === "Command: complex, Args: 2, CWD: /workspace");
  });

  await t.step("renderReason should fallback on invalid templates", () => {
    const template = "Invalid template: <%= it.nonexistent.field.access %>";
    const ctx = createContext("test");
    const data = createTemplateData(ctx, { action: "block" });

    const result = renderReason(template, data);
    // Should fallback to the template string itself on error
    assert(result === "Invalid template: <%= it.nonexistent.field.access %>");
  });

  await t.step("renderReason should handle templates with additional data", () => {
    const template = "Custom rule '<%= it.ruleName %>' approved command '<%= it.command %>'";
    const ctx = createContext("safe-command");
    const data = createTemplateData(ctx, { 
      action: "approve",
      ruleName: "test_rule"
    });

    const result = renderReason(template, data);
    assert(result === "Custom rule 'test_rule' approved command 'safe-command'");
  });
});

Deno.test("Template integration with rule builders", async (t) => {
  await t.step("shell expansion with custom template for approve", () => {
    const ctx = createContext("$(ls)", [], undefined, ["warn-shell-expansion"]);
    const data = createTemplateData(ctx, { action: "approve" });
    const template = "Custom approval: <%= it.command %> acknowledged in session <%= it.sessionId %>";
    
    const result = renderReason(template, data);
    assert(result === "Custom approval: $(ls) acknowledged in session test-session");
  });

  await t.step("pattern-based rule with eta template", () => {
    const ctx = createContext("git", ["status"]);
    const data = createTemplateData(ctx, { action: "approve" });
    const template = "Git command '<%= it.args[0] %>' approved in session <%= it.sessionId %>";
    
    const result = renderReason(template, data);
    assert(result === "Git command 'status' approved in session test-session");
  });

  await t.step("blocked command with template data", () => {
    const ctx = createContext("cp", ["../file.txt", "dest.txt"], "/home/user");
    const data = createTemplateData(ctx, { action: "block" });
    const template = "Blocked <%= it.command %> with <%= it.argCount %> arguments in <%= it.cwd %>";
    
    const result = renderReason(template, data);
    assert(result === "Blocked cp with 2 arguments in /home/user");
  });

  await t.step("dangerous command with session info", () => {
    const ctx = createContext("rm", ["-rf", "file.txt"]);
    const data = createTemplateData(ctx, { action: "block" });
    const template = "Dangerous rm command '<%= it.command %>' blocked in session <%= it.sessionId %>";
    
    const result = renderReason(template, data);
    assert(result === "Dangerous rm command 'rm' blocked in session test-session");
  });
});