import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { createApprovalRequest } from "@/lib/repository";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["SALES_AGENT"]);
    const body = (await request.json()) as {
      leadId?: string;
      siteId?: string | null;
      customerName?: string;
      quantity?: number | string;
      requiredDate?: string;
      oneWayDistanceKm?: number | string;
      trafficCount?: number | string;
      castingType?: string;
      mixDesignType?: string;
      paymentType?: string;
      paymentTerms?: string;
      items?: Array<{ id?: string; grade?: string; quotedPrice?: number | string }>;
    };
    const approval = await createApprovalRequest(user, {
      leadId: `${body.leadId ?? ""}`,
      siteId: `${body.siteId ?? ""}`.trim() || null,
      customerName: `${body.customerName ?? ""}`,
      items: (body.items ?? []).map((item, index) => ({
        id: `${item.id ?? ""}`.trim() || `item-${index + 1}`,
        grade: `${item.grade ?? ""}`,
        quotedPrice: Number(item.quotedPrice),
      })),
      quantity: Number(body.quantity),
      requiredDate: `${body.requiredDate ?? ""}`,
      oneWayDistanceKm: Number(body.oneWayDistanceKm),
      trafficCount: Number(body.trafficCount),
      castingType: `${body.castingType ?? ""}`,
      mixDesignType: `${body.mixDesignType ?? "DESIGN_MIX"}` as "DESIGN_MIX" | "NOMINAL_MIX",
      paymentType: `${body.paymentType ?? "NORMAL"}` as "NORMAL" | "CREDIT",
      paymentTerms: `${body.paymentTerms ?? "ADVANCE"}` as "ADVANCE" | "PO" | "PDC" | "PO_AND_PDC",
    });

    return jsonOk({ approval }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
