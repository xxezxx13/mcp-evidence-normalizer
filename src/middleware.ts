import {
  GuardBudgetExceededError,
  clampTextToGuardBudget,
  fitsGuardBudget,
  measureGuardText,
  resolveGuardOptions,
  utf8ByteLength,
} from "./budget.js";
import { renderCompactJson, tabularize } from "./compact.js";
import {
  normalizeGuardText,
  normalizeGuardValue,
} from "./normalize.js";

import type {
  FieldPriority,
  GuardFormat,
  GuardOptions,
  ResolvedGuardOptions,
  TombstoneMeta,
} from "./types.js";

type UnknownRecord = Record<string, unknown>;

type MutableParent = UnknownRecord | unknown[];

interface EvidenceBundle {
  contentText: unknown[];
  structuredContent?: unknown;
}

interface FieldRef {
  parent: UnknownRecord;
  key: string;
  path: string;
  priority: FieldPriority;
}

interface ValueRef {
  parent: MutableParent;
  key: string | number;
  path: string;
  value: unknown;
}

interface DegradationState {
  omittedFields: string[];
  hardClampedFields: string[];
  omittedItems: number;
  slicedArrayCount: number;
  firstArrayOriginalCount?: number;
  firstArrayRetainedCount?: number;
}

interface GuardPipelineResult {
  bundle: EvidenceBundle;
  projection: string;
  meta?: TombstoneMeta;
  forcedText?: string;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrimitive(value: unknown): boolean {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function renderMarkdownScalar(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  const rendered = JSON.stringify(value);
  return rendered === undefined ? "null" : rendered;
}

function renderCompactMarkdown(value: unknown): string {
  if (Array.isArray(value)) {
    const table = tabularize(value);
    return table?.markdown ?? renderCompactJson(value);
  }

  if (!isRecord(value)) {
    return typeof value === "string" ? value : renderMarkdownScalar(value);
  }

  const lines: string[] = [];

  for (const key of Object.keys(value).sort()) {
    const item = value[key];

    if (Array.isArray(item)) {
      const table = tabularize(item);
      if (table !== null) {
        lines.push(`${key}:\n${table.markdown}`);
        continue;
      }
    }

    if (isPrimitive(item)) {
      lines.push(`${key}: ${renderMarkdownScalar(item)}`);
      continue;
    }

    lines.push(`${key}: ${renderCompactJson(item)}`);
  }

  return lines.join("\n");
}

/** Render one canonical guard value in the requested model-facing format. */
export function renderGuardValue(
  value: unknown,
  format: GuardFormat,
): string {
  switch (format) {
    case "compact-json":
      return renderCompactJson(value);
    case "markdown-table": {
      if (Array.isArray(value)) {
        return tabularize(value)?.markdown ?? renderCompactJson(value);
      }

      return renderCompactJson(value);
    }
    case "raw":
      return typeof value === "string" ? value : renderCompactJson(value);
    case "compact-markdown":
      return renderCompactMarkdown(value);
  }
}

function renderBundle(
  bundle: EvidenceBundle,
  options: ResolvedGuardOptions,
): string {
  const parts: string[] = [];
  const seen = new Set<string>();

  for (const value of bundle.contentText) {
    const rendered = renderGuardValue(value, options.format);
    if (!seen.has(rendered)) {
      parts.push(rendered);
      seen.add(rendered);
    }
  }

  if ("structuredContent" in bundle) {
    const rendered = renderGuardValue(bundle.structuredContent, options.format);
    if (!seen.has(rendered)) {
      parts.push(rendered);
      seen.add(rendered);
    }
  }

  return parts.join("\n\n");
}

function publicEvidencePath(path: string): string {
  if (path === "structuredContent") {
    return "";
  }

  if (path.startsWith("structuredContent.")) {
    return path.slice("structuredContent.".length);
  }

  const contentText = /^contentText\\[\\d+\\](?:\\.(.*))?$/.exec(path);
  if (contentText !== null) {
    return contentText[1] ?? "";
  }

  return path;
}

function isSameOrDescendant(path: string, base: string): boolean {
  if (base.length === 0) {
    return path.length === 0;
  }

  return (
    path === base ||
    path.startsWith(`${base}.`) ||
    path.startsWith(`${base}[`)
  );
}

function nameRuleMatchesPath(path: string, name: string): boolean {
  return (
    path === name ||
    path.startsWith(`${name}.`) ||
    path.startsWith(`${name}[`) ||
    path.includes(`.${name}.`) ||
    path.includes(`.${name}[`) ||
    path.endsWith(`.${name}`)
  );
}

function protectedRuleMatches(
  rule: string,
  path: string,
  key: string,
): boolean {
  if (rule === key) {
    return true;
  }

  const publicPath = publicEvidencePath(path);

  if (!rule.includes(".") && !rule.includes("[")) {
    return nameRuleMatchesPath(publicPath, rule);
  }

  return (
    isSameOrDescendant(publicPath, rule) ||
    isSameOrDescendant(rule, publicPath)
  );
}

function isProtectedPath(
  path: string,
  key: string,
  options: ResolvedGuardOptions,
): boolean {
  if (
    options.pinnedFields.some((rule) =>
      protectedRuleMatches(rule, path, key),
    )
  ) {
    return true;
  }

  return Object.entries(options.fieldPriorities).some(
    ([rule, priority]) =>
      priority === "p0" &&
      protectedRuleMatches(rule, path, key),
  );
}

function fieldPriority(
  path: string,
  key: string,
  options: ResolvedGuardOptions,
): FieldPriority {
  if (isProtectedPath(path, key, options)) {
    return "p0";
  }

  const publicPath = publicEvidencePath(path);

  const exact =
    options.fieldPriorities[path] ??
    options.fieldPriorities[publicPath];

  if (exact !== undefined) {
    return exact;
  }

  const byName = options.fieldPriorities[key];
  if (byName !== undefined) {
    return byName;
  }

  return "p1";
}

function collectFields(
  value: unknown,
  path: string,
  options: ResolvedGuardOptions,
  output: FieldRef[],
): void {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      collectFields(value[index], `${path}[${index}]`, options, output);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const key of Object.keys(value).sort()) {
    if (key === "_guard_meta") {
      continue;
    }

    const childPath = path.length === 0 ? key : `${path}.${key}`;
    output.push({
      parent: value,
      key,
      path: childPath,
      priority: fieldPriority(childPath, key, options),
    });
    collectFields(value[key], childPath, options, output);
  }
}

function nextDroppableField(
  bundle: EvidenceBundle,
  options: ResolvedGuardOptions,
): FieldRef | undefined {
  const refs: FieldRef[] = [];

  for (let index = 0; index < bundle.contentText.length; index += 1) {
    collectFields(
      bundle.contentText[index],
      `contentText[${index}]`,
      options,
      refs,
    );
  }

  if ("structuredContent" in bundle) {
    collectFields(
      bundle.structuredContent,
      "structuredContent",
      options,
      refs,
    );
  }

  const priorityRank: Record<FieldPriority, number> = {
    p2: 0,
    p1: 1,
    p0: 2,
  };

  return refs
    .filter((ref) => ref.priority === "p2")
    .sort((left, right) => {
      const byPriority = priorityRank[left.priority] - priorityRank[right.priority];
      if (byPriority !== 0) {
        return byPriority;
      }

      const byDepth = right.path.length - left.path.length;
      return byDepth !== 0
        ? byDepth
        : left.path < right.path
          ? -1
          : left.path > right.path
            ? 1
            : 0;
    })[0];
}

function collectArrays(
  value: unknown,
  parent: MutableParent,
  key: string | number,
  path: string,
  output: ValueRef[],
): void {
  if (Array.isArray(value)) {
    output.push({ parent, key, path, value });

    for (let index = 0; index < value.length; index += 1) {
      collectArrays(
        value[index],
        value,
        index,
        `${path}[${index}]`,
        output,
      );
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const childKey of Object.keys(value).sort()) {
    if (childKey === "_guard_meta") {
      continue;
    }

    collectArrays(
      value[childKey],
      value,
      childKey,
      `${path}.${childKey}`,
      output,
    );
  }
}

function nextArrayToSlice(
  bundle: EvidenceBundle,
  options: ResolvedGuardOptions,
): ValueRef | undefined {
  const refs: ValueRef[] = [];

  for (let index = 0; index < bundle.contentText.length; index += 1) {
    collectArrays(
      bundle.contentText[index],
      bundle.contentText,
      index,
      `contentText[${index}]`,
      refs,
    );
  }

  if ("structuredContent" in bundle) {
    collectArrays(
      bundle.structuredContent,
      bundle as unknown as UnknownRecord,
      "structuredContent",
      "structuredContent",
      refs,
    );
  }

  return refs
    .filter(
      (ref) =>
        Array.isArray(ref.value) &&
        ref.value.length > 0 &&
        !isProtectedPath(
          ref.path,
          typeof ref.key === "string" ? ref.key : String(ref.key),
          options,
        ),
    )
    .sort((left, right) => {
      const byLength =
        (right.value as unknown[]).length - (left.value as unknown[]).length;
      return byLength !== 0
        ? byLength
        : left.path < right.path
          ? -1
          : left.path > right.path
            ? 1
            : 0;
    })[0];
}

function replaceRef(ref: ValueRef, value: unknown): void {
  if (Array.isArray(ref.parent) && typeof ref.key === "number") {
    ref.parent[ref.key] = value;
    return;
  }

  if (!Array.isArray(ref.parent) && typeof ref.key === "string") {
    ref.parent[ref.key] = value;
  }
}

function sliceArrayRef(
  ref: ValueRef,
  options: ResolvedGuardOptions,
  state: DegradationState,
): void {
  const array = ref.value as unknown[];
  const retainedCount = array.length > 1 ? Math.floor(array.length / 2) : 0;
  const retained = array.slice(0, retainedCount);
  const omittedNow = array.length - retainedCount;
  const parent = ref.parent;

  if (
    !Array.isArray(parent) &&
    ref.key === "items" &&
    isRecord(parent._guard_meta) &&
    parent._guard_meta.status === "truncated_to_budget"
  ) {
    parent.items = retained;
    parent._guard_meta.retained_count = retainedCount;
    state.omittedItems += omittedNow;

    if (state.slicedArrayCount === 1) {
      state.firstArrayRetainedCount = retainedCount;
    }
    return;
  }

  const wrapper = {
    items: retained,
    _guard_meta: {
      status: "truncated_to_budget",
      original_count: array.length,
      retained_count: retainedCount,
      suggested_action: options.suggestedAction,
    },
  };

  replaceRef(ref, wrapper);
  state.omittedItems += omittedNow;
  state.slicedArrayCount += 1;

  if (state.slicedArrayCount === 1) {
    state.firstArrayOriginalCount = array.length;
    state.firstArrayRetainedCount = retainedCount;
  }
}

function collectStrings(
  value: unknown,
  parent: MutableParent,
  key: string | number,
  path: string,
  options: ResolvedGuardOptions,
  output: ValueRef[],
): void {
  if (typeof value === "string") {
    const finalKey = typeof key === "string" ? key : String(key);
    if (fieldPriority(path, finalKey, options) !== "p0" && value.length > 1) {
      output.push({ parent, key, path, value });
    }
    return;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      collectStrings(
        value[index],
        value,
        index,
        `${path}[${index}]`,
        options,
        output,
      );
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const childKey of Object.keys(value).sort()) {
    if (childKey === "_guard_meta") {
      continue;
    }

    collectStrings(
      value[childKey],
      value,
      childKey,
      `${path}.${childKey}`,
      options,
      output,
    );
  }
}

function nextStringToClamp(
  bundle: EvidenceBundle,
  options: ResolvedGuardOptions,
): ValueRef | undefined {
  const refs: ValueRef[] = [];

  for (let index = 0; index < bundle.contentText.length; index += 1) {
    collectStrings(
      bundle.contentText[index],
      bundle.contentText,
      index,
      `contentText[${index}]`,
      options,
      refs,
    );
  }

  if ("structuredContent" in bundle) {
    collectStrings(
      bundle.structuredContent,
      bundle as unknown as UnknownRecord,
      "structuredContent",
      "structuredContent",
      options,
      refs,
    );
  }

  return refs.sort((left, right) => {
    const byLength =
      (right.value as string).length - (left.value as string).length;
    return byLength !== 0
        ? byLength
        : left.path < right.path
          ? -1
          : left.path > right.path
            ? 1
            : 0;
  })[0];
}

function clampStringRef(ref: ValueRef, state: DegradationState): void {
  const current = ref.value as string;
  const characters = Array.from(current);
  const targetLength = Math.max(1, Math.floor(characters.length / 2));
  const next = targetLength <= 1
    ? characters.slice(0, 1).join("")
    : `${characters.slice(0, targetLength - 1).join("")}…`;

  replaceRef(ref, next);
  if (!state.hardClampedFields.includes(ref.path)) {
    state.hardClampedFields.push(ref.path);
  }
}

function buildMeta(
  state: DegradationState,
  originalBytes: number,
  projection: string,
  options: ResolvedGuardOptions,
): TombstoneMeta {
  const measurement = measureGuardText(projection, options);
  const omittedFields = [...new Set(state.omittedFields)].sort();
  const hardClampedFields = [...new Set(state.hardClampedFields)].sort();
  const metadataListLimit = 32;

  return {
    status: "truncated_to_budget",
    ...(state.slicedArrayCount === 1 && state.firstArrayOriginalCount !== undefined
      ? { original_count: state.firstArrayOriginalCount }
      : {}),
    ...(state.slicedArrayCount === 1 && state.firstArrayRetainedCount !== undefined
      ? { retained_count: state.firstArrayRetainedCount }
      : {}),
    ...(omittedFields.length > 0
      ? {
          omitted_fields: omittedFields.slice(0, metadataListLimit),
          omitted_field_count: omittedFields.length,
        }
      : {}),
    ...(state.omittedItems > 0 ? { omitted_items: state.omittedItems } : {}),
    original_bytes: originalBytes,
    retained_bytes: measurement.bytes,
    estimated_tokens: measurement.estimatedTokens,
    ...(hardClampedFields.length > 0
      ? {
          hard_clamped_fields: hardClampedFields.slice(0, metadataListLimit),
          hard_clamped_field_count: hardClampedFields.length,
        }
      : {}),
    suggested_action: options.suggestedAction,
  };
}

function fitTombstone(
  meta: TombstoneMeta,
  options: ResolvedGuardOptions,
): string {
  const candidates: unknown[] = [
    { _guard_meta: meta },
    {
      _guard_meta: {
        status: meta.status,
        ...(meta.original_count === undefined
          ? {}
          : { original_count: meta.original_count }),
        ...(meta.retained_count === undefined
          ? {}
          : { retained_count: meta.retained_count }),
        ...(meta.omitted_items === undefined
          ? {}
          : { omitted_items: meta.omitted_items }),
        suggested_action: meta.suggested_action,
      },
    },
    { _guard_meta: { status: meta.status } },
    {},
  ];

  for (const candidate of candidates) {
    const rendered = renderCompactJson(candidate);
    if (fitsGuardBudget(rendered, options)) {
      return rendered;
    }
  }

  return "";
}

function initialBundle(
  result: UnknownRecord,
  options: ResolvedGuardOptions,
): {
  bundle: EvidenceBundle;
  textBlockIndexes: number[];
  originalProjection: string;
} {
  const content = Array.isArray(result.content) ? result.content : [];
  const contentText: unknown[] = [];
  const textBlockIndexes: number[] = [];
  const originalParts: string[] = [];

  for (let index = 0; index < content.length; index += 1) {
    const block = content[index];
    if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
      textBlockIndexes.push(index);
      contentText.push(
        options.format === "raw"
          ? block.text
          : normalizeGuardText(block.text, options.pinnedFields),
      );
      originalParts.push(block.text);
    }
  }

  const bundle: EvidenceBundle = { contentText };

  if ("structuredContent" in result) {
    bundle.structuredContent = normalizeGuardValue(
      result.structuredContent,
      options.pinnedFields,
    );

    const originalStructured = JSON.stringify(result.structuredContent);
    if (originalStructured !== undefined && !originalParts.includes(originalStructured)) {
      originalParts.push(originalStructured);
    }
  }

  return {
    bundle,
    textBlockIndexes,
    originalProjection: originalParts.join("\n\n"),
  };
}

function runGuardPipeline(
  bundle: EvidenceBundle,
  originalProjection: string,
  options: ResolvedGuardOptions,
): GuardPipelineResult {
  let projection = renderBundle(bundle, options);
  const originalBytes = utf8ByteLength(originalProjection);

  if (fitsGuardBudget(projection, options)) {
    return { bundle, projection };
  }

  if (options.strategy === "lossless-first") {
    const state: DegradationState = {
      omittedFields: [],
      hardClampedFields: [],
      omittedItems: 0,
      slicedArrayCount: 0,
    };
    const meta = buildMeta(state, originalBytes, projection, options);
    return finishExceeded(bundle, projection, meta, options);
  }

  const state: DegradationState = {
    omittedFields: [],
    hardClampedFields: [],
    omittedItems: 0,
    slicedArrayCount: 0,
  };

  // Priority pruning: remove low-priority p2 fields. p0/p1 fields are retained.
  for (let iteration = 0; iteration < 10_000; iteration += 1) {
    const ref = nextDroppableField(bundle, options);
    if (ref === undefined) {
      break;
    }

    delete ref.parent[ref.key];
    state.omittedFields.push(ref.path);
    projection = renderBundle(bundle, options);

    if (fitsGuardBudget(projection, options)) {
      return {
        bundle,
        projection,
        meta: buildMeta(state, originalBytes, projection, options),
      };
    }
  }

  // Array slicing keeps leading rows/items and inserts an explicit local tombstone.
  for (let iteration = 0; iteration < 10_000; iteration += 1) {
    const ref = nextArrayToSlice(bundle, options);
    if (ref === undefined) {
      break;
    }

    sliceArrayRef(ref, options, state);
    projection = renderBundle(bundle, options);

    if (fitsGuardBudget(projection, options)) {
      return {
        bundle,
        projection,
        meta: buildMeta(state, originalBytes, projection, options),
      };
    }
  }

  // Last structured degradation stage: clamp whole strings at code-point boundaries.
  for (let iteration = 0; iteration < 10_000; iteration += 1) {
    const ref = nextStringToClamp(bundle, options);
    if (ref === undefined) {
      break;
    }

    clampStringRef(ref, state);
    projection = renderBundle(bundle, options);

    if (fitsGuardBudget(projection, options)) {
      return {
        bundle,
        projection,
        meta: buildMeta(state, originalBytes, projection, options),
      };
    }
  }

  const meta = buildMeta(state, originalBytes, projection, options);
  return finishExceeded(bundle, projection, meta, options);
}

function finishExceeded(
  bundle: EvidenceBundle,
  projection: string,
  meta: TombstoneMeta,
  options: ResolvedGuardOptions,
): GuardPipelineResult {
  if (options.onBudgetExceeded === "throw") {
    throw new GuardBudgetExceededError(
      "MCP tool result exceeded the configured guard budget",
      measureGuardText(projection, options),
    );
  }

  if (options.onBudgetExceeded === "truncate-bytes" && options.format !== "compact-json") {
    return {
      bundle,
      projection,
      meta,
      forcedText: clampTextToGuardBudget(projection, options),
    };
  }

  return {
    bundle,
    projection,
    meta,
    forcedText: fitTombstone(meta, options),
  };
}

function mergeGuardMeta(
  originalMeta: unknown,
  meta: TombstoneMeta | undefined,
): unknown {
  if (meta === undefined) {
    return originalMeta;
  }

  if (isRecord(originalMeta)) {
    return {
      ...originalMeta,
      evidenceGuard: meta,
    };
  }

  return {
    evidenceGuard: meta,
  };
}

/**
 * Guard a CallToolResult-shaped object while preserving a valid MCP result
 * envelope. Authoritative structuredContent remains unchanged while text and
 * structured evidence contribute to a separately compacted model projection.
 */
export function guardCallToolResult<T extends object>(
  result: T,
  guardOptions: GuardOptions = {},
): T {
  const options = resolveGuardOptions(guardOptions);
  const source: UnknownRecord = { ...(result as UnknownRecord) };
  const prepared = initialBundle(source, options);
  const guarded = runGuardPipeline(
    prepared.bundle,
    prepared.originalProjection,
    options,
  );

  const originalContent = Array.isArray(source.content)
    ? [...source.content]
    : [];

  if (guarded.forcedText !== undefined) {
    const nonTextBlocks = originalContent.filter(
      (block) =>
        !(isRecord(block) && block.type === "text" && typeof block.text === "string"),
    );

    source.content = [
      ...nonTextBlocks,
      {
        type: "text",
        text: guarded.forcedText,
      },
    ];
  } else {
    for (let slot = 0; slot < prepared.textBlockIndexes.length; slot += 1) {
      const contentIndex = prepared.textBlockIndexes[slot];
      const originalBlock =
        contentIndex === undefined ? undefined : originalContent[contentIndex];
      const value = guarded.bundle.contentText[slot];

      if (
        contentIndex !== undefined &&
        isRecord(originalBlock) &&
        originalBlock.type === "text"
      ) {
        originalContent[contentIndex] = {
          ...originalBlock,
          text: renderGuardValue(value, options.format),
        };
      }
    }

    if (
      prepared.textBlockIndexes.length === 0 &&
      "structuredContent" in guarded.bundle
    ) {
      originalContent.push({
        type: "text",
        text: renderGuardValue(guarded.bundle.structuredContent, options.format),
      });
    }

    source.content = originalContent;
  }

  if (guarded.meta !== undefined) {
    source._meta = mergeGuardMeta(source._meta, guarded.meta);
  }

  return source as T;
}

/**
 * Wrap an MCP client without modifying the upstream server or the client's
 * public TypeScript surface. The returned Proxy keeps the exact static type of
 * the supplied client and only intercepts callTool().
 */
export function withEvidenceGuard<
  TClient extends { callTool: (...args: never[]) => unknown },
>(
  client: TClient,
  options: GuardOptions = {},
): TClient {
  const callable = Reflect.get(client, "callTool");

  if (typeof callable !== "function") {
    throw new TypeError("withEvidenceGuard() requires a client with callTool()");
  }

  const guardedCallTool = async (...args: unknown[]): Promise<unknown> => {
    const result = await Reflect.apply(callable, client, args) as unknown;

    if (!isRecord(result)) {
      throw new TypeError("MCP client callTool() returned a non-object result");
    }

    return guardCallToolResult(result, options);
  };

  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === "callTool") {
        return guardedCallTool;
      }

      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
