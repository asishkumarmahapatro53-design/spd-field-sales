import { randomUUID } from "node:crypto";
import { jsonError, jsonOk, requireApiUser, requireNumber, requireString } from "@/lib/api";
import { nowIso } from "@/lib/date";
import { readCollection, updateDatabase } from "@/lib/db";
import type { CommissionVoucher } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(["ACCOUNTING", "MANAGER"]);
    const { searchParams } = new URL(request.url);
    const plantId = searchParams.get("plantId");

    let vouchers = plantId
      ? await readCollection("commissionVouchers", { filters: [{ field: "plantId", op: "==", value: plantId }] })
      : await readCollection("commissionVouchers");

    // Sort newest first
    vouchers = vouchers.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return jsonOk({ commissionVouchers: vouchers });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["ACCOUNTING"]);
    const body = await request.json();

    const plantId = requireString(body.plantId, "Plant ID is required");
    const brokerName = requireString(body.brokerName, "Broker Name is required");
    const siteName = requireString(body.siteName, "Site Name is required");
    const quantityCum = requireNumber(body.quantityCum, "Quantity is required and must be a number");
    const ratePerCum = requireNumber(body.ratePerCum, "Rate per cum is required and must be a number");

    if (quantityCum <= 0) throw new Error("Quantity must be greater than zero");
    if (ratePerCum <= 0) throw new Error("Rate must be greater than zero");

    const totalCommission = quantityCum * ratePerCum;

    const voucher: CommissionVoucher = {
      id: randomUUID(),
      plantId,
      brokerName,
      siteName,
      quantityCum,
      ratePerCum,
      totalCommission,
      status: "APPROVED", // Straight to approved since Accounting is creating it manually
      createdBy: user.id,
      createdAt: nowIso(),
      exportedAt: null,
    };

    await updateDatabase((draft) => {
      if (!draft.commissionVouchers) draft.commissionVouchers = [];
      draft.commissionVouchers.push(voucher);
      
      // Audit log
      draft.auditLogs.unshift({
        id: randomUUID(),
        actorId: user.id,
        actorRole: user.role,
        entityType: "COMMISSION_VOUCHER",
        entityId: voucher.id,
        action: "CREATED",
        detail: `Created manual commission voucher for ${brokerName} (${siteName}) - ₹${totalCommission}`,
        createdAt: nowIso(),
      });
    });

    return jsonOk({ commissionVoucher: voucher }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
