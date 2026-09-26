import type { NormalizedEvidence } from "./types.js";

/**
 * Render normalized evidence as plain text.
 *
 * Normalization owns evidence extraction and budgeting. Rendering does not
 * summarize, paraphrase, infer, reorder, or append content.
 *
 * Returning NormalizedEvidence.text directly ensures a maxChars budget
 * remains an upper bound on the rendered output.
 */
export function renderEvidence(evidence: NormalizedEvidence): string {
  return evidence.text;
}
