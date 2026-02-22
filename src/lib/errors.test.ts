import { describe, expect, test } from "bun:test";
import { getErrorMessage } from "@/lib/errors";

describe("getErrorMessage", () => {
  test("returns Error message when err is Error", () => {
    expect(getErrorMessage(new Error("boom"), "fallback")).toBe("boom");
  });

  test("returns fallback for non-Error values", () => {
    expect(getErrorMessage("oops", "fallback")).toBe("fallback");
    expect(getErrorMessage(null, "fallback")).toBe("fallback");
    expect(getErrorMessage(undefined, "fallback")).toBe("fallback");
  });
});
