# men

> **men** is short for **MCP Evidence Normalizer**.

**Created by Kelvin Rivera.**

`mcp-evidence-normalizer` is a zero-runtime-dependency evidence normalizer and drop-in MCP tool-result guard. It intercepts `callTool()` responses, compacts verbose structured evidence before it reaches model context, and degrades explicitly when a hard token or byte budget cannot be met losslessly.

The guard is designed for the failure mode where a correct tool call returns far more JSON, metadata, rows, traces, or nested structure than the model should receive at once.

```text
MCP callTool()
   ↓
lossless-first canonicalization
   ↓
empty-value pruning + deterministic key ordering
   ↓
array-of-object table pivoting
   ↓
priority pruning when required
   ↓
array slicing + structured tombstones
   ↓
hard string clamping only as a last structured stage
   ↓
bounded MCP CallToolResult
```

The original `normalizeMcpResult()` API remains available and keeps its v0.1 behavior, including full source blocks and deterministic `maxChars` rendering.

## Drop-in MCP guard

The current MCP TypeScript v2 client is `@modelcontextprotocol/client`. `withEvidenceGuard()` does not import an MCP SDK at runtime; it structurally wraps any client object exposing `callTool()`, so upstream servers do not need to change.

```ts
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

import { withEvidenceGuard } from "mcp-evidence-normalizer";

const rawClient = new Client({
  name: "my-client",
  version: "1.0.0",
});

const client = withEvidenceGuard(rawClient, {
  maxTokens: 3_500,
  maxBytes: 14_000,
  strategy: "adaptive",
  format: "compact-markdown",
  onBudgetExceeded: "tombstone",
  fieldPriorities: {
    id: "p0",
    debug_trace: "p2",
    raw_headers: "p2",
  },
});

await client.connect(
  new StreamableHTTPClientTransport(new URL("https://example.com/mcp")),
);

const result = await client.callTool({
  name: "query_database",
  arguments: { sql: "SELECT * FROM users LIMIT 500" },
});
```

The returned value remains a CallToolResult-shaped object. Standard non-text content blocks are retained. The guard derives a canonicalized, budgeted model-facing projection from text evidence and `structuredContent`, while authoritative `structuredContent` itself remains unchanged. Existing top-level `isError` and `_meta` data are preserved; when degradation occurs, `_meta.evidenceGuard` contains the tombstone metadata.

## Guard options

```ts
interface GuardOptions {
  maxTokens?: number; // default: 3500 when no byte budget is supplied
  maxBytes?: number;
  strategy?:
    | "adaptive"
    | "lossless-first"
    | "hard-cap"
    | "lossy-degrade";
  format?:
    | "compact-markdown"
    | "compact-json"
    | "markdown-table"
    | "raw";
  onBudgetExceeded?:
    | "tombstone"
    | "throw"
    | "truncate-bytes";
  fieldPriorities?: Record<string, "p0" | "p1" | "p2">;
  pinnedFields?: string[];
  tokenEstimator?: (text: string) => number;
  suggestedAction?: string;
}
```

When neither budget is supplied, the guard defaults to `maxTokens: 3500`. Supplying only `maxBytes` selects a byte-only budget. When both `maxTokens` and `maxBytes` are supplied, both constraints must be satisfied. The built-in token estimator is dependency-free and uses a conservative `ceil(chars / 4)` heuristic. A tokenizer can be injected through `tokenEstimator` when exact model-specific counting is required.

`p0` fields are pinned against priority pruning. `p2` fields are removed first when lossless compaction is insufficient. Common debug, trace, header, metadata, and timestamp keys are treated as low-priority by default unless overridden.

## Lossless-first compaction

`compactValue()` performs lossless canonicalization by recursively sorting object keys without discarding valid JSON values such as `null`, empty strings, or empty arrays. `pruneEmptyValues()` remains available as an explicit opt-in utility for removing empty object fields, but it preserves array positions. `sortObjectKeys()` recursively canonicalizes object key order. `tabularize()` detects homogeneous arrays of objects and produces deterministic Markdown and TSV table representations while retaining every cell value.

JSON text blocks are parsed when possible, canonicalized, and then rendered according to `format`. Non-JSON text remains ordinary text.

## Structured degradation

If the lossless-first representation still exceeds budget, adaptive degradation follows a deterministic sequence:

1. Remove explicitly/default low-priority (`p2`) fields.
2. Slice oversized arrays from the tail and replace them with `{ items, _guard_meta }` wrappers recording original and retained counts.
3. Clamp long strings at Unicode code-point boundaries.
4. If the result still cannot fit, apply `onBudgetExceeded`.

A tombstone includes the available original/retained counts, omitted field paths, omitted item count, original/retained byte measurements, estimated tokens, clamped field paths, and a suggested narrowing action. Field-path lists are capped with separate total-count fields so bookkeeping cannot become a second blowout. Metadata is reduced deterministically if the tombstone itself must fit an unusually small budget.

`compact-json` never falls back to malformed sliced JSON. Under an impossible sub-JSON budget, the model-facing text becomes empty rather than emitting a broken JSON fragment; tombstone information remains available in `_meta.evidenceGuard` when the MCP envelope can carry it.

## Direct guard API

A result can be guarded without wrapping a client:

```ts
import { guardCallToolResult } from "mcp-evidence-normalizer";

const guarded = guardCallToolResult(result, {
  maxBytes: 8_000,
  format: "compact-json",
});
```

## Original normalization API

```ts
import {
  normalizeMcpResult,
  renderEvidence,
} from "mcp-evidence-normalizer";

const evidence = normalizeMcpResult(
  {
    content: [
      { type: "text", text: "Alpha" },
      { type: "text", text: "Beta" },
    ],
  },
  { maxChars: 12_000 },
);

console.log(renderEvidence(evidence));
```

The legacy API preserves normalized source blocks independently of any `maxChars` limit applied to `NormalizedEvidence.text`. Unknown MCP content is preserved with warnings rather than silently discarded.

## Runtime properties

```text
runtime dependencies: 0
model dependencies:   0
network calls:         0
filesystem access:     0
```

The library uses standard JavaScript/TypeScript APIs only. The official MCP client remains a development dependency for examples and compatibility tests.

## Development

Requires Node.js 22 or newer.

```bash
npm install
npm run typecheck
npm run typecheck:examples
npm test
npm run build
npm run pack:check
```

`examples/mcp-guard-client.ts` demonstrates the middleware wrapper end to end. `examples/mcp-client.ts` demonstrates the original normalization flow.

## Scope

The guard controls the representation and size of tool results after a tool has executed. It is not an authorization layer, sandbox, prompt-injection detector, policy engine, or replacement for server-side query limits. It reduces context blowouts; it does not make an unsafe tool safe to execute.

## Where men came from

men did not start as an isolated library idea. It is the latest result of several personal AI projects I built, dismantled, and learned from.

For purposes of this history, I think of them as **Mach I**, **Mach II**, and **Mach III**.

### Mach I — distributed local inference

My first attempt was to combine two computers, **SER5** and **PHENOM**, into one distributed `llama.cpp` system.

The idea was straightforward: the two machines had roughly 32 GB of RAM between them, and I wanted to combine as much of their available compute and memory as possible so I could run the largest local LLM the pair could handle.

PHENOM used an older AMD Phenom X6 processor and a 2 GB Sapphire AMD GPU. SER5 had much newer and substantially faster integrated AMD graphics.

I eventually got the Sapphire GPU working with `llama.cpp`, so the experiment succeeded technically. The problem was performance.

PHENOM was simply too slow relative to SER5. Even when I assigned only a very small portion of the model — roughly two blocks — to PHENOM and left the rest to SER5, overall tokens per second were still worse than running the workload on SER5 alone.

The slower machine became a bottleneck instead of an accelerator.

Once that was clear, I dismantled the project. Mach I taught me an important lesson that carried into everything that followed: **more hardware and more architecture do not necessarily produce a better system.**

### Mach II — Kel AI

My next project was **Kel AI**, which I now think of as Mach II.

Instead of trying to spread one model across both computers, Mach II was designed as a persistent dual-mode personal AI system: Groq for online inference and a local Qwen model for private/offline inference, with persistent memory shared across the system.

This time I built essentially everything myself: the UI, orchestration, architecture, retrieval system, privacy rules, cloud/local switching, persistence, and the surrounding application infrastructure.

Mach II became far more capable than Mach I, but it developed a different problem: the architecture kept growing.

Every feature seemed to create another subsystem, abstraction, or thing I had to maintain. What had begun as a personal AI assistant was becoming a much larger software platform. The time commitment kept increasing without a clear finish line, and I was one person developing all of it.

Eventually I decided that continuing to add architecture was working against the original goal, so I dismantled Mach II as well.

### Mach III — simplify everything

Mach III was my response to what I learned from the first two projects.

Instead of asking what else I could build, I started asking what the smallest system was that would actually give me the personal AI assistant I originally wanted.

Mach III became a local-first persistent personal AI assistant built around reuse instead of reinvention. SER5 handles the interface and local WebLLM inference. PHENOM handles persistent Markdown memory and web research. A deliberately bounded MCP layer connects the pieces through fixed Memory and Research services instead of a general agent or plugin framework.

The goal became **less architecture, fewer moving parts, and a system I could actually finish and use**.

### The problem that became men

While qualifying a smaller local model in Mach III, I hit a failure that initially looked like a model problem.

The routing decision was correct. The MCP request was correct. The backend was correct. The evidence returned by the backend was correct. But the final answer was still wrong or incomplete.

The useful evidence was reaching the model wrapped in unnecessary result structure. A smaller model could successfully call the right tool and still fail to make proper use of the result.

The first fix inside Mach III was intentionally small: extract standard MCP text evidence deterministically and give the model the useful evidence instead of blindly handing it the entire raw result object.

That fixed the immediate problem, but it exposed something more general: MCP applications should not each have to reinvent the layer that turns protocol-shaped tool results into clean, bounded evidence.

I pulled that idea out of Mach III and built **men — MCP Evidence Normalizer**.

The standalone project then proved its usefulness during its own real Mach III qualification. A Research result exposed the same evidence both as a normal MCP text block and as `structuredContent`. That created duplicate model-facing evidence. The integration test caught it, men gained deterministic duplicate suppression, and the real backend test passed afterward.

That was the point where men clearly became its own project rather than just another Mach III helper.

The philosophy running through all four stages is simple:

> **Use the smallest architecture that solves the real problem.**

For men specifically:

> **Normalize evidence. Preserve facts. Reduce representational complexity.**

See [`PROVENANCE.md`](./PROVENANCE.md) for the detailed technical lineage and extraction boundary.

## Status

v0.1.0 — initial public release.

The intentionally small public API is:

```ts
normalizeMcpResult(result, options?)
renderEvidence(evidence)
```

I intend to keep the public surface small and earn additional complexity only when real integrations demonstrate that it is needed.
