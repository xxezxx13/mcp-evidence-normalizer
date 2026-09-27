import { describe, expect, it } from "vitest";

import type {
  EvidenceBlock,
  NormalizedEvidence,
  NormalizeOptions,
} from "../src/index.js";

describe("canonical evidence types", () => {
  it("represent the intended original evidence contract", () => {
    const blocks: EvidenceBlock[] = [
      {
        type: "text",
        text: "alpha",
      },
      {
        type: "json",
        value: {
          count: 2,
        },
      },
      {
        type: "unknown",
        value: {
          type: "resource",
          resource: {
            uri: "file:///example.md",
            mimeType: "text/markdown",
            text: "beta",
          },
        },
      },
      {
        type: "unknown",
        value: {
          type: "future-mcp-block",
        },
      },
    ];

    const evidence: NormalizedEvidence = {
      text: "alpha",
      blocks,
      isError: false,
      truncated: false,
      warnings: [],
      source: {
        tool: "search_memory",
        server: "example-server",
      },
    };

    const options: NormalizeOptions = {
      toolName: "search_memory",
      serverName: "example-server",
      maxChars: 12_000,
    };

    expect(evidence.blocks).toHaveLength(4);
    expect(evidence.text).toBe("alpha");
    expect(options.maxChars).toBe(12_000);
  });

  it("allows source metadata to be omitted", () => {
    const evidence: NormalizedEvidence = {
      text: "",
      blocks: [],
      isError: false,
      truncated: false,
      warnings: [],
    };

    expect(evidence.source).toBeUndefined();
  });
});
