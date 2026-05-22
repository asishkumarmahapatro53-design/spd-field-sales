import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import UZIP from "uzip";
import type { InformalQuotationRequest, Plant, User } from "@/lib/types";

const execFileAsync = promisify(execFile);
const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const GST_RATE = 0.18;
const MAX_PDF_CONVERSION_MS = 45_000;

interface QuotationDocxInput {
  quotation: InformalQuotationRequest;
  plant: Plant | null;
  manager: User | null;
  salesAgent: User | null;
  templateBuffer: Buffer;
}

type PlaceholderMap = Record<string, string>;

function formatDate(value: string | null | undefined) {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return new Intl.DateTimeFormat("en-GB").format(safeDate).replaceAll("/", ".");
}

function money(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function splitAddressLines(address: string) {
  const normalized = address.replace(/\s+/g, " ").trim();
  if (normalized.length <= 70) {
    return [normalized, ""];
  }

  const splitIndex = normalized.lastIndexOf(",", 70);
  if (splitIndex > 20) {
    return [normalized.slice(0, splitIndex).trim(), normalized.slice(splitIndex + 1).trim()];
  }

  const spaceIndex = normalized.lastIndexOf(" ", 70);
  if (spaceIndex > 20) {
    return [normalized.slice(0, spaceIndex).trim(), normalized.slice(spaceIndex + 1).trim()];
  }

  return [normalized.slice(0, 70).trim(), normalized.slice(70).trim()];
}

function paymentTermsText(quotation: InformalQuotationRequest) {
  if (quotation.paymentType === "CREDIT") {
    return `Credit period ${quotation.creditDays ?? 0} days from invoice date`;
  }

  return "100% Advance";
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function replacePlaceholders(xml: string, values: PlaceholderMap) {
  return Object.entries(values).reduce(
    (current, [key, value]) => current.replaceAll(`{{${key}}}`, xmlEscape(value)),
    xml,
  );
}

function buildScalarValues(input: QuotationDocxInput): PlaceholderMap {
  const { quotation, plant } = input;
  const [addressLine1, addressLine2] = splitAddressLines(quotation.billingAddress);
  const unitName = plant?.unitName || plant?.name || "Andharua";

  return {
    ADVANCE_PAYMENT_TERMS: quotation.paymentType === "ADVANCE" ? "100% advance" : paymentTermsText(quotation),
    AUTHORIZED_SIGNATORY_DESIGNATION: "Marketing head",
    AUTHORIZED_SIGNATORY_EMAIL: "marketing.spdconcrete@gmail.com",
    AUTHORIZED_SIGNATORY_NAME: "Amit Sharma",
    AUTHORIZED_SIGNATORY_PHONE: "9124580880",
    CUSTOMER_ADDRESS_LINE_1: addressLine1,
    CUSTOMER_ADDRESS_LINE_2: addressLine2,
    CUSTOMER_NAME: quotation.customerName,
    DELIVERY_NOTICE_HOURS: "24",
    DUMPING_MIN_CUM: "6",
    GST_PERCENT: quotation.priceType === "GST_INCLUSIVE" ? "18%" : "0%",
    KIND_ATTENTION: quotation.stakeholderName,
    MIN_LOAD_QTY: "6",
    PAYMENT_TERMS: paymentTermsText(quotation),
    PROJECT_LOCATION: quotation.siteAddress,
    PUMP_CHARGES: "8000",
    PUMPING_MIN_CUM: "30",
    QUOTATION_DATE: formatDate(quotation.decidedAt ?? quotation.createdAt),
    QUOTATION_REF: quotation.quotationRef ?? quotation.id,
    STANDARD_SLUMP: "120+/-20",
    UNIT_NAME: unitName,
    VALIDITY_DAYS: "30",
  };
}

function buildItemValues(quotation: InformalQuotationRequest) {
  return quotation.items.map<PlaceholderMap>((item) => {
    const basicRate =
      quotation.priceType === "GST_INCLUSIVE" ? item.pricePerCum / (1 + GST_RATE) : item.pricePerCum;

    return {
      BASIC_RATE_PER_CUM: money(basicRate),
      CONCRETE_GRADE: item.grade,
      GST_PERCENT: quotation.priceType === "GST_INCLUSIVE" ? "18%" : "0%",
      INCLUDING_GST_RATE: money(item.pricePerCum),
      QTY: String(item.quantityCum),
      UOM: "CUM",
    };
  });
}

function expandItemRows(documentXml: string, itemValues: PlaceholderMap[]) {
  const rowMatch = documentXml.match(/<w:tr[\s\S]*?\{\{#ITEMS\}\}[\s\S]*?\{\{\/ITEMS\}\}[\s\S]*?<\/w:tr>/);
  if (!rowMatch) {
    const firstItem = itemValues[0] ?? {};
    return replacePlaceholders(
      documentXml.replaceAll("{{#ITEMS}}", "").replaceAll("{{/ITEMS}}", ""),
      firstItem,
    );
  }

  const templateRow = rowMatch[0].replaceAll("{{#ITEMS}}", "").replaceAll("{{/ITEMS}}", "");
  const rows = itemValues.map((item) => replacePlaceholders(templateRow, item)).join("");
  return documentXml.replace(rowMatch[0], rows);
}

function bufferToArrayBuffer(buffer: Buffer) {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  return arrayBuffer;
}

function encodedZipToBuffer(encoded: ArrayBuffer | Uint8Array) {
  if (encoded instanceof Uint8Array) {
    return Buffer.from(encoded);
  }

  return Buffer.from(new Uint8Array(encoded));
}

function readZipText(files: Record<string, Uint8Array>, fileName: string) {
  const bytes = files[fileName];
  if (!bytes) {
    return null;
  }

  return new TextDecoder().decode(bytes);
}

function writeZipText(files: Record<string, Uint8Array>, fileName: string, value: string) {
  files[fileName] = new TextEncoder().encode(value);
}

export function isDocxTemplate(fileMimeType: string, originalFileName: string) {
  return fileMimeType === DOCX_MIME_TYPE || originalFileName.toLowerCase().endsWith(".docx");
}

export function getInformalQuotationDocxFileName(request: InformalQuotationRequest) {
  const ref = request.quotationRef ?? request.id;
  return `quotation-${ref.replace(/[^a-zA-Z0-9-]/g, "-")}.docx`;
}

export function getInformalQuotationDocxMimeType() {
  return DOCX_MIME_TYPE;
}

export function generateInformalQuotationDocx(input: QuotationDocxInput) {
  const files = UZIP.parse(bufferToArrayBuffer(input.templateBuffer));
  const scalarValues = buildScalarValues(input);
  const itemValues = buildItemValues(input.quotation);
  const documentXml = readZipText(files, "word/document.xml");

  if (!documentXml) {
    throw new Error("Quotation DOCX template is missing word/document.xml.");
  }

  const expandedDocumentXml = replacePlaceholders(expandItemRows(documentXml, itemValues), scalarValues);
  writeZipText(files, "word/document.xml", expandedDocumentXml);

  for (const [fileName, bytes] of Object.entries(files)) {
    if (!fileName.startsWith("word/header") || !fileName.endsWith(".xml")) {
      continue;
    }

    const headerXml = new TextDecoder().decode(bytes);
    writeZipText(files, fileName, replacePlaceholders(headerXml, scalarValues));
  }

  return encodedZipToBuffer(UZIP.encode(files));
}

function getPdfConverterCandidates() {
  return [
    process.env.LIBREOFFICE_PATH?.trim(),
    process.env.SOFFICE_PATH?.trim(),
    "soffice",
    "libreoffice",
  ].filter((candidate): candidate is string => Boolean(candidate));
}

export async function convertInformalQuotationDocxToPdf(docxBuffer: Buffer, fileName: string) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spd-quotation-"));
  const docxPath = path.join(tempDir, fileName);
  const pdfPath = path.join(tempDir, `${path.basename(fileName, path.extname(fileName))}.pdf`);
  let lastError: unknown = null;

  try {
    await writeFile(docxPath, docxBuffer);

    for (const command of getPdfConverterCandidates()) {
      try {
        await execFileAsync(
          command,
          ["--headless", "--convert-to", "pdf", "--outdir", tempDir, docxPath],
          { timeout: MAX_PDF_CONVERSION_MS, windowsHide: true },
        );
        return await readFile(pdfPath);
      } catch (error) {
        lastError = error;
      }
    }

    const message = lastError instanceof Error ? lastError.message : "LibreOffice/soffice was not available.";
    throw new Error(`PDF conversion failed: ${message}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
