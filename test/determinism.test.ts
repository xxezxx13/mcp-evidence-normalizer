import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  normalizeMcpResult,
  renderEvidence,
} from "../src/index.js";

describe("deterministic normalization", () => {
  it("produces byte-equivalent normalized output repeatedly", () => {
    const input = {
      content: [
        {
          type: "text",
          text: "alpha",
        },
        {
          type: "future-block",
          value: 17,
        },
        {
          type: "text",
          text: "beta",
        },
      ],
      structuredContent: {
        nested: {
          enabled: true,
          count: 3,
        },
        items: ["one", "two"],
      },
      vendorExtension: {
        retained: true,
      },
      isError: false,
    };

    const options = {
      toolName: "example_tool",
      serverName: "example_server",
      maxChars: 80,
    };

    const baseline = JSON.stringify(
      normalizeMcpResult(input, options),
    );

    for (let iteration = 0; iteration < 100; iteration += 1) {
      expect(
        JSON.stringify(normalizeMcpResult(input, options)),
      ).toBe(baseline);
    }
  });

  it("produces byte-equivalent rendered output repeatedly", () => {
    const input = {
      content: [
        {
          type: "text",
          text: "first",
        },
        {
          type: "text",
          text: "second",
        },
      ],
      structuredContent: {
        answer: 42,
      },
    };

    const evidence = normalizeMcpResult(input);
    const baseline = renderEvidence(evidence);

    for (let iteration = 0; iteration < 100; iteration += 1) {
      expect(
        renderEvidence(normalizeMcpResult(input)),
      ).toBe(baseline);
    }
  });

  it("keeps warning ordering deterministic", () => {
    const input = {
      content: [
        {
          type: "future-a",
        },
        {
          type: "text",
          text: "alpha",
        },
        {
          type: "future-b",
        },
      ],
      firstExtension: true,
      secondExtension: false,
    };

    const expected = [
      "Unrecognized MCP content block at index 0 preserved as unknown",
      "Unrecognized MCP content block at index 2 preserved as unknown",
      'Unrecognized MCP result property "firstExtension" preserved as unknown',
      'Unrecognized MCP result property "secondExtension" preserved as unknown',
    ];

    for (let iteration = 0; iteration < 25; iteration += 1) {
      expect(normalizeMcpResult(input).warnings).toEqual(expected);
    }
  });
});

describe("blind evidence regression matrix", () => {
  it("recovers a nonce from nested structured content", () => {
    const nonce =
      `VALUE-${randomBytes(16).toString("hex").toUpperCase()}`;

    const structuredContent = {
      outer: {
        inner: {
          nonce,
        },
      },
    };

    const evidence = normalizeMcpResult({
      content: [],
      structuredContent,
    });

    expect(evidence.blocks).toEqual([
      {
        type: "json",
        value: structuredContent,
      },
    ]);

    expect(evidence.text).toContain(nonce);
    expect(renderEvidence(evidence)).toContain(nonce);
  });

  it("recovers a nonce across multiple text blocks without reordering", () => {
    const nonce =
      `VALUE-${randomBytes(16).toString("hex").toUpperCase()}`;

    const evidence = normalizeMcpResult({
      content: [
        {
          type: "text",
          text: "before",
        },
        {
          type: "text",
          text: nonce,
        },
        {
          type: "text",
          text: "after",
        },
      ],
    });

    const expected = `before\n\n${nonce}\n\nafter`;

    expect(evidence.text).toBe(expected);
    expect(renderEvidence(evidence)).toBe(expected);
  });

  it("recovers the complete nonce exactly at a truncation boundary", () => {
    const nonce =
      `VALUE-${randomBytes(16).toString("hex").toUpperCase()}`;

    const before = "prefix";
    const completeNonceBoundary = `${before}\n\n${nonce}`.length;

    const evidence = normalizeMcpResult(
      {
        content: [
          {
            type: "text",
            text: before,
          },
          {
            type: "text",
            text: nonce,
          },
          {
            type: "text",
            text: "after",
          },
        ],
      },
      {
        maxChars: completeNonceBoundary,
      },
    );

    const rendered = renderEvidence(evidence);

    expect(rendered).toBe(`${before}\n\n${nonce}`);
    expect(rendered).toContain(nonce);
    expect(rendered).toHaveLength(completeNonceBoundary);
    expect(evidence.truncated).toBe(true);
  });

  it("preserves a blind nonce inside unknown content", () => {
    const nonce =
      `VALUE-${randomBytes(16).toString("hex").toUpperCase()}`;

    const original = {
      type: "future-content",
      payload: {
        nonce,
      },
    };

    const evidence = normalizeMcpResult({
      content: [original],
    });

    expect(evidence.blocks[0]).toEqual({
      type: "unknown",
      value: original,
    });

    if (evidence.blocks[0]?.type !== "unknown") {
      throw new Error("Expected unknown evidence block");
    }

    expect(
      JSON.stringify(evidence.blocks[0].value),
    ).toContain(nonce);
  });
});
