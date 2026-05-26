export interface QueryFilters {
  country?: string;
  device?: string;
  browser?: string;
  path?: string;
  query?: string;
  title?: string;
  hostname?: string;
  entry?: string;
  exit?: string;
  sourceDomain?: string;
  sourceLink?: string;
  clientBrowser?: string;
  clientOsVersion?: string;
  clientDeviceType?: string;
  clientLanguage?: string;
  clientScreenSize?: string;
  geo?: string;
  geoContinent?: string;
  geoTimezone?: string;
  geoOrganization?: string;
  eventPayloadFilters?: Array<{
    path: string;
    operator: "eq" | "ne";
    value: string | number | boolean | null;
  }>;
}
