import { describe, expect, it } from "vitest";

import { normalizeMcpResult } from "../src/index.js";

describe("unknown content preservation", () => {
  it("preserves an unknown MCP content type", () => {
    const original = {
      type: "future-block",
      payload: {
        value: 42,
      },
    };

    const evidence = normalizeMcpResult({
      content: [original],
    });

    expect(evidence.text).toBe("");
    expect(evidence.blocks).toEqual([
      {
        type: "unknown",
        value: original,
      },
    ]);
    expect(evidence.warnings).toEqual([
      "Unrecognized MCP content block at index 0 preserved as unknown",
      "MCP result contained no renderable evidence",
    ]);
    expect(evidence.isError).toBe(false);
  });

  it("preserves malformed text blocks instead of silently deleting them", () => {
    const malformed = {
      type: "text",
      text: 42,
    };

    const evidence = normalizeMcpResult({
      content: [malformed],
    });

    expect(evidence.blocks).toEqual([
      {
        type: "unknown",
        value: malformed,
      },
    ]);
    expect(evidence.warnings[0]).toBe(
      "Unrecognized MCP content block at index 0 preserved as unknown",
    );
  });

  it("preserves primitive content entries", () => {
    const evidence = normalizeMcpResult({
      content: [
        null,
        true,
        17,
        "raw-string",
      ],
    });

    expect(evidence.blocks).toEqual([
      {
        type: "unknown",
        value: null,
      },
      {
        type: "unknown",
        value: true,
      },
      {
        type: "unknown",
        value: 17,
      },
      {
        type: "unknown",
        value: "raw-string",
      },
    ]);

    expect(evidence.warnings).toEqual([
      "Unrecognized MCP content block at index 0 preserved as unknown",
      "Unrecognized MCP content block at index 1 preserved as unknown",
      "Unrecognized MCP content block at index 2 preserved as unknown",
      "Unrecognized MCP content block at index 3 preserved as unknown",
      "MCP result contained no renderable evidence",
    ]);
  });

  it("preserves mixed recognized and unknown blocks in source order", () => {
    const unknown = {
      type: "future-block",
      value: "middle",
    };

    const evidence = normalizeMcpResult({
      content: [
        {
          type: "text",
          text: "before",
        },
        unknown,
        {
          type: "text",
          text: "after",
        },
      ],
    });

    expect(evidence.blocks).toEqual([
      {
        type: "text",
        text: "before",
      },
      {
        type: "unknown",
        value: unknown,
      },
      {
        type: "text",
        text: "after",
      },
    ]);

    expect(evidence.text).toBe("before\n\nafter");
    expect(evidence.warnings).toEqual([
      "Unrecognized MCP content block at index 1 preserved as unknown",
    ]);
  });

  it("preserves malformed non-array content", () => {
    const malformedContent = {
      unexpected: "shape",
    };

    const evidence = normalizeMcpResult({
      content: malformedContent,
    });

    expect(evidence.blocks).toEqual([
      {
        type: "unknown",
        value: malformedContent,
      },
    ]);

    expect(evidence.warnings).toEqual([
      "MCP result content was not an array and was preserved as unknown",
      "MCP result contained no renderable evidence",
    ]);
  });
});

describe("top-level result preservation", () => {
  it("preserves unexpected top-level result properties", () => {
    const evidence = normalizeMcpResult({
      content: [
        {
          type: "text",
          text: "alpha",
        },
      ],
      vendorExtension: {
        nonce: "VALUE-EXTENSION",
      },
    });

    expect(evidence.blocks).toEqual([
      {
        type: "text",
        text: "alpha",
      },
      {
        type: "unknown",
        value: {
          vendorExtension: {
            nonce: "VALUE-EXTENSION",
          },
        },
      },
    ]);

    expect(evidence.warnings).toEqual([
      'Unrecognized MCP result property "vendorExtension" preserved as unknown',
    ]);
  });

  it("does not treat MCP metadata or resultType as evidence", () => {
    const evidence = normalizeMcpResult({
      content: [
        {
          type: "text",
          text: "alpha",
        },
      ],
      _meta: {
        transportDetail: true,
      },
      resultType: "complete",
    });

    expect(evidence.blocks).toEqual([
      {
        type: "text",
        text: "alpha",
      },
    ]);

    expect(evidence.warnings).toEqual([]);
  });

  it.each([
    null,
    true,
    17,
    "raw-result",
    [1, 2, 3],
  ])("preserves non-object input: %j", (value) => {
    const evidence = normalizeMcpResult(value);

    expect(evidence.blocks).toEqual([
      {
        type: "unknown",
        value,
      },
    ]);

    expect(evidence.warnings).toEqual([
      "MCP result was not an object and was preserved as unknown",
      "MCP result contained no renderable evidence",
    ]);
  });
});
