#!/usr/bin/env -S deno run

console.log(
  JSON.stringify({
    decision: "block",
    reason: "Bash tool is not allowed. Instead, use the MCP cmd tool.",
  }),
);
