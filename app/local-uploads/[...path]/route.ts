import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const uploadRoot = path.resolve(process.cwd(), process.env.STORAGE_ROOT?.trim() || "./runtime-uploads");

function getContentType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".heic":
      return "image/heic";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path: pathSegments } = await context.params;
  const safeSegments = pathSegments.filter((segment) => segment && segment !== "." && segment !== "..");
  const absolutePath = path.resolve(uploadRoot, ...safeSegments);

  if (!absolutePath.startsWith(`${uploadRoot}${path.sep}`)) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const fileStat = await stat(absolutePath);

    if (!fileStat.isFile()) {
      return new NextResponse("Not found", { status: 404 });
    }

    const file = await readFile(absolutePath);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": getContentType(absolutePath),
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
