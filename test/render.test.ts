import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  normalizeMcpResult,
  renderEvidence,
} from "../src/index.js";

describe("plain-text rendering", () => {
  it("renders normalized text exactly", () => {
    const evidence = normalizeMcpResult({
      content: [
        {
          type: "text",
          text: "alpha",
        },
        {
          type: "text",
          text: "beta",
        },
      ],
    });

    expect(renderEvidence(evidence)).toBe("alpha\n\nbeta");
  });

  it("renders structured evidence using the normalized representation", () => {
    const structuredContent = {
      alpha: true,
      count: 2,
    };

    const evidence = normalizeMcpResult({
      content: [],
      structuredContent,
    });

    expect(renderEvidence(evidence)).toBe(
      JSON.stringify(structuredContent, null, 2),
    );
  });

  it("does not append warnings to evidence text", () => {
    const evidence = normalizeMcpResult({
      content: [
        {
          type: "future-block",
          payload: "preserved",
        },
      ],
    });

    expect(evidence.warnings.length).toBeGreaterThan(0);
    expect(renderEvidence(evidence)).toBe("");
  });

  it("does not transform textual error evidence", () => {
    const evidence = normalizeMcpResult({
      content: [
        {
          type: "text",
          text: "Requested item was not found",
        },
      ],
      isError: true,
    });

    expect(evidence.isError).toBe(true);
    expect(renderEvidence(evidence)).toBe(
      "Requested item was not found",
    );
  });

  it("preserves the normalization character budget exactly", () => {
    const evidence = normalizeMcpResult(
      {
        content: [
          {
            type: "text",
            text: "0123456789",
          },
        ],
      },
      {
        maxChars: 4,
      },
    );

    const rendered = renderEvidence(evidence);

    expect(rendered).toBe("0123");
    expect(rendered).toHaveLength(4);
    expect(evidence.truncated).toBe(true);
  });

  it("returns an empty string for empty evidence", () => {
    const evidence = normalizeMcpResult({
      content: [],
    });

    expect(renderEvidence(evidence)).toBe("");
  });

  it("does not mutate normalized evidence", () => {
    const evidence = normalizeMcpResult({
      content: [
        {
          type: "text",
          text: "alpha",
        },
      ],
      structuredContent: {
        value: 42,
      },
    });

    const before = JSON.stringify(evidence);

    renderEvidence(evidence);

    expect(JSON.stringify(evidence)).toBe(before);
  });

  it("recovers a blind nonce byte-for-byte from normalized evidence", () => {
    const nonce =
      `VALUE-${randomBytes(16).toString("hex").toUpperCase()}`;

    const evidence = normalizeMcpResult({
      content: [
        {
          type: "text",
          text: nonce,
        },
      ],
    });

    expect(renderEvidence(evidence)).toBe(nonce);
  });
});
