import { assertEquals } from "@std/assert";
import { evaluateRules } from "./engine.ts";
import type { Rule, RuleContext } from "./types.ts";

const createContext = (command: string, args: string[] = []): RuleContext => ({
  toolInput: {
    command,
    args,
    cwd: "/home/user/project",
  },
  sessionId: "test-session",
  transcriptPath: "/tmp/transcript.jsonl",
  timestamp: new Date("2024-01-01T00:00:00Z"),
});

Deno.test("evaluateRules", async (t) => {
  await t.step("ルールにマッチしない場合はskip", () => {
    const rules: Rule[] = [
      {
        name: "block_test",
        condition: () => null,
      },
    ];

    const result = evaluateRules(rules, createContext("ls"));
    assertEquals(result, { action: "skip" });
  });

  await t.step("blockルールが最優先", () => {
    const rules: Rule[] = [
      {
        name: "approve_test",
        condition: () => ({ action: "approve", reason: "approved" }),
      },
      {
        name: "block_test",
        condition: () => ({ action: "block", reason: "blocked" }),
      },
      {
        name: "confirm_test",
        condition: () => ({ action: "confirm", reason: "confirm" }),
      },
    ];

    const result = evaluateRules(rules, createContext("test"));
    assertEquals(result, { action: "block", reason: "blocked" });
  });

  await t.step("confirmがapproveより優先", () => {
    const rules: Rule[] = [
      {
        name: "approve_test",
        condition: () => ({ action: "approve", reason: "approved" }),
      },
      {
        name: "confirm_test",
        condition: () => ({ action: "confirm", reason: "confirm" }),
      },
    ];

    const result = evaluateRules(rules, createContext("test"));
    assertEquals(result, { action: "confirm", reason: "confirm" });
  });

  await t.step("approveが返される", () => {
    const rules: Rule[] = [
      {
        name: "approve_test",
        condition: () => ({ action: "approve", reason: "approved" }),
      },
    ];

    const result = evaluateRules(rules, createContext("test"));
    assertEquals(result, { action: "approve", reason: "approved" });
  });

  await t.step("skipは無視される", () => {
    const rules: Rule[] = [
      {
        name: "skip_test",
        condition: () => ({ action: "skip" }),
      },
      {
        name: "approve_test",
        condition: () => ({ action: "approve", reason: "approved" }),
      },
    ];

    const result = evaluateRules(rules, createContext("test"));
    assertEquals(result, { action: "approve", reason: "approved" });
  });

  await t.step("条件を正しく評価", () => {
    const rules: Rule[] = [
      {
        name: "block_rm",
        condition: (ctx) =>
          ctx.toolInput.command === "rm"
            ? { action: "block", reason: "rm not allowed" }
            : null,
      },
    ];

    // rmコマンドはブロック
    const rmResult = evaluateRules(rules, createContext("rm", ["-rf", "file"]));
    assertEquals(rmResult, { action: "block", reason: "rm not allowed" });

    // lsコマンドはskip
    const lsResult = evaluateRules(rules, createContext("ls"));
    assertEquals(lsResult, { action: "skip" });
  });
});
