import path from "path";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { endOfMonth, parseMonth } from "@/lib/calendar";
import { ensureFamilyMember } from "@/lib/families";
import { prisma } from "@/lib/prisma";

export type ExportFormat = "pdf" | "xlsx" | "txt";

export type ScheduleExportEvent = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  isAllDay: boolean;
  location: string | null;
  note: string | null;
  assignees: string;
  creator: string;
};

export type MonthlyScheduleExport = {
  family: {
    id: string;
    name: string;
  };
  month: string;
  monthLabel: string;
  events: ScheduleExportEvent[];
};

const timeZone = "Asia/Tokyo";

const japaneseDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone,
  month: "numeric",
  day: "numeric",
  weekday: "short",
});

const japaneseMonthFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone,
  year: "numeric",
  month: "long",
});

const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone,
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(date: Date) {
  return japaneseDateFormatter.format(date);
}

function formatTimeRange(event: ScheduleExportEvent) {
  if (event.isAllDay) {
    return "終日";
  }

  return `${timeFormatter.format(event.startsAt)} - ${timeFormatter.format(event.endsAt)}`;
}

function sanitizeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_").slice(0, 80);
}

export function buildExportFilename(data: MonthlyScheduleExport, extension: string) {
  return `${sanitizeFilename(data.family.name)}_${data.month}_schedule.${extension}`;
}

export function encodeDownloadFilename(filename: string) {
  return `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function getMonthlyScheduleExport(userId: string, familySpaceId: string, month: string) {
  await ensureFamilyMember(userId, familySpaceId);

  const monthDate = parseMonth(month);
  const rangeStart = monthDate;
  const rangeEnd = endOfMonth(monthDate);

  const family = await prisma.familySpace.findUniqueOrThrow({
    where: {
      id: familySpaceId,
    },
    select: {
      id: true,
      name: true,
      members: {
        select: {
          userId: true,
        },
      },
    },
  });

  const events = await prisma.event.findMany({
    where: {
      familySpaceId,
      deletedAt: null,
      startsAt: {
        gte: rangeStart,
        lte: rangeEnd,
      },
    },
    orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
    include: {
      creator: {
        select: {
          displayName: true,
        },
      },
      assignee: {
        select: {
          displayName: true,
        },
      },
      assignments: {
        include: {
          user: {
            select: {
              displayName: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  return {
    family: {
      id: family.id,
      name: family.name,
    },
    month,
    monthLabel: japaneseMonthFormatter.format(monthDate),
    events: events.map((event) => {
      const assignedNames =
        event.assignments.length > 0
          ? event.assignments.map((assignment) => assignment.user.displayName)
          : event.assignee
            ? [event.assignee.displayName]
            : [];

      return {
        id: event.id,
        title: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        isAllDay: event.isAllDay,
        location: event.location,
        note: event.note,
        assignees:
          family.members.length > 0 && assignedNames.length >= family.members.length
            ? "全員"
            : assignedNames.join("、"),
        creator: event.creator.displayName,
      };
    }),
  } satisfies MonthlyScheduleExport;
}

export function buildMonthlyScheduleText(data: MonthlyScheduleExport) {
  const lines = [`${data.family.name} ${data.monthLabel} 予定リスト`, ""];

  if (data.events.length === 0) {
    lines.push("予定はありません。");
    return `${lines.join("\n")}\n`;
  }

  let currentDate = "";

  for (const event of data.events) {
    const dateLabel = formatDate(event.startsAt);

    if (dateLabel !== currentDate) {
      currentDate = dateLabel;
      lines.push(`■ ${dateLabel}`);
    }

    const details = [
      formatTimeRange(event),
      event.title,
      event.assignees ? `担当: ${event.assignees}` : "",
      event.location ? `場所: ${event.location}` : "",
      event.note ? `メモ: ${event.note}` : "",
    ].filter(Boolean);

    lines.push(`- ${details.join(" / ")}`);
  }

  return `${lines.join("\n")}\n`;
}

export async function buildMonthlyScheduleWorkbook(data: MonthlyScheduleExport) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TimeTreeForUs";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet("予定リスト", {
    views: [{ state: "frozen", ySplit: 3 }],
  });

  worksheet.mergeCells("A1:G1");
  worksheet.getCell("A1").value = `${data.family.name} ${data.monthLabel} 予定リスト`;
  worksheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF1F2D2B" } };
  worksheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8FFFB" } };
  worksheet.getCell("A1").alignment = { vertical: "middle" };
  worksheet.getRow(1).height = 28;

  worksheet.addRow([]);
  worksheet.addRow(["日付", "時間", "タイトル", "担当", "場所", "メモ", "入力"]);

  const headerRow = worksheet.getRow(3);
  headerRow.font = { bold: true, color: { argb: "FF1F2D2B" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6BE6D7" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };

  if (data.events.length === 0) {
    worksheet.addRow(["予定はありません。"]);
  } else {
    for (const event of data.events) {
      worksheet.addRow([
        formatDate(event.startsAt),
        formatTimeRange(event),
        event.title,
        event.assignees,
        event.location ?? "",
        event.note ?? "",
        event.creator,
      ]);
    }
  }

  worksheet.columns = [
    { key: "date", width: 14 },
    { key: "time", width: 14 },
    { key: "title", width: 24 },
    { key: "assignees", width: 18 },
    { key: "location", width: 22 },
    { key: "note", width: 34 },
    { key: "creator", width: 16 },
  ];

  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFBCEEE8" } },
        left: { style: "thin", color: { argb: "FFBCEEE8" } },
        bottom: { style: "thin", color: { argb: "FFBCEEE8" } },
        right: { style: "thin", color: { argb: "FFBCEEE8" } },
      };
      cell.alignment = {
        vertical: "middle",
        wrapText: rowNumber > 3,
      };
    });
  });

  return workbook.xlsx.writeBuffer();
}

function getJapaneseFontPath() {
  return path.join(
    process.cwd(),
    "node_modules",
    "japanese-fonts",
    "dist",
    "Gen Jyuu Gothic L Monospace Normal",
    "Gen Jyuu Gothic L Monospace Normal.ttf",
  );
}

function addPdfFooter(document: PDFKit.PDFDocument) {
  const range = document.bufferedPageRange();

  for (let index = 0; index < range.count; index += 1) {
    document.switchToPage(index);
    document
      .fontSize(8)
      .fillColor("#556b68")
      .text(`${index + 1} / ${range.count}`, 48, document.page.height - 42, {
        align: "right",
        width: document.page.width - 96,
      });
  }
}

export async function buildMonthlySchedulePdf(data: MonthlyScheduleExport) {
  const chunks: Buffer[] = [];
  const document = new PDFDocument({
    size: "A4",
    margin: 48,
    bufferPages: true,
    info: {
      Title: `${data.family.name} ${data.monthLabel} 予定リスト`,
      Author: "TimeTreeForUs",
    },
  });

  document.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  document.registerFont("Japanese", getJapaneseFontPath());
  document.font("Japanese");

  document
    .rect(0, 0, document.page.width, 92)
    .fill("#e8fffb")
    .fillColor("#1f2d2b")
    .fontSize(19)
    .text(`${data.family.name} ${data.monthLabel}`, 48, 36, { continued: false })
    .fontSize(12)
    .fillColor("#556b68")
    .text("予定リスト", 48, 62);

  document.moveDown(2.2);

  if (data.events.length === 0) {
    document.fontSize(12).fillColor("#556b68").text("予定はありません。");
  } else {
    let currentDate = "";

    for (const event of data.events) {
      const dateLabel = formatDate(event.startsAt);

      if (dateLabel !== currentDate) {
        currentDate = dateLabel;
        if (document.y > document.page.height - 120) {
          document.addPage();
        }
        document.moveDown(0.7);
        document.roundedRect(48, document.y, document.page.width - 96, 24, 6).fill("#6be6d7");
        document.fillColor("#1f2d2b").fontSize(12).text(dateLabel, 58, document.y + 6);
        document.y += 28;
      }

      if (document.y > document.page.height - 120) {
        document.addPage();
      }

      const top = document.y;
      document.roundedRect(48, top, document.page.width - 96, 58, 6).strokeColor("#bceee8").stroke();
      document
        .fillColor("#1f2d2b")
        .fontSize(11)
        .text(event.title, 60, top + 8, { width: 300 })
        .fillColor("#556b68")
        .fontSize(9)
        .text(formatTimeRange(event), 390, top + 8, { width: 120, align: "right" });

      const meta = [
        event.assignees ? `担当: ${event.assignees}` : "",
        event.location ? `場所: ${event.location}` : "",
        event.note ? `メモ: ${event.note}` : "",
      ].filter(Boolean);

      document
        .fillColor("#556b68")
        .fontSize(9)
        .text(meta.join(" / "), 60, top + 29, { width: document.page.width - 120, height: 20, ellipsis: true });

      document.y = top + 68;
    }
  }

  addPdfFooter(document);
  document.end();

  return finished;
}
