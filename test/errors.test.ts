import { describe, expect, it } from "vitest";

import { normalizeMcpResult } from "../src/index.js";

describe("tool error normalization", () => {
  it("marks textual tool errors explicitly", () => {
    const evidence = normalizeMcpResult({
      content: [
        {
          type: "text",
          text: "No note with that id",
        },
      ],
      isError: true,
    });

    expect(evidence.text).toBe("No note with that id");
    expect(evidence.isError).toBe(true);
    expect(evidence.warnings).toEqual([]);
  });

  it("preserves structured detail on an error result", () => {
    const detail = {
      code: "NOT_FOUND",
      retryable: false,
    };

    const evidence = normalizeMcpResult({
      content: [
        {
          type: "text",
          text: "Requested item was not found",
        },
      ],
      structuredContent: detail,
      isError: true,
    });

    expect(evidence.isError).toBe(true);

    expect(evidence.blocks).toEqual([
      {
        type: "text",
        text: "Requested item was not found",
      },
      {
        type: "json",
        value: detail,
      },
    ]);
  });

  it("represents an empty tool error without making it look successful", () => {
    const evidence = normalizeMcpResult({
      content: [],
      isError: true,
    });

    expect(evidence.text).toBe("");
    expect(evidence.blocks).toEqual([]);
    expect(evidence.isError).toBe(true);
    expect(evidence.warnings).toEqual([
      "MCP result indicated an error but contained no renderable evidence",
    ]);
  });

  it("defaults an absent isError field to false", () => {
    const evidence = normalizeMcpResult({
      content: [
        {
          type: "text",
          text: "success",
        },
      ],
    });

    expect(evidence.isError).toBe(false);
  });

  it("preserves a malformed isError value instead of trusting it", () => {
    const evidence = normalizeMcpResult({
      content: [],
      isError: "yes",
    });

    expect(evidence.isError).toBe(false);

    expect(evidence.blocks).toEqual([
      {
        type: "unknown",
        value: {
          isError: "yes",
        },
      },
    ]);

    expect(evidence.warnings).toEqual([
      "MCP result isError was not boolean and was preserved as unknown",
      "MCP result contained no renderable evidence",
    ]);
  });
});
