import { NextResponse } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import {
  extractWhatsappInboundMessages,
  getWhatsappWebhookSharedSecret,
  getWhatsappWebhookVerifyToken,
  isWhatsappVerificationConfirmation,
} from "@/lib/contact-verification";
import { recordWhatsappVerificationReply } from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getTokenFromRequest(request: Request) {
  const url = new URL(request.url);
  return request.headers.get("x-spd-webhook-token") ?? url.searchParams.get("token") ?? "";
}

function assertWebhookSecret(request: Request) {
  const expected = getWhatsappWebhookSharedSecret();
  if (!expected) {
    return;
  }

  if (getTokenFromRequest(request) !== expected) {
    throw new ApiError(401, "Invalid WhatsApp webhook token.");
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = getWhatsappWebhookVerifyToken();

    if (mode === "subscribe" && challenge && (!expected || token === expected)) {
      return new NextResponse(challenge, { status: 200 });
    }

    throw new ApiError(403, "WhatsApp webhook verification failed.");
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertWebhookSecret(request);
    const payload = await request.json();
    const messages = extractWhatsappInboundMessages(payload);
    const results = [];

    for (const message of messages) {
      const verified = isWhatsappVerificationConfirmation(message.text);
      results.push(
        await recordWhatsappVerificationReply({
          phone: message.from,
          text: message.text,
          provider: message.provider,
          providerMessageId: message.providerMessageId,
          verified,
          metadata: { raw: message.raw },
        }),
      );
    }

    return jsonOk({ ok: true, processed: messages.length, results });
  } catch (error) {
    return jsonError(error);
  }
}
