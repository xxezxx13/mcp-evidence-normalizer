/**
 * Optional provenance supplied by the caller.
 *
 * The normalizer does not discover or infer source identity.
 */
export interface EvidenceSource {
  tool?: string;
  server?: string;
}

/**
 * A normalized block of evidence.
 *
 * Unknown content is preserved rather than silently discarded.
 */
export type EvidenceBlock =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "json";
      value: unknown;
    }
  | {
      type: "unknown";
      value: unknown;
    };

/**
 * Canonical representation returned by normalization.
 */
export interface NormalizedEvidence {
  /**
   * Predictable plain-text representation of renderable evidence.
   *
   * This value may be bounded by NormalizeOptions.maxChars.
   */
  text: string;

  /**
   * Evidence blocks in deterministic source order.
   *
   * Blocks preserve the normalized source evidence even when text is bounded.
   */
  blocks: EvidenceBlock[];

  /**
   * True only when the underlying MCP result indicates an error.
   */
  isError: boolean;

  /**
   * True only when rendered evidence text was actually truncated.
   */
  truncated: boolean;

  /**
   * Deterministic notices about malformed, unknown, empty, or truncated data.
   */
  warnings: string[];

  /**
   * Optional caller-supplied provenance.
   */
  source?: EvidenceSource;
}

/**
 * Initial normalization options.
 */
export interface NormalizeOptions {
  toolName?: string;
  serverName?: string;

  /**
   * Maximum length of NormalizedEvidence.text.
   *
   * Uses JavaScript string length semantics (UTF-16 code units).
   * Must be a non-negative integer.
   */
  maxChars?: number;
}

/** Strategies available to the MCP middleware guard. */
export type CompactionStrategy =
  | "adaptive"
  | "lossless-first"
  | "hard-cap"
  | "lossy-degrade";

/** Model-facing output encoding used after compaction. */
export type GuardFormat =
  | "compact-markdown"
  | "compact-json"
  | "markdown-table"
  | "raw";

/** Behavior when a result cannot be represented inside the configured budget. */
export type BudgetExceededPolicy =
  | "tombstone"
  | "throw"
  | "truncate-bytes";

/** Field retention priority. p0 is pinned and is never removed by priority pruning. */
export type FieldPriority = "p0" | "p1" | "p2";

/** Lightweight custom tokenizer hook. */
export type TokenEstimator = (text: string) => number;

/** Metadata emitted when the guard must degrade evidence. */
export interface TombstoneMeta {
  status: "truncated_to_budget";
  original_count?: number;
  retained_count?: number;
  omitted_fields?: string[];
  omitted_field_count?: number;
  omitted_items?: number;
  original_bytes?: number;
  retained_bytes?: number;
  estimated_tokens?: number;
  hard_clamped_fields?: string[];
  hard_clamped_field_count?: number;
  suggested_action?: string;
}

/**
 * Configuration for the drop-in MCP tool-result guard.
 *
 * When both maxTokens and maxBytes are provided, both limits must be satisfied.
 */
export interface GuardOptions {
  maxTokens?: number;
  maxBytes?: number;
  strategy?: CompactionStrategy;
  format?: GuardFormat;
  onBudgetExceeded?: BudgetExceededPolicy;

  /**
   * Field-name or dot-path priorities. A final key match is used when no exact
   * path match exists, so `{ debug_trace: "p2" }` applies at any depth.
   */
  fieldPriorities?: Readonly<Record<string, FieldPriority>>;

  /** Empty values at these field names or dot paths survive empty-value pruning. */
  pinnedFields?: readonly string[];

  /** Optional exact tokenizer or alternate estimator. */
  tokenEstimator?: TokenEstimator;

  /** Hint included in structured tombstones. */
  suggestedAction?: string;
}

/** Fully resolved guard defaults. */
export interface ResolvedGuardOptions {
  maxTokens?: number;
  maxBytes?: number;
  strategy: CompactionStrategy;
  format: GuardFormat;
  onBudgetExceeded: BudgetExceededPolicy;
  fieldPriorities: Readonly<Record<string, FieldPriority>>;
  pinnedFields: readonly string[];
  tokenEstimator: TokenEstimator;
  suggestedAction: string;
}

/** Measurements for a rendered guard payload. */
export interface GuardMeasurement {
  bytes: number;
  estimatedTokens: number;
}
