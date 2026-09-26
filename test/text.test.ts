import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { normalizeMcpResult } from "../src/index.js";

describe("text normalization", () => {
  it("normalizes one standard MCP text block", () => {
    const evidence = normalizeMcpResult({
      content: [
        {
          type: "text",
          text: "alpha",
        },
      ],
    });

    expect(evidence).toEqual({
      text: "alpha",
      blocks: [
        {
          type: "text",
          text: "alpha",
        },
      ],
      isError: false,
      truncated: false,
      warnings: [],
    });
  });

  it("preserves multiple text blocks in source order", () => {
    const evidence = normalizeMcpResult({
      content: [
        {
          type: "text",
          text: "one",
        },
        {
          type: "text",
          text: "two",
        },
        {
          type: "text",
          text: "three",
        },
      ],
    });

    expect(evidence.text).toBe("one\n\ntwo\n\nthree");
    expect(evidence.blocks).toEqual([
      {
        type: "text",
        text: "one",
      },
      {
        type: "text",
        text: "two",
      },
      {
        type: "text",
        text: "three",
      },
    ]);
  });

  it("preserves text exactly, including Unicode and newlines", () => {
    const text = "alpha\nβeta\n日本語\nline four";

    const evidence = normalizeMcpResult({
      content: [
        {
          type: "text",
          text,
        },
      ],
    });

    expect(evidence.text).toBe(text);
    expect(evidence.blocks[0]).toEqual({
      type: "text",
      text,
    });
  });

  it("preserves empty text blocks as text evidence", () => {
    const evidence = normalizeMcpResult({
      content: [
        {
          type: "text",
          text: "",
        },
      ],
    });

    expect(evidence.text).toBe("");
    expect(evidence.blocks).toEqual([
      {
        type: "text",
        text: "",
      },
    ]);
    expect(evidence.warnings).toEqual([]);
  });

  it("represents an empty result explicitly without treating it as an error", () => {
    const evidence = normalizeMcpResult({
      content: [],
    });

    expect(evidence).toEqual({
      text: "",
      blocks: [],
      isError: false,
      truncated: false,
      warnings: [
        "MCP result contained no renderable evidence",
      ],
    });
  });

  it("attaches caller-supplied provenance without inferring it", () => {
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
        toolName: "search_memory",
        serverName: "memory-server",
      },
    );

    expect(evidence.source).toEqual({
      tool: "search_memory",
      server: "memory-server",
    });
  });
});

describe("blind evidence recovery", () => {
  it("recovers an unpredictable nonce exactly from an MCP text block", () => {
    const nonce = `VALUE-${randomBytes(16).toString("hex").toUpperCase()}`;

    const result = {
      content: [
        {
          type: "text",
          text: nonce,
        },
      ],
    };

    const evidence = normalizeMcpResult(result);

    expect(evidence.text).toBe(nonce);
    expect(evidence.blocks).toEqual([
      {
        type: "text",
        text: nonce,
      },
    ]);
  });

  it("recovers an unpredictable nonce from its original block position", () => {
    const nonce = `VALUE-${randomBytes(16).toString("hex").toUpperCase()}`;

    const result = {
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
    };

    const evidence = normalizeMcpResult(result);

    expect(evidence.text).toBe(`before\n\n${nonce}\n\nafter`);
    expect(evidence.blocks[1]).toEqual({
      type: "text",
      text: nonce,
    });
  });
});
