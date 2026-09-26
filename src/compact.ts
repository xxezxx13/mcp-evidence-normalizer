export type TableCell = unknown;

export interface TabularizedData {
  columns: string[];
  rows: TableCell[][];
  markdown: string;
  tsv: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matchesField(
  path: string,
  key: string,
  fields: ReadonlySet<string>,
): boolean {
  return fields.has(path) || fields.has(key);
}

function isEmptyValue(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * Remove empty object fields recursively without collapsing array positions.
 *
 * Object fields containing null, undefined, empty strings, or empty arrays are
 * removed unless pinned. Array elements always retain their original positions,
 * while objects nested inside arrays are still pruned recursively.
 *
 * `pinnedFields` accepts field names or dot paths that must survive pruning.
 * Object keys are not sorted by this function.
 */
export function pruneEmptyValues(
  value: unknown,
  pinnedFields: readonly string[] = [],
): unknown {
  const pinned = new Set(pinnedFields);

  function visit(current: unknown, path: string): unknown {
    if (Array.isArray(current)) {
      return current.map((item, index) =>
        visit(item, `${path}[${index}]`),
      );
    }

    if (!isRecord(current)) {
      return current;
    }

    const result: Record<string, unknown> = {};

    for (const key of Object.keys(current)) {
      const childPath = path.length === 0 ? key : `${path}.${key}`;
      const original = current[key];
      const next = visit(original, childPath);

      if (isEmptyValue(next) && !matchesField(childPath, key, pinned)) {
        continue;
      }

      result[key] = next;
    }

    return result;
  }

  return visit(value, "");
}

/** Recursively sort object keys while preserving array order. */
export function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectKeys(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  const sorted: Record<string, unknown> = {};

  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortObjectKeys(value[key]);
  }

  return sorted;
}

/**
 * Lossless canonicalization used before any budget-driven degradation.
 *
 * Valid JSON values are preserved exactly; canonicalization only normalizes
 * deterministic object-key ordering. The legacy second parameter is retained
 * for API compatibility but no longer controls implicit value removal.
 */
export function compactValue(
  value: unknown,
  _pinnedFields: readonly string[] = [],
): unknown {
  return sortObjectKeys(value);
}

function stableJson(value: unknown): string {
  const rendered = JSON.stringify(sortObjectKeys(value));
  return rendered === undefined ? "null" : rendered;
}

function escapeMarkdown(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\n");
}

function markdownCell(value: TableCell): string {
  return escapeMarkdown(stableJson(value));
}

function tsvCell(value: TableCell): string {
  return stableJson(value);
}

/**
 * Pivot a homogeneous array of objects into a deterministic table.
 *
 * Cells retain their typed canonical values; Markdown and TSV cells are rendered
 * as compact JSON so string/null/number/boolean types remain distinguishable.
 * Returns null for non-homogeneous input.
 */
export function tabularize(array: readonly unknown[]): TabularizedData | null {
  if (array.length === 0 || !array.every(isRecord)) {
    return null;
  }

  const first = array[0];
  if (first === undefined) {
    return null;
  }

  const columns = Object.keys(first).sort();
  const signature = columns.join("\u0000");

  for (const item of array) {
    if (Object.keys(item).sort().join("\u0000") !== signature) {
      return null;
    }
  }

  if (columns.length === 0) {
    return null;
  }

  const rows = array.map((item) =>
    columns.map((column) => sortObjectKeys(item[column])),
  );

  const header = `| ${columns.map(escapeMarkdown).join(" | ")} |`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map(
    (row) => `| ${row.map(markdownCell).join(" | ")} |`,
  );

  const markdown = [header, separator, ...body].join("\n");
  const tsv = [
    columns.map((column) => JSON.stringify(column)).join("\t"),
    ...rows.map((row) => row.map(tsvCell).join("\t")),
  ].join("\n");

  return {
    columns,
    rows,
    markdown,
    tsv,
  };
}

/** Compact JSON rendering with deterministic key ordering. */
export function renderCompactJson(value: unknown): string {
  const rendered = JSON.stringify(sortObjectKeys(value));
  return rendered === undefined ? "null" : rendered;
}
