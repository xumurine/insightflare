export interface DimensionData {
  ok: boolean;
  data: Array<{
    value: string;
    views: number;
    sessions: number;
  }>;
}

export interface DashboardFilterOption {
  value: string;
  label: string;
  group?: "country" | "region" | "city";
}

export interface DashboardFilterOptionsData {
  ok: boolean;
  data: DashboardFilterOption[];
}
