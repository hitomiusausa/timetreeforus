"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensureFamilyMember } from "@/lib/families";
import { formatDateInput } from "@/lib/calendar";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

function buildDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
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

  while (cursor <= rangeEnd && dates.length < 370) {
    dates.push(formatDateInput(cursor));

    if (repeatRule === "weekly") {
      cursor = addDays(cursor, 7);
    } else if (repeatRule === "monthly") {
      cursor = addMonthsClamped(cursor, 1);
    } else {
      cursor = addDays(cursor, 1);
    }
  }

  return dates;
}

export async function createEventAction(formData: FormData) {
  const user = await requireUser();
  const familySpaceId = String(formData.get("familySpaceId") ?? "");
  const titlePreset = String(formData.get("titlePreset") ?? "").trim();
  const titleCustom = String(formData.get("titleCustom") ?? "").trim();
  const legacyTitle = String(formData.get("title") ?? "").trim();
  const title = titleCustom || titlePreset || legacyTitle;
  const date = String(formData.get("date") ?? "");
  const endDate = String(formData.get("endDate") ?? "") || date;
  const repeatRule = String(formData.get("repeatRule") ?? "none");
  const startTime = String(formData.get("startTime") ?? "09:00");
  const endTime = String(formData.get("endTime") ?? "10:00");
  const isAllDay = formData.get("isAllDay") === "on";
  const categoryId = String(formData.get("categoryId") ?? "") || null;
  const assignedTo = String(formData.get("assignedTo") ?? "") || null;
  const location = String(formData.get("location") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!familySpaceId || !title || !date) {
    redirect(`/calendar${familySpaceId ? `?family=${familySpaceId}&day=${date}&modal=event` : ""}`);
  }

  await ensureFamilyMember(user.id, familySpaceId);

  const occurrenceDates = buildOccurrenceDates(date, endDate, repeatRule);

  await prisma.event.createMany({
    data: occurrenceDates.map((occurrenceDate) => {
      const startsAt = isAllDay ? buildDateTime(occurrenceDate, "00:00") : buildDateTime(occurrenceDate, startTime);
      const endsAt = isAllDay ? buildDateTime(occurrenceDate, "23:59") : buildDateTime(occurrenceDate, endTime);

      return {
        familySpaceId,
        title,
        startsAt,
        endsAt: endsAt < startsAt ? startsAt : endsAt,
        isAllDay,
        categoryId,
        assignedTo,
        location,
        note,
        createdBy: user.id,
      };
    }),
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
  const endDate = String(formData.get("endDate") ?? "") || date;
  const repeatRule = String(formData.get("repeatRule") ?? "none");
  const startTime = String(formData.get("startTime") ?? "09:00");
  const endTime = String(formData.get("endTime") ?? "10:00");
  const isAllDay = formData.get("isAllDay") === "on";
  const categoryId = String(formData.get("categoryId") ?? "") || null;
  const assignedTo = String(formData.get("assignedTo") ?? "") || null;
  const location = String(formData.get("location") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!eventId || !familySpaceId || !title || !date) {
    redirect(
      `/calendar${familySpaceId ? `?family=${familySpaceId}&day=${date}&modal=edit&event=${eventId}` : ""}`,
    );
  }

  await ensureFamilyMember(user.id, familySpaceId);

  const startsAt = isAllDay ? buildDateTime(date, "00:00") : buildDateTime(date, startTime);
  const endsAt = isAllDay ? buildDateTime(date, "23:59") : buildDateTime(date, endTime);
  const occurrenceDates = buildOccurrenceDates(date, endDate, repeatRule);

  await prisma.event.updateMany({
    where: {
      id: eventId,
      familySpaceId,
      deletedAt: null,
    },
    data: {
      title,
      startsAt,
      endsAt: endsAt < startsAt ? startsAt : endsAt,
      isAllDay,
      categoryId,
      assignedTo,
      location,
      note,
    },
  });

  if (occurrenceDates.length > 1) {
    await prisma.event.createMany({
      data: occurrenceDates.slice(1).map((occurrenceDate) => {
        const occurrenceStartsAt = isAllDay ? buildDateTime(occurrenceDate, "00:00") : buildDateTime(occurrenceDate, startTime);
        const occurrenceEndsAt = isAllDay ? buildDateTime(occurrenceDate, "23:59") : buildDateTime(occurrenceDate, endTime);

        return {
          familySpaceId,
          title,
          startsAt: occurrenceStartsAt,
          endsAt: occurrenceEndsAt < occurrenceStartsAt ? occurrenceStartsAt : occurrenceEndsAt,
          isAllDay,
          categoryId,
          assignedTo,
          location,
          note,
          createdBy: user.id,
        };
      }),
    });
  }

  revalidatePath("/calendar");
  redirect(`/calendar?family=${familySpaceId}&month=${date.slice(0, 7)}&day=${date}&modal=day`);
}

export async function deleteEventAction(formData: FormData) {
  const user = await requireUser();
  const eventId = String(formData.get("eventId") ?? "");
  const familySpaceId = String(formData.get("familySpaceId") ?? "");
  const day = String(formData.get("day") ?? formatDateInput(new Date()));

  if (!eventId || !familySpaceId) {
    redirect("/calendar");
  }

  await ensureFamilyMember(user.id, familySpaceId);

  await prisma.event.updateMany({
    where: {
      id: eventId,
      familySpaceId,
    },
    data: {
      deletedAt: new Date(),
    },
  });

  revalidatePath("/calendar");
  redirect(`/calendar?family=${familySpaceId}&month=${day.slice(0, 7)}&day=${day}&modal=day`);
}
