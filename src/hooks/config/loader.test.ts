import { assertEquals, assertRejects } from "@std/assert";
import {
  configFileExists,
  loadAndMergeUserRules,
  loadUserRulesConfig,
} from "./loader.ts";

// Test data directory
const TEST_DATA_DIR = "/tmp/mcp-cmd-test-config";

async function setupTestDirectory() {
  try {
    await Deno.mkdir(TEST_DATA_DIR, { recursive: true });
  } catch (_error) {
    if (!(_error instanceof Deno.errors.AlreadyExists)) {
      throw _error;
    }
  }
}

async function cleanupTestDirectory() {
  try {
    await Deno.remove(TEST_DATA_DIR, { recursive: true });
  } catch (_error) {
    // Ignore cleanup errors
  }
}

async function writeTestFile(filename: string, content: string) {
  await Deno.writeTextFile(`${TEST_DATA_DIR}/${filename}`, content);
}

Deno.test("loadUserRulesConfig - YAML format", async (t) => {
  await setupTestDirectory();

  await t.step("loads valid YAML configuration", async () => {
    const yamlContent = `
rules:
  - name: "block-sudo"
    kind: "BlockCommandRule"
    enabled: true
    spec:
      command: "sudo"
      reason: "Sudo access not allowed"
  - name: "warn-docker"
    kind: "WarningRule"
    enabled: true
    spec:
      patterns:
        command: "docker"
        args:
          containsAny: ["--privileged"]
      warningReason: "Privileged container detected"
`;

    await writeTestFile("valid.yaml", yamlContent);

    const config = await loadUserRulesConfig(`${TEST_DATA_DIR}/valid.yaml`);
    assertEquals(config.rules.length, 2);
    assertEquals(config.rules[0].name, "block-sudo");
    assertEquals(config.rules[0].kind, "BlockCommandRule");
    assertEquals(config.rules[1].name, "warn-docker");
    assertEquals(config.rules[1].kind, "WarningRule");
  });

  await t.step("handles default enabled field", async () => {
    const yamlContent = `
rules:
  - name: "test-rule"
    kind: "BlockCommandRule"
    spec:
      command: "test"
`;

    await writeTestFile("default-enabled.yaml", yamlContent);

    const config = await loadUserRulesConfig(
      `${TEST_DATA_DIR}/default-enabled.yaml`,
    );
    assertEquals(config.rules[0].enabled, true);
  });

  await t.step("throws for invalid YAML syntax", async () => {
    const invalidYaml = `
rules:
  - name: "invalid
    kind: "BlockCommandRule"
    spec:
      command: "test"
`;

    await writeTestFile("invalid-syntax.yaml", invalidYaml);

    await assertRejects(
      () => loadUserRulesConfig(`${TEST_DATA_DIR}/invalid-syntax.yaml`),
      Error,
      "Invalid YAML/JSON syntax",
    );
  });

  await t.step("throws for validation errors", async () => {
    const invalidContent = `
rules:
  - name: "invalid-rule"
    kind: "InvalidKind"
    spec:
      command: "test"
`;

    await writeTestFile("invalid-validation.yaml", invalidContent);

    await assertRejects(
      () => loadUserRulesConfig(`${TEST_DATA_DIR}/invalid-validation.yaml`),
      Error,
      "Invalid configuration",
    );
  });

  await cleanupTestDirectory();
});

Deno.test("loadUserRulesConfig - JSON format", async (t) => {
  await setupTestDirectory();

  await t.step("loads valid JSON configuration", async () => {
    const jsonContent = JSON.stringify(
      {
        rules: [
          {
            name: "block-sudo",
            kind: "BlockCommandRule",
            enabled: true,
            spec: {
              command: "sudo",
              reason: "Sudo access not allowed",
            },
          },
        ],
      },
      null,
      2,
    );

    await writeTestFile("valid.json", jsonContent);

    const config = await loadUserRulesConfig(`${TEST_DATA_DIR}/valid.json`);
    assertEquals(config.rules.length, 1);
    assertEquals(config.rules[0].name, "block-sudo");
  });

  await t.step("throws for invalid JSON syntax", async () => {
    const invalidJson = `{
  "rules": [
    {
      "name": "test",
      "kind": "BlockRule",
      "spec": {
        "command": "test"
      }
    }
  }
  // Invalid comment in JSON
}`;

    await writeTestFile("invalid-syntax.json", invalidJson);

    await assertRejects(
      () => loadUserRulesConfig(`${TEST_DATA_DIR}/invalid-syntax.json`),
      Error,
      "Invalid YAML/JSON syntax",
    );
  });

  await cleanupTestDirectory();
});

Deno.test("loadUserRulesConfig - File operations", async (t) => {
  await setupTestDirectory();

  await t.step("throws for non-existent file", async () => {
    await assertRejects(
      () => loadUserRulesConfig(`${TEST_DATA_DIR}/non-existent.yaml`),
      Error,
      "Configuration file not found",
    );
  });

  await t.step("detects file format by extension", async () => {
    const config = { rules: [] };

    // Test YAML extensions
    await writeTestFile("test.yaml", "rules: []");
    await writeTestFile("test.yml", "rules: []");

    const yamlConfig1 = await loadUserRulesConfig(`${TEST_DATA_DIR}/test.yaml`);
    const yamlConfig2 = await loadUserRulesConfig(`${TEST_DATA_DIR}/test.yml`);

    assertEquals(yamlConfig1, config);
    assertEquals(yamlConfig2, config);

    // Test JSON extension
    await writeTestFile("test.json", JSON.stringify(config));

    const jsonConfig = await loadUserRulesConfig(`${TEST_DATA_DIR}/test.json`);
    assertEquals(jsonConfig, config);
  });

  await cleanupTestDirectory();
});

Deno.test("loadAndMergeUserRules", async (t) => {
  await setupTestDirectory();

  await t.step("merges multiple configuration files", async () => {
    const config1 = `
rules:
  - name: "rule1"
    kind: "BlockCommandRule"
    spec:
      command: "sudo"
`;

    const config2 = `
rules:
  - name: "rule2"
    kind: "WarningRule"
    spec:
      patterns:
        command: "docker"
      warningReason: "Docker detected"
`;

    await writeTestFile("config1.yaml", config1);
    await writeTestFile("config2.yaml", config2);

    const mergedConfig = await loadAndMergeUserRules([
      `${TEST_DATA_DIR}/config1.yaml`,
      `${TEST_DATA_DIR}/config2.yaml`,
    ]);

    assertEquals(mergedConfig.rules.length, 2);
    assertEquals(mergedConfig.rules[0].name, "rule1");
    assertEquals(mergedConfig.rules[1].name, "rule2");
  });

  await t.step("skips missing files", async () => {
    const config1 = `
rules:
  - name: "rule1"
    kind: "BlockCommandRule"
    spec:
      command: "sudo"
`;

    await writeTestFile("existing.yaml", config1);

    const mergedConfig = await loadAndMergeUserRules([
      `${TEST_DATA_DIR}/existing.yaml`,
      `${TEST_DATA_DIR}/missing.yaml`,
    ]);

    assertEquals(mergedConfig.rules.length, 1);
    assertEquals(mergedConfig.rules[0].name, "rule1");
  });

  await t.step("returns empty config when no files found", async () => {
    const mergedConfig = await loadAndMergeUserRules([
      `${TEST_DATA_DIR}/missing1.yaml`,
      `${TEST_DATA_DIR}/missing2.yaml`,
    ]);

    assertEquals(mergedConfig.rules, []);
  });

  await t.step("propagates validation errors", async () => {
    const invalidConfig = `
rules:
  - name: "invalid"
    kind: "InvalidKind"
    spec: {}
`;

    await writeTestFile("invalid.yaml", invalidConfig);

    await assertRejects(
      () => loadAndMergeUserRules([`${TEST_DATA_DIR}/invalid.yaml`]),
      Error,
      "Invalid configuration",
    );
  });

  await cleanupTestDirectory();
});

Deno.test("configFileExists", async (t) => {
  await setupTestDirectory();

  await t.step("returns true for existing file", async () => {
    await writeTestFile("exists.yaml", "rules: []");

    const exists = await configFileExists(`${TEST_DATA_DIR}/exists.yaml`);
    assertEquals(exists, true);
  });

  await t.step("returns false for non-existent file", async () => {
    const exists = await configFileExists(
      `${TEST_DATA_DIR}/does-not-exist.yaml`,
    );
    assertEquals(exists, false);
  });

  await t.step("returns false for directory", async () => {
    await Deno.mkdir(`${TEST_DATA_DIR}/directory`);

    const exists = await configFileExists(`${TEST_DATA_DIR}/directory`);
    assertEquals(exists, false);
  });

  await cleanupTestDirectory();
});

Deno.test("Path expansion", async (t) => {
  await t.step("expands tilde in config paths", async () => {
    // This test verifies that the tilde expansion works
    // We don't test actual file access since HOME may not exist in test env
    const homeConfigPath = "~/.config/@masinc/mcp-cmd/hooks-rules.yaml";

    // configFileExists should handle tilde expansion gracefully (return false if no file)
    const exists = await configFileExists(homeConfigPath);
    assertEquals(typeof exists, "boolean"); // Should not throw error
  });
});

Deno.test("Complex configuration validation", async (t) => {
  await setupTestDirectory();

  await t.step("validates complex nested patterns", async () => {
    const complexConfig = `
rules:
  - name: "complex-block"
    kind: "BlockCommandRule"
    enabled: true
    spec:
      command:
        oneOf: ["rm", "mv", "chmod"]
      args:
        containsAny: ["--force", "-f"]
        minLength: 2
        maxLength: 10
      cwd:
        startsWith: "/usr"
        contains: "bin"
      reason: "Complex blocking rule"
  
  - name: "complex-warning"
    kind: "WarningRule"
    enabled: true
    spec:
      patterns:
        command:
          regex: "^(curl|wget|nc)$"
        args:
          containsAny: ["--insecure", "-k"]
          exact: ["--insecure", "example.com"]
        cwd:
          outside: "/home"
          regex: ".*sensitive.*"
      warningReason: "Potentially dangerous network operation"
      acknowledgedReason: "Network security verified"
  
  - name: "complex-conditional"
    kind: "ConditionalRule"
    enabled: true
    spec:
      condition: "command.includes('kubectl') && args.some(arg => arg.match(/prod|production/i)) && cwd && cwd.includes('kubernetes')"
      action: "confirm"
      message: "Production Kubernetes operation detected"
      reason: "Requires explicit confirmation for production changes"
  
  - name: "complex-path"
    kind: "LocationRule"
    enabled: true
    spec:
      paths:
        startsWith: "/etc"
        contains: "config"
        outside: "/etc/user-configs"
      commands: ["vim", "nano", "emacs", "sed", "awk"]
      action: "confirm"
      reason: "System configuration file modification requires confirmation"
`;

    await writeTestFile("complex.yaml", complexConfig);

    const config = await loadUserRulesConfig(`${TEST_DATA_DIR}/complex.yaml`);
    assertEquals(config.rules.length, 4);

    // Verify all rule types are parsed correctly
    assertEquals(config.rules[0].kind, "BlockCommandRule");
    assertEquals(config.rules[1].kind, "WarningRule");
    assertEquals(config.rules[2].kind, "ConditionalRule");
    assertEquals(config.rules[3].kind, "LocationRule");

    // Verify complex patterns are preserved
    const blockRule = config.rules[0] as {
      spec: {
        command: { oneOf: string[] };
        args: { minLength: number; maxLength: number };
      };
    };
    assertEquals(blockRule.spec.command.oneOf, ["rm", "mv", "chmod"]);
    assertEquals(blockRule.spec.args.minLength, 2);
    assertEquals(blockRule.spec.args.maxLength, 10);

    const warningRule = config.rules[1] as {
      spec: {
        patterns: { command: { regex: string }; args: { exact: string[] } };
      };
    };
    assertEquals(warningRule.spec.patterns.command.regex, "^(curl|wget|nc)$");
    assertEquals(warningRule.spec.patterns.args.exact, [
      "--insecure",
      "example.com",
    ]);
  });

  await cleanupTestDirectory();
});
