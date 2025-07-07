import { drizzle } from "drizzle-orm/libsql";
import { type Client, createClient } from "npm:@libsql/client/node";
import { outputs } from "./schema.ts";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { homedir } from "node:os";
import { deleteExpiredOutputs } from "./ouputs.ts";
let db: ReturnType<typeof drizzle> | null = null;

export async function initOrGetDrizzleDb(
  options?: { inMemory?: boolean; reset?: boolean },
) {
  if (options?.reset) {
    db = null;
  }

  if (db) return db;

  let client;

  if (options?.inMemory) {
    // インメモリDB使用
    client = createClient({
      url: ":memory:",
    });
  } else {
    // データベースディレクトリとファイルパスを構築
    const configDir = join(homedir(), ".config", "@masinc", "mcp-cmd");
    const dbPath = join(configDir, "mcp-cmd.db");

    // ディレクトリが存在しない場合は作成
    await ensureDir(configDir);

    client = createClient({
      url: "file:" + dbPath,
    });
  }

  await initDatabase(client);

  db = drizzle(client);
  return db;
}

async function initDatabase(client: Client) {
  // テーブルが存在しない場合は作成
  await client.execute(`
    CREATE TABLE IF NOT EXISTS outputs (
      id TEXT PRIMARY KEY,
      stdout TEXT NOT NULL DEFAULT '',
      stdoutIsEncoded INTEGER NOT NULL DEFAULT 0,
      stderr TEXT NOT NULL DEFAULT '',
      stderrIsEncoded INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'running',
      exitCode INTEGER DEFAULT NULL,
      cwd TEXT NOT NULL,
      createdAt TEXT NOT NULL
    )
  `);

  // データベース初期化時にクリーンアップを実行
  await cleanupExpiredOutputsOnInit();
}

async function cleanupExpiredOutputsOnInit(expirationDays: number = 1) {
  try {
    const deletedCount = await deleteExpiredOutputs(expirationDays);
    if (deletedCount > 0) {
      console.log(`Database cleanup: ${deletedCount} expired records deleted`);
    }
  } catch (error) {
    console.warn(`Database cleanup failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export { outputs };
