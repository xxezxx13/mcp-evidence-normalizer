import { describe, expect, it } from "vitest";

import type { CallToolResult } from "@modelcontextprotocol/client";

import {
  normalizeMcpResult,
  renderEvidence,
} from "../src/index.js";

describe("official MCP CallToolResult compatibility", () => {
  it("accepts an official CallToolResult structurally", () => {
    const result: CallToolResult = {
      content: [
        {
          type: "text",
          text: "official MCP evidence",
        },
      ],
      isError: false,
    };

    const evidence = normalizeMcpResult(result);

    expect(renderEvidence(evidence)).toBe(
      "official MCP evidence",
    );
    expect(evidence.isError).toBe(false);
  });

  it("accepts official structuredContent without an adapter", () => {
    const result: CallToolResult = {
      content: [
        {
          type: "text",
          text: "structured result",
        },
      ],
      structuredContent: {
        answer: 42,
        source: "official-sdk-shape",
      },
    };

    const evidence = normalizeMcpResult(result);

    expect(evidence.blocks).toEqual([
      {
        type: "text",
        text: "structured result",
      },
      {
        type: "json",
        value: {
          answer: 42,
          source: "official-sdk-shape",
        },
      },
    ]);
  });

  it.each([
    [
      "embedded text resource",
      {
        type: "resource",
        resource: {
          uri: "file:///notes/example.md",
          mimeType: "text/markdown",
          text: "# Example",
        },
      },
    ],
    [
      "embedded blob resource",
      {
        type: "resource",
        resource: {
          uri: "file:///images/example.bin",
          mimeType: "application/octet-stream",
          blob: "AAECAw==",
        },
      },
    ],
    [
      "resource link",
      {
        type: "resource_link",
        uri: "file:///notes/example.md",
        name: "example.md",
      },
    ],
    [
      "image",
      {
        type: "image",
        data: "AAECAw==",
        mimeType: "image/png",
      },
    ],
    [
      "audio",
      {
        type: "audio",
        data: "AAECAw==",
        mimeType: "audio/wav",
      },
    ],
  ] satisfies Array<
    readonly [
      string,
      CallToolResult["content"][number],
    ]
  >)(
    "preserves official non-text content as unknown: %s",
    (_label, block) => {
      const result: CallToolResult = {
        content: [block],
      };

      const evidence = normalizeMcpResult(result);

      expect(evidence.blocks).toEqual([
        {
          type: "unknown",
          value: block,
        },
      ]);

      expect(evidence.text).toBe("");

      expect(evidence.warnings).toEqual([
        "Unrecognized MCP content block at index 0 preserved as unknown",
        "MCP result contained no renderable evidence",
      ]);
    },
  );

  it("accepts official error results without an adapter", () => {
    const result: CallToolResult = {
      content: [
        {
          type: "text",
          text: "tool failed",
        },
      ],
      isError: true,
    };

    const evidence = normalizeMcpResult(result);

    expect(evidence.isError).toBe(true);
    expect(renderEvidence(evidence)).toBe("tool failed");
  });
});
