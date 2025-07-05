import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";
import { createMcpServer } from "../mcp/server.ts";
import denoConfig from "../../deno.json" with { type: "json" };

console.info(`mcp-cmd v${denoConfig.version} (HTTP mode)`);

const app: Hono = new Hono();

app.get("/", (c) => {
  return c.text("Hello, MCP Server is available at /mcp");
});

app.all("/mcp", async (c) => {
  const mcpServer = createMcpServer();
  const transport = new StreamableHTTPTransport();
  await mcpServer.connect(transport);
  return transport.handleRequest(c);
});

export default (app satisfies Deno.ServeDefaultExport) as Deno.ServeDefaultExport;
