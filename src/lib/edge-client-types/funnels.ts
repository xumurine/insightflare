export interface FunnelStep {
  type: "pageview" | "event";
  value: string;
}

export interface FunnelDefinition {
  id: string;
  siteId: string;
  name: string;
  steps: FunnelStep[];
  createdAt: number;
  updatedAt: number;
}

export interface FunnelListData {
  ok: boolean;
  funnels: FunnelDefinition[];
}

export interface FunnelAnalysisData {
  ok: boolean;
  steps: Array<{
    index: number;
    label: string;
    type: string;
    sessions: number;
    conversionRate: number;
    dropOffRate: number;
  }>;
  overallConversionRate: number;
}
