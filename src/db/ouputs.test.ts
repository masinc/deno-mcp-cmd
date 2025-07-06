import { assertEquals, assertThrows } from "@std/assert";
import { createOutputId, idToString, isOutputId } from "./ouputs.ts";

Deno.test("createOutputId", async (t) => {
  await t.step("should create valid UUID", () => {
    const id = createOutputId();
    assertEquals(typeof id, "string");
    assertEquals(id.length, 36);

    // Should match UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    assertEquals(uuidRegex.test(id), true);
  });

  await t.step("should create unique IDs", () => {
    const id1 = createOutputId();
    const id2 = createOutputId();
    assertEquals(id1 !== id2, true);
  });

  await t.step("should be valid output ID", () => {
    const id = createOutputId();
    assertEquals(isOutputId(id), true);
  });
});

Deno.test("isOutputId", async (t) => {
  await t.step("should validate correct UUID format", () => {
    const validIds = [
      "123e4567-e89b-12d3-a456-426614174000",
      "550e8400-e29b-41d4-a716-446655440000",
      createOutputId(),
    ];

    validIds.forEach((id) => {
      assertEquals(isOutputId(id), true);
    });
  });

  await t.step("should reject invalid formats", () => {
    const invalidIds = [
      "",
      "123",
      "123e4567-e89b-12d3-a456", // too short
      "123e4567-e89b-12d3-a456-426614174000-extra", // too long
      null,
      undefined,
      123,
      {},
      [],
    ];

    invalidIds.forEach((id) => {
      assertEquals(isOutputId(id), false);
    });
  });

  await t.step("should be case insensitive", () => {
    const lowerCase = "123e4567-e89b-12d3-a456-426614174000";
    const upperCase = "123E4567-E89B-12D3-A456-426614174000";
    const mixedCase = "123E4567-e89b-12D3-a456-426614174000";

    assertEquals(isOutputId(lowerCase), true);
    assertEquals(isOutputId(upperCase), true);
    assertEquals(isOutputId(mixedCase), true);
  });
});

Deno.test("idToString", async (t) => {
  await t.step("should convert valid ID to string", () => {
    const id = createOutputId();
    const str = idToString(id);
    assertEquals(typeof str, "string");
    assertEquals(str, id);
  });

  await t.step("should preserve the exact string value", () => {
    const testId = createOutputId();
    const result = idToString(testId);
    assertEquals(result, testId);
  });

  await t.step("should throw error for invalid ID", () => {
    const invalidIds = [
      "invalid-id",
      "",
      "123",
      null,
      undefined,
    ];

    invalidIds.forEach((id) => {
      assertThrows(
        // deno-lint-ignore no-explicit-any
        () => idToString(id as any),
        Error,
        "Invalid OutputId",
      );
    });
  });
});

Deno.test("ID consistency", async (t) => {
  await t.step("createOutputId should always produce valid IDs", () => {
    // Test multiple generations
    for (let i = 0; i < 100; i++) {
      const id = createOutputId();
      assertEquals(isOutputId(id), true);

      // Should not throw when converting to string
      const str = idToString(id);
      assertEquals(str, id);
    }
  });

  await t.step("round trip should preserve ID", () => {
    const originalId = createOutputId();

    // Round trip: ID -> string -> validation
    const stringId = idToString(originalId);
    assertEquals(isOutputId(stringId), true);
    assertEquals(stringId, originalId);
  });
});
