import { describe, expect, it } from "vitest";

import {
  compactValue,
  normalizeGuardText,
  normalizeGuardValue,
  pruneEmptyValues,
  renderCompactJson,
} from "../src/index.js";

describe("lossless canonicalization", () => {
  it("preserves legitimate JSON values while sorting object keys", () => {
    const value = {
      zero: 0,
      falseValue: false,
      nullValue: null,
      emptyString: "",
      emptyArray: [],
      nested: {
        nullValue: null,
        emptyString: "",
        emptyArray: [],
        keep: "x",
      },
    };

    const compacted = compactValue(value);

    expect(compacted).toEqual(value);
    expect(renderCompactJson(compacted)).toBe(
      '{"emptyArray":[],"emptyString":"","falseValue":false,"nested":{"emptyArray":[],"emptyString":"","keep":"x","nullValue":null},"nullValue":null,"zero":0}',
    );
  });

  it("preserves every array position during canonicalization", () => {
    const value = [
      "first",
      null,
      "",
      [],
      0,
      false,
      "last",
    ];

    expect(compactValue(value)).toEqual(value);
    expect(renderCompactJson(compactValue(value))).toBe(
      '["first",null,"",[],0,false,"last"]',
    );
  });

  it("preserves JSON values parsed from text", () => {
    const text =
      '{"nullValue":null,"emptyString":"","emptyArray":[],"zero":0,"falseValue":false}';

    expect(renderCompactJson(normalizeGuardText(text))).toBe(
      '{"emptyArray":[],"emptyString":"","falseValue":false,"nullValue":null,"zero":0}',
    );
  });

  it("preserves JSON values supplied as structured guard data", () => {
    const value = {
      nullValue: null,
      emptyString: "",
      emptyArray: [],
      nested: [null, "", [], 0, false],
    };

    expect(normalizeGuardValue(value)).toEqual(value);
  });
});

describe("explicit empty-field pruning", () => {
  it("prunes empty object fields without collapsing array positions", () => {
    const value = [
      null,
      "",
      [],
      {
        dropNull: null,
        dropString: "",
        dropArray: [],
        keepZero: 0,
        keepFalse: false,
        keepText: "x",
      },
      "last",
    ];

    expect(pruneEmptyValues(value)).toEqual([
      null,
      "",
      [],
      {
        keepZero: 0,
        keepFalse: false,
        keepText: "x",
      },
      "last",
    ]);
  });

  it("continues to preserve pinned empty object fields", () => {
    const value = {
      optional: null,
      nested: {
        keepEmpty: "",
        dropEmpty: "",
      },
    };

    expect(
      pruneEmptyValues(value, ["optional", "nested.keepEmpty"]),
    ).toEqual({
      optional: null,
      nested: {
        keepEmpty: "",
      },
    });
  });
});
