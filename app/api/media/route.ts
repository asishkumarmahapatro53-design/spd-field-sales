import { NextResponse } from "next/server";
import { createPresignedS3GetUrl } from "@/lib/storage";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return new Response("Missing url parameter", { status: 400 });
    }

    if (url.includes(".s3.") && url.includes("amazonaws.com")) {
      // Extract key from URL. Example: https://bucket.s3.region.amazonaws.com/uploads/2026-05/xyz.jpg
      const urlObj = new URL(url);
      const key = decodeURIComponent(urlObj.pathname.slice(1)); // Remove leading slash
      
      const presignedUrl = await createPresignedS3GetUrl(key);
      return NextResponse.redirect(presignedUrl);
    }

    // For non-S3 URLs (e.g. local uploads or Firebase signed URLs), just redirect to the original URL
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("Media proxy error:", error);
    return new Response("Failed to load media", { status: 500 });
  }
}
