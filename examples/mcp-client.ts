import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

import type { CallToolResult } from "@modelcontextprotocol/client";

import {
  normalizeMcpResult,
  renderEvidence,
} from "../src/index.js";

async function main(): Promise<void> {
  const endpoint = process.argv[2];
  const toolName = process.argv[3];
  const rawArguments = process.argv[4] ?? "{}";

  if (endpoint === undefined || toolName === undefined) {
    console.error(
      "Usage: node examples/mcp-client.js <mcp-url> <tool-name> '[arguments-json]'",
    );
    process.exitCode = 1;
    return;
  }

  let toolArguments: Record<string, unknown>;

  try {
    const parsed: unknown = JSON.parse(rawArguments);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new TypeError("tool arguments must be a JSON object");
    }

    toolArguments = parsed as Record<string, unknown>;
  } catch (error) {
    console.error(
      "Invalid tool arguments:",
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
    return;
  }

  const client = new Client({
    name: "men-example",
    version: "0.1.0",
  });

  try {
    const transport =
      new StreamableHTTPClientTransport(new URL(endpoint));

    await client.connect(transport);

    const result: CallToolResult = await client.callTool({
      name: toolName,
      arguments: toolArguments,
    });

    const evidence = normalizeMcpResult(result, {
      toolName,
      maxChars: 12_000,
    });

    console.log(renderEvidence(evidence));

    if (evidence.warnings.length > 0) {
      console.error("Evidence warnings:");

      for (const warning of evidence.warnings) {
        console.error(`- ${warning}`);
      }
    }

    if (evidence.isError) {
      process.exitCode = 2;
    }
  } finally {
    await client.close();
  }
}

await main();
