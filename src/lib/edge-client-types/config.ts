import type { SiteScriptSettings } from "@/lib/site-settings";

export interface SiteConfigData {
  ok: boolean;
  data: SiteScriptSettings;
}

export interface ScriptSnippetData {
  ok: boolean;
  data: {
    siteId: string;
    src: string;
    snippet: string;
  };
}
