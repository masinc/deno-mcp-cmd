import { initOrGetDb } from "./index.ts";
import { type OutputId, OutputSchema } from "./types.ts";

export function createOutputId(): OutputId {
  const id = crypto.randomUUID();
  return id as OutputId;
}

export function isOutputId(id: unknown): id is OutputId {
  return typeof id === "string" && id.length === 36;
}

export function idToString(id: OutputId): string {
  if (!isOutputId(id)) {
    throw new Error(`Invalid OutputId: ${id}`);
  }
  return id;
}

type InsertOutputParams = {
  stdout: string;
  stdoutIsEncoded?: boolean;
  stderr?: string;
  stderrIsEncoded?: boolean;
};

export function insertOutput(
  params: InsertOutputParams,
): OutputId {
  try {
    const db = initOrGetDb();
    const id = createOutputId();
    const createdAt = new Date().toISOString();

    const result = db.prepare(
      `INSERT INTO outputs (id, stdout, stdoutIsEncoded, stderr, stderrIsEncoded, createdAt) VALUES (:id, :stdout, :stdoutIsEncoded, :stderr, :stderrIsEncoded, :createdAt)`,
    ).run({
      id,
      stdout: params.stdout,
      stdoutIsEncoded: params.stdoutIsEncoded ? 1 : 0,
      stderr: params.stderr || "",
      stderrIsEncoded: params.stderrIsEncoded ? 1 : 0,
      createdAt,
    });

    if (result.changes !== 1) {
      throw new Error(`Failed to insert output: expected 1 change, got ${result.changes}`);
    }

    return id;
  } catch (error) {
    throw new Error(`Database error while inserting output: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

type OutputResult = {
  stdout: string;
  stdoutIsEncoded: boolean;
  stderr: string;
  stderrIsEncoded: boolean;
  createdAt: string;
};

export function getOutputById(id: OutputId): OutputResult | undefined {
  try {
    if (!isOutputId(id)) {
      throw new Error(`Invalid output ID format: ${id}`);
    }

    const db = initOrGetDb();
    const result = db.prepare(`SELECT * FROM outputs WHERE id = ?`).get(id);

    if (!result) {
      return undefined;
    }

    const output = OutputSchema.safeParse(result);

    if (!output.success) {
      throw new Error(`Failed to parse output result: ${output.error.message}`);
    }

    return {
      stdout: output.data.stdout,
      stdoutIsEncoded: Boolean(output.data.stdoutIsEncoded),
      stderr: output.data.stderr,
      stderrIsEncoded: Boolean(output.data.stderrIsEncoded),
      createdAt: output.data.createdAt,
    };
  } catch (error) {
    throw new Error(`Database error while getting output by ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function deleteExpiredOutputs(
  expirationDays: number = 1,
): number {
  try {
    const db = initOrGetDb();
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() - expirationDays);
    const isoExpirationDate = expirationDate.toISOString();

    const result = db.prepare(
      `DELETE FROM outputs WHERE createdAt < ?`,
    ).run(isoExpirationDate);
    
    return Number(result.changes);
  } catch (error) {
    throw new Error(`Database error while deleting expired outputs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
