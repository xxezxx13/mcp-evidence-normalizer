import {
  normalizeMcpResult,
  renderEvidence,
} from "../src/index.js";

const result = {
  content: [
    {
      type: "text",
      text: "Alpha",
    },
    {
      type: "text",
      text: "Beta",
    },
  ],
};

const evidence = normalizeMcpResult(result, {
  toolName: "example_tool",
  maxChars: 4_000,
});

console.log(renderEvidence(evidence));
