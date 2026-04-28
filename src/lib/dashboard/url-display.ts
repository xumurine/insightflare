const URL_ESCAPE_PATTERN = /%[0-9A-Fa-f]{2}/;

export function decodeUrlDisplayValue(value: string): string {
  const normalized = String(value ?? "");
  if (!URL_ESCAPE_PATTERN.test(normalized)) return normalized;

  try {
    return decodeURI(normalized);
  } catch {
    try {
      return decodeURIComponent(normalized);
    } catch {
      return normalized;
    }
  }
}
