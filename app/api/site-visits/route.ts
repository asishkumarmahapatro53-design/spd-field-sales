import { ApiError, jsonError, jsonOk, parseLatLng, requireApiUser, requireNumber, requireString, toIsoDateTime } from "@/lib/api";
import { createSiteVisit } from "@/lib/repository";
import type { ExpectedSupplyWindow, LeadStage } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["SALES_AGENT"]);
    const formData = await request.formData();
    const arrivalPhoto = formData.get("arrivalPhoto");
    const remarksVoiceNote = formData.get("remarksVoiceNote");

    if (!(arrivalPhoto instanceof File)) {
      throw new ApiError(400, "Arrival photo is required.");
    }

    const leadStageValue = `${formData.get("leadStage") ?? ""}`.trim();
    const nextFollowUpAtValue = `${formData.get("nextFollowUpAt") ?? ""}`.trim();

    const visit = await createSiteVisit(user, {
      file: arrivalPhoto,
      leadId: `${formData.get("leadId") ?? ""}`.trim() || null,
      siteId: `${formData.get("siteId") ?? ""}`.trim() || null,
      siteName: `${formData.get("siteName") ?? ""}`.trim(),
      siteAddress: `${formData.get("siteAddress") ?? ""}`.trim(),
      stakeholders: requireString(formData.get("stakeholders"), "Stakeholder details are required."),
      concreteGrade: requireString(formData.get("concreteGrade"), "Concrete grade is required."),
      quantityCum: requireNumber(formData.get("quantityCum"), "Quantity is required."),
      stageOfWork: requireString(formData.get("stageOfWork"), "Stage of work is required."),
      futureScope: requireString(formData.get("futureScope"), "Future scope is required."),
      currentSupplier: `${formData.get("currentSupplier") ?? ""}`.trim(),
      priceExpectation: `${formData.get("priceExpectation") ?? ""}`.trim(),
      expectedSupplyWindow: (`${formData.get("expectedSupplyWindow") ?? ""}`.trim() || null) as ExpectedSupplyWindow | null,
      score: `${formData.get("score") ?? ""}`.trim() ? requireNumber(formData.get("score"), "Score is invalid.") : null,
      leadStage: (leadStageValue || null) as LeadStage | null,
      nextFollowUpAt: nextFollowUpAtValue ? toIsoDateTime(nextFollowUpAtValue, "Invalid follow-up date.") : null,
      latLng: parseLatLng({
        lat: formData.get("lat"),
        lng: formData.get("lng"),
      }),
      detectedLatLng: parseLatLng({
        lat: formData.get("detectedLat"),
        lng: formData.get("detectedLng"),
      }),
      photoWatermarkAddress: `${formData.get("photoWatermarkAddress") ?? ""}`.trim(),
      photoCapturedAt: `${formData.get("photoCapturedAt") ?? ""}`.trim() || null,
      remarksText: `${formData.get("remarksText") ?? ""}`.trim(),
      remarksVoiceNoteFile: remarksVoiceNote instanceof File && remarksVoiceNote.size > 0 ? remarksVoiceNote : null,
    });

    return jsonOk({ visit }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
