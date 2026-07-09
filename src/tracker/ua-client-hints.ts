const UA_CLIENT_HINT_KEYS: string[] = [
  "fullVersionList",
  "platformVersion",
  "model",
  "formFactors",
];

export interface UaClientHintsResult {
  [key: string]: unknown;
}

function hasUaClientHints(input: UaClientHintsResult): boolean {
  return Object.values(input).some((value) => value !== undefined);
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
    return Promise.resolve(hasUaClientHints(lowEntropy) ? lowEntropy : null);
  }
  return uaData
    .getHighEntropyValues(UA_CLIENT_HINT_KEYS)
    .then((values: any) => ({ ...lowEntropy, ...values }))
    .catch(() => (hasUaClientHints(lowEntropy) ? lowEntropy : null));
}

export function withUaClientHints(payload: any, uaClientHints: unknown): any {
  if (!uaClientHints) return payload;
  return {
    ...payload,
    uaClientHints,
  };
}
