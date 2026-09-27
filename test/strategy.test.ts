import {
  describe,
  expect,
  it,
} from "vitest";

import {
  guardCallToolResult,
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
  if (
    !isRecord(result) ||
    !Array.isArray(result.content)
  ) {
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

describe("guard strategies", () => {
  it("supports only adaptive and lossless-first", () => {
    expect(
      resolveGuardOptions({
        strategy: "adaptive",
      }).strategy,
    ).toBe("adaptive");

    expect(
      resolveGuardOptions({
        strategy: "lossless-first",
      }).strategy,
    ).toBe("lossless-first");

    for (const strategy of [
      "hard-cap",
      "lossy-degrade",
    ]) {
      const unsupported = {
        strategy,
      } as unknown as Parameters<
        typeof resolveGuardOptions
      >[0];

      expect(
        () => resolveGuardOptions(unsupported),
      ).toThrow(
        "GuardOptions.strategy must be adaptive or lossless-first",
      );
    }
  });

  it("keeps adaptive and lossless-first behavior distinct", () => {
    const source = {
      content: [],
      structuredContent: {
        id: "strategy-test",
        discard: "d".repeat(300),
        payload: "p".repeat(600),
      },
    };

    const shared = {
      maxBytes: 300,
      maxTokens: 10_000,
      format: "compact-json" as const,
      onBudgetExceeded: "tombstone" as const,
      fieldPriorities: {
        discard: "p2" as const,
      },
    };

    const adaptive = guardCallToolResult(
      source,
      {
        ...shared,
        strategy: "adaptive",
      },
    );

    const lossless = guardCallToolResult(
      source,
      {
        ...shared,
        strategy: "lossless-first",
      },
    );

    expect(textOf(adaptive)).toContain(
      '"id":"strategy-test"',
    );

    expect(textOf(adaptive)).not.toContain(
      '"discard"',
    );

    expect(textOf(lossless)).not.toContain(
      '"id":"strategy-test"',
    );

    expect(textOf(lossless)).toContain(
      '"_guard_meta"',
    );
  });

  it(
    "handles wide explicit-p2 evidence without repeated full-tree selection",
    { timeout: 2_000 },
    () => {
      const structuredContent:
        Record<string, string> = {};
      const fieldPriorities:
        Record<string, "p2"> = {};

      for (
        let index = 0;
        index < 400;
        index += 1
      ) {
        const key = `field_${index}`;

        structuredContent[key] =
          "x".repeat(80);

        fieldPriorities[key] = "p2";
      }

      const result = guardCallToolResult(
        {
          content: [],
          structuredContent,
        },
        {
          maxBytes: 500,
          maxTokens: 100_000,
          format: "compact-json",
          strategy: "adaptive",
          onBudgetExceeded: "tombstone",
          fieldPriorities,
        },
      );

      const text = textOf(result);
      const bytes =
        new TextEncoder().encode(text).length;

      expect(bytes).toBeLessThanOrEqual(500);

      const meta = guardMeta(result);

      expect(
        meta.omitted_field_count,
      ).toBe(395);
    },
  );
});
