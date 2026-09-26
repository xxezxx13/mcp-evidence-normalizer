# Provenance

## Project lineage

men is the latest result of several personal AI projects I built, dismantled, and learned from.

For clarity, I refer to the first two projects retrospectively as **Mach I** and **Mach II**. Mach II was originally developed under the name **Kel AI**.

### Mach I — distributed `llama.cpp`

Before Kel AI, I built an earlier local-AI project around two Ubuntu computers: **SER5** and **PHENOM**.

The goal was to combine the compute, memory, and storage resources of both machines through distributed `llama.cpp` so I could run the largest local LLM their combined resources could reasonably handle.

Together the machines had roughly 32 GB of RAM. PHENOM used an older AMD Phenom X6 processor and a 2 GB Sapphire AMD GPU, while SER5 had much newer CPU and integrated AMD GPU hardware.

I eventually got the Sapphire GPU working with `llama.cpp`, so the distributed experiment succeeded technically. The problem was performance.

Even when I assigned only a very small part of the model — roughly two blocks — to PHENOM and left the rest on SER5, total tokens per second were still worse than running on SER5 alone.

PHENOM had become a bottleneck instead of an accelerator, so I dismantled the project.

> **Mach I taught me that combining more resources does not automatically make a system better.**

### Mach II — Kel AI

My next project was **Kel AI**, which I now refer to as Mach II.

Mach II abandoned the idea of splitting one model across both machines. Instead, I designed a persistent dual-mode personal AI system using Groq for normal online inference and a local Qwen model for private or offline inference.

PHENOM provided persistent storage and retrieval while SER5 handled the interactive AI experience.

For Mach II I built essentially everything myself: the UI, orchestration, local and cloud inference paths, persistent memory, SQLite FTS5/BM25 retrieval, privacy-policy machinery, cloud/local switching, application state, service boundaries, and the surrounding architecture.

Mach II became much more capable than Mach I, but its architecture kept growing. Each capability created another subsystem, abstraction, configuration surface, or maintenance responsibility.

What began as a personal AI assistant was turning into a much larger software platform. The development commitment kept increasing without a clear endpoint, and I was one person building and maintaining all of it.

Eventually I decided that the architecture itself had started working against the original goal, so I dismantled Mach II rather than continue expanding it.

> **Mach II taught me that software architecture can become a bottleneck just as easily as hardware can.**

### Mach III — the architectural reset

Mach III was my response to what I learned from Mach I and Mach II.

Instead of asking what else I could build, I started asking what the smallest system was that would actually give me the persistent personal AI assistant I originally wanted.

**Mach III is a local-first persistent personal AI assistant.**

Its job is intentionally straightforward: local AI chat, persistent long-term Markdown memory, memory search/read/write, current web research, answers based on retrieved evidence, and normal language-model work such as reasoning, writing, troubleshooting, summarization, and code generation.

Mach III deliberately reuses existing open-source software rather than rebuilding everything from scratch.

SER5 is the interface and local-intelligence machine. Mach III uses the existing WebLLM Chat application, with local Qwen inference through MLC WebLLM and WebGPU.

PHENOM is the persistence and services machine. It provides persistent Markdown/Obsidian memory, the memory MCP service, TinySearch web research, and the existing Nginx Proxy Manager network front door.

That division of labor was intentional. Mach I had shown that PHENOM was a poor inference partner for SER5, so Mach III gave PHENOM work that better matched its strengths: storage, persistence, retrieval, and services.

Mach III uses the official MCP client but exposes only two predetermined service categories — **Memory** and **Research** — through a small bounded coordinator. It is intentionally not a general MCP client, recursive agent framework, plugin platform, or giant RAG system.

The governing idea was the opposite of Mach II:

> **Reuse good open-source components, write as little new infrastructure as possible, and keep the orchestration bounded.**


## How Mach III led to men

I created **men (MCP Evidence Normalizer)** while working on Mach III.

The original problem was practical rather than theoretical: an MCP backend could execute correctly and return the right information, but a smaller local model could still fail to use that information when the useful evidence was buried inside the complete tool-result structure.

I first solved that problem inside Mach III with a small deterministic formatter. Once the behavior proved useful, I separated the idea from the application and developed it into this independent library.

men is therefore related to Mach III historically, but it is not a packaged copy of Mach III's coordinator.

## Mach III source I studied

At the time I analyzed the extraction boundary, the relevant Mach III checkout was:

- repository: `~/src/mach-iii`
- commit: `efa5e6b`
- branch: `mach-iii`
- source file: `app/client/machiii-coordinator.ts`
- parent repository license: Apache-2.0

## How the idea developed

The relevant Mach III behavior evolved through three commits:

1. `7ebbbeb` — the bounded coordinator rendered backend tool results using `JSON.stringify(execution.result, null, 2)`.

2. `9c169ef` — `research_read` gained deterministic extraction of standard MCP content blocks shaped like:

   `{ type: "text", text: string }`

   Those text blocks were retained in source order and joined with blank lines before falling back to JSON.

3. `efa5e6b` — I generalized that behavior beyond `research_read`, making standard MCP text extraction apply to normalized Mach III tool results more broadly.

That small change fixed the real failure that started this project: the backend and MCP transport were working, but the model-facing representation was unnecessarily difficult for the local model to consume.

## Becoming an independent project

I did not want men to become a Mach III subsystem with a new name.

I kept the useful concept and rebuilt it as a small standalone library with its own canonical evidence types, deterministic budgeting, rendering, unknown-content preservation, error handling, regression tests, package boundary, and public API.

The standalone qualification also uncovered a problem that the original formatter did not address. A live Mach III Research response exposed the same structured evidence in both a standard MCP text block and `structuredContent`. Rendering both produced an exact duplicate.

I added exact duplicate suppression to men while still preserving both canonical source blocks. I then reran the real MCP integration and confirmed that the model-facing result contained the evidence only once.

That is an example of what I want this project to be: small enough that real integration problems can improve the normalization layer without turning it into an orchestration framework.

## Extraction boundary

men does **not** extract or depend on Mach III's:

- routing policy;
- router prompts;
- mandatory Memory/Research routing;
- Ajv validation;
- jsonrepair logic;
- MCP server allowlists;
- tool execution;
- WebLLM;
- Qwen-specific behavior;
- PHENOM integration;
- TinySearch integration;
- Obsidian integration;
- application state; or
- Stop/Abort handling.

The independent implementation generalizes the evidence-normalization problem only.

men is not an MCP client, MCP server, MCP gateway, agent framework, RAG framework, tool router, capability firewall, prompt framework, or model runtime.

## Authorship and attribution

**men was originally created by Kelvin Rivera in 2026.**

The top-level [`NOTICE`](./NOTICE) records that creator attribution.

I have kept this provenance document because I want the project's origin to be explicit rather than obscured. men grew out of a real implementation problem discovered in Mach III, while the standalone project was deliberately narrowed and generalized around evidence normalization.

## Licensing

men is distributed under the Apache License 2.0.

The Apache `LICENSE` text in this repository is kept unmodified. The separate `NOTICE` file records project attribution and does not alter the terms of the Apache License 2.0.
