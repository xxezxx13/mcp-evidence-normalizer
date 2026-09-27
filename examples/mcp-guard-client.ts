import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

import {
  withEvidenceGuard,
} from "../src/index.js";

async function main(): Promise<void> {
  const endpoint = process.argv[2];
  const toolName = process.argv[3];
  const rawArguments = process.argv[4] ?? "{}";

  if (endpoint === undefined || toolName === undefined) {
    console.error(
      "Usage: node examples/mcp-guard-client.js <mcp-url> <tool-name> '[arguments-json]'",
    );
    process.exitCode = 1;
    return;
  }

  const parsedArguments: unknown = JSON.parse(rawArguments);

  if (
    typeof parsedArguments !== "object" ||
    parsedArguments === null ||
    Array.isArray(parsedArguments)
  ) {
    throw new TypeError("tool arguments must be a JSON object");
  }

  const rawClient = new Client({
    name: "men-guard-example",
    version: "1.0.0",
  });

  const client = withEvidenceGuard(rawClient, {
    maxTokens: 3_500,
    maxBytes: 14_000,
    strategy: "adaptive",
    format: "compact-markdown",
    onBudgetExceeded: "tombstone",
    fieldPriorities: {
      debug_trace: "p2",
      raw_headers: "p2",
      id: "p0",
    },
  });

  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(endpoint)),
    );

    const result = await client.callTool({
      name: toolName,
      arguments: parsedArguments as Record<string, unknown>,
    });

    for (const block of result.content) {
      if (block.type === "text") {
        console.log(block.text);
      }
    }
  } finally {
    await client.close();
  }
}

await main();
