import { assertEquals } from "@std/assert";
import {
  UserRulesConfigSchema,
  BlockCommandRuleSchema,
  ApproveCommandRuleSchema,
  ConfirmCommandRuleSchema,
  WarningRuleSchema,
  ConditionalRuleSchema,
  LocationRuleSchema,
  CommandPatternSchema,
  ArgsPatternSchema,
  PathPatternSchema,
} from "./schema.ts";

Deno.test("CommandPatternSchema validation", async (t) => {
  await t.step("accepts string pattern", () => {
    const result = CommandPatternSchema.safeParse("docker");
    assertEquals(result.success, true);
    if (result.success) {
      assertEquals(result.data, "docker");
    }
  });

  await t.step("accepts exact pattern", () => {
    const result = CommandPatternSchema.safeParse({ exact: "docker" });
    assertEquals(result.success, true);
  });

  await t.step("accepts oneOf pattern", () => {
    const result = CommandPatternSchema.safeParse({ oneOf: ["docker", "podman"] });
    assertEquals(result.success, true);
  });

  await t.step("accepts regex pattern", () => {
    const result = CommandPatternSchema.safeParse({ regex: "^docker.*" });
    assertEquals(result.success, true);
  });

  await t.step("accepts startsWith pattern", () => {
    const result = CommandPatternSchema.safeParse({ startsWith: "docker" });
    assertEquals(result.success, true);
  });

  await t.step("accepts endsWith pattern", () => {
    const result = CommandPatternSchema.safeParse({ endsWith: "run" });
    assertEquals(result.success, true);
  });

  await t.step("rejects multiple pattern types", () => {
    const result = CommandPatternSchema.safeParse({ 
      exact: "docker", 
      regex: "^docker.*" 
    });
    assertEquals(result.success, false);
  });

  await t.step("rejects empty object", () => {
    const result = CommandPatternSchema.safeParse({});
    assertEquals(result.success, false);
  });
});

Deno.test("ArgsPatternSchema validation", async (t) => {
  await t.step("accepts containsAny pattern", () => {
    const result = ArgsPatternSchema.safeParse({ containsAny: ["--privileged"] });
    assertEquals(result.success, true);
  });

  await t.step("accepts containsAll pattern", () => {
    const result = ArgsPatternSchema.safeParse({ containsAll: ["--force", "--recursive"] });
    assertEquals(result.success, true);
  });

  await t.step("accepts containsNone pattern", () => {
    const result = ArgsPatternSchema.safeParse({ containsNone: ["-d", "--delete"] });
    assertEquals(result.success, true);
  });

  await t.step("accepts exact pattern", () => {
    const result = ArgsPatternSchema.safeParse({ exact: ["run", "--rm"] });
    assertEquals(result.success, true);
  });

  await t.step("accepts regexAny pattern", () => {
    const result = ArgsPatternSchema.safeParse({ regexAny: "--port=\\d+" });
    assertEquals(result.success, true);
  });

  await t.step("accepts regexAll pattern", () => {
    const result = ArgsPatternSchema.safeParse({ regexAll: ["--user=.*", "--group=.*"] });
    assertEquals(result.success, true);
  });

  await t.step("accepts startsWith pattern", () => {
    const result = ArgsPatternSchema.safeParse({ startsWith: ["--oneline"] });
    assertEquals(result.success, true);
  });

  await t.step("accepts length constraints", () => {
    const result = ArgsPatternSchema.safeParse({ 
      minLength: 1, 
      maxLength: 5 
    });
    assertEquals(result.success, true);
  });

  await t.step("accepts combined patterns", () => {
    const result = ArgsPatternSchema.safeParse({ 
      containsAny: ["--privileged"],
      minLength: 2
    });
    assertEquals(result.success, true);
  });

  await t.step("accepts empty object", () => {
    const result = ArgsPatternSchema.safeParse({});
    assertEquals(result.success, true);
  });
});

Deno.test("PathPatternSchema validation", async (t) => {
  await t.step("accepts startsWith pattern", () => {
    const result = PathPatternSchema.safeParse({ startsWith: "/usr" });
    assertEquals(result.success, true);
  });

  await t.step("accepts contains pattern", () => {
    const result = PathPatternSchema.safeParse({ contains: "node_modules" });
    assertEquals(result.success, true);
  });

  await t.step("accepts regex pattern", () => {
    const result = PathPatternSchema.safeParse({ regex: ".*\\.git.*" });
    assertEquals(result.success, true);
  });

  await t.step("accepts outside pattern", () => {
    const result = PathPatternSchema.safeParse({ outside: "/home" });
    assertEquals(result.success, true);
  });

  await t.step("accepts combined patterns", () => {
    const result = PathPatternSchema.safeParse({ 
      startsWith: "/usr",
      contains: "bin"
    });
    assertEquals(result.success, true);
  });

  await t.step("accepts empty object", () => {
    const result = PathPatternSchema.safeParse({});
    assertEquals(result.success, true);
  });
});

Deno.test("BlockCommandRuleSchema validation", async (t) => {
  await t.step("accepts valid block rule", () => {
    const rule = {
      name: "block-sudo",
      kind: "BlockCommandRule",
      enabled: true,
      spec: {
        command: "sudo",
        reason: "Sudo access not allowed"
      }
    };
    const result = BlockCommandRuleSchema.safeParse(rule);
    assertEquals(result.success, true);
  });

  await t.step("defaults enabled to true", () => {
    const rule = {
      name: "block-sudo",
      kind: "BlockCommandRule",
      spec: {
        command: "sudo"
      }
    };
    const result = BlockCommandRuleSchema.safeParse(rule);
    assertEquals(result.success, true);
    if (result.success) {
      assertEquals(result.data.enabled, true);
    }
  });

  await t.step("requires at least one pattern", () => {
    const rule = {
      name: "invalid-rule",
      kind: "BlockCommandRule",
      spec: {}
    };
    const result = BlockCommandRuleSchema.safeParse(rule);
    assertEquals(result.success, false);
  });

  await t.step("accepts args pattern", () => {
    const rule = {
      name: "block-force",
      kind: "BlockCommandRule",
      spec: {
        args: { containsAny: ["--force"] }
      }
    };
    const result = BlockCommandRuleSchema.safeParse(rule);
    assertEquals(result.success, true);
  });

  await t.step("accepts cwd pattern", () => {
    const rule = {
      name: "block-system",
      kind: "BlockCommandRule",
      spec: {
        cwd: { startsWith: "/usr" }
      }
    };
    const result = BlockCommandRuleSchema.safeParse(rule);
    assertEquals(result.success, true);
  });
});

Deno.test("ApproveCommandRuleSchema validation", async (t) => {
  await t.step("accepts valid approve rule", () => {
    const rule = {
      name: "approve-ls",
      kind: "ApproveCommandRule",
      enabled: true,
      spec: {
        command: "ls",
        reason: "Safe directory listing command"
      }
    };
    const result = ApproveCommandRuleSchema.safeParse(rule);
    assertEquals(result.success, true);
  });

  await t.step("accepts command pattern with oneOf", () => {
    const rule = {
      name: "approve-safe-commands",
      kind: "ApproveCommandRule",
      spec: {
        command: { oneOf: ["ls", "pwd", "whoami"] },
        reason: "Safe read-only commands"
      }
    };
    const result = ApproveCommandRuleSchema.safeParse(rule);
    assertEquals(result.success, true);
  });

  await t.step("accepts with cwd pattern", () => {
    const rule = {
      name: "approve-dev-tools",
      kind: "ApproveCommandRule",
      spec: {
        command: { oneOf: ["npm", "yarn"] },
        cwd: { contains: "projects" }
      }
    };
    const result = ApproveCommandRuleSchema.safeParse(rule);
    assertEquals(result.success, true);
  });

  await t.step("requires at least one pattern", () => {
    const rule = {
      name: "invalid-approve",
      kind: "ApproveCommandRule",
      spec: {
        reason: "No patterns specified"
      }
    };
    const result = ApproveCommandRuleSchema.safeParse(rule);
    assertEquals(result.success, false);
  });

  await t.step("defaults enabled to true", () => {
    const rule = {
      name: "approve-ls",
      kind: "ApproveCommandRule",
      spec: {
        command: "ls"
      }
    };
    const result = ApproveCommandRuleSchema.safeParse(rule);
    assertEquals(result.success, true);
    if (result.success) {
      assertEquals(result.data.enabled, true);
    }
  });
});

Deno.test("ConfirmCommandRuleSchema validation", async (t) => {
  await t.step("accepts valid confirm rule", () => {
    const rule = {
      name: "confirm-prod-deploy",
      kind: "ConfirmCommandRule",
      enabled: true,
      spec: {
        args: { containsAny: ["prod", "production"] },
        reason: "Production deployment requires confirmation",
        message: "Deploy to production environment?"
      }
    };
    const result = ConfirmCommandRuleSchema.safeParse(rule);
    assertEquals(result.success, true);
  });

  await t.step("accepts kubectl apply rule", () => {
    const rule = {
      name: "confirm-kubectl-apply",
      kind: "ConfirmCommandRule",
      spec: {
        command: "kubectl",
        args: { startsWith: ["apply"] },
        reason: "Kubernetes changes require confirmation"
      }
    };
    const result = ConfirmCommandRuleSchema.safeParse(rule);
    assertEquals(result.success, true);
  });

  await t.step("accepts system changes rule", () => {
    const rule = {
      name: "confirm-system-changes",
      kind: "ConfirmCommandRule",
      spec: {
        cwd: { startsWith: "/etc" },
        reason: "System configuration changes need approval",
        message: "Modify system configuration files?"
      }
    };
    const result = ConfirmCommandRuleSchema.safeParse(rule);
    assertEquals(result.success, true);
  });

  await t.step("accepts force operations rule", () => {
    const rule = {
      name: "confirm-force-operations",
      kind: "ConfirmCommandRule",
      spec: {
        args: { containsAll: ["--force", "--yes"] },
        reason: "Multiple force flags detected",
        message: "Execute potentially dangerous operation?"
      }
    };
    const result = ConfirmCommandRuleSchema.safeParse(rule);
    assertEquals(result.success, true);
  });

  await t.step("requires at least one pattern", () => {
    const rule = {
      name: "invalid-confirm",
      kind: "ConfirmCommandRule",
      spec: {
        reason: "No patterns specified"
      }
    };
    const result = ConfirmCommandRuleSchema.safeParse(rule);
    assertEquals(result.success, false);
  });

  await t.step("defaults enabled to true", () => {
    const rule = {
      name: "confirm-kubectl",
      kind: "ConfirmCommandRule",
      spec: {
        command: "kubectl"
      }
    };
    const result = ConfirmCommandRuleSchema.safeParse(rule);
    assertEquals(result.success, true);
    if (result.success) {
      assertEquals(result.data.enabled, true);
    }
  });
});

Deno.test("WarningRuleSchema validation", async (t) => {
  await t.step("accepts valid warning rule", () => {
    const rule = {
      name: "warn-docker",
      kind: "WarningRule",
      enabled: true,
      spec: {
        patterns: {
          command: "docker",
          args: { containsAny: ["--privileged"] }
        },
        warningReason: "Privileged container detected",
        acknowledgedReason: "Acknowledged"
      }
    };
    const result = WarningRuleSchema.safeParse(rule);
    assertEquals(result.success, true);
  });

  await t.step("requires warning reason", () => {
    const rule = {
      name: "warn-docker",
      kind: "WarningRule",
      spec: {
        patterns: {
          command: "docker"
        }
      }
    };
    const result = WarningRuleSchema.safeParse(rule);
    assertEquals(result.success, false);
  });

  await t.step("requires at least one pattern", () => {
    const rule = {
      name: "invalid-rule",
      kind: "WarningRule",
      spec: {
        patterns: {},
        warningReason: "Warning"
      }
    };
    const result = WarningRuleSchema.safeParse(rule);
    assertEquals(result.success, false);
  });

  await t.step("rejects empty warning message", () => {
    const rule = {
      name: "warn-docker",
      kind: "WarningRule",
      spec: {
        patterns: {
          command: "docker"
        },
        warningReason: ""
      }
    };
    const result = WarningRuleSchema.safeParse(rule);
    assertEquals(result.success, false);
  });
});

Deno.test("ConditionalRuleSchema validation", async (t) => {
  await t.step("accepts valid conditional rule", () => {
    const rule = {
      name: "confirm-prod",
      kind: "ConditionalRule",
      enabled: true,
      spec: {
        condition: "command === 'kubectl' && args.includes('prod')",
        action: "confirm",
        reason: "Production deployment"
      }
    };
    const result = ConditionalRuleSchema.safeParse(rule);
    assertEquals(result.success, true);
  });

  await t.step("accepts all action types", () => {
    const actions = ["block", "confirm", "approve", "warning"];
    for (const action of actions) {
      const rule = {
        name: "test-rule",
        kind: "ConditionalRule",
        spec: {
          condition: "true",
          action
        }
      };
      const result = ConditionalRuleSchema.safeParse(rule);
      assertEquals(result.success, true, `Action ${action} should be valid`);
    }
  });

  await t.step("requires condition", () => {
    const rule = {
      name: "invalid-rule",
      kind: "ConditionalRule",
      spec: {
        action: "block"
      }
    };
    const result = ConditionalRuleSchema.safeParse(rule);
    assertEquals(result.success, false);
  });

  await t.step("rejects invalid action", () => {
    const rule = {
      name: "invalid-rule",
      kind: "ConditionalRule",
      spec: {
        condition: "true",
        action: "invalid"
      }
    };
    const result = ConditionalRuleSchema.safeParse(rule);
    assertEquals(result.success, false);
  });
});

Deno.test("LocationRuleSchema validation", async (t) => {
  await t.step("accepts valid path rule", () => {
    const rule = {
      name: "protect-system",
      kind: "LocationRule",
      enabled: true,
      spec: {
        paths: {
          outside: "/usr"
        },
        commands: ["rm", "mv"],
        action: "block",
        reason: "System protection"
      }
    };
    const result = LocationRuleSchema.safeParse(rule);
    assertEquals(result.success, true);
  });

  await t.step("accepts all action types", () => {
    const actions = ["block", "confirm", "approve"];
    for (const action of actions) {
      const rule = {
        name: "test-rule",
        kind: "LocationRule",
        spec: {
          paths: { startsWith: "/home" },
          action
        }
      };
      const result = LocationRuleSchema.safeParse(rule);
      assertEquals(result.success, true, `Action ${action} should be valid`);
    }
  });

  await t.step("requires at least one path condition", () => {
    const rule = {
      name: "invalid-rule",
      kind: "LocationRule",
      spec: {
        paths: {},
        action: "block"
      }
    };
    const result = LocationRuleSchema.safeParse(rule);
    assertEquals(result.success, false);
  });

  await t.step("rejects invalid action", () => {
    const rule = {
      name: "invalid-rule",
      kind: "LocationRule",
      spec: {
        paths: { startsWith: "/home" },
        action: "invalid"
      }
    };
    const result = LocationRuleSchema.safeParse(rule);
    assertEquals(result.success, false);
  });
});

Deno.test("UserRulesConfigSchema validation", async (t) => {
  await t.step("accepts valid configuration", () => {
    const config = {
      rules: [
        {
          name: "block-sudo",
          kind: "BlockCommandRule",
          spec: {
            command: "sudo"
          }
        },
        {
          name: "confirm-kubectl-apply",
          kind: "ConfirmCommandRule",
          spec: {
            command: "kubectl",
            args: { startsWith: ["apply"] },
            reason: "Kubernetes changes require confirmation"
          }
        },
        {
          name: "warn-docker",
          kind: "WarningRule",
          spec: {
            patterns: {
              command: "docker"
            },
            warningReason: "Docker detected"
          }
        }
      ]
    };
    const result = UserRulesConfigSchema.safeParse(config);
    assertEquals(result.success, true);
  });

  await t.step("accepts empty rules array", () => {
    const config = { rules: [] };
    const result = UserRulesConfigSchema.safeParse(config);
    assertEquals(result.success, true);
  });

  await t.step("rejects invalid rule", () => {
    const config = {
      rules: [
        {
          name: "invalid-rule",
          kind: "InvalidKind",
          spec: {}
        }
      ]
    };
    const result = UserRulesConfigSchema.safeParse(config);
    assertEquals(result.success, false);
  });

  await t.step("rejects missing rules field", () => {
    const config = {};
    const result = UserRulesConfigSchema.safeParse(config);
    assertEquals(result.success, false);
  });
});