import { describe, expect, it } from "vitest";
import {
  buildOdooPartnerValues,
  buildOdooSaleOrderLineName,
  getOdooEnvSummary,
  normalizeOdooUrl,
  shouldSyncSalesOrderToOdoo,
} from "@/lib/odoo";
import type { SalesOrderRequest } from "@/lib/types";

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

  it("requires finance-verified GST before syncing to Odoo", () => {
    const order = {
      id: "order-1",
      customerName: "Jai Lakshmi Developers",
      siteName: "JL Site",
      grade: "M25",
      gstin: "21ABCDE1234F1Z5",
      gstVerificationStatus: "VERIFIED",
    } as SalesOrderRequest;

    expect(shouldSyncSalesOrderToOdoo(order)).toBe(true);
    expect(shouldSyncSalesOrderToOdoo({ ...order, gstin: null })).toBe(false);
    expect(shouldSyncSalesOrderToOdoo({ ...order, gstVerificationStatus: "PENDING_ACCOUNTS" })).toBe(false);
  });

  it("builds Odoo partner and sale-order values from app sales-order data", () => {
    const order = {
      id: "order-1",
      customerName: "Jai Lakshmi Developers",
      siteName: "Tower A",
      grade: "m25",
      gstin: "21ABCDE1234F1Z5",
      gstLegalName: "Jai Lakshmi Developers Pvt Ltd",
      gstBillingAddress: "Bhubaneswar, Odisha",
      siteAddress: "Tower A Site",
      shippingAddress: "Tower A Site",
      receiverPhone: "9876500000",
      gstVerificationStatus: "VERIFIED",
    } as SalesOrderRequest;

    expect(buildOdooPartnerValues(order)).toMatchObject({
      name: "Jai Lakshmi Developers Pvt Ltd",
      street: "Bhubaneswar, Odisha",
      phone: "9876500000",
      vat: "21ABCDE1234F1Z5",
    });
    expect(buildOdooSaleOrderLineName(order)).toBe("M25 ready mix concrete - Tower A");
  });
});
