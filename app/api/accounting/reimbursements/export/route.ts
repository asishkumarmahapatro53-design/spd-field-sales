import { NextRequest, NextResponse } from "next/server";
import { exportReimbursements } from "@/lib/repository";
import { jsonError, requireApiUser } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    await requireApiUser(["ACCOUNTING"]);
    const format = request.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
    const exported = await exportReimbursements(format);

    return new NextResponse(exported.content, {
      headers: {
        "Content-Type": exported.contentType,
        "Content-Disposition": `attachment; filename="${exported.fileName}"`,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
