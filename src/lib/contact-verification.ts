import type { ContactVerificationChannel, ContactVerificationStatus } from "@/lib/types";

export interface ContactVerificationConfigSummary {
  whatsappProvider: string;
  whatsappConfigured: boolean;
  callProvider: string;
  callConfigured: boolean;
  gpsProvider: string;
  gpsConfigured: boolean;
}

export interface VerificationSendResult {
  provider: string;
  status: Exclude<ContactVerificationStatus, "VERIFIED" | "RECEIVED">;
  providerMessageId: string | null;
  error: string | null;
  metadata?: Record<string, unknown>;
}

export interface WhatsappInboundMessage {
  provider: string;
  from: string;
  text: string;
  providerMessageId: string | null;
  raw: unknown;
}

function trimEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function sanitizeProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[A-Za-z0-9_-]{24,}/g, "[redacted-token]").replace(/\s+/g, " ").slice(0, 360);
}

function getJsonHeader(token: string) {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function normalizeIndianMobileForProvider(phone: string) {
  const digits = phone.replace(/\D/g, "").slice(-10);
  if (!/^[6-9]\d{9}$/.test(digits)) {
    throw new Error("A valid 10 digit Indian mobile number is required for verification.");
  }

  return {
    national: digits,
    e164: `91${digits}`,
    tel: `+91${digits}`,
  };
}

export function getContactVerificationEnvSummary(): ContactVerificationConfigSummary {
  const whatsappProvider = (trimEnv("WHATSAPP_PROVIDER") || "n8n").toLowerCase();
  const callProvider = (trimEnv("CALL_VERIFICATION_PROVIDER") || "webhook").toLowerCase();
  const gpsProvider = trimEnv("GPS_GEOCODER") || "mappls";

  const whatsappConfigured =
    whatsappProvider === "cloud"
      ? Boolean(trimEnv("WHATSAPP_CLOUD_TOKEN") && trimEnv("WHATSAPP_CLOUD_PHONE_NUMBER_ID"))
      : Boolean(trimEnv("N8N_WHATSAPP_WEBHOOK_URL"));
  const callConfigured = Boolean(trimEnv("CALL_VERIFICATION_API_URL") && trimEnv("CALL_VERIFICATION_API_KEY"));
  const gpsConfigured = gpsProvider === "mappls" ? Boolean(trimEnv("MAPPLS_REST_API_KEY")) : true;

  return {
    whatsappProvider,
    whatsappConfigured,
    callProvider,
    callConfigured,
    gpsProvider,
    gpsConfigured,
  };
}

export function buildVerificationMessage(channel: ContactVerificationChannel, name: string, siteName: string) {
  const greeting = name.trim() ? `Dear ${name.trim()},` : "Dear customer,";
  const site = siteName.trim() ? ` for ${siteName.trim()}` : "";

  if (channel === "CALL") {
    return `${greeting} this is an SPD Concrete contact verification call${site}.`;
  }

  return [
    greeting,
    `SPD Concrete is verifying your WhatsApp contact${site}.`,
    "Reply YES to confirm this number belongs to the site stakeholder.",
  ].join("\n");
}

export function getWhatsappWebhookVerifyToken() {
  return trimEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN");
}

export function getWhatsappWebhookSharedSecret() {
  return trimEnv("WHATSAPP_WEBHOOK_SHARED_SECRET");
}

function getReplyWords() {
  const configured = trimEnv("WHATSAPP_AUTO_VERIFY_REPLY_WORDS");
  const words = configured ? configured.split(",") : ["YES", "Y", "CONFIRM", "CONFIRMED", "VERIFY", "VERIFIED"];
  return new Set(words.map((word) => word.trim().toUpperCase()).filter(Boolean));
}

export function isWhatsappVerificationConfirmation(text: string) {
  const normalized = text.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim().toUpperCase();
  if (!normalized) {
    return false;
  }

  const words = getReplyWords();
  return words.has(normalized) || normalized.split(" ").some((word) => words.has(word));
}

function readNestedString(value: unknown, path: string[]) {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object") {
      return "";
    }
    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === "string" ? current.trim() : "";
}

function normalizeInboundPhone(value: unknown) {
  const digits = `${value ?? ""}`.replace(/\D/g, "");
  if (digits.length < 10) {
    return "";
  }

  return digits.slice(-10);
}

function pushInboundMessage(
  messages: WhatsappInboundMessage[],
  provider: string,
  from: unknown,
  text: string,
  providerMessageId: unknown,
  raw: unknown,
) {
  const phone = normalizeInboundPhone(from);
  if (!phone || !text.trim()) {
    return;
  }

  messages.push({
    provider,
    from: phone,
    text: text.trim(),
    providerMessageId: typeof providerMessageId === "string" ? providerMessageId : null,
    raw,
  });
}

export function extractWhatsappInboundMessages(payload: unknown): WhatsappInboundMessage[] {
  const messages: WhatsappInboundMessage[] = [];
  if (!payload || typeof payload !== "object") {
    return messages;
  }

  const root = payload as Record<string, unknown>;
  const data = (root.data && typeof root.data === "object" ? root.data : root) as Record<string, unknown>;

  const n8nFrom =
    readNestedString(root, ["phone"]) ||
    readNestedString(root, ["from"]) ||
    readNestedString(root, ["number"]) ||
    readNestedString(root, ["waId"]) ||
    readNestedString(data, ["phone"]) ||
    readNestedString(data, ["from"]) ||
    readNestedString(data, ["number"]) ||
    readNestedString(data, ["waId"]);
  const n8nText =
    readNestedString(root, ["text"]) ||
    readNestedString(root, ["message"]) ||
    readNestedString(root, ["body"]) ||
    readNestedString(root, ["reply"]) ||
    readNestedString(root, ["messageText"]) ||
    readNestedString(data, ["text"]) ||
    readNestedString(data, ["message"]) ||
    readNestedString(data, ["body"]) ||
    readNestedString(data, ["reply"]) ||
    readNestedString(data, ["messageText"]);
  const n8nId =
    readNestedString(root, ["providerMessageId"]) ||
    readNestedString(root, ["messageId"]) ||
    readNestedString(root, ["id"]) ||
    readNestedString(data, ["providerMessageId"]) ||
    readNestedString(data, ["messageId"]) ||
    readNestedString(data, ["id"]);
  pushInboundMessage(messages, "n8n", n8nFrom, n8nText, n8nId, payload);

  const entries = Array.isArray(root.entry) ? root.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray((entry as Record<string, unknown>).changes) ? (entry as Record<string, unknown>).changes as unknown[] : [];
    for (const change of changes) {
      const value = (change as Record<string, unknown>).value as Record<string, unknown> | undefined;
      const cloudMessages = Array.isArray(value?.messages) ? value.messages : [];
      for (const message of cloudMessages) {
        const record = message as Record<string, unknown>;
        const text =
          readNestedString(record, ["text", "body"]) ||
          readNestedString(record, ["button", "text"]) ||
          readNestedString(record, ["interactive", "button_reply", "title"]) ||
          readNestedString(record, ["interactive", "list_reply", "title"]);
        pushInboundMessage(messages, "cloud", record.from, text, record.id, message);
      }
    }
  }

  return messages;
}

export async function sendWhatsappVerification(phone: string, message: string): Promise<VerificationSendResult> {
  const normalized = normalizeIndianMobileForProvider(phone);
  const provider = (trimEnv("WHATSAPP_PROVIDER") || "n8n").toLowerCase();

  if (provider === "cloud") {
    return sendWhatsappCloudVerification(normalized.e164, message);
  }

  return sendN8nWhatsappVerification(normalized, message);
}

async function sendN8nWhatsappVerification(
  number: ReturnType<typeof normalizeIndianMobileForProvider>,
  message: string,
): Promise<VerificationSendResult> {
  const webhookUrl = trimEnv("N8N_WHATSAPP_WEBHOOK_URL");
  const webhookSecret = trimEnv("N8N_WHATSAPP_WEBHOOK_SECRET");
  const provider = "n8n";

  if (!webhookUrl) {
    return {
      provider,
      status: "PENDING_CONFIGURATION",
      providerMessageId: null,
      error: "n8n WhatsApp webhook is not configured. Add N8N_WHATSAPP_WEBHOOK_URL in AWS.",
    };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(webhookSecret ? { Authorization: `Bearer ${webhookSecret}`, "x-spd-webhook-token": webhookSecret } : {}),
      },
      body: JSON.stringify({
        phone: number.national,
        to: number.tel,
        e164: number.e164,
        countryCode: "91",
        purpose: "SPD_WHATSAPP_CONTACT_VERIFICATION",
        message,
      }),
      signal: AbortSignal.timeout(Number(trimEnv("WHATSAPP_TIMEOUT_MS")) || 15000),
    });

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return {
        provider,
        status: "FAILED",
        providerMessageId: null,
        error: sanitizeProviderError((payload.message as string | undefined) ?? `n8n WhatsApp webhook returned HTTP ${response.status}.`),
        metadata: payload,
      };
    }

    return {
      provider,
      status: "SENT",
      providerMessageId: String(payload.id ?? payload.executionId ?? payload.messageId ?? "") || null,
      error: null,
      metadata: payload,
    };
  } catch (error) {
    return {
      provider,
      status: "FAILED",
      providerMessageId: null,
      error: sanitizeProviderError(error),
    };
  }
}

async function sendWhatsappCloudVerification(to: string, message: string): Promise<VerificationSendResult> {
  const token = trimEnv("WHATSAPP_CLOUD_TOKEN");
  const phoneNumberId = trimEnv("WHATSAPP_CLOUD_PHONE_NUMBER_ID");
  const apiVersion = trimEnv("WHATSAPP_CLOUD_API_VERSION") || "v20.0";
  const provider = "cloud";

  if (!token || !phoneNumberId) {
    return {
      provider,
      status: "PENDING_CONFIGURATION",
      providerMessageId: null,
      error: "WhatsApp Cloud API is not configured. Add WHATSAPP_CLOUD_TOKEN and WHATSAPP_CLOUD_PHONE_NUMBER_ID in AWS.",
    };
  }

  try {
    const response = await fetch(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      headers: getJsonHeader(token),
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: message },
      }),
      signal: AbortSignal.timeout(Number(trimEnv("WHATSAPP_TIMEOUT_MS")) || 15000),
    });

    const payload = (await response.json().catch(() => ({}))) as { messages?: Array<{ id?: string }>; error?: { message?: string } };
    if (!response.ok) {
      return {
        provider,
        status: "FAILED",
        providerMessageId: null,
        error: sanitizeProviderError(payload.error?.message ?? `WhatsApp Cloud API returned HTTP ${response.status}.`),
        metadata: payload as Record<string, unknown>,
      };
    }

    return {
      provider,
      status: "SENT",
      providerMessageId: payload.messages?.[0]?.id ?? null,
      error: null,
      metadata: payload as Record<string, unknown>,
    };
  } catch (error) {
    return {
      provider,
      status: "FAILED",
      providerMessageId: null,
      error: sanitizeProviderError(error),
    };
  }
}

export async function placeCallVerification(phone: string, message: string): Promise<VerificationSendResult> {
  const normalized = normalizeIndianMobileForProvider(phone);
  const apiUrl = trimEnv("CALL_VERIFICATION_API_URL");
  const apiKey = trimEnv("CALL_VERIFICATION_API_KEY");
  const provider = trimEnv("CALL_VERIFICATION_PROVIDER") || "webhook";

  if (!apiUrl || !apiKey) {
    return {
      provider,
      status: "PENDING_CONFIGURATION",
      providerMessageId: null,
      error: "Call verification is not configured. Add CALL_VERIFICATION_API_URL and CALL_VERIFICATION_API_KEY in AWS.",
    };
  }

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: getJsonHeader(apiKey),
      body: JSON.stringify({
        to: normalized.tel,
        phone: normalized.national,
        countryCode: "91",
        purpose: "SPD_CONTACT_VERIFICATION",
        message,
      }),
      signal: AbortSignal.timeout(Number(trimEnv("CALL_VERIFICATION_TIMEOUT_MS")) || 15000),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      return {
        provider,
        status: "FAILED",
        providerMessageId: null,
        error: sanitizeProviderError((payload.message as string | undefined) ?? `Call verification API returned HTTP ${response.status}.`),
        metadata: payload,
      };
    }

    return {
      provider,
      status: "SENT",
      providerMessageId: String(payload.id ?? payload.callId ?? payload.sid ?? "") || null,
      error: null,
      metadata: payload,
    };
  } catch (error) {
    return {
      provider,
      status: "FAILED",
      providerMessageId: null,
      error: sanitizeProviderError(error),
    };
  }
}
