import { getConfig } from "./config.js";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    const msg =
      typeof body === "object" && body !== null && "message" in body
        ? String((body as Record<string, unknown>).message)
        : String(body);
    super(`API error ${status}: ${msg}`);
    this.status = status;
    this.body = body;
  }
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; params?: Record<string, string> } = {},
): Promise<T> {
  const config = getConfig();
  let url = `${config.base_url}${path}`;
  if (opts.params) {
    const search = new URLSearchParams(opts.params);
    url += `?${search}`;
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  headers["Authorization"] = `Api-key ${config.api_key}`;
  if (config.organization) headers["x-organization"] = config.organization;

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    throw new ApiError(res.status, parsed);
  }
  const text = await res.text();
  if (!text) return undefined as T;
  try { return JSON.parse(text) as T; } catch { return text as T; }
}
