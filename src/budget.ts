import type {
  GuardMeasurement,
  GuardOptions,
  ResolvedGuardOptions,
} from "./types.js";

export interface TextBudgetResult {
  text: string;
  truncated: boolean;
  warning?: string;
}

function validateMaxChars(maxChars: number): void {
  if (!Number.isInteger(maxChars) || maxChars < 0) {
    throw new RangeError(
      "NormalizeOptions.maxChars must be a non-negative integer",
    );
  }
}

/**
 * Apply a deterministic limit to rendered evidence text.
 *
 * maxChars uses JavaScript string length semantics (UTF-16 code units).
 * Canonical evidence blocks remain intact; only the model-facing text
 * representation is bounded.
 */
export function applyTextBudget(
  text: string,
  maxChars: number | undefined,
): TextBudgetResult {
  if (maxChars === undefined) {
    return {
      text,
      truncated: false,
    };
  }

  validateMaxChars(maxChars);

  if (text.length <= maxChars) {
    return {
      text,
      truncated: false,
    };
  }

  return {
    text: text.slice(0, maxChars),
    truncated: true,
    warning: `Evidence text truncated to ${maxChars} characters`,
  };
}

/** Dependency-free default estimate for code, JSON, and tool output. */
export function estimateTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  return Math.ceil(text.length / 4);
}

export const DEFAULT_GUARD_OPTIONS = Object.freeze({
  maxTokens: 3_500,
  strategy: "adaptive",
  format: "compact-markdown",
  onBudgetExceeded: "tombstone",
  suggestedAction: "Narrow query filters using limit/offset",
}) satisfies Readonly<GuardOptions>;

function validateBudget(name: string, value: number | undefined): void {
  if (value === undefined) {
    return;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`);
  }
}

/** Validate and fill guard defaults without adding runtime dependencies. */
export function resolveGuardOptions(
  options: GuardOptions = {},
): ResolvedGuardOptions {
  const maxBytes = options.maxBytes;
  const maxTokens =
    options.maxTokens ??
    (maxBytes === undefined ? DEFAULT_GUARD_OPTIONS.maxTokens : undefined);

  validateBudget("GuardOptions.maxTokens", maxTokens);
  validateBudget("GuardOptions.maxBytes", maxBytes);

  return {
    ...(maxTokens === undefined ? {} : { maxTokens }),
    ...(maxBytes === undefined ? {} : { maxBytes }),
    strategy: options.strategy ?? DEFAULT_GUARD_OPTIONS.strategy,
    format: options.format ?? DEFAULT_GUARD_OPTIONS.format,
    onBudgetExceeded:
      options.onBudgetExceeded ?? DEFAULT_GUARD_OPTIONS.onBudgetExceeded,
    fieldPriorities: options.fieldPriorities ?? {},
    pinnedFields: options.pinnedFields ?? [],
    tokenEstimator: options.tokenEstimator ?? estimateTokens,
    suggestedAction:
      options.suggestedAction ?? DEFAULT_GUARD_OPTIONS.suggestedAction,
  };
}

function checkedTokenEstimate(
  text: string,
  options: ResolvedGuardOptions,
): number {
  const estimate = options.tokenEstimator(text);

  if (!Number.isFinite(estimate) || estimate < 0) {
    throw new RangeError(
      "GuardOptions.tokenEstimator must return a finite non-negative number",
    );
  }

  return Math.ceil(estimate);
}

/** UTF-8 byte length, matching transport/model payload accounting. */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function measureGuardText(
  text: string,
  options: ResolvedGuardOptions,
): GuardMeasurement {
  return {
    bytes: utf8ByteLength(text),
    estimatedTokens: checkedTokenEstimate(text, options),
  };
}

export function fitsGuardBudget(
  text: string,
  options: ResolvedGuardOptions,
): boolean {
  const measurement = measureGuardText(text, options);

  return (
    (options.maxBytes === undefined || measurement.bytes <= options.maxBytes) &&
    (options.maxTokens === undefined ||
      measurement.estimatedTokens <= options.maxTokens)
  );
}

function clampUtf8Bytes(text: string, maxBytes: number): string {
  if (maxBytes <= 0) {
    return "";
  }

  let used = 0;
  let output = "";

  for (const character of text) {
    const width = utf8ByteLength(character);
    if (used + width > maxBytes) {
      break;
    }

    output += character;
    used += width;
  }

  return output;
}

function clampEstimatedTokens(
  text: string,
  maxTokens: number,
  options: ResolvedGuardOptions,
): string {
  if (maxTokens <= 0) {
    return "";
  }

  if (checkedTokenEstimate(text, options) <= maxTokens) {
    return text;
  }

  const characters = Array.from(text);
  let low = 0;
  let high = characters.length;

  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = characters.slice(0, middle).join("");

    if (checkedTokenEstimate(candidate, options) <= maxTokens) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  return characters.slice(0, low).join("");
}

/**
 * UTF-8-safe hard clamp. It never splits a Unicode code point. With a custom
 * tokenizer it uses a deterministic binary search to stay within maxTokens.
 */
export function clampTextToGuardBudget(
  text: string,
  options: ResolvedGuardOptions,
): string {
  let clamped = text;

  if (options.maxTokens !== undefined) {
    clamped = clampEstimatedTokens(clamped, options.maxTokens, options);
  }

  if (options.maxBytes !== undefined) {
    clamped = clampUtf8Bytes(clamped, options.maxBytes);
  }

  return clamped;
}

export class GuardBudgetExceededError extends Error {
  readonly measurement: GuardMeasurement;

  constructor(
    message: string,
    measurement: GuardMeasurement,
  ) {
    super(message);
    this.name = "GuardBudgetExceededError";
    this.measurement = measurement;
  }
}
