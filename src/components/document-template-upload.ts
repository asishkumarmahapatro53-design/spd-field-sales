import type { DocumentTemplateType } from "@/lib/types";

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const TEMPLATE_UPLOAD_TIMEOUT_MS = 45_000;

async function parseApiError(response: Response) {
  const payload = await response.json().catch(() => ({ error: "Request failed." }));
  return payload.error ?? "Request failed.";
}

function getExtension(fileName: string) {
  return fileName.toLowerCase().split(".").pop() ?? "";
}

function normalizeTemplateMimeType(file: File) {
  const extension = getExtension(file.name);
  if (extension === "docx") {
    return DOCX_MIME_TYPE;
  }

  if (extension === "pdf") {
    return "application/pdf";
  }

  return file.type || "application/octet-stream";
}

function getClientUploadError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Upload timed out. Please try again; if it repeats, check the storage configuration.";
  }

  return error instanceof Error ? error.message : "Upload failed before the server responded.";
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), TEMPLATE_UPLOAD_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function uploadDocumentTemplate(input: {
  form: HTMLFormElement;
  type: DocumentTemplateType;
}) {
  const formData = new FormData(input.form);
  const name = `${formData.get("name") ?? ""}`.trim();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    throw new Error("Upload a template file.");
  }

  try {
    const mimeType = normalizeTemplateMimeType(file);
    const presignResponse = await fetchWithTimeout("/api/uploads/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        purpose: "document-template",
        fileName: file.name,
        mimeType,
        sizeBytes: file.size,
      }),
    });

    if (!presignResponse.ok) {
      throw new Error(await parseApiError(presignResponse));
    }

    const upload = (await presignResponse.json()) as {
      uploadUrl: string;
      key: string;
      photoUrl: string;
      headers: Record<string, string>;
      originalFileName: string;
    };
    const s3Response = await fetchWithTimeout(upload.uploadUrl, {
      method: "PUT",
      headers: upload.headers,
      body: file,
    });

    if (!s3Response.ok) {
      throw new Error(`Template upload failed (${s3Response.status}).`);
    }

    const createResponse = await fetchWithTimeout("/api/document-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: input.type,
        name,
        fileUrl: upload.photoUrl,
        fileS3Key: upload.key,
        fileMimeType: mimeType,
        originalFileName: upload.originalFileName || file.name,
      }),
    });

    if (!createResponse.ok) {
      throw new Error(await parseApiError(createResponse));
    }

    return createResponse;
  } catch (error) {
    throw new Error(getClientUploadError(error));
  }
}
