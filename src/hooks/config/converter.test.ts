import { assertEquals, assertThrows } from "@std/assert";
import { convertUserRuleToRule } from "./converter.ts";
import type { 
  BlockCommandRule, 
  ApproveCommandRule,
  ConfirmCommandRule,
  WarningRule, 
  ConditionalRule, 
  LocationRule 
} from "./schema.ts";
import type { RuleContext, RuleResult } from "../rules/types.ts";
import { RuleResultSchema } from "../rules/types.ts";
import { UserRuleSchema } from "./schema.ts";

// Helper function to assert rule result action
function assertRuleAction(result: RuleResult | null, expectedAction: string) {
  if (result !== null) {
    const parsedResult = RuleResultSchema.parse(result);
    assertEquals(parsedResult.action, expectedAction);
  } else {
    throw new Error(`Expected RuleResult with action "${expectedAction}" but got null`);
  }
}

// Helper function to create mock rule context
function createMockContext(
  command: string,
  args: string[] = [],
  cwd?: string
): RuleContext {
  return {
    toolInput: {
      command,
      args,
      cwd,
    },
  } as RuleContext;
}

Deno.test("convertUserRuleToRule - BlockCommandRule", async (t) => {
  await t.step("converts simple command block rule", () => {
    const userRule: BlockCommandRule = {
      name: "block-sudo",
      kind: "BlockCommandRule",
      enabled: true,
      spec: {
        command: "sudo",
        reason: "Sudo access not allowed"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    assertEquals(rule.name, "block-sudo");

    // Test that it blocks sudo command
    const ctx = createMockContext("sudo", ["ls"]);
    const result = rule.condition(ctx);
    assertRuleAction(result, "block");
  });

  await t.step("converts command pattern with oneOf", () => {
    const userRule: BlockCommandRule = {
      name: "block-dangerous",
      kind: "BlockCommandRule",
      enabled: true,
      spec: {
        command: { oneOf: ["rm", "mv", "chmod"] },
        reason: "Dangerous commands blocked"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    
    // Test that it blocks rm command
    const ctx1 = createMockContext("rm", ["-rf", "/"]);
    const result1 = rule.condition(ctx1);
    assertRuleAction(result1, "block");

    // Test that it doesn't block safe command
    const ctx2 = createMockContext("ls", []);
    assertEquals(rule.condition(ctx2), null);
  });

  await t.step("converts args pattern", () => {
    const userRule: BlockCommandRule = {
      name: "block-force",
      kind: "BlockCommandRule", 
      enabled: true,
      spec: {
        command: "rm",
        args: { containsAny: ["--force", "-f"] },
        reason: "Force deletion blocked"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    
    // Test that it blocks rm with force flag
    const ctx1 = createMockContext("rm", ["--force", "file.txt"]);
    assertEquals(rule.condition(ctx1)?.action, "block");

    // Test that it doesn't block rm without force flag
    const ctx2 = createMockContext("rm", ["file.txt"]);
    assertEquals(rule.condition(ctx2), null);
  });

  await t.step("converts args pattern with containsAll", () => {
    const userRule: BlockCommandRule = {
      name: "block-dangerous-combo",
      kind: "BlockCommandRule", 
      enabled: true,
      spec: {
        command: "rm",
        args: { containsAll: ["--force", "--recursive"] },
        reason: "Dangerous combination blocked"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    
    // Test that it blocks rm with both flags
    const ctx1 = createMockContext("rm", ["--force", "--recursive", "dir"]);
    assertEquals(rule.condition(ctx1)?.action, "block");

    // Test that it doesn't block rm with only one flag
    const ctx2 = createMockContext("rm", ["--force", "file.txt"]);
    assertEquals(rule.condition(ctx2), null);
    
    // Test that it doesn't block rm with only the other flag
    const ctx3 = createMockContext("rm", ["--recursive", "dir"]);
    assertEquals(rule.condition(ctx3), null);
  });

  await t.step("converts args pattern with containsNone", () => {
    const userRule: ApproveCommandRule = {
      name: "approve-git-safe-branch",
      kind: "ApproveCommandRule", 
      enabled: true,
      spec: {
        command: "git",
        args: { 
          startsWith: ["branch"],
          containsNone: ["-d", "--delete", "-m", "--move"]
        },
        reason: "Safe git branch operations allowed"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    
    // Test that it approves safe git branch operations
    const ctx1 = createMockContext("git", ["branch"]);
    assertEquals(rule.condition(ctx1)?.action, "approve");
    
    const ctx2 = createMockContext("git", ["branch", "--list"]);
    assertEquals(rule.condition(ctx2)?.action, "approve");
    
    const ctx3 = createMockContext("git", ["branch", "-v"]);
    assertEquals(rule.condition(ctx3)?.action, "approve");

    // Test that it doesn't approve destructive operations
    const ctx4 = createMockContext("git", ["branch", "-d", "feature-branch"]);
    assertEquals(rule.condition(ctx4), null);
    
    const ctx5 = createMockContext("git", ["branch", "--delete", "feature-branch"]);
    assertEquals(rule.condition(ctx5), null);
    
    const ctx6 = createMockContext("git", ["branch", "-m", "old-name", "new-name"]);
    assertEquals(rule.condition(ctx6), null);
  });

  await t.step("converts args pattern with startsWith", () => {
    const userRule: BlockCommandRule = {
      name: "approve-git-log",
      kind: "BlockCommandRule", 
      enabled: true,
      spec: {
        command: "git",
        args: { startsWith: ["log"] },
        reason: "Only git log commands with additional args blocked"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    
    // Test that it blocks git log --oneline (starts with ["log"])
    const ctx1 = createMockContext("git", ["log", "--oneline"]);
    assertEquals(rule.condition(ctx1)?.action, "block");
    
    // Test that it blocks git log (exact match)
    const ctx2 = createMockContext("git", ["log"]);
    assertEquals(rule.condition(ctx2)?.action, "block");

    // Test that it blocks git log --pretty=format:%H (starts with ["log"])
    const ctx3 = createMockContext("git", ["log", "--pretty=format:%H"]);
    assertEquals(rule.condition(ctx3)?.action, "block");
    
    // Test that it doesn't block git push (different prefix)
    const ctx4 = createMockContext("git", ["push"]);
    assertEquals(rule.condition(ctx4), null);
    
    // Test that it doesn't block git status (different prefix)
    const ctx5 = createMockContext("git", ["status"]);
    assertEquals(rule.condition(ctx5), null);
  });

  await t.step("converts args pattern with regexAll", () => {
    const userRule: BlockCommandRule = {
      name: "block-user-group-combo",
      kind: "BlockCommandRule", 
      enabled: true,
      spec: {
        command: "useradd",
        args: { regexAll: ["--uid=\\d+", "--gid=\\d+"] },
        reason: "Both UID and GID specification required"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    
    // Test that it blocks when both regex patterns match
    const ctx1 = createMockContext("useradd", ["--uid=1000", "--gid=1000", "testuser"]);
    assertEquals(rule.condition(ctx1)?.action, "block");

    // Test that it doesn't block when only one pattern matches
    const ctx2 = createMockContext("useradd", ["--uid=1000", "testuser"]);
    assertEquals(rule.condition(ctx2), null);
    
    // Test that it doesn't block when the other pattern matches
    const ctx3 = createMockContext("useradd", ["--gid=1000", "testuser"]);
    assertEquals(rule.condition(ctx3), null);
  });

  await t.step("converts cwd pattern", () => {
    const userRule: BlockCommandRule = {
      name: "block-system-paths",
      kind: "BlockCommandRule",
      enabled: true,
      spec: {
        command: "rm",
        cwd: { startsWith: "/usr" },
        reason: "System path modifications blocked"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    
    // Test that it blocks in system path
    const ctx1 = createMockContext("rm", ["file"], "/usr/bin");
    assertEquals(rule.condition(ctx1)?.action, "block");

    // Test that it doesn't block in user path
    const ctx2 = createMockContext("rm", ["file"], "/home/user");
    assertEquals(rule.condition(ctx2), null);
  });

  await t.step("handles disabled rule", () => {
    const userRule: BlockCommandRule = {
      name: "disabled-rule",
      kind: "BlockCommandRule",
      enabled: false,
      spec: {
        command: "sudo"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    assertEquals(rule.name, "disabled-rule-disabled");

    // Test that disabled rule never triggers
    const ctx = createMockContext("sudo", ["ls"]);
    assertEquals(rule.condition(ctx), null);
  });
});

Deno.test("convertUserRuleToRule - ApproveCommandRule", async (t) => {
  await t.step("converts simple command approve rule", () => {
    const userRule: ApproveCommandRule = {
      name: "approve-ls",
      kind: "ApproveCommandRule",
      enabled: true,
      spec: {
        command: "ls",
        reason: "Safe directory listing command"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    assertEquals(rule.name, "approve-ls");

    // Test that it approves ls command
    const ctx = createMockContext("ls", ["-la"]);
    const result = rule.condition(ctx);
    assertRuleAction(result, "approve");
  });

  await t.step("converts command pattern with oneOf", () => {
    const userRule: ApproveCommandRule = {
      name: "approve-safe-commands",
      kind: "ApproveCommandRule",
      enabled: true,
      spec: {
        command: { oneOf: ["ls", "pwd", "whoami"] },
        reason: "Safe read-only commands"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    
    // Test that it approves ls command
    const ctx1 = createMockContext("ls", []);
    const result1 = rule.condition(ctx1);
    assertRuleAction(result1, "approve");

    // Test that it approves pwd command
    const ctx2 = createMockContext("pwd", []);
    const result2 = rule.condition(ctx2);
    assertRuleAction(result2, "approve");

    // Test that it doesn't approve dangerous command
    const ctx3 = createMockContext("rm", ["-rf", "/"]);
    assertEquals(rule.condition(ctx3), null);
  });

  await t.step("converts with cwd pattern", () => {
    const userRule: ApproveCommandRule = {
      name: "approve-dev-tools",
      kind: "ApproveCommandRule",
      enabled: true,
      spec: {
        command: { oneOf: ["npm", "yarn", "node"] },
        cwd: { contains: "projects" },
        reason: "Development tools in projects directory"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    
    // Test that it approves npm in projects directory
    const ctx1 = createMockContext("npm", ["install"], "/home/user/projects/myapp");
    const result1 = rule.condition(ctx1);
    assertRuleAction(result1, "approve");

    // Test that it doesn't approve npm outside projects directory
    const ctx2 = createMockContext("npm", ["install"], "/home/user/documents");
    assertEquals(rule.condition(ctx2), null);
  });

  await t.step("handles disabled rule", () => {
    const userRule: ApproveCommandRule = {
      name: "disabled-approve-rule",
      kind: "ApproveCommandRule",
      enabled: false,
      spec: {
        command: "ls"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    assertEquals(rule.name, "disabled-approve-rule-disabled");

    // Test that disabled rule never triggers
    const ctx = createMockContext("ls", []);
    assertEquals(rule.condition(ctx), null);
  });
});

Deno.test("convertUserRuleToRule - ConfirmCommandRule", async (t) => {
  await t.step("converts simple confirm rule", () => {
    const userRule: ConfirmCommandRule = {
      name: "confirm-prod-deploy",
      kind: "ConfirmCommandRule",
      enabled: true,
      spec: {
        args: { regexAny: "prod|production" },
        reason: "Production deployment requires confirmation",
        message: "Deploy to production environment?"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    assertEquals(rule.name, "confirm-prod-deploy");

    // Test that it requires confirmation for production deployment
    const ctx = createMockContext("kubectl", ["apply", "-f", "prod-config.yaml"]);
    const result = rule.condition(ctx);
    assertRuleAction(result, "confirm");
  });

  await t.step("converts kubectl apply confirm rule", () => {
    const userRule: ConfirmCommandRule = {
      name: "confirm-kubectl-apply",
      kind: "ConfirmCommandRule",
      enabled: true,
      spec: {
        command: "kubectl",
        args: { startsWith: ["apply"] },
        reason: "Kubernetes changes require confirmation"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    
    // Test that it requires confirmation for kubectl apply
    const ctx1 = createMockContext("kubectl", ["apply", "-f", "config.yaml"]);
    const result1 = rule.condition(ctx1);
    assertRuleAction(result1, "confirm");

    // Test that it doesn't trigger for kubectl get
    const ctx2 = createMockContext("kubectl", ["get", "pods"]);
    assertEquals(rule.condition(ctx2), null);
  });

  await t.step("converts system changes confirm rule", () => {
    const userRule: ConfirmCommandRule = {
      name: "confirm-system-changes",
      kind: "ConfirmCommandRule",
      enabled: true,
      spec: {
        cwd: { startsWith: "/etc" },
        reason: "System configuration changes need approval",
        message: "Modify system configuration files?"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    
    // Test that it requires confirmation in /etc directory
    const ctx1 = createMockContext("nano", ["hosts"], "/etc");
    const result1 = rule.condition(ctx1);
    assertRuleAction(result1, "confirm");

    // Test that it doesn't trigger in /home directory
    const ctx2 = createMockContext("nano", ["config"], "/home/user");
    assertEquals(rule.condition(ctx2), null);
  });

  await t.step("converts force operations confirm rule", () => {
    const userRule: ConfirmCommandRule = {
      name: "confirm-force-operations",
      kind: "ConfirmCommandRule",
      enabled: true,
      spec: {
        args: { containsAll: ["--force", "--yes"] },
        reason: "Multiple force flags detected",
        message: "Execute potentially dangerous operation?"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    
    // Test that it requires confirmation for operations with both force flags
    const ctx1 = createMockContext("rm", ["--force", "--yes", "--recursive", "dir"]);
    const result1 = rule.condition(ctx1);
    assertRuleAction(result1, "confirm");

    // Test that it doesn't trigger with only one force flag
    const ctx2 = createMockContext("rm", ["--force", "file.txt"]);
    assertEquals(rule.condition(ctx2), null);
  });

  await t.step("handles disabled confirm rule", () => {
    const userRule: ConfirmCommandRule = {
      name: "disabled-confirm-rule",
      kind: "ConfirmCommandRule",
      enabled: false,
      spec: {
        command: "kubectl",
        reason: "Disabled rule"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    assertEquals(rule.name, "disabled-confirm-rule-disabled");

    // Test that disabled rule never triggers
    const ctx = createMockContext("kubectl", ["apply"]);
    assertEquals(rule.condition(ctx), null);
  });

  await t.step("uses correct message priority", () => {
    const userRule: ConfirmCommandRule = {
      name: "test-message-priority",
      kind: "ConfirmCommandRule",
      enabled: true,
      spec: {
        command: "test",
        reason: "Test reason",
        message: "Test message"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    
    // Test that the rule is created successfully (message priority is handled in createRule)
    const ctx = createMockContext("test", []);
    const result = rule.condition(ctx);
    assertRuleAction(result, "confirm");
  });
});

Deno.test("convertUserRuleToRule - WarningRule", async (t) => {
  await t.step("converts simple warning rule", () => {
    const userRule: WarningRule = {
      name: "warn-docker",
      kind: "WarningRule",
      enabled: true,
      spec: {
        patterns: {
          command: "docker",
          args: { containsAny: ["--privileged"] }
        },
        warningReason: "Privileged container detected",
        acknowledgedAction: "skip",
        acknowledgedReason: "Acknowledged"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    assertEquals(rule.name, "warn-docker");

    // Test that it warns for privileged docker
    const ctx1 = createMockContext("docker", ["run", "--privileged", "image"]);
    const result1 = rule.condition(ctx1);
    assertRuleAction(result1, "warning");

    // Test that it doesn't warn for normal docker
    const ctx2 = createMockContext("docker", ["run", "image"]);
    assertEquals(rule.condition(ctx2), null);
  });

  await t.step("handles acknowledgedAction correctly", () => {
    const userRule: WarningRule = {
      name: "warn-docker-privileged",
      kind: "WarningRule",
      enabled: true,
      spec: {
        patterns: {
          command: "docker",
          args: { containsAny: ["--privileged"] }
        },
        warningReason: "Privileged container detected",
        acknowledgedAction: "approve",
        acknowledgedReason: "User approved privileged container"
      }
    };

    const rule = convertUserRuleToRule(userRule);

    // Test that it warns for privileged docker without acknowledgment
    const ctx1 = createMockContext("docker", ["run", "--privileged", "image"]);
    const result1 = rule.condition(ctx1);
    assertRuleAction(result1, "warning");

    // Test that it approves when warning is acknowledged
    const ctx2: RuleContext = {
      toolInput: {
        command: "docker",
        args: ["run", "--privileged", "image"],
        acknowledgeWarnings: ["warn-docker-privileged"]
      },
    } as RuleContext;
    const result2 = rule.condition(ctx2);
    assertRuleAction(result2, "approve");
  });

  await t.step("converts with multiple patterns", () => {
    const userRule: WarningRule = {
      name: "warn-network",
      kind: "WarningRule",
      enabled: true,
      spec: {
        patterns: {
          command: { regex: "^(curl|wget)$" },
          cwd: { contains: "sensitive" }
        },
        warningReason: "Network access in sensitive directory",
        acknowledgedAction: "confirm"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    
    // Test that it warns when both patterns match
    const ctx1 = createMockContext("curl", ["example.com"], "/sensitive/dir");
    const result1 = rule.condition(ctx1);
    assertEquals(typeof result1, "object");

    // Test that it doesn't warn when only one pattern matches
    const ctx2 = createMockContext("curl", ["example.com"], "/normal/dir");
    assertEquals(rule.condition(ctx2), null);
  });
});

Deno.test("convertUserRuleToRule - ConditionalRule", async (t) => {
  await t.step("converts conditional rule with warning action", () => {
    const userRule: ConditionalRule = {
      name: "confirm-prod",
      kind: "ConditionalRule",
      enabled: true,
      spec: {
        condition: "command === 'kubectl' && args.some(arg => arg.includes('prod'))",
        action: "warning",
        message: "Production deployment detected",
        reason: "Requires confirmation"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    assertEquals(rule.name, "confirm-prod");

    // Test that it triggers for production kubectl
    const ctx1 = createMockContext("kubectl", ["apply", "-f", "prod-config.yaml"]);
    const result1 = rule.condition(ctx1);
    assertEquals(typeof result1, "object");

    // Test that it doesn't trigger for non-production kubectl
    const ctx2 = createMockContext("kubectl", ["apply", "-f", "dev-config.yaml"]);
    assertEquals(rule.condition(ctx2), null);
  });

  await t.step("converts conditional rule with block action", () => {
    const userRule: ConditionalRule = {
      name: "block-dangerous",
      kind: "ConditionalRule",
      enabled: true,
      spec: {
        condition: "args.includes('--force') && args.includes('--recursive')",
        action: "block",
        reason: "Dangerous combination blocked"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    
    // Test that it blocks dangerous combination
    const ctx1 = createMockContext("rm", ["--force", "--recursive", "dir"]);
    assertEquals(rule.condition(ctx1)?.action, "block");

    // Test that it doesn't block safe commands
    const ctx2 = createMockContext("rm", ["file.txt"]);
    assertEquals(rule.condition(ctx2), null);
  });

  await t.step("handles condition evaluation errors gracefully", () => {
    const userRule: ConditionalRule = {
      name: "invalid-condition",
      kind: "ConditionalRule",
      enabled: true,
      spec: {
        condition: "invalid.syntax.error()",
        action: "block"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    
    // Should not throw and should return null for invalid conditions
    const ctx = createMockContext("test", []);
    assertEquals(rule.condition(ctx), null);
  });
});

Deno.test("convertUserRuleToRule - LocationRule", async (t) => {
  await t.step("converts path rule with startsWith condition", () => {
    const userRule: LocationRule = {
      name: "protect-usr",
      kind: "LocationRule",
      enabled: true,
      spec: {
        paths: {
          startsWith: "/usr"
        },
        commands: ["rm", "mv", "chmod"],
        action: "block",
        reason: "System directory protection"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    assertEquals(rule.name, "protect-usr");

    // Test that it blocks rm in /usr
    const ctx1 = createMockContext("rm", ["file"], "/usr/bin");
    assertEquals(rule.condition(ctx1)?.action, "block");

    // Test that it doesn't block rm in /home
    const ctx2 = createMockContext("rm", ["file"], "/home/user");
    assertEquals(rule.condition(ctx2), null);

    // Test that it doesn't block non-specified commands in /usr
    const ctx3 = createMockContext("ls", ["file"], "/usr/bin");
    assertEquals(rule.condition(ctx3), null);
  });

  await t.step("converts path rule with outside condition", () => {
    const userRule: LocationRule = {
      name: "stay-in-home",
      kind: "LocationRule",
      enabled: true,
      spec: {
        paths: {
          outside: "/home"
        },
        action: "confirm",
        reason: "Working outside home directory"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    
    // Test that it triggers when outside /home
    const ctx1 = createMockContext("ls", [], "/tmp");
    const result1 = rule.condition(ctx1);
    assertRuleAction(result1, "confirm");

    // Test that it doesn't trigger inside /home
    const ctx2 = createMockContext("ls", [], "/home/user");
    assertEquals(rule.condition(ctx2), null);
  });

  await t.step("converts path rule with contains condition", () => {
    const userRule: LocationRule = {
      name: "warn-node-modules",
      kind: "LocationRule",
      enabled: true,
      spec: {
        paths: {
          contains: "node_modules"
        },
        action: "confirm",
        reason: "Working in node_modules directory"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    
    // Test that it confirms in node_modules
    const ctx1 = createMockContext("rm", ["file"], "/project/node_modules/package");
    const result1 = rule.condition(ctx1);
    assertRuleAction(result1, "confirm");

    // Test that it doesn't trigger outside node_modules
    const ctx2 = createMockContext("rm", ["file"], "/project/src");
    assertEquals(rule.condition(ctx2), null);
  });

  await t.step("handles missing cwd gracefully", () => {
    const userRule: LocationRule = {
      name: "test-rule",
      kind: "LocationRule",
      enabled: true,
      spec: {
        paths: {
          startsWith: "/usr"
        },
        action: "block"
      }
    };

    const rule = convertUserRuleToRule(userRule);
    
    // Test with undefined cwd
    const ctx = createMockContext("rm", ["file"], undefined);
    assertEquals(rule.condition(ctx), null);
  });
});

Deno.test("convertUserRuleToRule - Error cases", async (t) => {
  await t.step("throws for unknown rule kind", () => {
    // Create an invalid rule object 
    const invalidRuleData = {
      name: "unknown-rule",
      kind: "UnknownKind",
      enabled: true,
      spec: {}
    };
    
    // Try to parse with Zod - this should fail at validation level
    const parseResult = UserRuleSchema.safeParse(invalidRuleData);
    assertEquals(parseResult.success, false);
    
    // If somehow it passes validation (which it shouldn't), test the converter
    if (parseResult.success) {
      assertThrows(
        () => convertUserRuleToRule(parseResult.data),
        Error,
        "Unknown rule kind"
      );
    }
  });
});