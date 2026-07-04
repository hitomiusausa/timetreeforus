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
  return path.join(process.cwd(), "public", "fonts", "gen-jyuu-gothic-normal.ttf");
}

function normalizePdfText(text: string) {
  return text.replace(/\p{Extended_Pictographic}/gu, "").replace(/[\u200d\ufe0f]/g, "").trim();
}

const pageWidth = 595.28;
const pageHeight = 841.89;
const pageMargin = 48;
const foreground = rgb(0.122, 0.176, 0.169);
const muted = rgb(0.333, 0.42, 0.408);
const line = rgb(0.737, 0.933, 0.91);
const soft = rgb(0.91, 1, 0.984);
const primary = rgb(0.42, 0.902, 0.843);

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number) {
  const lines: string[] = [];
  let currentLine = "";

  for (const character of normalizePdfText(text)) {
    const nextLine = `${currentLine}${character}`;
    if (font.widthOfTextAtSize(nextLine, fontSize) <= maxWidth || currentLine.length === 0) {
      currentLine = nextLine;
    } else {
      lines.push(currentLine);
      currentLine = character;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function drawTextLines(
  page: PDFPage,
  text: string,
  font: PDFFont,
  fontSize: number,
  x: number,
  y: number,
  maxWidth: number,
  maxLines: number,
  color = foreground,
) {
  const lines = wrapText(text, font, fontSize, maxWidth).slice(0, maxLines);

  lines.forEach((lineText, index) => {
    page.drawText(lineText, {
      x,
      y: y - index * (fontSize + 4),
      size: fontSize,
      font,
      color,
    });
  });
}

function addPdfHeader(page: PDFPage, font: PDFFont, data: MonthlyScheduleExport) {
  page.drawRectangle({ x: 0, y: pageHeight - 92, width: pageWidth, height: 92, color: soft });
  page.drawText(normalizePdfText(`${data.family.name} ${data.monthLabel}`), {
    x: pageMargin,
    y: pageHeight - 55,
    size: 19,
    font,
    color: foreground,
  });
  page.drawText("予定リスト", {
    x: pageMargin,
    y: pageHeight - 78,
    size: 12,
    font,
    color: muted,
  });
}

function addPdfFooter(page: PDFPage, font: PDFFont, pageNumber: number, pageCount: number) {
  page.drawText(`${pageNumber} / ${pageCount}`, {
    x: pageWidth - 90,
    y: 30,
    size: 8,
    font,
    color: muted,
  });
}

export async function buildMonthlySchedulePdf(data: MonthlyScheduleExport) {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  document.setTitle(`${data.family.name} ${data.monthLabel} 予定リスト`);
  document.setAuthor("TimeTreeForUs");

  const fontBytes = await readFile(getJapaneseFontPath());
  const font = await document.embedFont(fontBytes, { subset: true });
  let page = document.addPage([pageWidth, pageHeight]);
  addPdfHeader(page, font, data);
  let y = pageHeight - 124;

  function addPage() {
    page = document.addPage([pageWidth, pageHeight]);
    addPdfHeader(page, font, data);
    y = pageHeight - 124;
  }

  function ensureSpace(height: number) {
    if (y - height < 64) {
      addPage();
    }
  }

  if (data.events.length === 0) {
    page.drawText("予定はありません。", {
      x: pageMargin,
      y,
      size: 12,
      font,
      color: muted,
    });
  } else {
    let currentDate = "";

    for (const event of data.events) {
      const dateLabel = formatDate(event.startsAt);

      if (dateLabel !== currentDate) {
        currentDate = dateLabel;
        ensureSpace(36);
        page.drawRectangle({ x: pageMargin, y: y - 20, width: pageWidth - pageMargin * 2, height: 24, color: primary });
        page.drawText(dateLabel, {
          x: pageMargin + 10,
          y: y - 13,
          size: 12,
          font,
          color: foreground,
        });
        y -= 38;
      }

      const meta = [
        event.assignees ? `担当: ${event.assignees}` : "",
        event.location ? `場所: ${event.location}` : "",
        event.note ? `メモ: ${event.note}` : "",
      ].filter(Boolean);
      const metaText = meta.join(" / ");
      const titleLines = wrapText(event.title, font, 11, 308).slice(0, 2);
      const metaLines = metaText ? wrapText(metaText, font, 9, pageWidth - pageMargin * 2 - 24).slice(0, 2) : [];
      const cardHeight = Math.max(58, 24 + titleLines.length * 15 + metaLines.length * 13);

      ensureSpace(cardHeight + 10);
      page.drawRectangle({
        x: pageMargin,
        y: y - cardHeight + 8,
        width: pageWidth - pageMargin * 2,
        height: cardHeight,
        borderColor: line,
        borderWidth: 1,
      });

      drawTextLines(page, event.title, font, 11, pageMargin + 12, y - 8, 308, 2);
      page.drawText(formatTimeRange(event), {
        x: pageWidth - pageMargin - 124,
        y: y - 8,
        size: 9,
        font,
        color: muted,
      });

      if (metaText) {
        drawTextLines(page, metaText, font, 9, pageMargin + 12, y - 31, pageWidth - pageMargin * 2 - 24, 2, muted);
      }

      y -= cardHeight + 10;
    }
  }

  const pages = document.getPages();
  pages.forEach((pdfPage, index) => addPdfFooter(pdfPage, font, index + 1, pages.length));

  return Buffer.from(await document.save());
}
