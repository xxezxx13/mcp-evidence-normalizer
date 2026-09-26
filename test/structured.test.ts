import { describe, expect, it } from "vitest";

import { normalizeMcpResult } from "../src/index.js";

describe("structured content", () => {
  it("preserves and renders structured object content", () => {
    const structuredContent = {
      count: 2,
      items: ["alpha", "beta"],
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

    expect(evidence.text).toBe(
      JSON.stringify(structuredContent, null, 2),
    );

    expect(evidence.warnings).toEqual([]);
  });

  it("supports structured arrays and nested JSON values", () => {
    const structuredContent = [
      {
        active: true,
        score: 17,
        detail: null,
      },
      ["nested", false, 0],
    ];

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

    expect(evidence.text).toBe(
      JSON.stringify(structuredContent, null, 2),
    );
  });

  it.each([
    ["string", "alpha"],
    ["number", 42],
    ["zero", 0],
    ["boolean true", true],
    ["boolean false", false],
    ["null", null],
  ])("supports structured JSON primitive: %s", (_label, value) => {
    const evidence = normalizeMcpResult({
      content: [],
      structuredContent: value,
    });

    expect(evidence.blocks).toEqual([
      {
        type: "json",
        value,
      },
    ]);

    expect(evidence.text).toBe(JSON.stringify(value, null, 2));
    expect(evidence.warnings).toEqual([]);
  });

  it("renders text content before structured content deterministically", () => {
    const structuredContent = {
      answer: 42,
    };

    const evidence = normalizeMcpResult({
      content: [
        {
          type: "text",
          text: "Readable evidence",
        },
      ],
      structuredContent,
    });

    expect(evidence.blocks).toEqual([
      {
        type: "text",
        text: "Readable evidence",
      },
      {
        type: "json",
        value: structuredContent,
      },
    ]);

    expect(evidence.text).toBe(
      `Readable evidence\n\n${JSON.stringify(structuredContent, null, 2)}`,
    );
  });

  it("renders exact text and structured duplicates only once", () => {
    const structuredContent = {
      schema_version: "1",
      status: "ok",
      items: ["alpha", "beta"],
    };

    const rendered = JSON.stringify(structuredContent, null, 2);

    const evidence = normalizeMcpResult({
      content: [
        {
          type: "text",
          text: rendered,
        },
      ],
      structuredContent,
    });

    expect(evidence.blocks).toEqual([
      {
        type: "text",
        text: rendered,
      },
      {
        type: "json",
        value: structuredContent,
      },
    ]);

    expect(evidence.text).toBe(rendered);
    expect(evidence.warnings).toEqual([]);
  });

  it("does not deduplicate near-match text and structured evidence", () => {
    const structuredContent = {
      answer: 42,
    };

    const rendered = JSON.stringify(structuredContent, null, 2);
    const nearMatch = `${rendered}\n`;

    const evidence = normalizeMcpResult({
      content: [
        {
          type: "text",
          text: nearMatch,
        },
      ],
      structuredContent,
    });

    expect(evidence.blocks).toEqual([
      {
        type: "text",
        text: nearMatch,
      },
      {
        type: "json",
        value: structuredContent,
      },
    ]);

    expect(evidence.text).toBe(`${nearMatch}\n\n${rendered}`);
  });

  it("preserves malformed non-JSON structured content as unknown", () => {
    const malformed = {
      value: 10n,
    };

    const evidence = normalizeMcpResult({
      content: [],
      structuredContent: malformed,
    });

    expect(evidence.blocks).toEqual([
      {
        type: "unknown",
        value: malformed,
      },
    ]);

    expect(evidence.warnings).toEqual([
      "MCP structuredContent was not valid renderable JSON and was preserved as unknown",
      "MCP result contained no renderable evidence",
    ]);
  });
});
