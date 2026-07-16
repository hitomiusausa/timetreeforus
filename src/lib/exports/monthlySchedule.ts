import path from "path";
import { readFile } from "fs/promises";
import fontkit from "@pdf-lib/fontkit";
import ExcelJS from "exceljs";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
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

const calendarTimeZone = "UTC";
const localTimeZone = "Asia/Tokyo";

const japaneseDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: calendarTimeZone,
  month: "numeric",
  day: "numeric",
  weekday: "short",
});

const japaneseMonthFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: calendarTimeZone,
  year: "numeric",
  month: "long",
});

const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: calendarTimeZone,
  hour: "2-digit",
  minute: "2-digit",
});

const exportedDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: localTimeZone,
  year: "numeric",
  month: "numeric",
  day: "numeric",
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
  return path.join(process.cwd(), "public", "fonts", "gen-jyuu-gothic-normal.ttf");
}

function normalizePdfText(text: string) {
  return text.replace(/\p{Extended_Pictographic}/gu, "").replace(/[\u200d\ufe0f]/g, "").trim();
}

const pageWidth = 841.89;
const pageHeight = 595.28;
const pageMargin = 28;
const foreground = rgb(0.122, 0.176, 0.169);
const muted = rgb(0.333, 0.42, 0.408);
const line = rgb(0.737, 0.933, 0.91);
const soft = rgb(0.91, 1, 0.984);
const primary = rgb(0.42, 0.902, 0.843);

function truncateText(text: string, font: PDFFont, fontSize: number, maxWidth: number) {
  const normalizedText = normalizePdfText(text);

  if (font.widthOfTextAtSize(normalizedText, fontSize) <= maxWidth) {
    return normalizedText;
  }

  let truncated = "";
  const suffix = "...";

  for (const character of normalizedText) {
    const nextText = `${truncated}${character}${suffix}`;
    if (font.widthOfTextAtSize(nextText, fontSize) > maxWidth) {
      break;
    }
    truncated += character;
  }

  return `${truncated}${suffix}`;
}

function drawCellText(page: PDFPage, text: string, font: PDFFont, fontSize: number, x: number, y: number, width: number, color = foreground) {
  page.drawText(truncateText(text, font, fontSize, width), {
    x,
    y,
    size: fontSize,
    font,
    color,
  });
}

function addPdfHeader(page: PDFPage, font: PDFFont, data: MonthlyScheduleExport) {
  page.drawRectangle({ x: 0, y: pageHeight - 52, width: pageWidth, height: 52, color: soft });
  page.drawText(normalizePdfText(`${data.family.name} ${data.monthLabel}`), {
    x: pageMargin,
    y: pageHeight - 31,
    size: 17,
    font,
    color: foreground,
  });
  page.drawText("予定リスト", {
    x: pageMargin,
    y: pageHeight - 47,
    size: 9,
    font,
    color: muted,
  });

  const exportedDate = `書き出し日: ${exportedDateFormatter.format(new Date())}`;
  page.drawText(exportedDate, {
    x: pageWidth - pageMargin - font.widthOfTextAtSize(exportedDate, 7),
    y: pageHeight - 31,
    size: 7,
    font,
    color: muted,
  });
}

function addPdfFooter(page: PDFPage, font: PDFFont) {
  page.drawText("1 / 1", {
    x: pageWidth - 54,
    y: 16,
    size: 7,
    font,
    color: muted,
  });
}

function drawTableHeader(page: PDFPage, font: PDFFont, y: number, columns: Array<{ label: string; x: number; width: number }>) {
  page.drawRectangle({ x: pageMargin, y: y - 16, width: pageWidth - pageMargin * 2, height: 18, color: primary });

  for (const column of columns) {
    page.drawText(column.label, {
      x: column.x + 4,
      y: y - 10,
      size: 7.5,
      font,
      color: foreground,
    });
  }
}

export async function buildMonthlySchedulePdf(data: MonthlyScheduleExport) {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  document.setTitle(`${data.family.name} ${data.monthLabel} 予定リスト`);
  document.setAuthor("TimeTreeForUs");

  const fontBytes = await readFile(getJapaneseFontPath());
  const font = await document.embedFont(fontBytes, { subset: true });
  const page = document.addPage([pageWidth, pageHeight]);
  addPdfHeader(page, font, data);
  const tableTop = pageHeight - 68;
  const tableBottom = 26;
  const tableHeaderHeight = 18;
  const availableRowHeight = tableTop - tableHeaderHeight - tableBottom;
  const rowCount = Math.max(data.events.length, 1);
  const rowHeight = Math.max(7.2, Math.min(18, availableRowHeight / rowCount));
  const fontSize = rowHeight < 8.5 ? 5.2 : rowHeight < 10 ? 6 : rowHeight < 12 ? 6.8 : 7.4;
  const lineYAdjust = Math.max(2.2, (rowHeight - fontSize) / 2);
  const columns = [
    { key: "date", label: "日付", x: pageMargin, width: 72 },
    { key: "time", label: "時間", x: pageMargin + 72, width: 72 },
    { key: "title", label: "タイトル", x: pageMargin + 144, width: 150 },
    { key: "assignees", label: "担当", x: pageMargin + 294, width: 98 },
    { key: "location", label: "場所", x: pageMargin + 392, width: 132 },
    { key: "note", label: "メモ", x: pageMargin + 524, width: 216 },
    { key: "creator", label: "入力", x: pageMargin + 740, width: 46 },
  ];

  drawTableHeader(page, font, tableTop, columns);

  if (data.events.length === 0) {
    page.drawText("予定はありません。", {
      x: pageMargin,
      y: tableTop - tableHeaderHeight - 20,
      size: 12,
      font,
      color: muted,
    });
  } else {
    let currentDate = "";
    let y = tableTop - tableHeaderHeight;

    data.events.forEach((event, index) => {
      const dateLabel = formatDate(event.startsAt);
      const dateValue = dateLabel !== currentDate ? dateLabel : "";
      currentDate = dateLabel;
      const rowY = y - rowHeight;

      if (index % 2 === 1) {
        page.drawRectangle({
          x: pageMargin,
          y: rowY,
          width: pageWidth - pageMargin * 2,
          height: rowHeight,
          color: rgb(0.975, 0.996, 0.992),
        });
      }

      page.drawRectangle({
        x: pageMargin,
        y: rowY,
        width: pageWidth - pageMargin * 2,
        height: rowHeight,
        borderColor: line,
        borderWidth: 1,
      });

      const values = {
        date: dateValue,
        time: formatTimeRange(event),
        title: event.title,
        assignees: event.assignees,
        location: event.location ?? "",
        note: event.note ?? "",
        creator: event.creator,
      };

      for (const column of columns) {
        drawCellText(
          page,
          values[column.key as keyof typeof values],
          font,
          fontSize,
          column.x + 4,
          rowY + lineYAdjust,
          column.width - 8,
          column.key === "date" ? muted : foreground,
        );
      }

      y -= rowHeight;
    });
  }

  addPdfFooter(page, font);

  return Buffer.from(await document.save());
}
