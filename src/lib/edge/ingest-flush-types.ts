import type { RealtimeSnapshotRecord } from "./ingest-normalize";
import type { BufferedVisitRow, SqlWriter } from "./ingest-types";
import type { Env } from "./types";

export interface IngestFlushContext extends SqlWriter {
  env: Pick<Env, "DB">;
  dictionaryIds: Map<string, number>;
  readPersistedVisitRow(
    siteId: string,
    visitId: string,
  ): Promise<BufferedVisitRow | null>;
  insertBufferedVisitRow(row: BufferedVisitRow): void;
  hasOpenVisitsForVisitor(siteId: string, visitorId: string): boolean;
  pushRealtimeRecord(record: RealtimeSnapshotRecord): Promise<void>;
}
