export interface OdooConfig {
  url: string;
  db: string;
  username: string;
  apiKey: string;
  timeoutMs: number;
}

export interface OdooEnvSummary {
  configured: boolean;
  urlPresent: boolean;
  dbPresent: boolean;
  usernamePresent: boolean;
  apiKeyPresent: boolean;
  url: string | null;
  db: string | null;
  username: string | null;
}

export interface OdooHealthReport {
  ok: boolean;
  configured: boolean;
  url: string;
  db: string;
  username: string;
  uid: number;
  serverVersion?: string;
  userName?: string;
  company?: string;
}

interface OdooRpcErrorPayload {
  code?: number;
  message?: string;
  data?: {
    name?: string;
    message?: string;
    debug?: string;
  };
}

interface OdooJsonRpcResponse<T> {
  jsonrpc?: string;
  id?: string;
  result?: T;
  error?: OdooRpcErrorPayload;
}

type JsonRpcService = "common" | "object";

const DEFAULT_TIMEOUT_MS = 15000;

export class OdooConfigError extends Error {}

export class OdooApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export function normalizeOdooUrl(value: string) {
  let normalized = value.trim();

  if (normalized.startsWith("//")) {
    normalized = `https:${normalized}`;
  }

  if (normalized && !/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  return normalized.replace(/\/+$/, "");
}

function sanitizeOdooError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/[A-Za-z0-9_-]{24,}/g, "[redacted-token]")
    .replace(/\s+/g, " ")
    .slice(0, 360);
}

export function getOdooEnvSummary(env: NodeJS.ProcessEnv = process.env): OdooEnvSummary {
  const url = normalizeOdooUrl(env.ODOO_URL ?? "");
  const db = env.ODOO_DB?.trim() || "";
  const username = env.ODOO_USERNAME?.trim() || "";
  const apiKey = env.ODOO_API_KEY?.trim() || "";

  return {
    configured: Boolean(url && db && username && apiKey),
    urlPresent: Boolean(url),
    dbPresent: Boolean(db),
    usernamePresent: Boolean(username),
    apiKeyPresent: Boolean(apiKey),
    url: url || null,
    db: db || null,
    username: username || null,
  };
}

export function getOdooConfig(env: NodeJS.ProcessEnv = process.env): OdooConfig {
  const summary = getOdooEnvSummary(env);

  if (!summary.configured) {
    throw new OdooConfigError("Odoo is not configured. Add ODOO_URL, ODOO_DB, ODOO_USERNAME, and ODOO_API_KEY.");
  }

  return {
    url: summary.url ?? "",
    db: summary.db ?? "",
    username: summary.username ?? "",
    apiKey: env.ODOO_API_KEY?.trim() ?? "",
    timeoutMs: Number(env.ODOO_TIMEOUT_MS ?? "") || DEFAULT_TIMEOUT_MS,
  };
}

async function callOdooJsonRpc<T>(config: OdooConfig, service: JsonRpcService, method: string, args: unknown[]) {
  const response = await fetch(`${config.url}/jsonrpc`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        service,
        method,
        args,
      },
      id: `spd-${Date.now()}`,
    }),
    signal: AbortSignal.timeout(config.timeoutMs),
  });

  if (!response.ok) {
    throw new OdooApiError(`Odoo returned HTTP ${response.status}.`, response.status);
  }

  const payload = (await response.json()) as OdooJsonRpcResponse<T>;

  if (payload.error) {
    const message =
      payload.error.data?.message ||
      payload.error.message ||
      payload.error.data?.name ||
      "Odoo JSON-RPC request failed.";
    throw new OdooApiError(sanitizeOdooError(message));
  }

  return payload.result as T;
}

export async function authenticateOdoo(config = getOdooConfig()) {
  try {
    const uid = await callOdooJsonRpc<number | false>(config, "common", "authenticate", [
      config.db,
      config.username,
      config.apiKey,
      {},
    ]);

    if (uid) {
      return uid;
    }
  } catch (error) {
    if (!(error instanceof OdooApiError)) {
      throw error;
    }
  }

  const uid = await callOdooJsonRpc<number | false>(config, "common", "login", [
    config.db,
    config.username,
    config.apiKey,
  ]);

  if (!uid) {
    throw new OdooApiError("Odoo authentication failed. Check database, username, API key, and plan API access.");
  }

  return uid;
}

export async function executeOdooKw<T>(
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {},
  config = getOdooConfig(),
) {
  const uid = await authenticateOdoo(config);

  return callOdooJsonRpc<T>(config, "object", "execute_kw", [
    config.db,
    uid,
    config.apiKey,
    model,
    method,
    args,
    kwargs,
  ]);
}

export async function checkOdooConnection(config = getOdooConfig()): Promise<OdooHealthReport> {
  const uid = await authenticateOdoo(config);
  const version = await callOdooJsonRpc<{ server_version?: string }>(config, "common", "version", []);
  const users = await callOdooJsonRpc<Array<{ name?: string; login?: string; company_id?: [number, string] }>>(
    config,
    "object",
    "execute_kw",
    [
      config.db,
      uid,
      config.apiKey,
      "res.users",
      "read",
      [[uid]],
      {
        fields: ["name", "login", "company_id"],
      },
    ],
  );
  const currentUser = users[0];

  return {
    ok: true,
    configured: true,
    url: config.url,
    db: config.db,
    username: config.username,
    uid,
    serverVersion: version.server_version,
    userName: currentUser?.name,
    company: currentUser?.company_id?.[1],
  };
}

export function formatOdooError(error: unknown) {
  if (error instanceof OdooConfigError) {
    return error.message;
  }

  if (error instanceof OdooApiError) {
    return error.message;
  }

  return sanitizeOdooError(error);
}
