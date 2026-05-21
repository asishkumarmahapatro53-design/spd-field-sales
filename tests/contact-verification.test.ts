import { describe, expect, it } from "vitest";
import {
  buildVerificationMessage,
  extractWhatsappInboundMessages,
  getContactVerificationEnvSummary,
  isWhatsappVerificationConfirmation,
  normalizeIndianMobileForProvider,
} from "@/lib/contact-verification";

describe("contact verification helpers", () => {
  it("normalizes Indian mobile numbers for provider calls", () => {
    expect(normalizeIndianMobileForProvider("+91 98765 43210")).toMatchObject({
      national: "9876543210",
      e164: "919876543210",
      tel: "+919876543210",
    });
  });

  it("rejects invalid stakeholder mobile numbers", () => {
    expect(() => normalizeIndianMobileForProvider("12345")).toThrow(/valid 10 digit Indian mobile/);
  });

  it("summarizes missing provider configuration without exposing secrets", () => {
    const summary = getContactVerificationEnvSummary();
    expect(summary).toHaveProperty("whatsappConfigured");
    expect(summary).toHaveProperty("callConfigured");
    expect(Object.prototype.hasOwnProperty.call(summary, "apiKey")).toBe(false);
  });

  it("builds distinct call and WhatsApp verification messages", () => {
    expect(buildVerificationMessage("CALL", "Amit", "Tower A")).toContain("verification call");
    expect(buildVerificationMessage("WHATSAPP", "Amit", "Tower A")).toContain("Reply YES");
  });

  it("recognizes WhatsApp confirmation replies", () => {
    expect(isWhatsappVerificationConfirmation("YES")).toBe(true);
    expect(isWhatsappVerificationConfirmation("Yes, confirmed")).toBe(true);
    expect(isWhatsappVerificationConfirmation("who is this")).toBe(false);
  });

  it("extracts inbound Meta Cloud WhatsApp messages", () => {
    const messages = extractWhatsappInboundMessages({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "wamid.1",
                    from: "919876543210",
                    text: { body: "YES" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(messages).toMatchObject([{ from: "9876543210", text: "YES", provider: "cloud", providerMessageId: "wamid.1" }]);
  });

  it("extracts inbound n8n WhatsApp reply messages", () => {
    const messages = extractWhatsappInboundMessages({
      phone: "919876543210",
      text: "confirmed",
      messageId: "n8n-1",
    });

    expect(messages).toMatchObject([{ from: "9876543210", text: "confirmed", provider: "n8n", providerMessageId: "n8n-1" }]);
  });
});
