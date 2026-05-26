import { describe, it, expect } from "vitest";
import { PublishInputSchema, MAX_CONTENT_LENGTH } from "../src/schema";

describe("PublishInputSchema", () => {
  it("accepts a valid short script", () => {
    const result = PublishInputSchema.safeParse({ content: "echo hi" });
    expect(result.success).toBe(true);
  });

  it("accepts a script exactly at the max length", () => {
    const content = "x".repeat(MAX_CONTENT_LENGTH);
    const result = PublishInputSchema.safeParse({ content });
    expect(result.success).toBe(true);
  });

  it("rejects an empty string", () => {
    const result = PublishInputSchema.safeParse({ content: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a script exceeding 16 384 characters", () => {
    const content = "x".repeat(MAX_CONTENT_LENGTH + 1);
    const result = PublishInputSchema.safeParse({ content });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.code).toBe("too_big");
  });

  it("rejects a multibyte string that exceeds the char limit", () => {
    // Each '한' is 3 bytes UTF-8 but 1 UTF-16 code unit.
    // 16385 chars triggers the .max() check regardless of byte length.
    const content = "한".repeat(MAX_CONTENT_LENGTH + 1);
    const result = PublishInputSchema.safeParse({ content });
    expect(result.success).toBe(false);
  });

  it("rejects invalid visibility values", () => {
    const result = PublishInputSchema.safeParse({ content: "x", visibility: "world" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid expires values", () => {
    const result = PublishInputSchema.safeParse({ content: "x", expires: "forever" });
    expect(result.success).toBe(false);
  });
});
