import { DurableObject } from "cloudflare:workers";

import {
  attachPerformanceToVisit as attachPerformanceToVisitInBufferStore,
  findRecentVisitorSession as findRecentVisitorSessionInBufferStore,
  getVisitContext as getVisitContextFromBufferStore,
  insertBufferedCustomEvent as insertBufferedCustomEventInBufferStore,
  insertBufferedVisitRow as insertBufferedVisitRowInBufferStore,
  insertCustomEvent as insertCustomEventInBufferStore,
  insertVisit as insertVisitInBufferStore,
  readPersistedVisitRow as readPersistedVisitRowFromBufferStore,
  updateOpenVisitActivity as updateOpenVisitActivityInBufferStore,
} from "./ingest-buffer-store";
import {
  D1_FLUSH_INTERVAL_MS,
  HIDDEN_LEAVE_GRACE_MS,
  WS_PRESENCE_LEAVE_EVENT,
} from "./ingest-constants";
import { handleIngestDiagnostic } from "./ingest-diagnostic";
import {
  cleanupBufferedRows as cleanupBufferedRowsInFlushStore,
  flushPendingToD1 as flushPendingToD1InFlushStore,
  flushTimeouts as flushTimeoutsInFlushStore,
} from "./ingest-flush";
import {
  compactClientForLog,
  errorToMessage,
  logDoTrace,
  toUnixSeconds,
} from "./ingest-log";
import {
  jsonResponse,
  type RealtimeSnapshotRecord,
  toRealtimeScreenSize,
} from "./ingest-normalize";
import {
  pushInitialRealtimeSnapshot,
  pushRealtimeRecordToSockets,
  readRecentRealtimeEvents,
  snapshotQueryParams,
} from "./ingest-realtime";
import { normalizeIngestRecord } from "./ingest-record-normalize";
import { initializeIngestSqlSchema } from "./ingest-schema";
import type { SqlBinding } from "./ingest-sql";
import type {
  BufferedCustomEventInput,
  BufferedVisitRow,
  NormalizeResult,
  RecentVisitorSession,
  StoredOpenVisit,
} from "./ingest-types";
import type {
  Env,
  IngestEnvelopePayload,
  NormalizedCustomEvent,
  NormalizedIdentify,
  NormalizedLeave,
  NormalizedPageview,
  NormalizedVisibility,
  TrackerPerformancePayload,
} from "./types";

export class IngestDurableObject extends DurableObject {
  private readonly doState: DurableObjectState;
  private readonly doEnv: Env;
  private readonly schemaReady: Promise<void>;
  private readonly dictionaryIds = new Map<string, number>();
  private sockets = new Set<WebSocket>();

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.doState = state;
    this.doEnv = env;
    this.schemaReady = this.doState.blockConcurrencyWhile(async () => {
      this.initializeSqlSchema();
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.schemaReady;
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      return this.handleWebSocket(request, url);
    }

    if (url.pathname === "/ingest" && request.method === "POST") {
      return this.handleIngest(request);
    }

    if (url.pathname === "/snapshot" && request.method === "GET") {
      return this.handleSnapshot(url);
    }

    if (url.pathname === "/diagnostic" && request.method === "GET") {
      return this.handleDiagnostic();
    }

    if (url.pathname === "/flush" && request.method === "POST") {
      logDoTrace("do_manual_flush_start");
      await this.flushTimeouts();
      await this.flushPendingToD1();
      await this.cleanupBufferedRows();
      logDoTrace("do_manual_flush_done");
      return jsonResponse({ ok: true });
    }

    return new Response("Not Found", { status: 404 });
  }

  async alarm(): Promise<void> {
    await this.schemaReady;
    logDoTrace("do_alarm_start");
    await this.flushTimeouts();
    await this.flushPendingToD1();
    await this.cleanupBufferedRows();
    if ((await this.hasOpenVisits()) || this.hasDirtyRows()) {
      const scheduledAt = Date.now() + D1_FLUSH_INTERVAL_MS;
      await this.doState.storage.setAlarm(scheduledAt);
      logDoTrace("do_alarm_rescheduled", { scheduledAt });
      return;
    }
    await this.doState.storage.deleteAlarm();
    logDoTrace("do_alarm_cleared");
  }

  private async handleIngest(request: Request): Promise<Response> {
    let envelope: IngestEnvelopePayload;
    try {
      envelope = (await request.json()) as IngestEnvelopePayload;
    } catch (error) {
      logDoTrace(
        "do_ingest_bad_request",
        { error: errorToMessage(error) },
        "warn",
      );
      return new Response("Bad Request", { status: 400 });
    }

    const traceId = envelope.trace?.id || "";
    logDoTrace("do_ingest_received", {
      traceId,
      acceptedAt: envelope.trace?.acceptedAt ?? null,
      receivedAt: envelope.request?.receivedAt ?? null,
      ...compactClientForLog(envelope.client),
    });

    const normalized = await this.normalizeRecord(envelope);
    const record = normalized.record;
    if (!record) {
      logDoTrace(
        "do_ingest_ignored",
        {
          traceId,
          reason: normalized.reason || "unknown",
          ...(normalized.detail || {}),
          ...compactClientForLog(envelope.client),
        },
        "warn",
      );
      return new Response(`ignored:${normalized.reason || "unknown"}`, {
        status: 202,
      });
    }

    if (record.kind === "pageview") {
      await this.handlePageview(record);
    } else if (record.kind === "leave") {
      await this.handleLeave(record);
    } else if (record.kind === "visibility") {
      await this.handleVisibility(record);
    } else if (record.kind === "identify") {
      await this.handleIdentify(record);
    } else {
      await this.handleCustomEvent(record);
    }

    await this.ensureAlarm();
    logDoTrace("do_ingest_handled", {
      traceId: record.traceId || traceId,
      kind: record.kind,
      siteId: record.siteId,
      visitId: record.visitId,
      eventId: record.kind === "custom_event" ? record.eventId : "",
    });
    return new Response("ok", { status: 202 });
  }

  private async handleWebSocket(request: Request, url: URL): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected websocket upgrade", { status: 426 });
    }

    if (this.doEnv.ADMIN_WS_TOKEN) {
      const tokenFromQuery = url.searchParams.get("token");
      if (tokenFromQuery !== this.doEnv.ADMIN_WS_TOKEN) {
        logDoTrace(
          "do_ws_rejected",
          { reason: "invalid_token", sockets: this.sockets.size },
          "warn",
        );
        return new Response("Unauthorized", { status: 401 });
      }
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();
    this.sockets.add(server);
    logDoTrace("do_ws_connected", {
      sockets: this.sockets.size,
      siteId: url.searchParams.get("siteId") || "",
    });
    void this.pushInitialSnapshotToSocket(server);

    server.addEventListener("close", () => {
      this.sockets.delete(server);
      logDoTrace("do_ws_disconnected", {
        sockets: this.sockets.size,
        reason: "close",
      });
    });
    server.addEventListener("error", () => {
      this.sockets.delete(server);
      logDoTrace(
        "do_ws_disconnected",
        { sockets: this.sockets.size, reason: "error" },
        "warn",
      );
      try {
        server.close();
      } catch {
        // no-op
      }
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private async handleSnapshot(url: URL): Promise<Response> {
    const { fromMs, toMs, limit } = snapshotQueryParams(url);

    return jsonResponse({
      ok: true,
      buffered: 0,
      data: readRecentRealtimeEvents(
        { sqlAll: this.sqlAll.bind(this) },
        fromMs,
        toMs,
        limit,
      ),
    });
  }

  private async handleDiagnostic(): Promise<Response> {
    return handleIngestDiagnostic({
      sqlAll: this.sqlAll.bind(this),
      sqlOne: this.sqlOne.bind(this),
      getAlarm: () => this.doState.storage.getAlarm(),
    });
  }

  private initializeSqlSchema(): void {
    initializeIngestSqlSchema(this.doState.storage.sql);
  }

  private sqlAll<T>(query: string, ...bindings: SqlBinding[]): T[] {
    return this.doState.storage.sql.exec(query, ...bindings).toArray() as T[];
  }

  private sqlOne<T>(query: string, ...bindings: SqlBinding[]): T | null {
    const rows = this.sqlAll<T>(query, ...bindings);
    return rows[0] ?? null;
  }

  private sqlRun(query: string, ...bindings: SqlBinding[]): number {
    return this.doState.storage.sql.exec(query, ...bindings).rowsWritten;
  }

  private bufferStoreContext() {
    return {
      env: this.doEnv,
      sqlAll: <T>(query: string, ...bindings: SqlBinding[]) =>
        this.sqlAll<T>(query, ...bindings),
      sqlOne: <T>(query: string, ...bindings: SqlBinding[]) =>
        this.sqlOne<T>(query, ...bindings),
      sqlRun: (query: string, ...bindings: SqlBinding[]) =>
        this.sqlRun(query, ...bindings),
    };
  }

  private hasDirtyRows(): boolean {
    const visits = this.sqlOne<{ ok: number }>(
      "SELECT 1 AS ok FROM buffered_visits WHERE dirty = 1 LIMIT 1",
    );
    if (visits) return true;
    const events = this.sqlOne<{ ok: number }>(
      "SELECT 1 AS ok FROM buffered_custom_events WHERE dirty = 1 LIMIT 1",
    );
    return Boolean(events);
  }
  private async normalizeRecord(
    envelope: IngestEnvelopePayload,
  ): Promise<NormalizeResult> {
    return normalizeIngestRecord(envelope, {
      env: this.doEnv,
      getVisitContext: this.getVisitContext.bind(this),
      findRecentVisitorSession: this.findRecentVisitorSession.bind(this),
      insertBufferedCustomEvent: this.insertBufferedCustomEvent.bind(this),
      ensureAlarm: this.ensureAlarm.bind(this),
    });
  }

  private async handlePageview(record: NormalizedPageview): Promise<void> {
    const now = toUnixSeconds(record.receivedAt);

    const prevVisit = record.clientSessionId
      ? this.sqlOne<{
          visitId: string;
          startedAt: number;
          visitorId: string;
          pathname: string;
          country: string;
          browser: string;
        }>(
          `
            SELECT visit_id AS visitId, started_at AS startedAt, visitor_id AS visitorId,
                   pathname, country, browser
            FROM buffered_visits
            WHERE site_id = ?
              AND client_session_id = ?
              AND visit_id != ?
              AND status IN ('open', 'hidden_pending')
            ORDER BY started_at DESC
            LIMIT 1
          `,
          record.siteId,
          record.clientSessionId,
          record.visitId,
        )
      : null;
    if (prevVisit) {
      const durationMs = Math.max(0, record.startedAt - prevVisit.startedAt);
      const closedPrevious = this.sqlRun(
        `
          UPDATE buffered_visits
          SET status = 'complete',
              last_activity_at = ?,
              hidden_at = NULL,
              ended_at = ?,
              finalized_at = ?,
              duration_ms = ?,
              duration_source = 'server',
              dirty = 1,
              updated_at = ?
          WHERE visit_id = ? AND status IN ('open', 'hidden_pending')
        `,
        record.startedAt,
        record.startedAt,
        record.startedAt,
        durationMs,
        now,
        prevVisit.visitId,
      );
      if (closedPrevious > 0) {
        logDoTrace("do_previous_visit_closed", {
          traceId: record.traceId || "",
          siteId: record.siteId,
          visitId: prevVisit.visitId,
          nextVisitId: record.visitId,
          durationMs,
        });
      }
    }

    const inserted = await this.insertVisit(record);
    if (!inserted) {
      logDoTrace("do_pageview_duplicate_or_not_inserted", {
        traceId: record.traceId || "",
        siteId: record.siteId,
        visitId: record.visitId,
        sessionId: record.sessionId,
        pathname: record.pathname,
      });
      return;
    }
    logDoTrace("do_pageview_buffered", {
      traceId: record.traceId || "",
      siteId: record.siteId,
      visitId: record.visitId,
      sessionId: record.sessionId,
      visitorId: record.visitorId,
      startedAt: record.startedAt,
      pathname: record.pathname,
      sockets: this.sockets.size,
    });
    await this.pushRealtimeRecord({
      id: record.visitId,
      eventType: "visit",
      eventAt: record.startedAt,
      visitId: record.visitId,
      sessionId: record.sessionId,
      pathname: record.pathname,
      hash: record.hashFragment,
      title: record.title,
      hostname: record.hostname,
      referrerUrl: record.referrerUrl,
      referrerHost: record.referrerHost,
      visitorId: record.visitorId,
      country: record.country,
      region: record.region,
      regionCode: record.regionCode,
      city: record.city,
      continent: record.continent,
      timezone: record.timezone,
      organization: record.asOrganization,
      browser: record.browser,
      os: record.os,
      osVersion: record.osVersion,
      deviceType: record.deviceType,
      language: record.language,
      screenSize: toRealtimeScreenSize(record.screenWidth, record.screenHeight),
      latitude: record.latitude,
      longitude: record.longitude,
    });
  }

  private async handleLeave(record: NormalizedLeave): Promise<void> {
    const visit = this.sqlOne<{
      visitId: string;
      startedAt: number;
      visitorId: string;
      siteId: string;
      sessionId: string;
      pathname: string;
      hash: string;
      title: string;
      hostname: string;
      referrerUrl: string;
      referrerHost: string;
      country: string;
      region: string;
      regionCode: string;
      city: string;
      continent: string;
      timezone: string;
      organization: string;
      browser: string;
      os: string;
      osVersion: string;
      deviceType: string;
      language: string;
      screenSize: string;
      latitude: number | null;
      longitude: number | null;
      status: string;
      hiddenAt: number | null;
    }>(
      `
        SELECT visit_id AS visitId, started_at AS startedAt, visitor_id AS visitorId, site_id AS siteId,
               session_id AS sessionId, pathname, hash_fragment AS hash, title, hostname,
               referrer_url AS referrerUrl, referrer_host AS referrerHost,
               country, region, region_code AS regionCode, city, continent, timezone,
               as_organization AS organization, browser, os, os_version AS osVersion,
               device_type AS deviceType, language,
               CASE
                 WHEN screen_width IS NOT NULL AND screen_height IS NOT NULL
                   THEN CAST(screen_width AS TEXT) || 'x' || CAST(screen_height AS TEXT)
                 ELSE ''
               END AS screenSize,
               latitude, longitude,
               status, hidden_at AS hiddenAt
        FROM buffered_visits
        WHERE site_id = ? AND visit_id = ? AND status IN ('open', 'hidden_pending')
        LIMIT 1
      `,
      record.siteId,
      record.visitId,
    );

    let closedVisit = false;
    let closedLeaveAt = record.leaveAt;
    if (visit) {
      const reportedLeaveAt = Math.max(record.leaveAt, visit.startedAt);
      const hiddenAt =
        typeof visit.hiddenAt === "number"
          ? Math.max(visit.hiddenAt, visit.startedAt)
          : null;
      const useHiddenFallback =
        hiddenAt !== null && reportedLeaveAt - hiddenAt > HIDDEN_LEAVE_GRACE_MS;
      const leaveAt = useHiddenFallback ? hiddenAt : reportedLeaveAt;
      closedLeaveAt = leaveAt;
      const durationMs =
        !useHiddenFallback &&
        typeof record.durationMs === "number" &&
        Number.isFinite(record.durationMs)
          ? Math.max(0, Math.floor(record.durationMs))
          : Math.max(0, leaveAt - visit.startedAt);
      const durationSource = useHiddenFallback ? "hidden" : "reported";
      const exitReason = useHiddenFallback
        ? "hidden_timeout"
        : record.exitReason || "pagehide";

      const rowsWritten = this.sqlRun(
        `
          UPDATE buffered_visits
          SET status = 'complete',
              last_activity_at = ?,
              hidden_at = NULL,
              ended_at = ?,
              finalized_at = ?,
              duration_ms = ?,
              duration_source = ?,
              exit_reason = ?,
              dirty = 1,
              updated_at = ?
          WHERE visit_id = ? AND status IN ('open', 'hidden_pending')
        `,
        leaveAt,
        leaveAt,
        leaveAt,
        durationMs,
        durationSource,
        exitReason,
        toUnixSeconds(record.receivedAt),
        visit.visitId,
      );
      closedVisit = rowsWritten > 0;
      logDoTrace(
        closedVisit ? "do_leave_closed_visit" : "do_leave_no_rows_updated",
        {
          traceId: record.traceId || "",
          siteId: record.siteId,
          visitId: record.visitId,
          sessionId: visit.sessionId,
          leaveAt,
          durationMs,
          durationSource,
          exitReason,
        },
      );
    }

    if (record.performance) {
      await this.attachPerformanceToVisit(
        record.siteId,
        record.performanceVisitId,
        record.performance,
        record.receivedAt,
      );
    }

    if (!visit || !closedVisit) {
      logDoTrace("do_leave_ignored", {
        traceId: record.traceId || "",
        siteId: record.siteId,
        visitId: record.visitId,
        reason: visit ? "visit_not_open" : "visit_not_found",
      });
      return;
    }

    if (!this.hasOpenVisitsForVisitor(visit.siteId, visit.visitorId)) {
      await this.pushRealtimeRecord({
        id: `leave:${visit.visitId}`,
        eventType: WS_PRESENCE_LEAVE_EVENT,
        eventAt: closedLeaveAt,
        visitId: visit.visitId,
        sessionId: visit.sessionId,
        pathname: visit.pathname,
        hash: visit.hash,
        title: visit.title,
        hostname: visit.hostname,
        referrerUrl: visit.referrerUrl,
        referrerHost: visit.referrerHost,
        visitorId: visit.visitorId,
        country: visit.country,
        region: visit.region,
        regionCode: visit.regionCode,
        city: visit.city,
        continent: visit.continent,
        timezone: visit.timezone,
        organization: visit.organization,
        browser: visit.browser,
        os: visit.os,
        osVersion: visit.osVersion,
        deviceType: visit.deviceType,
        language: visit.language,
        screenSize: visit.screenSize,
        latitude: visit.latitude,
        longitude: visit.longitude,
      });
    }
  }

  private async handleVisibility(record: NormalizedVisibility): Promise<void> {
    const updatedAt = toUnixSeconds(record.receivedAt);
    if (record.visibilityState === "hidden") {
      let rowsWritten = this.sqlRun(
        `
          UPDATE buffered_visits
          SET status = 'hidden_pending',
              hidden_at = ?,
              last_activity_at = CASE WHEN last_activity_at > ? THEN last_activity_at ELSE ? END,
              dirty = 1,
              updated_at = ?
          WHERE site_id = ?
            AND visit_id = ?
            AND status = 'open'
        `,
        record.eventAt,
        record.eventAt,
        record.eventAt,
        updatedAt,
        record.siteId,
        record.visitId,
      );
      if (rowsWritten === 0) {
        rowsWritten = this.sqlRun(
          `
            UPDATE buffered_visits
            SET hidden_at = COALESCE(hidden_at, ?),
                last_activity_at = CASE WHEN last_activity_at > ? THEN last_activity_at ELSE ? END,
                dirty = 1,
                updated_at = ?
            WHERE site_id = ?
              AND visit_id = ?
              AND status = 'hidden_pending'
          `,
          record.eventAt,
          record.eventAt,
          record.eventAt,
          updatedAt,
          record.siteId,
          record.visitId,
        );
      }
      logDoTrace(
        rowsWritten > 0
          ? "do_visibility_hidden_buffered"
          : "do_visibility_hidden_ignored",
        {
          traceId: record.traceId || "",
          siteId: record.siteId,
          visitId: record.visitId,
          eventAt: record.eventAt,
        },
      );
      return;
    }

    const rowsWritten = this.sqlRun(
      `
        UPDATE buffered_visits
        SET status = 'open',
            hidden_at = NULL,
            last_activity_at = CASE WHEN last_activity_at > ? THEN last_activity_at ELSE ? END,
            dirty = 1,
            updated_at = ?
        WHERE site_id = ?
          AND visit_id = ?
          AND status = 'hidden_pending'
          AND (hidden_at IS NULL OR ? - hidden_at <= ?)
      `,
      record.eventAt,
      record.eventAt,
      updatedAt,
      record.siteId,
      record.visitId,
      record.eventAt,
      HIDDEN_LEAVE_GRACE_MS,
    );
    logDoTrace(
      rowsWritten > 0
        ? "do_visibility_visible_restored"
        : "do_visibility_visible_ignored",
      {
        traceId: record.traceId || "",
        siteId: record.siteId,
        visitId: record.visitId,
        eventAt: record.eventAt,
      },
    );
  }

  private async attachPerformanceToVisit(
    siteId: string,
    visitId: string,
    performance: TrackerPerformancePayload,
    receivedAt: number,
  ): Promise<void> {
    return attachPerformanceToVisitInBufferStore(
      this.bufferStoreContext(),
      siteId,
      visitId,
      performance,
      receivedAt,
    );
  }

  private async handleCustomEvent(
    record: NormalizedCustomEvent,
  ): Promise<void> {
    const inserted = await this.insertCustomEvent(record);
    if (!inserted) {
      logDoTrace("do_custom_event_duplicate_or_not_inserted", {
        traceId: record.traceId || "",
        siteId: record.siteId,
        visitId: record.visitId,
        eventId: record.eventId,
        eventName: record.eventName,
      });
      return;
    }
    logDoTrace("do_custom_event_buffered", {
      traceId: record.traceId || "",
      siteId: record.siteId,
      visitId: record.visitId,
      eventId: record.eventId,
      eventName: record.eventName,
      occurredAt: record.eventAt,
      sockets: this.sockets.size,
    });
    await this.updateOpenVisitActivity(record.visitId, record.eventAt);
    await this.pushRealtimeRecord({
      id: record.eventId,
      eventType: record.eventName,
      eventAt: record.eventAt,
      visitId: record.visitId,
      sessionId: record.sessionId,
      pathname: record.pathname,
      hash: record.hashFragment,
      title: record.title,
      hostname: record.hostname,
      referrerUrl: record.referrerUrl,
      referrerHost: record.referrerHost,
      visitorId: record.visitorId,
      country: record.country,
      region: record.region,
      regionCode: record.regionCode,
      city: record.city,
      continent: record.continent,
      timezone: record.timezone,
      organization: record.asOrganization,
      browser: record.browser,
      os: record.os,
      osVersion: record.osVersion,
      deviceType: record.deviceType,
      language: record.language,
      screenSize: toRealtimeScreenSize(record.screenWidth, record.screenHeight),
      latitude: record.latitude,
      longitude: record.longitude,
    });
  }

  private async handleIdentify(record: NormalizedIdentify): Promise<void> {
    const updatedAt = toUnixSeconds(Date.now());
    let serverSessionId =
      this.sqlOne<{ sessionId: string }>(
        `
          SELECT session_id AS sessionId
          FROM buffered_visits
          WHERE visit_id = ? AND site_id = ?
          LIMIT 1
        `,
        record.visitId,
        record.siteId,
      )?.sessionId || "";

    const rowsUpdated = this.sqlRun(
      `
        UPDATE buffered_visits
        SET user_id = ?, user_name = ?, dirty = 1, updated_at = ?
        WHERE visit_id = ? AND site_id = ?
      `,
      record.userId,
      record.userName || null,
      updatedAt,
      record.visitId,
      record.siteId,
    );

    // Update buffered_custom_events for the same visit
    this.sqlRun(
      `
        UPDATE buffered_custom_events
        SET user_id = ?, dirty = 1
        WHERE visit_id = ? AND site_id = ?
      `,
      record.userId,
      record.visitId,
      record.siteId,
    );

    if (rowsUpdated === 0) {
      if (!serverSessionId) {
        const persistedVisit = await this.doEnv.DB.prepare(
          `
            SELECT session_id AS sessionId
            FROM visits
            WHERE visit_id = ? AND site_id = ?
            LIMIT 1
          `,
        )
          .bind(record.visitId, record.siteId)
          .first<{ sessionId: string }>()
          .catch(() => null);
        serverSessionId = persistedVisit?.sessionId || "";
      }
      await this.doEnv.DB.prepare(
        `
          UPDATE visits
          SET user_id = ?, user_name = ?
          WHERE visit_id = ? AND site_id = ?
        `,
      )
        .bind(
          record.userId,
          record.userName || null,
          record.visitId,
          record.siteId,
        )
        .run()
        .catch(() => {});
    }

    if (serverSessionId) {
      this.sqlRun(
        `
          UPDATE buffered_visits
          SET user_id = ?, user_name = ?, dirty = 1, updated_at = ?
          WHERE session_id = ? AND site_id = ? AND visit_id != ? AND (user_id = '' OR user_id IS NULL)
        `,
        record.userId,
        record.userName || null,
        updatedAt,
        serverSessionId,
        record.siteId,
        record.visitId,
      );
    }
    logDoTrace("do_identify_applied", {
      traceId: record.traceId || "",
      siteId: record.siteId,
      visitId: record.visitId,
      sessionId: serverSessionId,
      bufferedVisitRowsUpdated: rowsUpdated,
      updatedPersistedVisit: rowsUpdated === 0,
    });
  }

  private async getVisitContext(
    siteId: string,
    visitId: string,
  ): Promise<StoredOpenVisit | null> {
    return getVisitContextFromBufferStore(
      this.bufferStoreContext(),
      siteId,
      visitId,
    );
  }

  private async findRecentVisitorSession(input: {
    siteId: string;
    visitorId: string;
    visitId: string;
    startedAt: number;
    sessionWindowMs: number;
  }): Promise<RecentVisitorSession | null> {
    return findRecentVisitorSessionInBufferStore(
      this.bufferStoreContext(),
      input,
    );
  }

  private async readPersistedVisitRow(
    siteId: string,
    visitId: string,
  ): Promise<BufferedVisitRow | null> {
    return readPersistedVisitRowFromBufferStore(
      this.bufferStoreContext(),
      siteId,
      visitId,
    );
  }

  private insertBufferedVisitRow(row: BufferedVisitRow): void {
    insertBufferedVisitRowInBufferStore(this.bufferStoreContext(), row);
  }

  private async insertVisit(record: NormalizedPageview): Promise<boolean> {
    return insertVisitInBufferStore(this.bufferStoreContext(), record);
  }

  private async insertCustomEvent(
    record: NormalizedCustomEvent,
  ): Promise<boolean> {
    return insertCustomEventInBufferStore(this.bufferStoreContext(), record);
  }

  private insertBufferedCustomEvent(record: BufferedCustomEventInput): boolean {
    return insertBufferedCustomEventInBufferStore(
      this.bufferStoreContext(),
      record,
    );
  }

  private async updateOpenVisitActivity(
    visitId: string,
    eventAt: number,
  ): Promise<void> {
    return updateOpenVisitActivityInBufferStore(
      this.bufferStoreContext(),
      visitId,
      eventAt,
    );
  }

  private async pushRealtimeRecord(
    record: RealtimeSnapshotRecord,
  ): Promise<void> {
    await pushRealtimeRecordToSockets(this.sockets, record);
  }

  private async ensureAlarm(): Promise<void> {
    const now = Date.now();
    const existing = await this.doState.storage.getAlarm();
    if (!existing || existing <= now) {
      const scheduledAt = now + D1_FLUSH_INTERVAL_MS;
      await this.doState.storage.setAlarm(scheduledAt);
      logDoTrace("do_alarm_scheduled", {
        existing: existing ?? null,
        scheduledAt,
      });
    }
  }

  private async hasOpenVisits(): Promise<boolean> {
    return (
      this.sqlOne<{ ok: number }>(
        "SELECT 1 AS ok FROM buffered_visits WHERE status IN ('open', 'hidden_pending') LIMIT 1",
      ) !== null
    );
  }

  private hasOpenVisitsForVisitor(siteId: string, visitorId: string): boolean {
    const row = this.sqlOne<{ ok: number }>(
      `
        SELECT 1 AS ok
        FROM buffered_visits
        WHERE site_id = ?
          AND visitor_id = ?
          AND status = 'open'
        LIMIT 1
      `,
      siteId,
      visitorId,
    );
    return row !== null;
  }

  private async pushInitialSnapshotToSocket(socket: WebSocket): Promise<void> {
    await pushInitialRealtimeSnapshot(
      {
        sqlAll: this.sqlAll.bind(this),
        sqlOne: this.sqlOne.bind(this),
        sockets: this.sockets,
      },
      socket,
    );
  }

  private flushStoreContext() {
    return {
      env: this.doEnv,
      dictionaryIds: this.dictionaryIds,
      sqlAll: <T>(query: string, ...bindings: SqlBinding[]) =>
        this.sqlAll<T>(query, ...bindings),
      sqlOne: <T>(query: string, ...bindings: SqlBinding[]) =>
        this.sqlOne<T>(query, ...bindings),
      sqlRun: (query: string, ...bindings: SqlBinding[]) =>
        this.sqlRun(query, ...bindings),
      readPersistedVisitRow: this.readPersistedVisitRow.bind(this),
      insertBufferedVisitRow: this.insertBufferedVisitRow.bind(this),
      hasOpenVisitsForVisitor: this.hasOpenVisitsForVisitor.bind(this),
      pushRealtimeRecord: this.pushRealtimeRecord.bind(this),
    };
  }

  private async flushPendingToD1(): Promise<void> {
    return flushPendingToD1InFlushStore(this.flushStoreContext());
  }

  private async cleanupBufferedRows(): Promise<void> {
    return cleanupBufferedRowsInFlushStore(this.flushStoreContext());
  }

  private async flushTimeouts(): Promise<void> {
    return flushTimeoutsInFlushStore(this.flushStoreContext());
  }
}
