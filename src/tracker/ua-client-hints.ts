const UA_CLIENT_HINT_KEYS: string[] = [
  "fullVersionList",
  "platformVersion",
  "model",
  "formFactors",
];

interface UaBrandVersion {
  brand: string;
  version: string;
}

export interface UaClientHintsResult {
  brands?: UaBrandVersion[];
  fullVersionList?: UaBrandVersion[];
  mobile?: boolean;
  platform?: string;
  platformVersion?: string;
  model?: string;
  formFactors?: string[];
}

function normalizeUaBrandVersionList(input: unknown): UaBrandVersion[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 8)
    .map((item: unknown) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const brand = String((item as any).brand || "")
        .trim()
        .slice(0, 80);
      const version = String((item as any).version || "")
        .trim()
        .slice(0, 80);
      if (!brand || !version) return null;
      return { brand, version } as UaBrandVersion;
    })
    .filter(Boolean) as UaBrandVersion[];
}

function normalizeUaStringList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 8)
    .map((item: unknown) =>
      String(item || "")
        .trim()
        .slice(0, 40),
    )
    .filter(Boolean);
}

function normalizeUaClientHints(input: unknown): UaClientHintsResult | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const obj = input as any;
  const hints: UaClientHintsResult = {};
  const brands = normalizeUaBrandVersionList(obj.brands);
  const fullVersionList = normalizeUaBrandVersionList(obj.fullVersionList);
  const formFactors = normalizeUaStringList(obj.formFactors);
  const platform = String(obj.platform || "")
    .trim()
    .slice(0, 80);
  const platformVersion = String(obj.platformVersion || "")
    .trim()
    .slice(0, 80);
  const model = String(obj.model || "")
    .trim()
    .slice(0, 120);
  if (brands.length > 0) hints.brands = brands;
  if (fullVersionList.length > 0) hints.fullVersionList = fullVersionList;
  if (typeof obj.mobile === "boolean") hints.mobile = obj.mobile;
  if (platform) hints.platform = platform;
  if (platformVersion) hints.platformVersion = platformVersion;
  if (model) hints.model = model;
  if (formFactors.length > 0) hints.formFactors = formFactors;
  return Object.keys(hints).length > 0 ? hints : null;
}

export function readUaClientHints(): Promise<UaClientHintsResult | null> {
  const uaData = (navigator as any).userAgentData;
  if (!uaData || typeof uaData !== "object") return Promise.resolve(null);
  const lowEntropy: any = {
    brands: uaData.brands,
    mobile: uaData.mobile,
    platform: uaData.platform,
  };
  if (typeof uaData.getHighEntropyValues !== "function") {
    return Promise.resolve(normalizeUaClientHints(lowEntropy));
  }
  return uaData
    .getHighEntropyValues(UA_CLIENT_HINT_KEYS)
    .then((values: any) => normalizeUaClientHints({ ...lowEntropy, ...values }))
    .catch(() => normalizeUaClientHints(lowEntropy));
}

export function withUaClientHints(payload: any, uaClientHints: unknown): any {
  if (!uaClientHints) return payload;
  return {
    ...payload,
    uaClientHints,
  };
}
