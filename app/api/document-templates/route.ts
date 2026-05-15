import { randomUUID } from "node:crypto";
import { ApiError, jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { nowIso } from "@/lib/date";
import { updateDatabase } from "@/lib/db";
import { saveUploadedFile } from "@/lib/storage";
import type { DocumentTemplate, DocumentTemplateType } from "@/lib/types";

export const runtime = "nodejs";

const TEMPLATE_TYPES: DocumentTemplateType[] = ["QUOTATION", "CHALLAN", "INVOICE"];
const ALLOWED_TEMPLATE_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_TEMPLATE_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["ACCOUNTING", "MANAGER"]);
    const formData = await request.formData();
    const type = `${formData.get("type") ?? ""}`.trim().toUpperCase() as DocumentTemplateType;
    const name = `${formData.get("name") ?? ""}`.trim();
    const file = formData.get("file");

    if (!TEMPLATE_TYPES.includes(type)) {
      throw new ApiError(400, "Choose a valid template type: quotation, challan, or invoice.");
    }

    if (!(file instanceof File)) {
      throw new ApiError(400, "Upload a template file.");
    }

    if (file.size <= 0) {
      throw new ApiError(400, "Template file is empty.");
    }

    if (file.size > MAX_TEMPLATE_BYTES) {
      throw new ApiError(413, "Template file is too large. Maximum size is 8 MB.");
    }

    const mimeType = file.type || "application/octet-stream";
    if (!ALLOWED_TEMPLATE_MIME_TYPES.has(mimeType)) {
      throw new ApiError(400, "Only PDF, JPG, PNG, or WebP templates are supported.");
    }

    const storedFile = await saveUploadedFile(file);
    const now = nowIso();
    const template: DocumentTemplate = {
      id: randomUUID(),
      type,
      name: name || defaultTemplateName(type),
      fileUrl: storedFile.photoUrl,
      fileMimeType: mimeType,
      originalFileName: storedFile.originalFileName,
      status: "ACTIVE",
      uploadedBy: user.id,
      uploadedAt: now,
    };

    await updateDatabase((database) => {
      database.documentTemplates ??= [];
      database.documentTemplates.forEach((entry) => {
        if (entry.type === type) {
          entry.status = "INACTIVE";
        }
      });
      database.documentTemplates.unshift(template);
      database.auditLogs.unshift({
        id: randomUUID(),
        actorId: user.id,
        actorRole: user.role,
        entityType: "DOCUMENT_TEMPLATE",
        entityId: template.id,
        action: "UPLOAD_ACTIVE",
        detail: `Uploaded active ${type.toLowerCase()} template ${template.originalFileName}.`,
        createdAt: now,
      });
      return template;
    });

    return jsonOk({ template }, 201);
  } catch (error) {
    return jsonError(error);
  }
}

function defaultTemplateName(type: DocumentTemplateType) {
  if (type === "QUOTATION") {
    return "Quotation template";
  }

  if (type === "CHALLAN") {
    return "Challan template";
  }

  return "Invoice template";
}
