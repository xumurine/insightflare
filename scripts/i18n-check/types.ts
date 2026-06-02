export type JsonLike = string | number | boolean | null | JsonMap;
export type JsonMap = { [key: string]: JsonLike };

export interface NodeInfo {
  kind: "object" | "scalar";
  value?: string;
}

export interface ResolvedPath {
  path: string[];
  dynamic: boolean;
}

export interface UsageRef {
  file: string;
  line: number;
  column: number;
}

export type BindingMap = Map<string, string[]>;
export type TypePathMap = Map<string, string[]>;
