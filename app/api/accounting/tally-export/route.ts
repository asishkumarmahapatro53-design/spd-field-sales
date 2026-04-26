import { randomUUID } from "node:crypto";
import { jsonError, requireApiUser } from "@/lib/api";
import { nowIso } from "@/lib/date";
import { readDatabase, updateDatabase } from "@/lib/db";

function generateTallyXml(vouchers: any[]) {
  // A simplified Odoo-derived Tally ERP 9 import XML structure
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<ENVELOPE>\n`;
  xml += `  <HEADER>\n`;
  xml += `    <TALLYREQUEST>Import Data</TALLYREQUEST>\n`;
  xml += `  </HEADER>\n`;
  xml += `  <BODY>\n`;
  xml += `    <IMPORTDATA>\n`;
  xml += `      <REQUESTDESC>\n`;
  xml += `        <REPORTNAME>Vouchers</REPORTNAME>\n`;
  xml += `      </REQUESTDESC>\n`;
  xml += `      <REQUESTDATA>\n`;

  for (const v of vouchers) {
    const dateStr = new Date(v.createdAt).toISOString().slice(0, 10).replace(/-/g, "");
    
    xml += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n`;
    xml += `          <VOUCHER VCHTYPE="Journal" ACTION="Create">\n`;
    xml += `            <DATE>${dateStr}</DATE>\n`;
    xml += `            <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>\n`;
    xml += `            <PARTYLEDGERNAME>${v.brokerName}</PARTYLEDGERNAME>\n`;
    xml += `            <NARRATION>Commission for Site: ${v.siteName}, Qty: ${v.quantityCum} cum @ ₹${v.ratePerCum}/cum</NARRATION>\n`;
    xml += `            <ALLLEDGERENTRIES.LIST>\n`;
    xml += `              <LEDGERNAME>Commission Expense</LEDGERNAME>\n`;
    xml += `              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n`;
    xml += `              <AMOUNT>-${v.totalCommission}</AMOUNT>\n`; // Debit
    xml += `            </ALLLEDGERENTRIES.LIST>\n`;
    xml += `            <ALLLEDGERENTRIES.LIST>\n`;
    xml += `              <LEDGERNAME>${v.brokerName}</LEDGERNAME>\n`;
    xml += `              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n`;
    xml += `              <AMOUNT>${v.totalCommission}</AMOUNT>\n`; // Credit
    xml += `            </ALLLEDGERENTRIES.LIST>\n`;
    xml += `          </VOUCHER>\n`;
    xml += `        </TALLYMESSAGE>\n`;
  }

  xml += `      </REQUESTDATA>\n`;
  xml += `    </IMPORTDATA>\n`;
  xml += `  </BODY>\n`;
  xml += `</ENVELOPE>`;
  return xml;
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["ACCOUNTING"]);
    
    // Find all unexported commission vouchers
    const db = await readDatabase();
    const unexported = (db.commissionVouchers ?? []).filter(v => v.status === "APPROVED" && !v.exportedAt);

    if (unexported.length === 0) {
      return new Response("No vouchers to export", { status: 400 });
    }

    const exportTime = nowIso();

    // Mark as exported
    await updateDatabase((draft) => {
      if (!draft.commissionVouchers) return;
      
      let count = 0;
      for (const v of draft.commissionVouchers) {
        if (v.status === "APPROVED" && !v.exportedAt) {
          v.status = "EXPORTED_TO_TALLY";
          v.exportedAt = exportTime;
          count++;
        }
      }

      draft.auditLogs.unshift({
        id: randomUUID(),
        actorId: user.id,
        actorRole: user.role,
        entityType: "TALLY_EXPORT",
        entityId: exportTime,
        action: "EXPORTED",
        detail: `Exported ${count} commission vouchers to Tally XML`,
        createdAt: exportTime,
      });
    });

    const xmlData = generateTallyXml(unexported);

    return new Response(xmlData, {
      status: 200,
      headers: {
        "Content-Type": "application/xml",
        "Content-Disposition": `attachment; filename="tally_export_${exportTime.replace(/[:T]/g, "-").slice(0, 19)}.xml"`,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
