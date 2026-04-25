import { ApiError, jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { createSalesOrderRequest } from "@/lib/repository";
import { saveUploadedFile } from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["SALES_AGENT"]);
    const formData = await request.formData();
    const leadId = `${formData.get("leadId") ?? ""}`.trim();
    const approvalRequestId = `${formData.get("approvalRequestId") ?? ""}`.trim();
    const approvalItemId = `${formData.get("approvalItemId") ?? ""}`.trim() || null;
    const priority = `${formData.get("priority") ?? "NORMAL"}`.trim() === "URGENT" ? "URGENT" : "NORMAL";
    const quantity = Number(`${formData.get("quantity") ?? ""}`);
    const requiredDate = `${formData.get("requiredDate") ?? ""}`.trim();
    const slump = `${formData.get("slump") ?? ""}`.trim();
    const receiverName = `${formData.get("receiverName") ?? ""}`.trim();
    const receiverPhone = `${formData.get("receiverPhone") ?? ""}`.trim();
    const notes = `${formData.get("notes") ?? ""}`.trim();
    const pumpRequired = `${formData.get("pumpRequired") ?? ""}` === "true";
    const paymentReceivedConfirmed = `${formData.get("paymentReceivedConfirmed") ?? ""}` === "true";
    const poFile = formData.get("poDocument");
    const pdcFile = formData.get("pdcDocument");

    if (!leadId) {
      throw new ApiError(400, "Lead is required.");
    }

    if (!approvalRequestId) {
      throw new ApiError(400, "Approved final approval is required.");
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ApiError(400, "Quantity must be greater than zero.");
    }

    if (!requiredDate) {
      throw new ApiError(400, "Required date is invalid.");
    }

    if (!slump) {
      throw new ApiError(400, "Slump is required.");
    }

    if (!receiverName || !receiverPhone) {
      throw new ApiError(400, "Receiver name and phone number are required.");
    }

    const poDocumentUrl =
      poFile instanceof File && poFile.size > 0 ? (await saveUploadedFile(poFile)).photoUrl : null;
    const pdcDocumentUrl =
      pdcFile instanceof File && pdcFile.size > 0 ? (await saveUploadedFile(pdcFile)).photoUrl : null;

    const orderRequest = await createSalesOrderRequest(user, {
      leadId,
      approvalRequestId,
      approvalItemId,
      priority,
      quantity,
      slump,
      requiredDate,
      receiverName,
      receiverPhone,
      pumpRequired,
      notes,
      paymentReceivedConfirmed,
      poDocumentUrl,
      pdcDocumentUrl,
    });

    return jsonOk({ orderRequest }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
