import { describe, expect, it } from "vitest";
import UZIP from "uzip";
import { generateInformalQuotationDocx } from "../src/lib/informal-quotation-docx";
import type { InformalQuotationRequest, Plant } from "../src/lib/types";

function makeTemplateBuffer() {
  const documentXml = [
    "<w:document>",
    "{{QUOTATION_REF}} {{QUOTATION_DATE}} {{CUSTOMER_NAME}} {{CUSTOMER_ADDRESS_LINE_1}} {{CUSTOMER_ADDRESS_LINE_2}}",
    "{{KIND_ATTENTION}} {{PROJECT_LOCATION}} {{PAYMENT_TERMS}} {{UNIT_NAME}}",
    "<w:tbl>",
    "<w:tr>{{#ITEMS}}{{CONCRETE_GRADE}}|{{UOM}}|{{QTY}}|{{BASIC_RATE_PER_CUM}}|{{GST_PERCENT}}|{{INCLUDING_GST_RATE}}{{/ITEMS}}</w:tr>",
    "</w:tbl>",
    "{{AUTHORIZED_SIGNATORY_NAME}} {{AUTHORIZED_SIGNATORY_DESIGNATION}} {{AUTHORIZED_SIGNATORY_PHONE}} {{AUTHORIZED_SIGNATORY_EMAIL}}",
    "</w:document>",
  ].join("");
  const files = {
    "word/document.xml": new TextEncoder().encode(documentXml),
    "word/header1.xml": new TextEncoder().encode("<w:hdr>{{QUOTATION_REF}}</w:hdr>"),
  };

  const encoded = UZIP.encode(files);
  return Buffer.from(encoded instanceof Uint8Array ? encoded : new Uint8Array(encoded));
}

describe("generateInformalQuotationDocx", () => {
  it("fills quotation placeholders and repeats item rows", () => {
    const quotation = {
      id: "quote-1",
      quotationRef: "SPDCPL/26-27/0001",
      createdAt: "2026-05-22T05:00:00.000Z",
      decidedAt: "2026-05-22T06:00:00.000Z",
      customerName: "JRM Buildcon",
      billingAddress: "Plot 1, Kalinga Nagar, Bhubaneswar, Odisha",
      siteAddress: "JRM Buildcon Office, Kalinga Nagar, Bhubaneswar",
      stakeholderName: "Rajiv Sharma",
      priceType: "GST_INCLUSIVE",
      paymentType: "ADVANCE",
      creditDays: null,
      items: [
        { id: "item-1", grade: "M25", quantityCum: 30, mixDesignType: "NOMINAL_MIX", mixRequirement: "Nominal mix", pricePerCum: 5900 },
        { id: "item-2", grade: "M30", quantityCum: 20, mixDesignType: "DESIGN_MIX", mixRequirement: "Client design", pricePerCum: 6200 },
      ],
    } as InformalQuotationRequest;
    const plant = { id: "plant-1", name: "Andharua Plant", unitName: "Andharua" } as Plant;
    const docx = generateInformalQuotationDocx({
      quotation,
      plant,
      manager: null,
      salesAgent: null,
      templateBuffer: makeTemplateBuffer(),
    });
    const files = UZIP.parse(docx.buffer.slice(docx.byteOffset, docx.byteOffset + docx.byteLength));
    const documentXml = new TextDecoder().decode(files["word/document.xml"]);
    const headerXml = new TextDecoder().decode(files["word/header1.xml"]);

    expect(documentXml).toContain("SPDCPL/26-27/0001");
    expect(documentXml).toContain("Rajiv Sharma");
    expect(documentXml).toContain("JRM Buildcon Office, Kalinga Nagar, Bhubaneswar");
    expect(documentXml).toContain("M25|CUM|30");
    expect(documentXml).toContain("M30|CUM|20");
    expect(documentXml).toContain("Amit Sharma Marketing head 9124580880 marketing.spdconcrete@gmail.com");
    expect(documentXml).not.toContain("{{");
    expect(headerXml).toContain("SPDCPL/26-27/0001");
  });
});
