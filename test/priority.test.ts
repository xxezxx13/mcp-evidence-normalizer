import { describe, expect, it } from "vitest";

import { guardCallToolResult } from "../src/index.js";

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function textOf(result: unknown): string {
  if (!isRecord(result) || !Array.isArray(result.content)) {
    throw new Error("Expected guarded content array.");
  }

  for (const candidate of result.content) {
    if (
      isRecord(candidate) &&
      candidate.type === "text" &&
      typeof candidate.text === "string"
    ) {
      return candidate.text;
    }
  }

  throw new Error("Expected guarded text output.");
}

function guardMeta(
  result: unknown,
): Record<string, unknown> {
  if (
    !isRecord(result) ||
    !isRecord(result._meta) ||
    !isRecord(result._meta.evidenceGuard)
  ) {
    throw new Error("Expected evidenceGuard metadata.");
  }

  return result._meta.evidenceGuard;
}

describe("conservative priority semantics", () => {
  it("does not infer p2 from common evidence field names", () => {
    const result = guardCallToolResult(
      {
        content: [],
        structuredContent: {
          debug_trace: "trace-value",
          headers: {
            etag: "critical-version",
          },
          metadata: {
            legalBasis: "customer-consent",
          },
          timestamp: "2026-09-26T18:00:00-04:00",
          payload: "p".repeat(400),
        },
      },
      {
        maxBytes: 300,
        maxTokens: 10_000,
        format: "compact-json",
        strategy: "adaptive",
        onBudgetExceeded: "tombstone",
      },
    );

    const projection = textOf(result);
    const meta = guardMeta(result);

    expect(projection).toContain('"debug_trace":"trace-value"');
    expect(projection).toContain('"headers"');
    expect(projection).toContain('"metadata"');
    expect(projection).toContain('"timestamp"');
    expect(meta.omitted_fields).toBeUndefined();
  });

  it("still prunes fields explicitly marked p2 by name", () => {
    const result = guardCallToolResult(
      {
        content: [],
        structuredContent: {
          metadata: {
            legalBasis: "customer-consent",
            source: "ledger",
          },
          payload: "p".repeat(400),
        },
      },
      {
        maxBytes: 240,
        maxTokens: 10_000,
        format: "compact-json",
        strategy: "adaptive",
        onBudgetExceeded: "tombstone",
        fieldPriorities: {
          metadata: "p2",
        },
      },
    );

    const projection = textOf(result);
    const meta = guardMeta(result);

    expect(projection).not.toContain('"metadata"');
    expect(meta.omitted_fields).toEqual(
      expect.arrayContaining(["structuredContent.metadata"]),
    );
  });

  it("supports evidence-relative exact priority paths", () => {
    const result = guardCallToolResult(
      {
        content: [],
        structuredContent: {
          metadata: {
            debug_trace: "d".repeat(300),
            legalBasis: "retain",
          },
          payload: "p".repeat(300),
        },
      },
      {
        maxBytes: 220,
        maxTokens: 10_000,
        format: "compact-json",
        strategy: "adaptive",
        onBudgetExceeded: "tombstone",
        fieldPriorities: {
          "metadata.debug_trace": "p2",
        },
      },
    );

    const projection = textOf(result);
    const meta = guardMeta(result);

    expect(projection).toContain('"legalBasis":"retain"');
    expect(projection).not.toContain("dddddddddd");
    expect(meta.omitted_fields).toEqual(
      expect.arrayContaining([
        "structuredContent.metadata.debug_trace",
      ]),
    );
  });

  it("protects an ancestor needed to reach a pinned descendant", () => {
    const result = guardCallToolResult(
      {
        content: [],
        structuredContent: {
          metadata: {
            legalBasis: "retain-me",
            disposable: "z".repeat(240),
          },
          timestamp: "drop-me",
          payload: "p".repeat(240),
        },
      },
      {
        maxBytes: 220,
        maxTokens: 10_000,
        format: "compact-json",
        strategy: "adaptive",
        onBudgetExceeded: "tombstone",
        fieldPriorities: {
          metadata: "p2",
          timestamp: "p2",
        },
        pinnedFields: [
          "metadata.legalBasis",
        ],
      },
    );

    const projection = textOf(result);
    const meta = guardMeta(result);

    expect(projection).toContain('"metadata"');
    expect(projection).toContain('"legalBasis":"retain-me"');
    expect(meta.omitted_fields).not.toEqual(
      expect.arrayContaining(["structuredContent.metadata"]),
    );
    expect(meta.omitted_fields).toEqual(
      expect.arrayContaining(["structuredContent.timestamp"]),
    );
  });

  it("protects a pinned parent subtree from slicing and clamping", () => {
    const longPinned = "m".repeat(120);

    const result = guardCallToolResult(
      {
        content: [],
        structuredContent: {
          metadata: {
            longValue: longPinned,
            items: [
              "one",
              "two",
              "three",
              "four",
              "five",
              "six",
              "seven",
              "eight",
            ],
          },
          payload: "p".repeat(500),
        },
      },
      {
        maxBytes: 450,
        maxTokens: 10_000,
        format: "compact-json",
        strategy: "adaptive",
        onBudgetExceeded: "tombstone",
        pinnedFields: [
          "metadata",
        ],
      },
    );

    const projection = JSON.parse(textOf(result)) as {
      metadata: {
        longValue: string;
        items: string[];
      };
      payload: string;
    };

    expect(projection.metadata.longValue).toBe(longPinned);
    expect(projection.metadata.items).toEqual([
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
      "seven",
      "eight",
    ]);
    expect(projection.payload.length).toBeLessThan(500);
  });
});
