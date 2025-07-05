import type { DatabaseSync } from "node:sqlite";

export function initDatabase(db: DatabaseSync) {
  db.exec(`
        CREATE TABLE IF NOT EXISTS outputs (
        id TEXT PRIMARY KEY,
        stdout TEXT NOT NULL,
        stdoutIsEncoded INTEGER NOT NULL DEFAULT 0,
        stderr TEXT NOT NULL DEFAULT '',
        stderrIsEncoded INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'running',
        exitCode INTEGER DEFAULT NULL,
        createdAt TEXT NOT NULL DEFAULT (datetime('now'))
        );
    `);

  db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_outputs_id ON outputs (id);
    `);
}
