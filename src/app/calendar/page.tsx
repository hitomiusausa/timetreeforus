import { redirect } from "next/navigation";
import { CalendarWorkspace } from "@/app/calendar/CalendarWorkspace";
import {
  buildMonthGrid,
  endOfMonth,
  formatDateInput,
  formatMonthInput,
  parseDate,
  parseMonth,
} from "@/lib/calendar";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

type CalendarPageProps = {
  searchParams: Promise<{
    family?: string;
    month?: string;
    day?: string;
    modal?: string;
    event?: string;
  }>;
};

function normalizeModal(value?: string) {
  if (value === "day" || value === "event" || value === "edit") {
    return value;
  }

  return null;
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const user = await requireUser();
  const params = await searchParams;

  if (user.memberships.length === 0) {
    redirect("/setup");
  }

  const selectedMembership =
    user.memberships.find((membership) => membership.familySpaceId === params.family) ??
    user.memberships[0];
  const familySpaceId = selectedMembership.familySpaceId;
  const monthDate = parseMonth(params.month);
  const selectedDate = parseDate(params.day);
  const monthDays = buildMonthGrid(monthDate);
  const rangeStart = monthDays[0];
  const rangeEnd = endOfMonth(monthDays[monthDays.length - 1]);

  const family = await prisma.familySpace.findFirst({
    where: {
      id: familySpaceId,
      members: {
        some: {
          userId: user.id,
        },
      },
    },
    include: {
      members: {
        include: {
          user: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      categories: {
        orderBy: {
          sortOrder: "asc",
        },
      },
      events: {
        where: {
          deletedAt: null,
          startsAt: {
            gte: rangeStart,
            lte: rangeEnd,
          },
        },
        include: {
          category: true,
          assignee: true,
          creator: true,
        },
        orderBy: {
          startsAt: "asc",
        },
      },
    },
  });

  if (!family) {
    redirect("/setup");
  }

  return (
    <CalendarWorkspace
      family={{
        id: family.id,
        name: family.name,
        inviteCode: family.inviteCode,
        members: family.members.map((member) => ({
          id: member.id,
          userId: member.userId,
          role: member.role,
          color: member.color,
          user: {
            id: member.user.id,
            displayName: member.user.displayName,
          },
        })),
        categories: family.categories.map((category) => ({
          id: category.id,
          name: category.name,
          color: category.color,
        })),
        events: family.events.map((event) => ({
          id: event.id,
          categoryId: event.categoryId,
          title: event.title,
          startsAt: event.startsAt.toISOString(),
          endsAt: event.endsAt.toISOString(),
          isAllDay: event.isAllDay,
          location: event.location,
          note: event.note,
          assignedTo: event.assignedTo,
          category: event.category
            ? {
                id: event.category.id,
                name: event.category.name,
                color: event.category.color,
              }
            : null,
          assignee: event.assignee
            ? {
                id: event.assignee.id,
                displayName: event.assignee.displayName,
              }
            : null,
          creator: {
            id: event.creator.id,
            displayName: event.creator.displayName,
          },
        })),
      }}
      memberships={user.memberships.map((membership) => ({
        id: membership.id,
        familySpaceId: membership.familySpaceId,
        familySpace: {
          id: membership.familySpace.id,
          name: membership.familySpace.name,
        },
      }))}
      initialMonth={formatMonthInput(monthDate)}
      initialDay={formatDateInput(selectedDate)}
      initialModal={normalizeModal(params.modal)}
      initialEventId={params.event}
    />
  );
}
