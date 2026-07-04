import {
  buildExportFilename,
  buildMonthlySchedulePdf,
  buildMonthlyScheduleText,
  buildMonthlyScheduleWorkbook,
  encodeDownloadFilename,
  getMonthlyScheduleExport,
  type ExportFormat,
} from "@/lib/exports/monthlySchedule";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeFormat(value: string | null): ExportFormat {
  if (value === "pdf" || value === "xlsx" || value === "txt") {
    return value;
  }

  return "pdf";
}

function normalizeMonth(value: string | null) {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    return value;
  }

  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function responseWithDownload(body: BlobPart, contentType: string, filename: string) {
  return new Response(new Blob([body], { type: contentType }), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": encodeDownloadFilename(filename),
      "Cache-Control": "private, no-store",
    },
  });
}

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const familySpaceId = url.searchParams.get("family");

  if (!familySpaceId) {
    return new Response("family is required", { status: 400 });
  }

  const month = normalizeMonth(url.searchParams.get("month"));
  const format = normalizeFormat(url.searchParams.get("format"));

  try {
    const data = await getMonthlyScheduleExport(user.id, familySpaceId, month);

    if (format === "xlsx") {
      const buffer = await buildMonthlyScheduleWorkbook(data);
      return responseWithDownload(
        buffer as BlobPart,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buildExportFilename(data, "xlsx"),
      );
    }

    if (format === "txt") {
      return responseWithDownload(
        buildMonthlyScheduleText(data),
        "text/plain; charset=utf-8",
        buildExportFilename(data, "txt"),
      );
    }

    const buffer = await buildMonthlySchedulePdf(data);
    return responseWithDownload(buffer as BlobPart, "application/pdf", buildExportFilename(data, "pdf"));
  } catch (error) {
    console.error(error);
    return new Response("Export failed", { status: 500 });
  }
}
