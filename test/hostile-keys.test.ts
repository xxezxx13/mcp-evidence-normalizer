import { describe, expect, it } from "vitest";

import {
  compactValue,
  normalizeGuardText,
  pruneEmptyValues,
  renderCompactJson,
  sortObjectKeys,
} from "../src/index.js";

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

describe("hostile-looking evidence keys", () => {
  it("preserves __proto__, constructor, and prototype as ordinary own properties", () => {
    const source = JSON.parse(
      '{"safe":"yes","__proto__":{"polluted":"evidence"},"constructor":{"kind":"ctor"},"prototype":{"kind":"proto"}}',
    ) as Record<string, unknown>;

    const sorted = sortObjectKeys(source) as Record<string, unknown>;

    expect(Object.getPrototypeOf(sorted)).toBe(Object.prototype);
    expect(hasOwn(sorted, "__proto__")).toBe(true);
    expect(hasOwn(sorted, "constructor")).toBe(true);
    expect(hasOwn(sorted, "prototype")).toBe(true);

    expect(sorted["__proto__"]).toEqual({
      polluted: "evidence",
    });

    expect(renderCompactJson(sorted)).toBe(
      '{"__proto__":{"polluted":"evidence"},"constructor":{"kind":"ctor"},"prototype":{"kind":"proto"},"safe":"yes"}',
    );

    expect(
      (Object.prototype as Record<string, unknown>)["polluted"],
    ).toBeUndefined();
  });

  it("preserves hostile keys recursively without altering nested prototypes", () => {
    const source = JSON.parse(
      '{"outer":{"__proto__":{"marker":true},"keep":1},"items":[{"__proto__":{"arrayMarker":true},"keep":2}]}',
    ) as Record<string, unknown>;

    const compacted = compactValue(source) as {
      outer: Record<string, unknown>;
      items: Array<Record<string, unknown>>;
    };

    const firstItem = compacted.items[0];

    expect(firstItem).toBeDefined();

    if (firstItem === undefined) {
      throw new Error("Expected compacted.items[0] to exist.");
    }

    expect(Object.getPrototypeOf(compacted)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(compacted.outer)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(firstItem)).toBe(Object.prototype);

    expect(hasOwn(compacted.outer, "__proto__")).toBe(true);
    expect(hasOwn(firstItem, "__proto__")).toBe(true);

    expect(compacted.outer["__proto__"]).toEqual({
      marker: true,
    });

    expect(firstItem["__proto__"]).toEqual({
      arrayMarker: true,
    });

    expect(renderCompactJson(compacted)).toBe(
      '{"items":[{"__proto__":{"arrayMarker":true},"keep":2}],"outer":{"__proto__":{"marker":true},"keep":1}}',
    );
  });

  it("keeps __proto__ safe during explicit empty-field pruning", () => {
    const source = JSON.parse(
      '{"__proto__":{"drop":null,"keep":"yes"},"ordinary":{"drop":"","keep":0}}',
    ) as Record<string, unknown>;

    const pruned = pruneEmptyValues(source) as Record<string, unknown>;

    expect(Object.getPrototypeOf(pruned)).toBe(Object.prototype);
    expect(hasOwn(pruned, "__proto__")).toBe(true);

    const protoEvidence = pruned["__proto__"] as Record<string, unknown>;

    expect(Object.getPrototypeOf(protoEvidence)).toBe(Object.prototype);
    expect(protoEvidence).toEqual({
      keep: "yes",
    });

    expect(pruned["ordinary"]).toEqual({
      keep: 0,
    });

    expect(
      (Object.prototype as Record<string, unknown>)["keep"],
    ).toBeUndefined();
  });

  it("preserves hostile keys parsed from JSON text", () => {
    const normalized = normalizeGuardText(
      '{"__proto__":{"safe":true},"constructor":null,"prototype":"","zero":0,"falseValue":false}',
    );

    expect(renderCompactJson(normalized)).toBe(
      '{"__proto__":{"safe":true},"constructor":null,"falseValue":false,"prototype":"","zero":0}',
    );

    const record = normalized as Record<string, unknown>;

    expect(Object.getPrototypeOf(record)).toBe(Object.prototype);
    expect(hasOwn(record, "__proto__")).toBe(true);
    expect(
      (Object.prototype as Record<string, unknown>)["safe"],
    ).toBeUndefined();
  });
});
