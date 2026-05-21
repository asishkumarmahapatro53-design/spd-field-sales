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
  const whatsappProvider = (trimEnv("WHATSAPP_PROVIDER") || "evolution").toLowerCase();
  const callProvider = (trimEnv("CALL_VERIFICATION_PROVIDER") || "webhook").toLowerCase();
  const gpsProvider = trimEnv("GPS_GEOCODER") || "mappls";

  const whatsappConfigured =
    whatsappProvider === "cloud"
      ? Boolean(trimEnv("WHATSAPP_CLOUD_TOKEN") && trimEnv("WHATSAPP_CLOUD_PHONE_NUMBER_ID"))
      : Boolean(trimEnv("EVOLUTION_API_URL") && trimEnv("EVOLUTION_API_KEY") && trimEnv("EVOLUTION_INSTANCE"));
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

function getEvolutionMessageText(data: Record<string, unknown>) {
  return (
    readNestedString(data, ["message", "conversation"]) ||
    readNestedString(data, ["message", "extendedTextMessage", "text"]) ||
    readNestedString(data, ["message", "ephemeralMessage", "message", "extendedTextMessage", "text"]) ||
    readNestedString(data, ["message", "buttonsResponseMessage", "selectedDisplayText"]) ||
    readNestedString(data, ["message", "listResponseMessage", "title"]) ||
    readNestedString(data, ["text"]) ||
    readNestedString(data, ["messageText"])
  );
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

  const data = (root.data && typeof root.data === "object" ? root.data : root) as Record<string, unknown>;
  const evolutionFrom =
    readNestedString(data, ["key", "remoteJid"]) ||
    readNestedString(data, ["remoteJid"]) ||
    readNestedString(data, ["from"]) ||
    readNestedString(root, ["from"]) ||
    readNestedString(root, ["number"]);
  const evolutionText = getEvolutionMessageText(data) || readNestedString(root, ["text"]) || readNestedString(root, ["message"]);
  const evolutionId = readNestedString(data, ["key", "id"]) || readNestedString(data, ["id"]) || readNestedString(root, ["id"]);
  pushInboundMessage(messages, "evolution", evolutionFrom, evolutionText, evolutionId, payload);

  return messages;
}

export async function sendWhatsappVerification(phone: string, message: string): Promise<VerificationSendResult> {
  const normalized = normalizeIndianMobileForProvider(phone);
  const provider = (trimEnv("WHATSAPP_PROVIDER") || "evolution").toLowerCase();

  if (provider === "cloud") {
    return sendWhatsappCloudVerification(normalized.e164, message);
  }

  return sendEvolutionWhatsappVerification(normalized.e164, message);
}

async function sendEvolutionWhatsappVerification(number: string, message: string): Promise<VerificationSendResult> {
  const apiUrl = trimEnv("EVOLUTION_API_URL").replace(/\/+$/, "");
  const apiKey = trimEnv("EVOLUTION_API_KEY");
  const instance = trimEnv("EVOLUTION_INSTANCE");
  const provider = "evolution";

  if (!apiUrl || !apiKey || !instance) {
    return {
      provider,
      status: "PENDING_CONFIGURATION",
      providerMessageId: null,
      error: "Evolution API is not configured. Add EVOLUTION_API_URL, EVOLUTION_API_KEY, and EVOLUTION_INSTANCE in AWS.",
    };
  }

  try {
    const response = await fetch(`${apiUrl}/message/sendText/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        number,
        text: message,
      }),
      signal: AbortSignal.timeout(Number(trimEnv("WHATSAPP_TIMEOUT_MS")) || 15000),
    });

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return {
        provider,
        status: "FAILED",
        providerMessageId: null,
        error: sanitizeProviderError((payload.message as string | undefined) ?? `Evolution API returned HTTP ${response.status}.`),
        metadata: payload,
      };
    }

    return {
      provider,
      status: "SENT",
      providerMessageId: String(payload.key ?? payload.id ?? payload.messageId ?? "") || null,
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
