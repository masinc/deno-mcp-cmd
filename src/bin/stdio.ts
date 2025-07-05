import { createMcpServer } from "../mcp/server.ts";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import denoConfig from "../../deno.json" with { type: "json" };

console.error(`mcp-cmd v${denoConfig.version} (STDIO mode)`);

const mcpServer = createMcpServer();
const transport = new StdioServerTransport();

await mcpServer.connect(transport);
