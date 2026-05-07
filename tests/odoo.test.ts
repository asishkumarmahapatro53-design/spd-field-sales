import { describe, expect, it } from "vitest";
import { getOdooEnvSummary, normalizeOdooUrl } from "@/lib/odoo";

describe("odoo connector helpers", () => {
  it("normalizes Odoo URLs for env setup mistakes", () => {
    expect(normalizeOdooUrl("civilsai.odoo.com")).toBe("https://civilsai.odoo.com");
    expect(normalizeOdooUrl("//civilsai.odoo.com/")).toBe("https://civilsai.odoo.com");
    expect(normalizeOdooUrl("https://civilsai.odoo.com/")).toBe("https://civilsai.odoo.com");
  });

  it("summarizes Odoo env without exposing the API key", () => {
    const summary = getOdooEnvSummary({
      ODOO_URL: "https://civilsai.odoo.com",
      ODOO_DB: "civilsai",
      ODOO_USERNAME: "asishkumarmahapatro53@gmail.com",
      ODOO_API_KEY: "secret-api-key",
    } as unknown as NodeJS.ProcessEnv);

    expect(summary.configured).toBe(true);
    expect(summary.apiKeyPresent).toBe(true);
    expect(summary.url).toBe("https://civilsai.odoo.com");
    expect(Object.prototype.hasOwnProperty.call(summary, "apiKey")).toBe(false);
  });
});
