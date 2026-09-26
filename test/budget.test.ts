import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { normalizeMcpResult } from "../src/index.js";

describe("character budgeting", () => {
  it("leaves evidence under the limit unchanged", () => {
    const evidence = normalizeMcpResult(
      {
        content: [
          {
            type: "text",
            text: "alpha",
          },
        ],
      },
      {
        maxChars: 10,
      },
    );

    expect(evidence.text).toBe("alpha");
    expect(evidence.truncated).toBe(false);
    expect(evidence.warnings).toEqual([]);
  });

  it("leaves evidence exactly at the limit unchanged", () => {
    const evidence = normalizeMcpResult(
      {
        content: [
          {
            type: "text",
            text: "12345",
          },
        ],
      },
      {
        maxChars: 5,
      },
    );

    expect(evidence.text).toBe("12345");
    expect(evidence.truncated).toBe(false);
    expect(evidence.warnings).toEqual([]);
  });

  it("truncates evidence deterministically over the limit", () => {
    const evidence = normalizeMcpResult(
      {
        content: [
          {
            type: "text",
            text: "abcdefghij",
          },
        ],
      },
      {
        maxChars: 6,
      },
    );

    expect(evidence.text).toBe("abcdef");
    expect(evidence.text).toHaveLength(6);
    expect(evidence.truncated).toBe(true);
    expect(evidence.warnings).toEqual([
      "Evidence text truncated to 6 characters",
    ]);
  });

  it("supports a zero-character budget", () => {
    const evidence = normalizeMcpResult(
      {
        content: [
          {
            type: "text",
            text: "alpha",
          },
        ],
      },
      {
        maxChars: 0,
      },
    );

    expect(evidence.text).toBe("");
    expect(evidence.truncated).toBe(true);
    expect(evidence.warnings).toEqual([
      "Evidence text truncated to 0 characters",
    ]);
  });

  it("does not report truncation when there was no renderable evidence", () => {
    const evidence = normalizeMcpResult(
      {
        content: [],
      },
      {
        maxChars: 0,
      },
    );

    expect(evidence.text).toBe("");
    expect(evidence.truncated).toBe(false);
    expect(evidence.warnings).toEqual([
      "MCP result contained no renderable evidence",
    ]);
  });

  it("preserves full text blocks while bounding rendered text", () => {
    const original = "0123456789";

    const evidence = normalizeMcpResult(
      {
        content: [
          {
            type: "text",
            text: original,
          },
        ],
      },
      {
        maxChars: 4,
      },
    );

    expect(evidence.text).toBe("0123");
    expect(evidence.blocks).toEqual([
      {
        type: "text",
        text: original,
      },
    ]);
    expect(evidence.truncated).toBe(true);
  });

  it("preserves full structured data while bounding its rendered form", () => {
    const structuredContent = {
      alpha: "0123456789",
      beta: true,
    };

    const fullRendered = JSON.stringify(structuredContent, null, 2);

    const evidence = normalizeMcpResult(
      {
        content: [],
        structuredContent,
      },
      {
        maxChars: 12,
      },
    );

    expect(evidence.text).toBe(fullRendered.slice(0, 12));
    expect(evidence.blocks).toEqual([
      {
        type: "json",
        value: structuredContent,
      },
    ]);
    expect(evidence.truncated).toBe(true);
  });

  it("preserves block ordering when the joined rendering is truncated", () => {
    const evidence = normalizeMcpResult(
      {
        content: [
          {
            type: "text",
            text: "first",
          },
          {
            type: "text",
            text: "second",
          },
          {
            type: "text",
            text: "third",
          },
        ],
      },
      {
        maxChars: 9,
      },
    );

    expect(evidence.text).toBe("first\n\nse");
    expect(evidence.blocks.map((block) => block.type)).toEqual([
      "text",
      "text",
      "text",
    ]);
    expect(evidence.truncated).toBe(true);
  });

  it("recovers a blind nonce exactly when it lies inside the budget", () => {
    const nonce = `VALUE-${randomBytes(12).toString("hex").toUpperCase()}`;
    const text = `prefix:${nonce}:suffix`;
    const maxChars = `prefix:${nonce}`.length;

    const evidence = normalizeMcpResult(
      {
        content: [
          {
            type: "text",
            text,
          },
        ],
      },
      {
        maxChars,
      },
    );

    expect(evidence.text).toBe(`prefix:${nonce}`);
    expect(evidence.text).toContain(nonce);
    expect(evidence.blocks[0]).toEqual({
      type: "text",
      text,
    });
    expect(evidence.truncated).toBe(true);
  });

  it.each([
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("rejects invalid maxChars value: %s", (maxChars) => {
    expect(() =>
      normalizeMcpResult(
        {
          content: [
            {
              type: "text",
              text: "alpha",
            },
          ],
        },
        {
          maxChars,
        },
      ),
    ).toThrow(
      "NormalizeOptions.maxChars must be a non-negative integer",
    );
  });
});
