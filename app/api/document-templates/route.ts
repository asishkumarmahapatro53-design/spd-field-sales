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
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_TEMPLATE_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["ACCOUNTING", "MANAGER"]);
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const payload = (await request.json()) as {
        type?: string;
        name?: string;
        fileUrl?: string;
        fileS3Key?: string | null;
        fileMimeType?: string;
        originalFileName?: string;
      };
      const type = `${payload.type ?? ""}`.trim().toUpperCase() as DocumentTemplateType;
      const name = `${payload.name ?? ""}`.trim();
      const originalFileName = `${payload.originalFileName ?? ""}`.trim();
      const fileUrl = `${payload.fileUrl ?? ""}`.trim();
      const fileS3Key = `${payload.fileS3Key ?? ""}`.trim() || null;
      const mimeType = normalizeTemplateMimeType(originalFileName, `${payload.fileMimeType ?? ""}`, type);

      validateTemplateType(type);
      validateDirectTemplateUpload({ type, originalFileName, fileUrl, fileS3Key, mimeType });

      const template = await createTemplateRecord({
        type,
        name,
        fileUrl,
        fileS3Key,
        localAbsolutePath: null,
        mimeType,
        originalFileName,
        user,
      });

      return jsonOk({ template }, 201);
    }

    const formData = await request.formData();
    const type = `${formData.get("type") ?? ""}`.trim().toUpperCase() as DocumentTemplateType;
    const name = `${formData.get("name") ?? ""}`.trim();
    const file = formData.get("file");

    validateTemplateType(type);

    if (!(file instanceof File)) {
      throw new ApiError(400, "Upload a template file.");
    }

    if (file.size <= 0) {
      throw new ApiError(400, "Template file is empty.");
    }

    if (file.size > MAX_TEMPLATE_BYTES) {
      throw new ApiError(413, "Template file is too large. Maximum size is 8 MB.");
    }

    const mimeType = normalizeTemplateMimeType(file.name, file.type, type);

    const storedFile = await saveUploadedFile(file);
    const template = await createTemplateRecord({
      type,
      name,
      fileUrl: storedFile.photoUrl,
      fileS3Key: storedFile.s3Key,
      localAbsolutePath: storedFile.localAbsolutePath,
      mimeType,
      originalFileName: storedFile.originalFileName,
      user,
    });

    return jsonOk({ template }, 201);
  } catch (error) {
    return jsonError(error);
  }
}

function validateTemplateType(type: DocumentTemplateType) {
  if (!TEMPLATE_TYPES.includes(type)) {
    throw new ApiError(400, "Choose a valid template type: quotation, challan, or invoice.");
  }
}

function normalizeTemplateMimeType(fileName: string, fileType: string, type: DocumentTemplateType) {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  const mimeType = extension === "docx" ? DOCX_MIME_TYPE : extension === "pdf" ? "application/pdf" : fileType || "application/octet-stream";
  const isAllowedDocx = type === "QUOTATION" && extension === "docx";

  if (!ALLOWED_TEMPLATE_MIME_TYPES.has(mimeType) && !isAllowedDocx) {
    throw new ApiError(400, "Only PDF, JPG, PNG, WebP, or quotation DOCX templates are supported.");
  }

  if (extension === "docx" && type !== "QUOTATION") {
    throw new ApiError(400, "DOCX templates are currently supported for quotations only.");
  }

  return mimeType;
}

function validateDirectTemplateUpload(input: {
  type: DocumentTemplateType;
  originalFileName: string;
  fileUrl: string;
  fileS3Key: string | null;
  mimeType: string;
}) {
  if (!input.originalFileName) {
    throw new ApiError(400, "Template file name is required.");
  }

  if (!input.fileUrl || !/^https:\/\/.+/i.test(input.fileUrl)) {
    throw new ApiError(400, "Template upload URL is invalid.");
  }

  if (!input.fileS3Key?.startsWith("uploads/document-templates/")) {
    throw new ApiError(400, "Template upload key is invalid.");
  }
}

async function createTemplateRecord(input: {
  type: DocumentTemplateType;
  name: string;
  fileUrl: string;
  fileS3Key: string | null;
  localAbsolutePath: string | null;
  mimeType: string;
  originalFileName: string;
  user: Awaited<ReturnType<typeof requireApiUser>>;
}) {
  const now = nowIso();
  const template: DocumentTemplate = {
    id: randomUUID(),
    type: input.type,
    name: input.name || defaultTemplateName(input.type),
    fileUrl: input.fileUrl,
    fileS3Key: input.fileS3Key,
    localAbsolutePath: input.localAbsolutePath,
    fileMimeType: input.mimeType,
    originalFileName: input.originalFileName,
    status: "ACTIVE",
    uploadedBy: input.user.id,
    uploadedAt: now,
  };

  await updateDatabase((database) => {
    database.documentTemplates ??= [];
    database.documentTemplates.forEach((entry) => {
      if (entry.type === input.type) {
        entry.status = "INACTIVE";
      }
    });
    database.documentTemplates.unshift(template);
    database.auditLogs.unshift({
      id: randomUUID(),
      actorId: input.user.id,
      actorRole: input.user.role,
      entityType: "DOCUMENT_TEMPLATE",
      entityId: template.id,
      action: "UPLOAD_ACTIVE",
      detail: `Uploaded active ${input.type.toLowerCase()} template ${template.originalFileName}.`,
      createdAt: now,
    });
    return template;
  });

  return template;
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
