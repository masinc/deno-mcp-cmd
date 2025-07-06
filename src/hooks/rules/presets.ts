import type { Rule } from "./types.ts";
import {
  blockCommand,
  blockOutsideCurrentDirectory,
  createCommandRule,
} from "./builders.ts";

export const SECURITY_RULES: Rule[] = [
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
];
