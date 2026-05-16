import { NextResponse } from "next/server";
import { jsonError, requireApiUser } from "@/lib/api";
import { readDatabase } from "@/lib/db";
import { toIndiaTimeLabel } from "@/lib/date";

function line(label: string, value: unknown) {
  return `${label}: ${value ?? "-"}`;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireApiUser(["ACCOUNTING", "MANAGER", "SALES_AGENT", "PRODUCTION_MANAGER"]);
    const { id } = await context.params;
    const database = await readDatabase();
    const order = database.salesOrderRequests.find((entry) => entry.id === id);

    if (!order) {
      return NextResponse.json({ error: "Sales order request not found." }, { status: 404 });
    }

    const content = [
      "SPD Sales Order Copy",
      "====================",
      line("Order ID", order.id),
      line("Customer", order.customerName),
      line("Site", order.siteName),
      line("Grade", order.grade),
      line("Quantity", `${order.quantity} CUM`),
      line("Rate", `Rs.${order.approvedPrice}/CUM`),
      line("Amount", `Rs.${order.amount}`),
      line("Payment", `${order.paymentType} / ${order.paymentTerms}`),
      line("Required date", toIndiaTimeLabel(order.requiredDate)),
      line("Casting", order.plannedCastingType),
      line("Pump required", order.pumpRequired ? "Yes" : "No"),
      line("Receiver", order.receiverName),
      line("Receiver phone", order.receiverPhone),
      line("Delivery address", order.siteAddress),
      line("GSTIN", order.gstin),
      line("GST legal name", order.gstLegalName),
      line("Ledger decision", order.ledgerDecisionStatus),
      line("Finance reviewed at", toIndiaTimeLabel(order.financeReviewedAt)),
      line("Final checklist at", toIndiaTimeLabel(order.salesOrderFinalChecklist?.verifiedAt ?? null)),
      line("Preview confirmed at", toIndiaTimeLabel(order.salesOrderPreviewConfirmedAt ?? null)),
    ].join("\n");

    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="sales-order-${order.id.slice(0, 8)}.txt"`,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
