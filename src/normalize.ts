import { applyTextBudget } from "./budget.js";
import { compactValue } from "./compact.js";

import type {
  EvidenceBlock,
  EvidenceSource,
  NormalizedEvidence,
  NormalizeOptions,
} from "./types.js";

const EMPTY_EVIDENCE_WARNING =
  "MCP result contained no renderable evidence";

const EMPTY_ERROR_WARNING =
  "MCP result indicated an error but contained no renderable evidence";

const NON_ARRAY_CONTENT_WARNING =
  "MCP result content was not an array and was preserved as unknown";

const NON_OBJECT_RESULT_WARNING =
  "MCP result was not an object and was preserved as unknown";

const MALFORMED_IS_ERROR_WARNING =
  "MCP result isError was not boolean and was preserved as unknown";

const UNRENDERABLE_STRUCTURED_WARNING =
  "MCP structuredContent was not valid renderable JSON and was preserved as unknown";

const KNOWN_RESULT_PROPERTIES = new Set([
  "_meta",
  "content",
  "isError",
  "resultType",
  "structuredContent",
]);

function unknownBlockWarning(index: number): string {
  return `Unrecognized MCP content block at index ${index} preserved as unknown`;
}

function unknownPropertyWarning(key: string): string {
  return `Unrecognized MCP result property "${key}" preserved as unknown`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildSource(options: NormalizeOptions): EvidenceSource | undefined {
  const source: EvidenceSource = {};

  if (options.toolName !== undefined) {
    source.tool = options.toolName;
  }

  if (options.serverName !== undefined) {
    source.server = options.serverName;
  }

  return Object.keys(source).length > 0 ? source : undefined;
}

function renderJson(value: unknown): string | undefined {
  try {
    const rendered = JSON.stringify(value, null, 2);
    return typeof rendered === "string" ? rendered : undefined;
  } catch {
    return undefined;
  }
}

interface ResultNormalization {
  blocks: EvidenceBlock[];
  renderParts: string[];
  warnings: string[];
  isError: boolean;
}

function normalizeResult(result: unknown): ResultNormalization {
  const blocks: EvidenceBlock[] = [];
  const renderParts: string[] = [];
  const renderedTextBlocks = new Set<string>();
  const warnings: string[] = [];

  if (!isRecord(result)) {
    blocks.push({
      type: "unknown",
      value: result,
    });

    warnings.push(NON_OBJECT_RESULT_WARNING);

    return {
      blocks,
      renderParts,
      warnings,
      isError: false,
    };
  }

  if ("content" in result) {
    if (!Array.isArray(result.content)) {
      blocks.push({
        type: "unknown",
        value: result.content,
      });

      warnings.push(NON_ARRAY_CONTENT_WARNING);
    } else {
      for (const [index, block] of result.content.entries()) {
        if (
          isRecord(block) &&
          block.type === "text" &&
          typeof block.text === "string"
        ) {
          blocks.push({
            type: "text",
            text: block.text,
          });

          renderParts.push(block.text);
          renderedTextBlocks.add(block.text);
          continue;
        }

        blocks.push({
          type: "unknown",
          value: block,
        });

        warnings.push(unknownBlockWarning(index));
      }
    }
  }

  if ("structuredContent" in result) {
    const rendered = renderJson(result.structuredContent);

    if (rendered === undefined) {
      blocks.push({
        type: "unknown",
        value: result.structuredContent,
      });

      warnings.push(UNRENDERABLE_STRUCTURED_WARNING);
    } else {
      blocks.push({
        type: "json",
        value: result.structuredContent,
      });

      if (!renderedTextBlocks.has(rendered)) {
        renderParts.push(rendered);
      }
    }
  }

  if ("isError" in result && typeof result.isError !== "boolean") {
    blocks.push({
      type: "unknown",
      value: {
        isError: result.isError,
      },
    });

    warnings.push(MALFORMED_IS_ERROR_WARNING);
  }

  for (const key of Object.keys(result)) {
    if (KNOWN_RESULT_PROPERTIES.has(key)) {
      continue;
    }

    blocks.push({
      type: "unknown",
      value: {
        [key]: result[key],
      },
    });

    warnings.push(unknownPropertyWarning(key));
  }

  return {
    blocks,
    renderParts,
    warnings,
    isError: result.isError === true,
  };
}

/**
 * Normalize a common MCP CallToolResult-style value into canonical evidence.
 *
 * Recognized evidence is represented explicitly and rendered deterministically.
 * Unknown or malformed external data is preserved with warnings rather than
 * silently discarded.
 */
export function normalizeMcpResult(
  result: unknown,
  options: NormalizeOptions = {},
): NormalizedEvidence {
  const normalized = normalizeResult(result);
  const warnings = [...normalized.warnings];

  if (normalized.renderParts.length === 0) {
    warnings.push(
      normalized.isError ? EMPTY_ERROR_WARNING : EMPTY_EVIDENCE_WARNING,
    );
  }

  const renderedText = normalized.renderParts.join("\n\n");
  const budgeted = applyTextBudget(renderedText, options.maxChars);

  if (budgeted.warning !== undefined) {
    warnings.push(budgeted.warning);
  }

  const source = buildSource(options);

  return {
    text: budgeted.text,
    blocks: normalized.blocks,
    isError: normalized.isError,
    truncated: budgeted.truncated,
    warnings,
    ...(source === undefined ? {} : { source }),
  };
}

/**
 * Canonicalize arbitrary tool data for the middleware guard without changing
 * the legacy normalizeMcpResult contract.
 */
export function normalizeGuardValue(
  value: unknown,
  pinnedFields: readonly string[] = [],
): unknown {
  return compactValue(value, pinnedFields);
}

/**
 * Parse JSON-looking text when possible so structured compaction and table
 * pivoting can be applied. Non-JSON text remains byte-for-byte unchanged.
 */
export function normalizeGuardText(
  text: string,
  pinnedFields: readonly string[] = [],
): unknown {
  try {
    return compactValue(JSON.parse(text) as unknown, pinnedFields);
  } catch {
    return text;
  }
}
