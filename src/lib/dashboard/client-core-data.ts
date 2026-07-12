import type {
  EventRecordSortKey,
  RetentionGranularity,
  SessionListSortKey,
  SortDirection,
  VisitorListSortKey,
} from "@/lib/dashboard/client-data-types";
import {
  emptyEventFieldValues,
  emptyEventRecordDetail,
  emptyEventsRecords,
  emptyEventsSummary,
  emptyEventsTrend,
  emptyEventTypeDetail,
  emptyPerformance,
  emptySessionDetail,
  emptySessions,
  emptyVisitorDetail,
  emptyVisitors,
} from "@/lib/dashboard/client-empty-data";
import type { DashboardFilters, TimeWindow } from "@/lib/dashboard/query-state";
import type {
  EventField,
  EventFieldValuesData,
  EventRecordDetailData,
  EventsRecordsData,
  EventsSummaryData,
  EventsTrendData,
  EventTypeDetailData,
  FunnelDeleteData,
  FunnelDetailData,
  FunnelListData,
  FunnelMutationData,
  FunnelStep,
  OverviewData,
  PagesData,
  PerformanceData,
  RetentionData,
  SessionDetailData,
  SessionsData,
  TrendData,
  VisitorDetailData,
  VisitorsData,
} from "@/lib/edge-client";

import { fetchPrivateJson, fetchPrivateJsonMutate } from "./client-request";
import { withFilters } from "./client-utils";

function emptySessionsUnlessAborted(error: unknown): SessionsData {
  if (error instanceof Error && error.name === "AbortError") throw error;
  return emptySessions();
}

export async function fetchOverview(
  siteId: string,
  window: TimeWindow,
  filters?: DashboardFilters,
  options?: {
    includeChange?: boolean;
    includeDetail?: boolean;
    signal?: AbortSignal;
  },
): Promise<OverviewData> {
  return fetchPrivateJson<OverviewData>(
    "/api/private/overview",
    withFilters(
      {
        siteId,
        from: window.from,
        to: window.to,
        timeZone: window.timeZone,
        ...(options?.includeChange ? { includeChange: 1 } : {}),
        ...(options?.includeDetail
          ? { includeDetail: 1, interval: window.interval }
          : {}),
      },
      filters,
    ),
    { signal: options?.signal },
  );
}

export async function fetchTrend(
  siteId: string,
  window: TimeWindow,
  filters?: DashboardFilters,
  options?: { signal?: AbortSignal },
): Promise<TrendData> {
  return fetchPrivateJson<TrendData>(
    "/api/private/trend",
    withFilters(
      {
        siteId,
        from: window.from,
        to: window.to,
        timeZone: window.timeZone,
        interval: window.interval,
      },
      filters,
    ),
    { signal: options?.signal },
  );
}

export async function fetchPages(
  siteId: string,
  window: TimeWindow,
  filters?: DashboardFilters,
): Promise<PagesData> {
  return fetchPrivateJson<PagesData>(
    "/api/private/pages",
    withFilters(
      {
        siteId,
        from: window.from,
        to: window.to,
        timeZone: window.timeZone,
        limit: 100,
        details: 1,
      },
      filters,
    ),
  );
}

export async function fetchVisitors(
  siteId: string,
  window: TimeWindow,
  filters?: DashboardFilters,
  options?: {
    limit?: number;
    page?: number;
    pageSize?: number;
    sortBy?: VisitorListSortKey;
    sortDir?: SortDirection;
    search?: string;
  },
): Promise<VisitorsData> {
  const params: Record<string, string | number> = {
    siteId,
    from: window.from,
    to: window.to,
    timeZone: window.timeZone,
  };
  if (options?.page !== undefined) params.page = options.page;
  if (options?.pageSize !== undefined) params.pageSize = options.pageSize;
  if (options?.limit !== undefined) {
    params.limit = options.limit;
  } else if (options?.pageSize === undefined) {
    params.limit = 100;
  }
  if (options?.sortBy) params.sortBy = options.sortBy;
  if (options?.sortDir) params.sortDir = options.sortDir;
  const search = options?.search?.trim();
  if (search) params.search = search;
  return fetchPrivateJson<VisitorsData>(
    "/api/private/visitors",
    withFilters(
      {
        ...params,
      },
      filters,
    ),
  ).catch(emptyVisitors);
}

export async function fetchVisitorDetail(
  siteId: string,
  visitorId: string,
  timeZone?: string,
  window?: TimeWindow,
  options?: { signal?: AbortSignal },
): Promise<VisitorDetailData> {
  const normalizedVisitorId = visitorId.trim();
  if (!normalizedVisitorId) return emptyVisitorDetail();
  return fetchPrivateJson<VisitorDetailData>(
    "/api/private/visitor-detail",
    {
      siteId,
      visitorId: normalizedVisitorId,
      ...(window ? { from: window.from, to: window.to } : {}),
      ...(timeZone ? { timeZone } : {}),
    },
    { signal: options?.signal, dedupe: false },
  );
}

export async function fetchSessions(
  siteId: string,
  window: TimeWindow,
  filters?: DashboardFilters,
  options?: {
    limit?: number;
    page?: number;
    pageSize?: number;
    sortBy?: SessionListSortKey;
    sortDir?: SortDirection;
    search?: string;
    signal?: AbortSignal;
  },
): Promise<SessionsData> {
  const params: Record<string, string | number> = {
    siteId,
    from: window.from,
    to: window.to,
    timeZone: window.timeZone,
  };
  if (options?.page !== undefined) params.page = options.page;
  if (options?.pageSize !== undefined) params.pageSize = options.pageSize;
  if (options?.limit !== undefined) {
    params.limit = options.limit;
  } else if (options?.pageSize === undefined) {
    params.limit = 100;
  }
  if (options?.sortBy) params.sortBy = options.sortBy;
  if (options?.sortDir) params.sortDir = options.sortDir;
  const search = options?.search?.trim();
  if (search) params.search = search;
  const requestParams = withFilters(
    {
      ...params,
    },
    filters,
  );
  const request = options?.signal
    ? fetchPrivateJson<SessionsData>("/api/private/sessions", requestParams, {
        signal: options.signal,
      })
    : fetchPrivateJson<SessionsData>("/api/private/sessions", requestParams);
  return request.catch(emptySessionsUnlessAborted);
}

export async function fetchSessionDetail(
  siteId: string,
  sessionId: string,
  timeZone?: string,
  window?: TimeWindow,
  options?: { signal?: AbortSignal },
): Promise<SessionDetailData> {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) return emptySessionDetail();
  return fetchPrivateJson<SessionDetailData>(
    "/api/private/session-detail",
    {
      siteId,
      sessionId: normalizedSessionId,
      ...(window ? { from: window.from, to: window.to } : {}),
      ...(timeZone ? { timeZone } : {}),
    },
    { signal: options?.signal, dedupe: false },
  );
}

export async function fetchFunnels(siteId: string): Promise<FunnelListData> {
  return fetchPrivateJson<FunnelListData>("/api/private/funnels", {
    siteId,
  });
}

export async function fetchFunnelDetail(
  siteId: string,
  funnelId: string,
  window: TimeWindow,
  filters?: DashboardFilters,
): Promise<FunnelDetailData> {
  const normalizedFunnelId = funnelId.trim();
  if (!normalizedFunnelId) {
    throw new Error("Funnel id is required");
  }
  return fetchPrivateJson<FunnelDetailData>(
    "/api/private/funnels",
    withFilters(
      {
        siteId,
        id: normalizedFunnelId,
        from: window.from,
        to: window.to,
        timeZone: window.timeZone,
      },
      filters,
    ),
    { dedupe: false },
  );
}

export async function createFunnel(
  siteId: string,
  name: string,
  steps: FunnelStep[],
): Promise<FunnelMutationData> {
  return fetchPrivateJsonMutate<FunnelMutationData>(
    "/api/private/funnels",
    "POST",
    { siteId },
    { name, steps },
  );
}

export async function deleteFunnel(
  siteId: string,
  funnelId: string,
): Promise<FunnelDeleteData> {
  return fetchPrivateJsonMutate<FunnelDeleteData>(
    "/api/private/funnels",
    "DELETE",
    { siteId, id: funnelId },
  );
}

export async function fetchEventsSummary(
  siteId: string,
  window: TimeWindow,
  filters?: DashboardFilters,
): Promise<EventsSummaryData> {
  return fetchPrivateJson<EventsSummaryData>(
    "/api/private/events-summary",
    withFilters(
      {
        siteId,
        from: window.from,
        to: window.to,
        timeZone: window.timeZone,
      },
      filters,
    ),
  ).catch(emptyEventsSummary);
}

export async function fetchEventsTrend(
  siteId: string,
  window: TimeWindow,
  filters?: DashboardFilters,
  options?: {
    limit?: number;
    eventName?: string;
  },
): Promise<EventsTrendData> {
  const params: Record<string, string | number> = {
    siteId,
    from: window.from,
    to: window.to,
    timeZone: window.timeZone,
    interval: window.interval,
    limit: options?.limit ?? 8,
  };
  const eventName = options?.eventName?.trim();
  if (eventName) params.eventName = eventName;
  return fetchPrivateJson<EventsTrendData>(
    "/api/private/events-trend",
    withFilters(params, filters),
  ).catch(() => emptyEventsTrend(window.interval));
}

export async function fetchEventsRecords(
  siteId: string,
  window: TimeWindow,
  filters?: DashboardFilters,
  options?: {
    page?: number;
    pageSize?: number;
    sortBy?: EventRecordSortKey;
    sortDir?: SortDirection;
    search?: string;
    eventName?: string;
  },
): Promise<EventsRecordsData> {
  const pageSize = options?.pageSize ?? 80;
  const params: Record<string, string | number> = {
    siteId,
    from: window.from,
    to: window.to,
    timeZone: window.timeZone,
    page: options?.page ?? 1,
    pageSize,
  };
  if (options?.sortBy) params.sortBy = options.sortBy;
  if (options?.sortDir) params.sortDir = options.sortDir;
  const search = options?.search?.trim();
  if (search) params.search = search;
  const eventName = options?.eventName?.trim();
  if (eventName) params.eventName = eventName;
  return fetchPrivateJson<EventsRecordsData>(
    "/api/private/events-records",
    withFilters(params, filters),
  ).catch(() => emptyEventsRecords(pageSize));
}

export async function fetchEventTypeDetail(
  siteId: string,
  window: TimeWindow,
  eventName: string,
  filters?: DashboardFilters,
): Promise<EventTypeDetailData> {
  const normalizedEventName = eventName.trim();
  if (!normalizedEventName) {
    return emptyEventTypeDetail("");
  }
  return fetchPrivateJson<EventTypeDetailData>(
    "/api/private/event-type-detail",
    withFilters(
      {
        siteId,
        from: window.from,
        to: window.to,
        timeZone: window.timeZone,
        interval: window.interval,
        eventName: normalizedEventName,
      },
      filters,
    ),
  ).catch(() => emptyEventTypeDetail(normalizedEventName));
}

export async function fetchEventTypeFieldValues(
  siteId: string,
  window: TimeWindow,
  eventName: string,
  fieldPath: string,
  fieldValueType: EventField["valueType"],
  filters?: DashboardFilters,
  options?: {
    limit?: number;
  },
): Promise<EventFieldValuesData> {
  const normalizedEventName = eventName.trim();
  const normalizedFieldPath = String(fieldPath ?? "");
  if (!normalizedEventName || !normalizedFieldPath) {
    return emptyEventFieldValues(normalizedFieldPath, fieldValueType);
  }
  return fetchPrivateJson<EventFieldValuesData>(
    "/api/private/event-type-field-values",
    withFilters(
      {
        siteId,
        from: window.from,
        to: window.to,
        timeZone: window.timeZone,
        eventName: normalizedEventName,
        fieldPath: normalizedFieldPath,
        fieldValueType,
        limit: options?.limit ?? 25,
      },
      filters,
    ),
  ).catch(() => emptyEventFieldValues(normalizedFieldPath, fieldValueType));
}

export async function fetchEventRecordDetail(
  siteId: string,
  eventId: string,
  window?: TimeWindow,
): Promise<EventRecordDetailData> {
  const normalizedEventId = eventId.trim();
  if (!normalizedEventId) return emptyEventRecordDetail();
  return fetchPrivateJson<EventRecordDetailData>(
    "/api/private/event-record-detail",
    {
      siteId,
      eventId: normalizedEventId,
      ...(window ? { from: window.from, to: window.to } : {}),
    },
  ).catch(emptyEventRecordDetail);
}

export async function fetchPerformance(
  siteId: string,
  window: TimeWindow,
  filters?: DashboardFilters,
): Promise<PerformanceData> {
  return fetchPrivateJson<PerformanceData>(
    "/api/private/performance",
    withFilters(
      {
        siteId,
        from: window.from,
        to: window.to,
        timeZone: window.timeZone,
        interval: window.interval,
      },
      filters,
    ),
  ).catch(() => emptyPerformance(window.interval));
}

export async function fetchRetention(
  siteId: string,
  window: TimeWindow,
  filters?: DashboardFilters,
  options?: {
    granularity?: RetentionGranularity;
  },
): Promise<RetentionData> {
  const granularity = options?.granularity ?? "week";
  return fetchPrivateJson<RetentionData>(
    "/api/private/retention",
    withFilters(
      {
        siteId,
        from: window.from,
        to: window.to,
        timeZone: window.timeZone,
        granularity,
      },
      filters,
    ),
  );
}
