/**
 * MCP Server specific schemas using Zod v3 for compatibility
 * 
 * This file contains Zod v3 compatible schemas used only by the MCP server.
 * We use Zod v3 here because the MCP SDK requires v3 compatible inputSchema types.
 * 
 * Note: The rest of the application uses Zod v4 (imported as "zod/v4")
 */
import * as zV3 from "zod"; // Zod v3 for MCP SDK compatibility

// MCP-compatible OutputId schema (Zod v3)
export const OutputIdSchemaV3 = zV3.string().regex(/^\d{9}$/);