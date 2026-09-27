import {
  describe,
  expect,
  it,
} from "vitest";

import {
  withEvidenceGuard,
} from "../src/index.js";

class PrivateClient {
  #value = 42;

  get value(): number {
    return this.#value;
  }

  set value(next: number) {
    this.#value = next;
  }

  readValue(): number {
    return this.#value;
  }

  async callTool(): Promise<{
    content: Array<{
      type: "text";
      text: string;
    }>;
  }> {
    return {
      content: [
        {
          type: "text",
          text: String(this.#value),
        },
      ],
    };
  }
}

describe("withEvidenceGuard proxy compatibility", () => {
  it(
    "preserves private-field method and accessor receivers",
    () => {
      const raw = new PrivateClient();
      const guarded = withEvidenceGuard(raw);

      expect(guarded.readValue()).toBe(42);
      expect(guarded.value).toBe(42);

      guarded.value = 73;

      expect(raw.value).toBe(73);
      expect(guarded.value).toBe(73);
      expect(guarded.readValue()).toBe(73);
    },
  );

  it(
    "returns stable bound functions for repeated method access",
    () => {
      const raw = new PrivateClient();
      const guarded = withEvidenceGuard(raw);

      const first = guarded.readValue;
      const second = guarded.readValue;

      expect(first).toBe(second);
      expect(first).not.toBe(raw.readValue);
      expect(first()).toBe(42);

      expect(guarded.callTool).toBe(
        guarded.callTool,
      );
    },
  );

  it(
    "keeps function-valued own properties stable and correctly received",
    () => {
      const callback = function (
        this: { marker: string },
      ): string {
        return this.marker;
      };

      const raw = {
        marker: "underlying-client",
        callback,

        async callTool() {
          return {
            content: [
              {
                type: "text" as const,
                text: "ok",
              },
            ],
          };
        },
      };

      const guarded = withEvidenceGuard(raw);

      const first =
        guarded.callback as () => string;
      const second =
        guarded.callback as () => string;

      expect(first).toBe(second);
      expect(first).not.toBe(callback);
      expect(first()).toBe(
        "underlying-client",
      );
    },
  );

  it(
    "preserves own keys, symbols, and property descriptors",
    () => {
      const symbolKey = Symbol("probe");

      const raw = {
        normal: 1,
        [symbolKey]: 2,

        async callTool() {
          return {
            content: [
              {
                type: "text" as const,
                text: "ok",
              },
            ],
          };
        },
      };

      Object.defineProperty(
        raw,
        "hidden",
        {
          value: 3,
          writable: true,
          enumerable: false,
          configurable: true,
        },
      );

      const guarded = withEvidenceGuard(raw);

      expect(
        Reflect.ownKeys(guarded),
      ).toEqual(
        Reflect.ownKeys(raw),
      );

      expect(
        Object.getOwnPropertyDescriptor(
          guarded,
          "hidden",
        ),
      ).toEqual(
        Object.getOwnPropertyDescriptor(
          raw,
          "hidden",
        ),
      );

      expect(guarded[symbolKey]).toBe(2);
    },
  );

  it(
    "invokes callTool against the underlying private-field receiver",
    async () => {
      const raw = new PrivateClient();
      const guarded = withEvidenceGuard(
        raw,
        {
          maxBytes: 10_000,
          format: "compact-json",
        },
      );

      const result =
        await guarded.callTool();

      expect(result.content).toEqual([
        {
          type: "text",
          text: "42",
        },
      ]);
    },
  );

  it(
    "returns frozen own function properties unchanged",
    () => {
      const fixedMethod = function (
        this: { marker: string },
      ): string {
        return this.marker;
      };

      const raw = {
        marker: "underlying-client",
        fixedMethod,

        async callTool() {
          return {
            content: [
              {
                type: "text" as const,
                text: "ok",
              },
            ],
          };
        },
      };

      Object.defineProperty(
        raw,
        "fixedMethod",
        {
          value: fixedMethod,
          writable: false,
          enumerable: true,
          configurable: false,
        },
      );

      const guarded = withEvidenceGuard(raw);

      expect(guarded.fixedMethod).toBe(
        fixedMethod,
      );

      expect(
        Reflect.apply(
          guarded.fixedMethod,
          raw,
          [],
        ),
      ).toBe("underlying-client");
    },
  );

  it(
    "rejects a frozen own callTool that cannot be intercepted",
    () => {
      const raw = {
        async callTool() {
          return {
            content: [
              {
                type: "text" as const,
                text: "ok",
              },
            ],
          };
        },
      };

      Object.defineProperty(
        raw,
        "callTool",
        {
          value: raw.callTool,
          writable: false,
          enumerable: true,
          configurable: false,
        },
      );

      expect(
        () => withEvidenceGuard(raw),
      ).toThrow(
        "withEvidenceGuard() cannot intercept a non-configurable, non-writable own callTool property",
      );
    },
  );

});
