import type { Rule } from "./types.ts";
import {
  findDangerousPathsInArgs,
  isAllPathsWithinCurrentDirectory,
} from "./path-utils.ts";

export const SECURITY_RULES: Rule[] = [
  {
    name: "block_dangerous_rm",
    condition: (ctx) => {
      if (ctx.toolInput.command === "rm") {
        const dangerousFlags = ["-rf", "-r", "--recursive", "--force"];
        const hasDangerous = ctx.toolInput.args?.some((arg) =>
          dangerousFlags.includes(arg)
        );

        if (hasDangerous) {
          return {
            action: "block",
            reason: `Dangerous rm command with flags: ${
              ctx.toolInput.args?.filter((arg) => dangerousFlags.includes(arg))
                .join(", ")
            }`,
          };
        }
      }
      return null;
    },
  },

  {
    name: "block_cd_command",
    condition: (ctx) =>
      ctx.toolInput.command === "cd"
        ? { action: "block", reason: "Directory navigation via cd not allowed" }
        : null,
  },

  {
    name: "confirm_network_commands",
    condition: (ctx) =>
      ["curl", "wget", "nc", "netcat"].includes(ctx.toolInput.command)
        ? { action: "confirm", reason: "Network command requires confirmation" }
        : null,
  },

  {
    name: "block_privilege_escalation",
    condition: (ctx) =>
      ["sudo", "su", "doas"].includes(ctx.toolInput.command)
        ? {
          action: "block",
          reason: "Privilege escalation commands not allowed",
        }
        : null,
  },

  {
    name: "block_outside_current_directory",
    condition: (ctx) => {
      const args = ctx.toolInput.args || [];
      if (args.length === 0) return null;

      if (!isAllPathsWithinCurrentDirectory(args, ctx.toolInput.cwd)) {
        return {
          action: "block",
          reason: "Operations outside current directory not allowed",
        };
      }
      return null;
    },
  },

  {
    name: "block_dangerous_paths",
    condition: (ctx) => {
      const args = ctx.toolInput.args || [];
      const dangerousPaths = findDangerousPathsInArgs(args);

      if (dangerousPaths.length > 0) {
        return {
          action: "block",
          reason: `Dangerous system paths not allowed: ${
            dangerousPaths.join(", ")
          }`,
        };
      }
      return null;
    },
  },
];
