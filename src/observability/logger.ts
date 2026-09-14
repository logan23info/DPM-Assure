const SENSITIVE_KEY = /(authorization|cookie|token|secret|password|api[_-]?key|signed[_-]?url|evidence[_-]?content)/i;
const TOKEN_LIKE = /(Bearer\s+[A-Za-z0-9._~+/=-]+|https?:\/\/[^\s?]+\?[^\s]+)/gi;

export type LogLevel = "info" | "warn" | "error";

export function redactForLog(value: unknown, key = ""): unknown {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (typeof value === "string") return value.replace(TOKEN_LIKE, "[REDACTED]");
  if (Array.isArray(value)) return value.map((item) => redactForLog(item));
  if (value && typeof value === "object") {
    if (value instanceof Error) return { name: value.name, message: redactForLog(value.message), stack: undefined };
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactForLog(v, k)]));
  }
  return value;
}

export function operationalLog(level: LogLevel, event: string, context: Record<string, unknown> = {}): void {
  const record = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...redactForLog(context) as object });
  if (level === "error") console.error(record);
  else if (level === "warn") console.warn(record);
  else console.info(record);
}
