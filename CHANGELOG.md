# Changelog

All notable changes to this project will be documented in this file.

The project follows semantic versioning beginning with v0.1.0.

## [0.2.0] - 2026-09-19
### Added

- Drop-in `withEvidenceGuard()` MCP `callTool()` middleware/proxy wrapper.
- `guardCallToolResult()` for direct result interception without an MCP client dependency.
- Lossless-first empty-value pruning, recursive key canonicalization, and homogeneous array table pivoting.
- Markdown/TSV tabularization helpers and compact JSON/Markdown guard rendering.
- Token and UTF-8 byte budgets with a dependency-free token estimator and injectable custom estimator.
- Field priority policies (`p0`/`p1`/`p2`), array slicing, structured tombstones, and Unicode-safe string clamping.
- Budget-exceeded policies for tombstones, exceptions, and safe text truncation.
- Guard-specific unit tests and an end-to-end MCP guard client example.

### Changed

- Expanded the package from a standalone evidence normalizer into an optional MCP middleware guard while retaining the v0.1 normalization contract.
- Updated package metadata and documentation for the v0.2 guard API.

## [0.1.0] - 2026-08-30
### Added

- Initial public release of men, originally created by Kelvin Rivera.
- Creator attribution through the Apache NOTICE mechanism.
- Documented the Mach I → Mach II / Kel AI → Mach III → men project lineage.
- Canonical normalized evidence types.
- Standard MCP text-block normalization with deterministic source ordering.
- Lossless unknown preservation for current official MCP non-text content blocks, including embedded resources, resource links, images, and audio.
- Structured-content preservation and deterministic JSON rendering.
- Exact duplicate suppression when structured JSON is already present as an identical MCP text block, while preserving both canonical blocks.
- Explicit MCP tool-error representation.
- Preservation of unknown and malformed content with deterministic warnings.
- Deterministic `maxChars` budgeting while retaining full normalized blocks.
- Plain-text rendering through `renderEvidence(...)`.
- Blind nonce evidence-recovery and determinism regression tests.
- Structural compatibility tests for the official MCP `CallToolResult` type.
- Official MCP client and basic usage examples.
- Apache-2.0 licensing and provenance documentation.
