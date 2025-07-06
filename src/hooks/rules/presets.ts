import type { Rule } from "./types.ts";
import {
  blockCommand,
  blockOutsideCurrentDirectory,
  createCommandRule,
  createPatternBasedRule,
  createWarningRule,
} from "./builders.ts";

export const SECURITY_RULES: Rule[] = [
  // Approve safe git commands first (higher priority)
  createPatternBasedRule({
    name: "approve-safe-git-commands",
    cmd: "git",
    args: [[
      "status",
      "log",
      "show",
      "diff",
      "help",
      "version",
      "describe",
      "shortlog",
      "blame",
      "grep",
      "ls-files",
      "rev-parse",
    ], "**"],
    action: "approve",
    reason:
      "Safe git command '<%= it.args[0] %>' approved for read-only operations",
  }),

  // Block directory navigation
  blockCommand("cd", "Directory navigation via cd not allowed"),

  // Block shell commands with eta template
  createCommandRule(
    "block",
    ["bash", "sh", "zsh", "fish", "csh", "tcsh", "ksh"],
    "Shell command '<%= it.command %>' is not allowed for security reasons",
  ),

  // Confirm network commands (using unified API)
  createCommandRule(
    "confirm",
    ["curl", "wget", "nc", "netcat"],
    "Network command '<%= it.command %>'",
  ),

  // Block privilege escalation (using unified API)
  createCommandRule(
    "block",
    ["sudo", "su", "doas"],
    "Privilege escalation command '<%= it.command %>' not allowed",
  ),

  // Path-based security rules with template
  blockOutsideCurrentDirectory(
    "Command '<%= it.command %>' with <%= it.argCount %> args blocked - operations outside current directory not allowed",
  ),

  // Warn about shell expansion attempts
  createWarningRule(
    "warn-shell-expansion",
    (ctx) => {
      const shellPatterns = ["$(", "`"];
      const allInputs = [ctx.toolInput.command, ...(ctx.toolInput.args ?? [])];
      return allInputs.some((input) =>
        shellPatterns.some((pattern) => input.includes(pattern))
      );
    },
    "Shell expansion syntax detected in command. In this MCP environment, $(command) and `command` are treated as literal text, not executed. Use a plain string instead.",
    "Shell expansion syntax detected in command '<%= it.command %>'. In this MCP environment, $(command) and `command` are treated as literal text, not executed. Use a plain string instead.\n\nTo proceed anyway, add acknowledgeWarnings: [\"warn-shell-expansion\"] to your request.",
  ),
];
