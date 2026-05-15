import type { SalesOrderRequest } from "@/lib/types";

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
type OdooDomain = Array<[string, string, unknown]>;

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_CONCRETE_PRODUCT_CODE = "SPD-RMC";
const DEFAULT_CONCRETE_PRODUCT_NAME = "Ready Mix Concrete";

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

export function isOdooConfigured(env: NodeJS.ProcessEnv = process.env) {
  return getOdooEnvSummary(env).configured;
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

async function searchReadOdoo<T extends { id: number }>(
  model: string,
  domain: OdooDomain,
  fields: string[],
  limit = 1,
) {
  return executeOdooKw<T[]>(model, "search_read", [domain], { fields, limit });
}

function parseOdooId(value: string | undefined) {
  const parsed = Number(`${value ?? ""}`.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseOdooIdList(value: string | undefined) {
  return `${value ?? ""}`
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);
}

function getOrderReference(order: SalesOrderRequest) {
  return `SPD-${order.id}`;
}

function getPartnerName(order: SalesOrderRequest) {
  return order.gstLegalName?.trim() || order.customerName.trim();
}

function getPartnerAddress(order: SalesOrderRequest) {
  return order.gstBillingAddress?.trim() || order.shippingAddress?.trim() || order.siteAddress?.trim() || "";
}

export function shouldSyncSalesOrderToOdoo(order: SalesOrderRequest) {
  return Boolean(order.gstin && order.gstVerificationStatus === "VERIFIED");
}

export function buildOdooPartnerValues(order: SalesOrderRequest) {
  const values: Record<string, unknown> = {
    name: getPartnerName(order),
    street: getPartnerAddress(order),
    phone: order.receiverPhone.trim() || false,
    vat: order.gstin ?? false,
    comment: `Created/updated from SPD app sales order ${getOrderReference(order)}.`,
  };

  return values;
}

export function buildOdooSaleOrderLineName(order: SalesOrderRequest) {
  const site = order.siteName.trim();
  const grade = order.grade.trim().toUpperCase();
  return `${grade} ready mix concrete${site ? ` - ${site}` : ""}`;
}

export async function upsertOdooPartnerForSalesOrder(order: SalesOrderRequest) {
  if (!shouldSyncSalesOrderToOdoo(order)) {
    throw new OdooConfigError("Odoo partner sync requires a finance-verified GST sales order.");
  }

  const values = buildOdooPartnerValues(order);
  const gstin = order.gstin?.trim();
  const partnerName = getPartnerName(order);
  const searchDomains: OdooDomain[] = [];

  if (gstin) {
    searchDomains.push([["vat", "=", gstin]]);
  }
  if (partnerName) {
    searchDomains.push([["name", "=", partnerName]]);
  }

  let partner: { id: number; display_name?: string } | undefined;
  for (const domain of searchDomains) {
    const matches = await searchReadOdoo<{ id: number; display_name?: string }>("res.partner", domain, ["id", "display_name"]);
    partner = matches[0];
    if (partner) {
      break;
    }
  }

  if (partner) {
    await executeOdooKw<boolean>("res.partner", "write", [[partner.id], values]);
    return {
      partnerId: partner.id,
      partnerName: partner.display_name || partnerName,
      created: false,
    };
  }

  const partnerId = await executeOdooKw<number>("res.partner", "create", [values]);
  return {
    partnerId,
    partnerName,
    created: true,
  };
}

async function resolveOdooConcreteProductId(env: NodeJS.ProcessEnv = process.env) {
  const configuredProductId = parseOdooId(env.ODOO_CONCRETE_PRODUCT_ID);
  if (configuredProductId) {
    return configuredProductId;
  }

  const productName = env.ODOO_CONCRETE_PRODUCT_NAME?.trim() || DEFAULT_CONCRETE_PRODUCT_NAME;
  const byCode = await searchReadOdoo<{ id: number; display_name?: string }>(
    "product.product",
    [["default_code", "=", DEFAULT_CONCRETE_PRODUCT_CODE]],
    ["id", "display_name"],
  );

  if (byCode[0]) {
    return byCode[0].id;
  }

  const byName = await searchReadOdoo<{ id: number; display_name?: string }>(
    "product.product",
    [["name", "=", productName]],
    ["id", "display_name"],
  );

  if (byName[0]) {
    return byName[0].id;
  }

  return executeOdooKw<number>("product.product", "create", [
    {
      name: productName,
      default_code: DEFAULT_CONCRETE_PRODUCT_CODE,
    },
  ]);
}

export async function createOdooSaleOrderForSalesOrder(order: SalesOrderRequest) {
  if (!shouldSyncSalesOrderToOdoo(order)) {
    throw new OdooConfigError("Odoo sales order sync requires a finance-verified GST sales order.");
  }

  const partner = await upsertOdooPartnerForSalesOrder(order);
  const clientOrderRef = getOrderReference(order);
  const existing = await searchReadOdoo<{ id: number; name?: string }>(
    "sale.order",
    [["client_order_ref", "=", clientOrderRef]],
    ["id", "name"],
  );

  if (existing[0]) {
    return {
      saleOrderId: existing[0].id,
      saleOrderName: existing[0].name || `${existing[0].id}`,
      partnerId: partner.partnerId,
      productId: null,
      created: false,
    };
  }

  const productId = await resolveOdooConcreteProductId();
  const taxIds = parseOdooIdList(process.env.ODOO_GST_TAX_IDS);
  const orderLine: Record<string, unknown> = {
    product_id: productId,
    name: buildOdooSaleOrderLineName(order),
    product_uom_qty: order.quantity,
    price_unit: order.approvedPrice,
  };

  if (taxIds.length) {
    orderLine.tax_id = [[6, 0, taxIds]];
  }

  const saleOrderId = await executeOdooKw<number>("sale.order", "create", [
    {
      partner_id: partner.partnerId,
      client_order_ref: clientOrderRef,
      origin: clientOrderRef,
      note: [
        `SPD app order: ${order.id}`,
        `Site: ${order.siteName}`,
        `GSTIN: ${order.gstin}`,
        `Dispatch address: ${order.shippingAddress || order.siteAddress}`,
      ].join("\n"),
      order_line: [[0, 0, orderLine]],
    },
  ]);

  const createdOrder = await executeOdooKw<Array<{ id: number; name?: string }>>(
    "sale.order",
    "read",
    [[saleOrderId]],
    { fields: ["name"] },
  );

  return {
    saleOrderId,
    saleOrderName: createdOrder[0]?.name || `${saleOrderId}`,
    partnerId: partner.partnerId,
    productId,
    created: true,
  };
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
