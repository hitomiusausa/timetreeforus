"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensureFamilyMember } from "@/lib/families";
import { formatDateInput, getTodayDateKey } from "@/lib/calendar";
import { getTitleLabelColor } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

function buildDateTime(date: string, time: string) {
  // The database uses timestamp-without-time-zone as calendar wall time.
  // Appending Z makes writes independent of the server machine's time zone.
  return new Date(`${date}T${time}:00Z`);
}

function parseDateInput(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonthsClamped(date: Date, amount: number) {
  const year = date.getFullYear();
  const month = date.getMonth() + amount;
  const day = date.getDate();
  const lastDayOfTargetMonth = new Date(year, month + 1, 0).getDate();

  return new Date(year, month, Math.min(day, lastDayOfTargetMonth));
}

function buildOccurrenceDates(startDate: string, endDate: string, repeatRule: string) {
  const start = parseDateInput(startDate);
  const end = parseDateInput(endDate || startDate);
  const rangeEnd = end < start ? start : end;
  const dates: string[] = [];
  let cursor = start;
  let occurrenceIndex = 0;

  while (cursor <= rangeEnd && dates.length < 370) {
    dates.push(formatDateInput(cursor));
    occurrenceIndex += 1;

    if (repeatRule === "weekly") {
      cursor = addDays(start, occurrenceIndex * 7);
    } else if (repeatRule === "monthly") {
      cursor = addMonthsClamped(start, occurrenceIndex);
    } else if (repeatRule === "daily") {
      cursor = addDays(start, occurrenceIndex);
    } else {
      break;
    }
  }

  return dates;
}

const repeatRules = new Set(["daily", "weekly", "monthly"]);

function normalizeRepeatRule(value: string) {
  return repeatRules.has(value) ? value : "none";
}

function getDefaultRepeatEndDate(startDate: string) {
  return formatDateInput(addMonthsClamped(parseDateInput(startDate), 12));
}

function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = parseDateInput(value);
  return !Number.isNaN(date.getTime()) && formatDateInput(date) === value;
}

function normalizeTimeInput(value: string, fallback: string) {
  const match = value.match(/^(\d{2}):(\d{2})$/);

  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    return fallback;
  }

  return value;
}

function readCopyDates(formData: FormData, originalDate: string) {
  const rawCopyDates = formData
    .getAll("copyDates")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (rawCopyDates.length === 0) {
    return [];
  }

  const dates = rawCopyDates
    .flatMap((value) => value.split(/[\s,、]+/))
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => value !== originalDate && isValidDateInput(value));

  return Array.from(new Set(dates)).slice(0, 60);
}

function readAssignedUserIds(formData: FormData) {
  return formData
    .getAll("assignedUserIds")
    .map((value) => String(value))
    .filter(Boolean);
}

async function resolveAssignmentUserIds(familySpaceId: string, requestedUserIds: string[], assignAll: boolean) {
  const members = await prisma.familyMember.findMany({
    where: {
      familySpaceId,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      userId: true,
    },
  });
  const memberUserIds = members.map((member) => member.userId);

  if (assignAll) {
    return memberUserIds;
  }

  const allowedUserIds = new Set(memberUserIds);
  return Array.from(new Set(requestedUserIds.filter((userId) => allowedUserIds.has(userId))));
}

export async function createEventAction(formData: FormData) {
  const user = await requireUser();
  const familySpaceId = String(formData.get("familySpaceId") ?? "");
  const titlePreset = String(formData.get("titlePreset") ?? "").trim();
  const titleCustom = String(formData.get("titleCustom") ?? "").trim();
  const legacyTitle = String(formData.get("title") ?? "").trim();
  const title = titleCustom || titlePreset || legacyTitle;
  const date = String(formData.get("date") ?? "");
  const requestedEndDate = String(formData.get("endDate") ?? "");
  const repeatRule = normalizeRepeatRule(String(formData.get("repeatRule") ?? "none"));
  const startTime = normalizeTimeInput(String(formData.get("startTime") ?? "09:00"), "09:00");
  const endTime = normalizeTimeInput(String(formData.get("endTime") ?? "10:00"), "10:00");
  const isAllDay = formData.get("isAllDay") === "on";
  const labelColor = titleCustom ? getTitleLabelColor(String(formData.get("labelColor") ?? "")) : null;
  const assignAll = formData.get("assignAll") === "on";
  const requestedAssignedUserIds = readAssignedUserIds(formData);
  const location = String(formData.get("location") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!familySpaceId || !title || !isValidDateInput(date)) {
    redirect(`/calendar${familySpaceId ? `?family=${familySpaceId}&day=${date}&modal=event` : ""}`);
  }

  await ensureFamilyMember(user.id, familySpaceId);

  const maximumEndDate = getDefaultRepeatEndDate(date);
  const endDate =
    repeatRule === "none"
      ? date
      : !isValidDateInput(requestedEndDate) || requestedEndDate <= date || requestedEndDate > maximumEndDate
        ? maximumEndDate
        : requestedEndDate;
  const occurrenceDates = buildOccurrenceDates(date, endDate, repeatRule);
  const occurrenceDateSet = new Set(occurrenceDates);
  const creationTargets = [
    ...occurrenceDates.map((occurrenceDate) => ({ occurrenceDate, belongsToSeries: repeatRule !== "none" })),
    ...readCopyDates(formData, date)
      .filter((copyDate) => !occurrenceDateSet.has(copyDate))
      .map((occurrenceDate) => ({ occurrenceDate, belongsToSeries: false })),
  ];
  const recurrenceSeriesId = repeatRule === "none" ? null : randomUUID();
  const assignmentUserIds = await resolveAssignmentUserIds(familySpaceId, requestedAssignedUserIds, assignAll);

  const createdEvents = await prisma.$transaction(
    creationTargets.map(({ occurrenceDate, belongsToSeries }) => {
      const startsAt = isAllDay ? buildDateTime(occurrenceDate, "00:00") : buildDateTime(occurrenceDate, startTime);
      const endsAt = isAllDay ? buildDateTime(occurrenceDate, "23:59") : buildDateTime(occurrenceDate, endTime);

      return prisma.event.create({
        data: {
          familySpaceId,
          title,
          startsAt,
          endsAt: endsAt < startsAt ? startsAt : endsAt,
          isAllDay,
          labelColor,
          assignedTo: assignmentUserIds[0] ?? null,
          recurrenceSeriesId: belongsToSeries ? recurrenceSeriesId : null,
          recurrenceRule: belongsToSeries ? repeatRule : null,
          location,
          note,
          createdBy: user.id,
          assignments:
            assignmentUserIds.length > 0
              ? {
                  create: assignmentUserIds.map((userId) => ({ userId })),
                }
              : undefined,
        },
      });
    }),
  );

  await prisma.eventChangeLog.create({
    data: {
      familySpaceId,
      eventId: createdEvents[0]?.id,
      userId: user.id,
      action: "created",
      eventTitle: title,
      scope: recurrenceSeriesId ? "series" : "occurrence",
    },
  });

  revalidatePath("/calendar");
  redirect(`/calendar?family=${familySpaceId}&month=${date.slice(0, 7)}&day=${date}&modal=day`);
}

export async function updateEventAction(formData: FormData) {
  const user = await requireUser();
  const eventId = String(formData.get("eventId") ?? "");
  const familySpaceId = String(formData.get("familySpaceId") ?? "");
  const titlePreset = String(formData.get("titlePreset") ?? "").trim();
  const titleCustom = String(formData.get("titleCustom") ?? "").trim();
  const title = titleCustom || titlePreset;
  const date = String(formData.get("date") ?? "");
  const requestedEditScope = String(formData.get("editScope") ?? "occurrence");
  const startTime = normalizeTimeInput(String(formData.get("startTime") ?? "09:00"), "09:00");
  const endTime = normalizeTimeInput(String(formData.get("endTime") ?? "10:00"), "10:00");
  const isAllDay = formData.get("isAllDay") === "on";
  const labelColor = titleCustom ? getTitleLabelColor(String(formData.get("labelColor") ?? "")) : null;
  const assignAll = formData.get("assignAll") === "on";
  const requestedAssignedUserIds = readAssignedUserIds(formData);
  const location = String(formData.get("location") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!eventId || !familySpaceId || !title || !isValidDateInput(date)) {
    redirect(
      `/calendar${familySpaceId ? `?family=${familySpaceId}&day=${date}&modal=edit&event=${eventId}` : ""}`,
    );
  }

  await ensureFamilyMember(user.id, familySpaceId);

  const existingEvent = await prisma.event.findFirst({
    where: {
      id: eventId,
      familySpaceId,
      deletedAt: null,
    },
    select: {
      id: true,
      startsAt: true,
      recurrenceSeriesId: true,
    },
  });

  if (!existingEvent) {
    redirect(`/calendar?family=${familySpaceId}&month=${date.slice(0, 7)}&day=${date}&modal=day`);
  }

  const editScope = existingEvent.recurrenceSeriesId && ["future", "series"].includes(requestedEditScope)
    ? requestedEditScope
    : "occurrence";
  const targetEvents =
    editScope === "occurrence"
      ? [existingEvent]
      : await prisma.event.findMany({
          where: {
            familySpaceId,
            recurrenceSeriesId: existingEvent.recurrenceSeriesId,
            deletedAt: null,
            ...(editScope === "future" ? { startsAt: { gte: existingEvent.startsAt } } : {}),
          },
          select: { id: true, startsAt: true, recurrenceSeriesId: true },
          orderBy: { startsAt: "asc" },
        });
  const assignmentUserIds = await resolveAssignmentUserIds(familySpaceId, requestedAssignedUserIds, assignAll);

  await prisma.$transaction(async (tx) => {
    if (editScope === "occurrence") {
      const targetEvent = existingEvent;
      const targetDate = date;
      const targetStartsAt = isAllDay ? buildDateTime(targetDate, "00:00") : buildDateTime(targetDate, startTime);
      const targetEndsAt = isAllDay ? buildDateTime(targetDate, "23:59") : buildDateTime(targetDate, endTime);

      await tx.event.update({
        where: { id: targetEvent.id },
        data: {
          title,
          startsAt: targetStartsAt,
          endsAt: targetEndsAt < targetStartsAt ? targetStartsAt : targetEndsAt,
          isAllDay,
          categoryId: null,
          labelColor,
          assignedTo: assignmentUserIds[0] ?? null,
          location,
          note,
        },
      });

      await tx.eventAssignment.deleteMany({ where: { eventId: targetEvent.id } });

      if (assignmentUserIds.length > 0) {
        await tx.eventAssignment.createMany({
          data: assignmentUserIds.map((userId) => ({ eventId: targetEvent.id, userId })),
          skipDuplicates: true,
        });
      }

      for (const occurrenceDate of readCopyDates(formData, date)) {
        const occurrenceStartsAt = isAllDay ? buildDateTime(occurrenceDate, "00:00") : buildDateTime(occurrenceDate, startTime);
        const occurrenceEndsAt = isAllDay ? buildDateTime(occurrenceDate, "23:59") : buildDateTime(occurrenceDate, endTime);

        await tx.event.create({
          data: {
            familySpaceId,
            title,
            startsAt: occurrenceStartsAt,
            endsAt: occurrenceEndsAt < occurrenceStartsAt ? occurrenceStartsAt : occurrenceEndsAt,
            isAllDay,
            labelColor,
            assignedTo: assignmentUserIds[0] ?? null,
            location,
            note,
            createdBy: user.id,
            assignments:
              assignmentUserIds.length > 0
                ? {
                    create: assignmentUserIds.map((userId) => ({ userId })),
                  }
                : undefined,
          },
        });
      }

      await tx.eventChangeLog.create({
        data: {
          familySpaceId,
          eventId,
          userId: user.id,
          action: "updated",
          eventTitle: title,
          scope: editScope,
        },
      });

      return;
    }

    const targetEventIds = targetEvents.map((targetEvent) => targetEvent.id);
    const effectiveStartTime = isAllDay ? "00:00" : startTime;
    const effectiveEndTime = isAllDay ? "23:59" : endTime < startTime ? startTime : endTime;

    await tx.event.updateMany({
      where: { id: { in: targetEventIds } },
      data: {
        title,
        isAllDay,
        categoryId: null,
        labelColor,
        assignedTo: assignmentUserIds[0] ?? null,
        location,
        note,
      },
    });

    await tx.$executeRaw`
      UPDATE "events"
      SET
        "starts_at" = "starts_at"::date + CAST(${effectiveStartTime} AS time),
        "ends_at" = "starts_at"::date + CAST(${effectiveEndTime} AS time),
        "updated_at" = NOW()
      WHERE "id" IN (${Prisma.join(targetEventIds)})
    `;

    await tx.eventAssignment.deleteMany({ where: { eventId: { in: targetEventIds } } });

    if (assignmentUserIds.length > 0) {
      await tx.eventAssignment.createMany({
        data: targetEventIds.flatMap((targetEventId) =>
          assignmentUserIds.map((userId) => ({ eventId: targetEventId, userId })),
        ),
        skipDuplicates: true,
      });
    }

    await tx.eventChangeLog.create({
      data: {
        familySpaceId,
        eventId,
        userId: user.id,
        action: "updated",
        eventTitle: title,
        scope: editScope,
      },
    });
  });

  revalidatePath("/calendar");
  redirect(`/calendar?family=${familySpaceId}&month=${date.slice(0, 7)}&day=${date}&modal=day`);
}

export async function deleteEventAction(formData: FormData) {
  const user = await requireUser();
  const eventId = String(formData.get("eventId") ?? "");
  const familySpaceId = String(formData.get("familySpaceId") ?? "");
  const day = String(formData.get("day") ?? getTodayDateKey());
  const deleteScope = String(formData.get("deleteScope") ?? "occurrence");

  if (!eventId || !familySpaceId) {
    redirect("/calendar");
  }

  await ensureFamilyMember(user.id, familySpaceId);

  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      familySpaceId,
      deletedAt: null,
    },
    select: {
      recurrenceSeriesId: true,
      title: true,
    },
  });

  if (event) {
    await prisma.$transaction(async (tx) => {
      await tx.event.updateMany({
        where:
          deleteScope === "series" && event.recurrenceSeriesId
            ? {
                familySpaceId,
                recurrenceSeriesId: event.recurrenceSeriesId,
                deletedAt: null,
              }
            : {
                id: eventId,
                familySpaceId,
                deletedAt: null,
              },
        data: { deletedAt: new Date() },
      });
      await tx.eventChangeLog.create({
        data: {
          familySpaceId,
          eventId,
          userId: user.id,
          action: "deleted",
          eventTitle: event.title,
          scope: deleteScope === "series" && event.recurrenceSeriesId ? "series" : "occurrence",
        },
      });
    });
  }

  revalidatePath("/calendar");
  redirect(`/calendar?family=${familySpaceId}&month=${day.slice(0, 7)}&day=${day}&modal=day`);
}

export async function restoreEventAction(formData: FormData) {
  const user = await requireUser();
  const eventId = String(formData.get("eventId") ?? "");
  const familySpaceId = String(formData.get("familySpaceId") ?? "");
  const restoreScope = String(formData.get("restoreScope") ?? "occurrence");

  if (!eventId || !familySpaceId) {
    redirect("/calendar");
  }

  await ensureFamilyMember(user.id, familySpaceId);

  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      familySpaceId,
      deletedAt: { not: null },
    },
    select: {
      recurrenceSeriesId: true,
      startsAt: true,
      title: true,
    },
  });

  if (event) {
    await prisma.$transaction(async (tx) => {
      await tx.event.updateMany({
        where:
          restoreScope === "series" && event.recurrenceSeriesId
            ? { familySpaceId, recurrenceSeriesId: event.recurrenceSeriesId, deletedAt: { not: null } }
            : { id: eventId, familySpaceId, deletedAt: { not: null } },
        data: { deletedAt: null },
      });
      await tx.eventChangeLog.create({
        data: {
          familySpaceId,
          eventId,
          userId: user.id,
          action: "restored",
          eventTitle: event.title,
          scope: restoreScope === "series" && event.recurrenceSeriesId ? "series" : "occurrence",
        },
      });
    });
  }

  revalidatePath("/calendar");
  const day = event ? event.startsAt.toISOString().slice(0, 10) : getTodayDateKey();
  redirect(`/calendar?family=${familySpaceId}&month=${day.slice(0, 7)}&day=${day}`);
}
