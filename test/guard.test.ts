import { describe, expect, it } from "vitest";

import type { CallToolResult } from "@modelcontextprotocol/client";

import {
  estimateTokens,
  guardCallToolResult,
  tabularize,
  utf8ByteLength,
  withEvidenceGuard,
} from "../src/index.js";

function firstText(result: CallToolResult): string {
  const block = result.content.find(
    (candidate) => candidate.type === "text",
  );

  if (block === undefined || block.type !== "text") {
    throw new Error("expected text content block");
  }

  return block.text;
}

describe("lossless-first compaction", () => {
  it("tabularizes homogeneous object arrays and reduces estimated tokens", () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      account_identifier: index + 1,
      customer_display_name: `Customer ${index + 1}`,
      subscription_state: index % 2 === 0 ? "active" : "paused",
      region_identifier: `region-${index % 8}`,
      plan_identifier: `plan-${index % 5}`,
      seats_allocated: 10 + index,
    }));

    const table = tabularize(rows);

    expect(table).not.toBeNull();
    expect(table?.rows).toHaveLength(100);
    expect(table?.columns).toEqual([
      "account_identifier",
      "customer_display_name",
      "plan_identifier",
      "region_identifier",
      "seats_allocated",
      "subscription_state",
    ]);

    const verboseJson = JSON.stringify(rows, null, 2);
    expect(estimateTokens(table?.markdown ?? "")).toBeLessThan(
      estimateTokens(verboseJson),
    );
    expect(table?.markdown).toContain("Customer 100");
    expect(table?.markdown).toContain("plan-4");
  });
});

describe("budget degradation", () => {
  it("emits tombstone metadata and stays inside a strict byte budget", () => {
    const rows = Array.from({ length: 80 }, (_, index) => ({
      id: index,
      name: `user-${index}`,
      value: `VALUE-${String(index).padStart(4, "0")}-${"x".repeat(24)}`,
      debug_trace: `trace-${index}-${"d".repeat(80)}`,
    }));

    const original: CallToolResult = {
      content: [
        {
          type: "text",
          text: JSON.stringify(rows),
        },
      ],
      isError: false,
    };

    const guarded = guardCallToolResult(original, {
      maxBytes: 700,
      maxTokens: 10_000,
      format: "compact-json",
      strategy: "adaptive",
      fieldPriorities: {
        debug_trace: "p2",
      },
      onBudgetExceeded: "tombstone",
    });

    const text = firstText(guarded);

    expect(utf8ByteLength(text)).toBeLessThanOrEqual(700);
    expect(guarded.isError).toBe(false);
    expect(guarded._meta).toBeDefined();

    const meta = guarded._meta as Record<string, unknown>;
    const guardMeta = meta.evidenceGuard as Record<string, unknown>;

    expect(guardMeta.status).toBe("truncated_to_budget");
    expect(
      Array.isArray(guardMeta.omitted_fields) ||
        typeof guardMeta.omitted_items === "number",
    ).toBe(true);
    expect(() => JSON.parse(text) as unknown).not.toThrow();
  });

  it("never removes p0 fields during priority pruning", () => {
    const original: CallToolResult = {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            critical_nonce: `VALUE-${"A".repeat(80)}`,
            debug_trace: "d".repeat(400),
          }),
        },
      ],
    };

    const guarded = guardCallToolResult(original, {
      maxBytes: 220,
      maxTokens: 10_000,
      format: "compact-json",
      fieldPriorities: {
        critical_nonce: "p0",
        debug_trace: "p2",
      },
    });

    expect(firstText(guarded)).toContain("critical_nonce");
    expect(firstText(guarded)).toContain("VALUE-");
  });
});

describe("MCP client interception", () => {
  it("preserves the standard result envelope and the client's static surface", async () => {
    const rawClient = {
      name: "fake-client",
      async callTool(request: { name: string }): Promise<CallToolResult> {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify([
                { id: 1, name: "alpha" },
                { id: 2, name: "beta" },
              ]),
            },
          ],
          isError: false,
          _meta: {
            requestId: `request-${request.name}`,
          },
        };
      },
      close(): string {
        return this.name;
      },
    };

    const guardedClient = withEvidenceGuard(rawClient, {
      maxTokens: 500,
      format: "markdown-table",
    });

    const result: CallToolResult = await guardedClient.callTool({
      name: "query_database",
    });

    expect(guardedClient.name).toBe("fake-client");
    expect(guardedClient.close()).toBe("fake-client");
    expect(result.isError).toBe(false);
    expect(result.content).toHaveLength(1);
    expect(firstText(result)).toContain("| id | name |");
    expect(result._meta).toMatchObject({
      requestId: "request-query_database",
    });
  });
});
