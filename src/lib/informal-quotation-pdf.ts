import type { DocumentTemplate, InformalQuotationRequest, Plant, User } from "@/lib/types";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 54;
const TOP_Y = 790;
const LINE_HEIGHT = 13.5;
const GST_RATE = 0.18;

type PdfFont = "F1" | "F2";

interface TextOptions {
  font?: PdfFont;
  size?: number;
  maxWidth?: number;
  leading?: number;
}

interface QuotationPdfInput {
  quotation: InformalQuotationRequest;
  plant: Plant | null;
  manager: User | null;
  salesAgent: User | null;
  template: DocumentTemplate;
}

class SimplePdf {
  private pages: string[] = [];
  private commands: string[] = [];

  addPage() {
    if (this.commands.length) {
      this.pages.push(this.commands.join("\n"));
    }
    this.commands = [];
  }

  finish() {
    if (this.commands.length) {
      this.pages.push(this.commands.join("\n"));
      this.commands = [];
    }
    return buildPdf(this.pages);
  }

  text(value: string, x: number, y: number, options: TextOptions = {}) {
    const font = options.font ?? "F1";
    const size = options.size ?? 10.5;
    const safeText = escapePdfText(normalizePdfText(value));
    this.commands.push(`BT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${safeText}) Tj ET`);
  }

  wrappedText(value: string, x: number, y: number, options: TextOptions = {}) {
    const size = options.size ?? 10.5;
    const leading = options.leading ?? LINE_HEIGHT;
    const maxWidth = options.maxWidth ?? PAGE_WIDTH - MARGIN_X * 2;
    const lines = wrapText(value, maxWidth, size);
    lines.forEach((line, index) => this.text(line, x, y - index * leading, options));
    return y - lines.length * leading;
  }

  line(x1: number, y1: number, x2: number, y2: number) {
    this.commands.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }

  rect(x: number, y: number, width: number, height: number) {
    this.commands.push(`${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S`);
  }
}

function buildPdf(pageContents: string[]) {
  const objects: string[] = [];
  const addObject = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const fontRegularId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>");
  const fontBoldId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>");
  const pageIds: number[] = [];

  pageContents.forEach((content) => {
    const stream = `q\n0.45 w\n${content}\nQ`;
    const contentId = addObject(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(
      `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  });

  const pagesId = addObject(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  pageIds.forEach((pageId) => {
    objects[pageId - 1] = objects[pageId - 1].replace("/Parent 0 0 R", `/Parent ${pagesId} 0 R`);
  });

  const chunks: string[] = ["%PDF-1.4\n%SPD\n"];
  const offsets: number[] = [0];
  let position = Buffer.byteLength(chunks[0], "utf8");

  objects.forEach((body, index) => {
    offsets.push(position);
    const objectText = `${index + 1} 0 obj\n${body}\nendobj\n`;
    chunks.push(objectText);
    position += Buffer.byteLength(objectText, "utf8");
  });

  const xrefStart = position;
  const xref = [
    `xref\n0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>`,
    "startxref",
    `${xrefStart}`,
    "%%EOF",
  ].join("\n");

  chunks.push(xref);
  return Buffer.from(chunks.join(""), "utf8");
}

function normalizePdfText(value: string) {
  return `${value ?? ""}`
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/₹/g, "Rs.")
    .replace(/–|—/g, "-")
    .replace(/±/g, "+/-")
    .replace(/▪/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(value: string, maxWidth: number, fontSize: number) {
  const words = normalizePdfText(value).split(/\s+/).filter(Boolean);
  const maxChars = Math.max(18, Math.floor(maxWidth / (fontSize * 0.48)));
  const lines: string[] = [];
  let line = "";

  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
      return;
    }
    line = next;
  });

  if (line) {
    lines.push(line);
  }

  return lines.length ? lines : [""];
}

function money(value: number) {
  return `Rs.${Math.round(value * 100) / 100}/-`;
}

function formatDate(value: string | null | undefined) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat("en-GB").format(new Date()).replaceAll("/", ".");
  }
  return new Intl.DateTimeFormat("en-GB").format(date).replaceAll("/", ".");
}

function paymentTermsText(quotation: InformalQuotationRequest) {
  if (quotation.paymentType === "CREDIT") {
    return `Credit period: ${quotation.creditDays ?? 0} days from invoice date, subject to approved commercial terms.`;
  }

  return "100% Advance.";
}

function drawHeader(pdf: SimplePdf, quotation: InformalQuotationRequest) {
  pdf.text("Quotation", 260, 808, { font: "F2", size: 15 });
  pdf.text(`Ref: ${quotation.quotationRef ?? "Pending"}`, MARGIN_X, 782, { font: "F2", size: 10.5 });
  pdf.text(`Dt: ${formatDate(quotation.decidedAt ?? quotation.createdAt)}`, 430, 782, { font: "F2", size: 10.5 });
}

function drawPriceTable(pdf: SimplePdf, quotation: InformalQuotationRequest, startY: number) {
  const hasGst = quotation.priceType === "GST_INCLUSIVE";
  const columns = hasGst
    ? [
        { label: "Concrete Grade", width: 74 },
        { label: "CUM Qty", width: 54 },
        { label: "Mix Design", width: 124 },
        { label: "Basic Rate (per Cum)", width: 92 },
        { label: "GST%", width: 45 },
        { label: "Including GST(Rs.)", width: 98 },
      ]
    : [
        { label: "Concrete Grade", width: 90 },
        { label: "CUM Qty", width: 70 },
        { label: "Mix Design", width: 210 },
        { label: "Base Price (per Cum)", width: 118 },
      ];
  const rowHeight = 36;
  const headerHeight = 28;
  let x = MARGIN_X;

  pdf.rect(MARGIN_X, startY - headerHeight, columns.reduce((sum, column) => sum + column.width, 0), headerHeight);
  columns.forEach((column) => {
    pdf.text(column.label, x + 4, startY - 18, { font: "F2", size: 8.7 });
    pdf.line(x, startY, x, startY - headerHeight - rowHeight * quotation.items.length);
    x += column.width;
  });
  pdf.line(x, startY, x, startY - headerHeight - rowHeight * quotation.items.length);
  pdf.line(MARGIN_X, startY - headerHeight, x, startY - headerHeight);

  quotation.items.forEach((item, index) => {
    const rowTop = startY - headerHeight - rowHeight * index;
    const rowBottom = rowTop - rowHeight;
    pdf.line(MARGIN_X, rowBottom, x, rowBottom);
    let cellX = MARGIN_X;
    const mixText = item.mixDesignType === "DESIGN_MIX" ? item.mixRequirement : "Nominal mix";
    const values = hasGst
      ? [
          item.grade,
          `${item.quantityCum}`,
          mixText,
          money(item.pricePerCum / (1 + GST_RATE)),
          "18%",
          money(item.pricePerCum),
        ]
      : [item.grade, `${item.quantityCum}`, mixText, money(item.pricePerCum)];

    values.forEach((value, valueIndex) => {
      const column = columns[valueIndex];
      pdf.wrappedText(value, cellX + 4, rowTop - 12, {
        size: 8.5,
        maxWidth: column.width - 8,
        leading: 10,
      });
      cellX += column.width;
    });
  });
}

function paragraph(pdf: SimplePdf, text: string, y: number, options: TextOptions = {}) {
  return pdf.wrappedText(text, MARGIN_X, y, {
    size: 10.3,
    maxWidth: PAGE_WIDTH - MARGIN_X * 2,
    leading: 13,
    ...options,
  });
}

export function generateInformalQuotationPdf(input: QuotationPdfInput) {
  const { quotation, plant, template } = input;
  const unitName = plant?.unitName || plant?.name || "Andharua";
  const pdf = new SimplePdf();

  drawHeader(pdf, quotation);
  let y = 754;
  y = paragraph(pdf, `Template: ${template.name} (${template.originalFileName})`, y, { size: 8.5 });
  y -= 8;
  y = paragraph(pdf, "To:", y, { font: "F2" });
  y = paragraph(pdf, quotation.customerName.toUpperCase(), y - 2, { font: "F2" });
  y = paragraph(pdf, quotation.billingAddress.toUpperCase(), y - 2);
  y = paragraph(pdf, `Kind Attention : ${quotation.stakeholderName}`, y - 8, { font: "F2" });
  y = paragraph(pdf, "Subject : Quotation for Supply of Ready Mixed Concrete", y - 12, { font: "F2" });
  y = paragraph(pdf, "Dear Sir/Madam,", y - 12);
  y = paragraph(
    pdf,
    `We are pleased to submit our quotation for the supply of Ready Mixed Concrete (RMC) for your esteemed Project at ${quotation.siteName}, ${quotation.siteAddress}. In response to your inquiry the following terms and conditions outline the details of the offer:`,
    y - 4,
  );

  y = paragraph(pdf, "Terms and Conditions:", y - 10, { font: "F2" });
  const pageOneTerms = [
    "1. Minimum Order Requirements: Pumping: Minimum order of 25 cum. Dumping: Minimum order of 7 cum.",
    quotation.priceType === "GST_INCLUSIVE" ? "2. GST: An 18% GST included in the given price." : "2. GST: Not applicable for this non-GST quotation.",
    "3. Pump Charges: Rs. 8000/- will be extra below 30 cum per day.",
    `4. Payment Terms - ${paymentTermsText(quotation)}`,
    "5. Price Adjustments: The quoted rates are based on your specified mix. Any changes to the mix design will result in revised rates. Cooling of concrete, placing, vibration, and curing of concrete are not included in the quotation.",
    '6. Purchase Orders: All orders should be issued in the name of "SPD Concrete Pvt Ltd", Mouza - Jagannath Prasad, Po- Andharua, P.s - Chandaka, Bhubaneswar, Odisha - 751003.',
  ];
  pageOneTerms.forEach((term) => {
    y = paragraph(pdf, term, y - 2);
  });
  drawPriceTable(pdf, quotation, Math.min(y - 12, 260));

  pdf.addPage();
  y = TOP_Y;
  const pageTwoParagraphs = [
    "7. Tax Invoices: Invoices will be raised based on the delivery challan quantity. Any discrepancies should be reported within 24 hours for immediate investigation.",
    "Validity of Offer: This quotation is valid for a period of 30 days from the date of issue. Acceptance of the order beyond this period may lead to price revisions based on prevailing market conditions.",
    "Price Escalation Clause: The quoted rates are based on current raw material and diesel prices. Any increase in the cost of raw materials, statutory levies, or any new duties imposed by the government will result in a proportional increase in the rates. Raw material base rates are as follows: Cement@Rs.320/- per bag. Sand@Rs.700/- per Ton. 10MM@Rs.750/- per Ton. 20MM@Rs.1150/- per Ton.",
    `Payment Terms: ${paymentTermsText(quotation)} Advance payment is required via cheque or demand draft drawn in favor of "SPD Concrete Pvt Ltd" and payable at Bhubaneswar. If credit is extended, payment will be subject to approved credit terms and delayed payments may attract interest at the rate of 18% per annum.`,
    "Suspension of Deliveries: Non-payment will result in the suspension of all further deliveries until outstanding dues are settled.",
    "Delivery Terms: Concrete requirements must be provided 24 hours in advance for scheduling deliveries. The customer is responsible for providing clear access for transit mixers, pumps, and related equipment at the site.",
    "Traffic Restrictions: We will not be able to supply during government-imposed traffic restrictions. In case of urgent deliveries, permission from the authorities must be provided by the customer.",
    "Idle Time Charges: Any delays in the unloading of concrete exceeding 45 minutes will incur a charge of Rs. 300 per hour or part thereof.",
    "Partial Delivery: The minimum delivery quantity is 6 m3 per load. Part deliveries below 3.0 m3 will incur an additional charge of Rs. 300 per cum.",
    "Quality Assurance: The standard slump for pumped concrete is 120 +/- 25 mm. Any deviation in workability will be based on mutually agreed terms. Testing of concrete will be performed at our in-house laboratory in compliance with relevant IS standards.",
    "Warranty Clause: SPD Concrete Pvt Ltd guarantees that the products provided conform to the appropriate BIS specifications. We do not assume responsibility for any issues arising from misuse or improper handling of concrete after delivery.",
  ];
  pageTwoParagraphs.forEach((text) => {
    y = paragraph(pdf, text, y - 2);
  });

  pdf.addPage();
  y = TOP_Y;
  y = paragraph(
    pdf,
    "Dispute Resolution: All disputes arising from this quotation, including its interpretation or any other matter, shall be subject to the jurisdiction of the courts in Odisha, irrespective of any other location specified in previous agreements.",
    y,
  );
  y = paragraph(
    pdf,
    "We trust this quotation meets your requirements, and we are committed to providing you with the best quality products and services. Should you have any further queries or require additional information, please do not hesitate to contact us.",
    y - 8,
  );
  y = paragraph(pdf, "We look forward to a fruitful and long-term partnership.", y - 8);
  y = paragraph(pdf, "For SPD Concrete Pvt Ltd", y - 24, { font: "F2" });
  y = paragraph(pdf, `Unit: ${unitName}`, y - 2, { font: "F2" });
  y = paragraph(pdf, "Amit Ranjan Sharma", y - 42, { font: "F2" });
  y = paragraph(pdf, "Marketing Head", y - 2);
  y = paragraph(pdf, "9124580880", y - 2);
  paragraph(pdf, "Marketing.spdconcrete@gmail.com", y - 2);

  return pdf.finish();
}
