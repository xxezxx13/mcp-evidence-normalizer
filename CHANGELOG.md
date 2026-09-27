# Changelog

All notable changes to this project will be documented in this file.

Project releases use whole-number Git tags (`v1`, `v2`, `v3`, ...). The npm package uses the corresponding semantic major version (`1.0.0`, `2.0.0`, `3.0.0`, ...).

## [1.0.0] - Unreleased

### Added

- Deterministic normalization of MCP `CallToolResult`-style evidence.
- Preservation of standard MCP text, structured content, non-text blocks, unknown content, malformed content, and tool-error state.
- `normalizeMcpResult()` and `renderEvidence()` for the original normalization workflow.
- `withEvidenceGuard()` as a drop-in structural `callTool()` wrapper without a runtime MCP SDK dependency.
- `guardCallToolResult()` for direct result guarding.
- Lossless canonicalization with deterministic object-key ordering.
- Preservation of legitimate JSON values including `null`, empty strings, empty arrays, and array positions.
- Safe preservation of hostile-looking evidence keys such as `__proto__`, `constructor`, and `prototype`.
- Compact JSON, compact Markdown, raw text, Markdown-table, and TSV-oriented evidence rendering utilities.
- UTF-8 byte and estimated-token budgets with an injectable token estimator.
- Caller-explicit evidence priorities (`p0`, `p1`, and `p2`) and pinned-field protection.
- Deterministic structured degradation through explicit low-priority pruning, array slicing, Unicode-safe string clamping, and bounded fallback behavior.
- Evidence-relative degradation metadata with final retained byte and estimated-token measurements.
- Stable MCP wrapper receiver semantics for ordinary methods, accessors, private fields, and repeated function access.
- Explicit handling of JavaScript Proxy invariants for non-configurable, non-writable properties.
- Deterministic cycle rejection and a 1,024-container canonicalization depth limit while preserving valid shared-reference DAGs.
- Adversarial, hostile-key, metadata-contract, priority, strategy, wrapper-compatibility, determinism, MCP compatibility, and downstream package-consumer regression coverage.

### Changed

- Structured evidence supplied by the caller remains authoritative and is no longer replaced by the model-facing degraded projection.
- Canonicalization is lossless by default; empty-value pruning remains an explicit opt-in operation.
- Unclassified evidence defaults to `p1`; low-priority `p2` behavior is caller-explicit rather than inferred from generic field names.
- Guard strategy semantics are now limited to the distinct `adaptive` and `lossless-first` behaviors.
- Priority pruning uses batched deterministic candidate processing with exact first-fit replay instead of repeatedly rescanning the complete evidence tree.
- Tombstone and truncation metadata describe the final model-facing result rather than an intermediate representation.
- Package and release history are rebased onto the clean v1 lineage.
