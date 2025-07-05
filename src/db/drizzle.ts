import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "npm:@libsql/client/node";
import { outputs } from "./schema.ts";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { homedir } from "node:os";
let db: ReturnType<typeof drizzle> | null = null;

export async function initOrGetDrizzleDb() {
  if (db) return db;

  // データベースディレクトリとファイルパスを構築
  const configDir = join(homedir(), ".config", "@masinc", "mcp-cmd");
  const dbPath = join(configDir, "mcp-cmd.db");

  // ディレクトリが存在しない場合は作成
  await ensureDir(configDir);

  const client = createClient({
    url: "file:" + dbPath,
  });

  db = drizzle(client);

  // テーブル作成
  await client.execute(`
    CREATE TABLE IF NOT EXISTS outputs (
      id TEXT PRIMARY KEY,
      stdout TEXT NOT NULL DEFAULT '',
      stdoutIsEncoded INTEGER NOT NULL DEFAULT 0,
      stderr TEXT NOT NULL DEFAULT '',
      stderrIsEncoded INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'running',
      exitCode INTEGER DEFAULT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

export { outputs };
