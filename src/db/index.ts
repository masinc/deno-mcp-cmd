import { DatabaseSync } from "node:sqlite";
import { initDatabase } from "./init.ts";
import { join } from "@std/path";
import { existsSync } from "@std/fs";
import { homedir } from "node:os";

let dbInstance: DatabaseSync | null = null;

function getDbPath(): string {
  const configDir = join(homedir(), ".config", "@masinc", "mcp-cmd");

  // 設定ディレクトリが存在しない場合は作成
  if (!existsSync(configDir)) {
    Deno.mkdirSync(configDir, { recursive: true });
  }

  return join(configDir, "mcp-cmd.db");
}

export function initOrGetDb(): DatabaseSync {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(getDbPath());
    initDatabase(dbInstance);
  }

  return dbInstance;
}

// export function closeDb() {
//   if (dbInstance) {
//     dbInstance.close();
//     dbInstance = null;
//   }
// }
