import {
  describe,
  expect,
  it,
} from "vitest";

import {
  clampTextToGuardBudget,
  compactValue,
  guardCallToolResult,
  normalizeMcpResult,
  pruneEmptyValues,
  renderCompactJson,
  resolveGuardOptions,
  utf8ByteLength,
} from "../src/index.js";

const CYCLE_MESSAGE =
  "Cyclic evidence structures are not supported";

const DEPTH_MESSAGE =
  "Evidence nesting depth exceeds 1024 container levels";

function cyclicRecord():
  Record<string, unknown> {
  const value:
    Record<string, unknown> = {
      marker: "cycle",
    };

  value.self = value;

  return value;
}

function nestedValue(
  depth: number,
): unknown {
  let value: unknown = true;

  for (
    let index = 0;
    index < depth;
    index += 1
  ) {
    value = {
      child: value,
    };
  }

  return value;
}

describe("adversarial structure handling", () => {
  it(
    "accepts shared references that do not form a cycle",
    () => {
      const shared = {
        marker: "shared",
      };

      const value = {
        left: shared,
        right: shared,
      };

      expect(
        renderCompactJson(
          compactValue(value),
        ),
      ).toBe(
        '{"left":{"marker":"shared"},"right":{"marker":"shared"}}',
      );
    },
  );

  it(
    "rejects true cycles deterministically during canonicalization",
    () => {
      expect(
        () => compactValue(cyclicRecord()),
      ).toThrow(
        new TypeError(CYCLE_MESSAGE),
      );

      expect(
        () => pruneEmptyValues(cyclicRecord()),
      ).toThrow(
        new TypeError(CYCLE_MESSAGE),
      );
    },
  );

  it(
    "rejects cyclic guard structuredContent before stack exhaustion",
    () => {
      const cyclic = cyclicRecord();

      expect(
        () =>
          guardCallToolResult({
            content: [],
            structuredContent: cyclic,
          }),
      ).toThrow(
        new TypeError(CYCLE_MESSAGE),
      );
    },
  );

  it(
    "keeps legacy normalization tolerant of cyclic structuredContent",
    () => {
      const cyclic = cyclicRecord();

      const evidence =
        normalizeMcpResult({
          content: [],
          structuredContent: cyclic,
        });

      expect(
        evidence.warnings,
      ).toContain(
        "MCP structuredContent was not valid renderable JSON and was preserved as unknown",
      );

      expect(
        evidence.blocks,
      ).toContainEqual({
        type: "unknown",
        value: cyclic,
      });
    },
  );

  it(
    "accepts 1024 container levels and rejects the 1025th",
    () => {
      expect(
        () =>
          compactValue(
            nestedValue(1_024),
          ),
      ).not.toThrow();

      expect(
        () =>
          compactValue(
            nestedValue(1_025),
          ),
      ).toThrow(
        new RangeError(DEPTH_MESSAGE),
      );
    },
  );

  it(
    "clamps UTF-8 without splitting Unicode code points",
    () => {
      const options =
        resolveGuardOptions({
          maxBytes: 5,
          maxTokens: 10_000,
        });

      const clamped =
        clampTextToGuardBudget(
          "😀😀",
          options,
        );

      expect(clamped).toBe("😀");

      expect(
        utf8ByteLength(clamped),
      ).toBe(4);

      expect(
        clamped.includes("\uFFFD"),
      ).toBe(false);
    },
  );
});
