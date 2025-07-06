import { assertEquals, assertExists } from "@std/assert";
import { 
  DEFAULT_USER_RULES_CONFIG,
  EXAMPLE_USER_RULES_CONFIG,
  SECURITY_PRESET_CONFIG,
  DEVELOPMENT_PRESET_CONFIG,
  getPresetConfig,
  getAvailablePresets
} from "./defaults.ts";
import { UserRulesConfigSchema } from "./schema.ts";
import { convertUserRuleToRule } from "./converter.ts";

Deno.test("DEFAULT_USER_RULES_CONFIG", async (t) => {
  await t.step("is valid and empty", () => {
    const result = UserRulesConfigSchema.safeParse(DEFAULT_USER_RULES_CONFIG);
    assertEquals(result.success, true);
    
    if (result.success) {
      assertEquals(result.data.rules.length, 0);
    }
  });

  await t.step("has correct structure", () => {
    assertEquals(Array.isArray(DEFAULT_USER_RULES_CONFIG.rules), true);
    assertEquals(DEFAULT_USER_RULES_CONFIG.rules.length, 0);
  });
});

Deno.test("EXAMPLE_USER_RULES_CONFIG", async (t) => {
  await t.step("is valid configuration", () => {
    const result = UserRulesConfigSchema.safeParse(EXAMPLE_USER_RULES_CONFIG);
    assertEquals(result.success, true);
  });

  await t.step("contains diverse rule types", () => {
    const rules = EXAMPLE_USER_RULES_CONFIG.rules;
    assertEquals(rules.length > 0, true);
    
    const ruleKinds = rules.map(rule => rule.kind);
    assertEquals(ruleKinds.includes("BlockCommandRule"), true);
    assertEquals(ruleKinds.includes("WarningRule"), true);
    assertEquals(ruleKinds.includes("ConditionalRule"), true);
    assertEquals(ruleKinds.includes("LocationRule"), true);
  });

  await t.step("all rules are enabled by default", () => {
    const rules = EXAMPLE_USER_RULES_CONFIG.rules;
    for (const rule of rules) {
      assertEquals(rule.enabled, true);
    }
  });

  await t.step("can be converted to internal rules", () => {
    const rules = EXAMPLE_USER_RULES_CONFIG.rules;
    for (const rule of rules) {
      // Should not throw when converting
      const internalRule = convertUserRuleToRule(rule);
      assertExists(internalRule.name);
      assertExists(internalRule.condition);
    }
  });

  await t.step("has meaningful rule names", () => {
    const rules = EXAMPLE_USER_RULES_CONFIG.rules;
    const expectedNames = [
      "block-sudo",
      "warn-docker-privileged", 
      "confirm-production-deploy",
      "block-system-modifications"
    ];
    
    const actualNames = rules.map(rule => rule.name);
    for (const expectedName of expectedNames) {
      assertEquals(actualNames.includes(expectedName), true);
    }
  });
});

Deno.test("SECURITY_PRESET_CONFIG", async (t) => {
  await t.step("is valid configuration", () => {
    const result = UserRulesConfigSchema.safeParse(SECURITY_PRESET_CONFIG);
    assertEquals(result.success, true);
  });

  await t.step("focuses on security rules", () => {
    const rules = SECURITY_PRESET_CONFIG.rules;
    assertEquals(rules.length > 0, true);
    
    // Check for security-focused rule names
    const ruleNames = rules.map(rule => rule.name);
    assertEquals(ruleNames.some(name => name.includes("dangerous")), true);
    assertEquals(ruleNames.some(name => name.includes("network")), true);
    assertEquals(ruleNames.some(name => name.includes("package")), true);
  });

  await t.step("includes expected security rules", () => {
    const rules = SECURITY_PRESET_CONFIG.rules;
    const expectedRules = [
      "block-dangerous-flags",
      "warn-network-access",
      "confirm-package-installation"
    ];
    
    const actualNames = rules.map(rule => rule.name);
    for (const expectedRule of expectedRules) {
      assertEquals(actualNames.includes(expectedRule), true);
    }
  });

  await t.step("blocks dangerous operations", () => {
    const blockRule = SECURITY_PRESET_CONFIG.rules.find(
      rule => rule.name === "block-dangerous-flags"
    );
    
    assertExists(blockRule);
    assertEquals(blockRule.kind, "BlockCommandRule");
    
    if (blockRule.kind === "BlockCommandRule") {
      if (typeof blockRule.spec.command === "object" && blockRule.spec.command.oneOf) {
        assertEquals(blockRule.spec.command.oneOf.includes("rm"), true);
      }
      assertEquals(blockRule.spec.args?.containsAny?.includes("--force"), true);
    }
  });

  await t.step("warns about network access", () => {
    const warningRule = SECURITY_PRESET_CONFIG.rules.find(
      rule => rule.name === "warn-network-access"
    );
    
    assertExists(warningRule);
    assertEquals(warningRule.kind, "WarningRule");
    
    if (warningRule.kind === "WarningRule") {
      if (typeof warningRule.spec.patterns.command === "object" && warningRule.spec.patterns.command.regex) {
        assertEquals(typeof warningRule.spec.patterns.command.regex, "string");
      }
      assertEquals(warningRule.spec.warningReason.includes("Network"), true);
    }
  });

  await t.step("can be converted to internal rules", () => {
    const rules = SECURITY_PRESET_CONFIG.rules;
    for (const rule of rules) {
      const internalRule = convertUserRuleToRule(rule);
      assertExists(internalRule.name);
      assertExists(internalRule.condition);
    }
  });
});

Deno.test("DEVELOPMENT_PRESET_CONFIG", async (t) => {
  await t.step("is valid configuration", () => {
    const result = UserRulesConfigSchema.safeParse(DEVELOPMENT_PRESET_CONFIG);
    assertEquals(result.success, true);
  });

  await t.step("focuses on development workflow", () => {
    const rules = DEVELOPMENT_PRESET_CONFIG.rules;
    assertEquals(rules.length > 0, true);
    
    // Check for development-focused rule names
    const ruleNames = rules.map(rule => rule.name);
    assertEquals(ruleNames.some(name => name.includes("git")), true);
    assertEquals(ruleNames.some(name => name.includes("database")), true);
  });

  await t.step("includes expected development rules", () => {
    const rules = DEVELOPMENT_PRESET_CONFIG.rules;
    const expectedRules = [
      "warn-git-force-push",
      "confirm-database-operations"
    ];
    
    const actualNames = rules.map(rule => rule.name);
    for (const expectedRule of expectedRules) {
      assertEquals(actualNames.includes(expectedRule), true);
    }
  });

  await t.step("warns about git force push", () => {
    const warningRule = DEVELOPMENT_PRESET_CONFIG.rules.find(
      rule => rule.name === "warn-git-force-push"
    );
    
    assertExists(warningRule);
    assertEquals(warningRule.kind, "WarningRule");
    
    if (warningRule.kind === "WarningRule") {
      assertEquals(warningRule.spec.patterns.command, "git");
      assertEquals(warningRule.spec.patterns.args?.containsAny?.includes("--force"), true);
    }
  });

  await t.step("confirms database operations", () => {
    const conditionalRule = DEVELOPMENT_PRESET_CONFIG.rules.find(
      rule => rule.name === "confirm-database-operations"
    );
    
    assertExists(conditionalRule);
    assertEquals(conditionalRule.kind, "ConditionalRule");
    
    if (conditionalRule.kind === "ConditionalRule") {
      assertEquals(conditionalRule.spec.action, "confirm");
      assertEquals(conditionalRule.spec.condition.includes("mysql"), true);
    }
  });

  await t.step("can be converted to internal rules", () => {
    const rules = DEVELOPMENT_PRESET_CONFIG.rules;
    for (const rule of rules) {
      const internalRule = convertUserRuleToRule(rule);
      assertExists(internalRule.name);
      assertExists(internalRule.condition);
    }
  });
});

Deno.test("getPresetConfig", async (t) => {
  await t.step("returns security preset", () => {
    const config1 = getPresetConfig("security");
    const config2 = getPresetConfig("@mcp-cmd/security-preset");
    
    assertEquals(config1, SECURITY_PRESET_CONFIG);
    assertEquals(config2, SECURITY_PRESET_CONFIG);
  });

  await t.step("returns development preset", () => {
    const config1 = getPresetConfig("development");
    const config2 = getPresetConfig("@mcp-cmd/development-preset");
    
    assertEquals(config1, DEVELOPMENT_PRESET_CONFIG);
    assertEquals(config2, DEVELOPMENT_PRESET_CONFIG);
  });

  await t.step("returns example preset", () => {
    const config = getPresetConfig("example");
    assertEquals(config, EXAMPLE_USER_RULES_CONFIG);
  });

  await t.step("returns null for unknown preset", () => {
    const config = getPresetConfig("unknown-preset");
    assertEquals(config, null);
  });

  await t.step("handles case sensitivity", () => {
    const config = getPresetConfig("Security");
    assertEquals(config, null);
  });
});

Deno.test("getAvailablePresets", async (t) => {
  await t.step("returns all available presets", () => {
    const presets = getAvailablePresets();
    
    assertEquals(Array.isArray(presets), true);
    assertEquals(presets.length > 0, true);
    
    // Check that all expected presets are included
    const expectedPresets = [
      "security",
      "@mcp-cmd/security-preset",
      "development", 
      "@mcp-cmd/development-preset",
      "example"
    ];
    
    for (const expectedPreset of expectedPresets) {
      assertEquals(presets.includes(expectedPreset), true);
    }
  });

  await t.step("all returned presets are valid", () => {
    const presets = getAvailablePresets();
    
    for (const preset of presets) {
      const config = getPresetConfig(preset);
      assertExists(config, `Preset ${preset} should return a valid config`);
      
      // Validate that the config is valid
      const result = UserRulesConfigSchema.safeParse(config);
      assertEquals(result.success, true, `Preset ${preset} should be valid`);
    }
  });
});

Deno.test("Preset configurations consistency", async (t) => {
  await t.step("all configurations follow same structure", () => {
    const allConfigs = [
      DEFAULT_USER_RULES_CONFIG,
      EXAMPLE_USER_RULES_CONFIG,
      SECURITY_PRESET_CONFIG,
      DEVELOPMENT_PRESET_CONFIG
    ];
    
    for (const config of allConfigs) {
      // All should have rules array
      assertEquals(Array.isArray(config.rules), true);
      
      // All rules should have required fields
      for (const rule of config.rules) {
        assertExists(rule.name);
        assertExists(rule.kind);
        assertEquals(typeof rule.enabled, "boolean");
        assertExists(rule.spec);
      }
    }
  });

  await t.step("no duplicate rule names within configurations", () => {
    const allConfigs = [
      EXAMPLE_USER_RULES_CONFIG,
      SECURITY_PRESET_CONFIG,
      DEVELOPMENT_PRESET_CONFIG
    ];
    
    for (const config of allConfigs) {
      const ruleNames = config.rules.map(rule => rule.name);
      const uniqueNames = [...new Set(ruleNames)];
      
      assertEquals(
        ruleNames.length,
        uniqueNames.length,
        `Configuration should not have duplicate rule names: ${ruleNames.join(", ")}`
      );
    }
  });

  await t.step("all rules have meaningful descriptions", () => {
    const allConfigs = [
      EXAMPLE_USER_RULES_CONFIG,
      SECURITY_PRESET_CONFIG,
      DEVELOPMENT_PRESET_CONFIG
    ];
    
    for (const config of allConfigs) {
      for (const rule of config.rules) {
        // Rule names should be descriptive
        assertEquals(rule.name.length > 3, true, `Rule name "${rule.name}" should be descriptive`);
        
        // Block and Path rules should have reasons
        if (rule.kind === "BlockCommandRule" || rule.kind === "LocationRule") {
          assertExists(rule.spec.reason, `${rule.kind} "${rule.name}" should have a reason`);
        }
        
        // Warning rules should have warning messages
        if (rule.kind === "WarningRule") {
          assertExists(rule.spec.warningReason, `WarningRule "${rule.name}" should have a warning reason`);
        }
      }
    }
  });
});