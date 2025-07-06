import { assertEquals, assertThrows } from "@std/assert";
import { createOutputId, idToString, isOutputId } from "./ouputs.ts";

Deno.test("createOutputId", async (t) => {
  await t.step("should create valid 9-digit numeric ID", () => {
    const id = createOutputId();
    assertEquals(typeof id, "string");
    assertEquals(id.length, 9);

    // Should match 9-digit numeric format
    const numericRegex = /^\d{9}$/;
    assertEquals(numericRegex.test(id), true);
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
  await t.step("should validate correct 9-digit numeric format", () => {
    const validIds = [
      "123456789",
      "000000001",
      "999999999",
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
      "12345678", // too short
      "1234567890", // too long
      "12345678a", // contains non-digit
      "123e4567-e89b-12d3-a456-426614174000", // old UUID format
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

  await t.step("should handle edge cases", () => {
    const edgeCases = [
      "000000000", // all zeros
      "111111111", // all ones
      "123456789", // sequential digits
    ];

    edgeCases.forEach((id) => {
      assertEquals(isOutputId(id), true);
    });
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
