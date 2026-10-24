import { describe, expect, it } from "vitest";
import { normalizeUrl } from "./BookmarkEditor";

describe("normalizeUrl", () => {
  it("keeps full URLs", () => {
    expect(normalizeUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(normalizeUrl("http://localhost:3000")).toBe("http://localhost:3000/");
  });

  it("adds https:// to bare domains, like the address bar", () => {
    expect(normalizeUrl("  example.com/docs ")).toBe("https://example.com/docs");
    expect(normalizeUrl("localhost:3000")).toBe("https://localhost:3000/");
  });

  it("keeps other schemes", () => {
    expect(normalizeUrl("chrome://extensions")).toBe("chrome://extensions");
    expect(normalizeUrl("mailto:me@example.com")).toBe("mailto:me@example.com");
  });

  it("rejects empty and unparseable input", () => {
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("   ")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
  });
});
