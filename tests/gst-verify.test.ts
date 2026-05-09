import { describe, expect, it } from "vitest";
import { normalizeGstVerifyResponse } from "@/lib/gst-verify";

describe("GSTVerify response normalization", () => {
  it("extracts legal name, PAN, status, and principal address from GST portal shaped data", () => {
    const result = normalizeGstVerifyResponse(
      {
        data: {
          gstin: "21ABCDE1234F1Z5",
          lgnm: "JRM Buildcon Pvt Ltd",
          tradeNam: "JRM Buildcon",
          sts: "Active",
          dty: "Regular",
          pradr: {
            addr: {
              bnm: "Plot 12",
              st: "Industrial Road",
              loc: "Bhubaneswar",
              dst: "Khordha",
              stcd: "Odisha",
              pncd: "751001",
            },
          },
        },
      },
      "21ABCDE1234F1Z5",
    );

    expect(result.legalName).toBe("JRM Buildcon Pvt Ltd");
    expect(result.tradeName).toBe("JRM Buildcon");
    expect(result.registrationStatus).toBe("Active");
    expect(result.taxpayerType).toBe("Regular");
    expect(result.pan).toBe("ABCDE1234F");
    expect(result.billingAddress).toBe("Plot 12, Industrial Road, Bhubaneswar, Khordha, Odisha, 751001");
  });

  it("supports simple provider responses with direct billing address fields", () => {
    const result = normalizeGstVerifyResponse(
      {
        result: {
          legalName: "Civil Sai Construction",
          billingAddress: "Main Road, Cuttack, Odisha",
          panNumber: "ABCDE1234F",
        },
      },
      "21ABCDE1234F1Z5",
    );

    expect(result.gstin).toBe("21ABCDE1234F1Z5");
    expect(result.legalName).toBe("Civil Sai Construction");
    expect(result.billingAddress).toBe("Main Road, Cuttack, Odisha");
    expect(result.pan).toBe("ABCDE1234F");
  });
});
