import { describe, expect, it } from "vitest";

import {
  guardCallToolResult,
  measureGuardText,
  resolveGuardOptions,
} from "../src/index.js";

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

  for (const block of result.content) {
    if (
      isRecord(block) &&
      block.type === "text" &&
      typeof block.text === "string"
    ) {
      return block.text;
    }
  }

  throw new Error("Expected guarded text output.");
}

function metaOf(result: unknown): Record<string, unknown> {
  if (
    !isRecord(result) ||
    !isRecord(result._meta) ||
    !isRecord(result._meta.evidenceGuard)
  ) {
    throw new Error("Expected evidenceGuard metadata.");
  }

  return result._meta.evidenceGuard;
}

function expectFinalMeasurement(
  result: unknown,
  guardOptions: Parameters<typeof resolveGuardOptions>[0],
): void {
  const text = textOf(result);
  const measurement = measureGuardText(
    text,
    resolveGuardOptions(guardOptions),
  );
  const meta = metaOf(result);

  expect(meta.retained_bytes).toBe(measurement.bytes);
  expect(meta.estimated_tokens).toBe(
    measurement.estimatedTokens,
  );
}

describe("public degradation metadata contract", () => {
  it("reports evidence-relative degradation paths", () => {
    const result = guardCallToolResult(
      {
        content: [],
        structuredContent: {
          discard: "d".repeat(300),
          payload: "p".repeat(500),
        },
      },
      {
        maxBytes: 180,
        maxTokens: 10_000,
        format: "compact-json",
        strategy: "adaptive",
        onBudgetExceeded: "tombstone",
        fieldPriorities: {
          discard: "p2",
        },
      },
    );

    const meta = metaOf(result);

    expect(meta.omitted_fields).toEqual(["discard"]);
    expect(meta.hard_clamped_fields).toEqual(["payload"]);

    const rendered = JSON.stringify(meta);

    expect(rendered).not.toContain("structuredContent");
    expect(rendered).not.toContain("contentText[");
  });

  it("reports the final measurement after a compact-json tombstone fallback", () => {
    const guardOptions = {
      maxBytes: 80,
      maxTokens: 1000,
      format: "compact-json" as const,
      strategy: "lossless-first" as const,
      onBudgetExceeded: "tombstone" as const,
    };

    const result = guardCallToolResult(
      {
        content: [],
        structuredContent: {
          payload: "x".repeat(1000),
        },
      },
      guardOptions,
    );

    expectFinalMeasurement(result, guardOptions);
  });

  it("keeps full embedded tombstone measurements self-consistent", () => {
    const guardOptions = {
      maxBytes: 500,
      maxTokens: 1000,
      format: "compact-json" as const,
      strategy: "lossless-first" as const,
      onBudgetExceeded: "tombstone" as const,
    };

    const result = guardCallToolResult(
      {
        content: [],
        structuredContent: {
          payload: "x".repeat(1000),
        },
      },
      guardOptions,
    );

    const text = textOf(result);
    const parsed = JSON.parse(text) as unknown;

    if (
      !isRecord(parsed) ||
      !isRecord(parsed._guard_meta)
    ) {
      throw new Error("Expected full embedded guard metadata.");
    }

    const measurement = measureGuardText(
      text,
      resolveGuardOptions(guardOptions),
    );

    expect(parsed._guard_meta.retained_bytes).toBe(
      measurement.bytes,
    );
    expect(parsed._guard_meta.estimated_tokens).toBe(
      measurement.estimatedTokens,
    );

    expectFinalMeasurement(result, guardOptions);
  });

  it("reports the final measurement after raw hard truncation", () => {
    const guardOptions = {
      maxBytes: 17,
      maxTokens: 1000,
      format: "raw" as const,
      strategy: "lossless-first" as const,
      onBudgetExceeded: "truncate-bytes" as const,
    };

    const result = guardCallToolResult(
      {
        content: [
          {
            type: "text",
            text: "🙂abcdef".repeat(100),
          },
        ],
      },
      guardOptions,
    );

    const text = textOf(result);

    expect(
      new TextEncoder().encode(text).length,
    ).toBeLessThanOrEqual(17);

    expectFinalMeasurement(result, guardOptions);
  });

  it("keeps compact-json valid under truncate-bytes policy and reports final size", () => {
    const guardOptions = {
      maxBytes: 32,
      maxTokens: 1000,
      format: "compact-json" as const,
      strategy: "lossless-first" as const,
      onBudgetExceeded: "truncate-bytes" as const,
    };

    const result = guardCallToolResult(
      {
        content: [],
        structuredContent: {
          payload: "x".repeat(1000),
        },
      },
      guardOptions,
    );

    expect(() => JSON.parse(textOf(result))).not.toThrow();
    expectFinalMeasurement(result, guardOptions);
  });
});
