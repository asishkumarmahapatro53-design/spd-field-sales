import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { createInformalQuotationRequest } from "@/lib/repository";
import type { InformalQuotationPaymentType, InformalQuotationPriceType, MixDesignType, StakeholderRole } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["SALES_AGENT"]);
    const body = (await request.json()) as {
      leadId?: string;
      siteId?: string;
      stakeholderRole?: string;
      stakeholderName?: string;
      stakeholderPhone?: string;
      stakeholderEmail?: string;
      billingAddress?: string;
      whatsappNumber?: string;
      priceType?: string;
      paymentType?: string;
      creditDays?: number | string | null;
      oneWayDistanceKm?: number | string;
      trafficPostCount?: number | string;
      items?: Array<{
        id?: string;
        grade?: string;
        quantityCum?: number | string;
        mixDesignType?: string;
        mixRequirement?: string;
        pricePerCum?: number | string;
      }>;
    };

    const quotation = await createInformalQuotationRequest(user, {
      leadId: `${body.leadId ?? ""}`,
      siteId: `${body.siteId ?? ""}`,
      stakeholderRole: `${body.stakeholderRole ?? ""}` as StakeholderRole,
      stakeholderName: `${body.stakeholderName ?? ""}`,
      stakeholderPhone: `${body.stakeholderPhone ?? ""}`,
      stakeholderEmail: `${body.stakeholderEmail ?? ""}`,
      billingAddress: `${body.billingAddress ?? ""}`,
      whatsappNumber: `${body.whatsappNumber ?? ""}`,
      priceType: `${body.priceType ?? "GST_INCLUSIVE"}` as InformalQuotationPriceType,
      paymentType: `${body.paymentType ?? "ADVANCE"}` as InformalQuotationPaymentType,
      creditDays: body.creditDays === null || body.creditDays === undefined || `${body.creditDays}`.trim() === "" ? null : Number(body.creditDays),
      oneWayDistanceKm: Number(body.oneWayDistanceKm),
      trafficPostCount: Number(body.trafficPostCount),
      items: (body.items ?? []).map((item, index) => ({
        id: `${item.id ?? ""}`.trim() || `item-${index + 1}`,
        grade: `${item.grade ?? ""}`,
        quantityCum: Number(item.quantityCum),
        mixDesignType: `${item.mixDesignType ?? "NOMINAL_MIX"}` as MixDesignType,
        mixRequirement: `${item.mixRequirement ?? ""}`,
        pricePerCum: Number(item.pricePerCum),
      })),
    });

    return jsonOk({ quotation }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
