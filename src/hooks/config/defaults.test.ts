import { assertEquals, assertExists } from "@std/assert";
import { 
  DEFAULT_USER_RULES_CONFIG,
  EXAMPLE_USER_RULES_CONFIG,
  DEFAULT_PRESET_CONFIG,
  DEVELOPMENT_PRESET_CONFIG,
  getPresetConfig,
  getAvailablePresets
} from "./defaults.ts";
import { UserRulesConfigSchema } from "./schema.ts";

Deno.test("Default configurations are valid", () => {
  const configs = [
    DEFAULT_USER_RULES_CONFIG,
    EXAMPLE_USER_RULES_CONFIG,
    DEFAULT_PRESET_CONFIG,
    DEVELOPMENT_PRESET_CONFIG
  ];
  
  for (const config of configs) {
    const result = UserRulesConfigSchema.safeParse(config);
    assertEquals(result.success, true);
  }
});

Deno.test("DEFAULT_USER_RULES_CONFIG is empty", () => {
  assertEquals(DEFAULT_USER_RULES_CONFIG.rules.length, 0);
});

Deno.test("getPresetConfig", () => {
  // Valid presets
  assertEquals(getPresetConfig("default"), DEFAULT_PRESET_CONFIG);
  assertEquals(getPresetConfig("@mcp-cmd/default-preset"), DEFAULT_PRESET_CONFIG);
  assertEquals(getPresetConfig("development"), DEVELOPMENT_PRESET_CONFIG);
  assertEquals(getPresetConfig("example"), EXAMPLE_USER_RULES_CONFIG);
  
  // Invalid preset
  assertEquals(getPresetConfig("unknown"), null);
});

Deno.test("getAvailablePresets", () => {
  const presets = getAvailablePresets();
  
  assertEquals(Array.isArray(presets), true);
  assertEquals(presets.includes("default"), true);
  assertEquals(presets.includes("development"), true);
  assertEquals(presets.includes("example"), true);
  
  // All presets should be valid
  for (const preset of presets) {
    const config = getPresetConfig(preset);
    assertExists(config);
  }
});

Deno.test("Rule names are unique within each configuration", () => {
  const configs = [EXAMPLE_USER_RULES_CONFIG, DEFAULT_PRESET_CONFIG, DEVELOPMENT_PRESET_CONFIG];
  
  for (const config of configs) {
    const ruleNames = config.rules.map(rule => rule.name);
    const uniqueNames = [...new Set(ruleNames)];
    assertEquals(ruleNames.length, uniqueNames.length);
  }
});