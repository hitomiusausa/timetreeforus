import { cookies } from "next/headers";
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
import { sessionCookieName } from "@/lib/session";

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

type CalendarQueryRow = {
  family: {
    id: string;
    name: string;
    inviteCode: string;
    members: Array<{
      id: string;
      userId: string;
      role: string;
      color: string;
      user: {
        id: string;
        displayName: string;
      };
    }>;
    categories: Array<{
      id: string;
      name: string;
      color: string;
    }>;
    events: Array<{
      id: string;
      categoryId: string | null;
      title: string;
      startsAt: string;
      endsAt: string;
      isAllDay: boolean;
      location: string | null;
      note: string | null;
      assignedTo: string | null;
      category: {
        id: string;
        name: string;
        color: string;
      } | null;
      assignee: {
        id: string;
        displayName: string;
      } | null;
      assignees: Array<{
        id: string;
        displayName: string;
      }>;
      creator: {
        id: string;
        displayName: string;
      };
    }>;
  } | null;
  memberships: Array<{
    id: string;
    familySpaceId: string;
    familySpace: {
      id: string;
      name: string;
    };
  }>;
};

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (!token) {
    redirect("/login");
  }

  const params = await searchParams;
  const monthDate = parseMonth(params.month);
  const selectedDate = parseDate(params.day);
  const monthDays = buildMonthGrid(monthDate);
  const rangeStart = monthDays[0];
  const rangeEnd = endOfMonth(monthDays[monthDays.length - 1]);
  const requestedFamilyId = params.family ?? "";

  const [calendarData] = await prisma.$queryRaw<CalendarQueryRow[]>`
    WITH current_session AS (
      SELECT s.user_id
      FROM "sessions" s
      WHERE s.token = ${token}
        AND s.expires_at >= NOW()
      LIMIT 1
    ),
    user_memberships AS (
      SELECT
        fm.id,
        fm.family_space_id,
        fm.created_at,
        fs.name AS family_space_name
      FROM "family_members" fm
      JOIN "family_spaces" fs ON fs.id = fm.family_space_id
      WHERE fm.user_id = (SELECT user_id FROM current_session)
      ORDER BY fm.created_at ASC
    ),
    selected_family AS (
      SELECT COALESCE(
        (
          SELECT family_space_id
          FROM user_memberships
          WHERE family_space_id = ${requestedFamilyId}
          LIMIT 1
        ),
        (
          SELECT family_space_id
          FROM user_memberships
          ORDER BY created_at ASC
          LIMIT 1
        )
      ) AS family_space_id
    )
    SELECT
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', id,
              'familySpaceId', family_space_id,
              'familySpace', json_build_object(
                'id', family_space_id,
                'name', family_space_name
              )
            )
            ORDER BY created_at ASC
          )
          FROM user_memberships
        ),
        '[]'::json
      ) AS "memberships",
      (
        SELECT json_build_object(
          'id', fs.id,
          'name', fs.name,
          'inviteCode', fs.invite_code,
          'members', COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id', fm.id,
                  'userId', fm.user_id,
                  'role', fm.role,
                  'color', fm.color,
                  'user', json_build_object(
                    'id', u.id,
                    'displayName', u.display_name
                  )
                )
                ORDER BY fm.created_at ASC
              )
              FROM "family_members" fm
              JOIN "users" u ON u.id = fm.user_id
              WHERE fm.family_space_id = fs.id
            ),
            '[]'::json
          ),
          'categories', COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id', c.id,
                  'name', c.name,
                  'color', c.color
                )
                ORDER BY c.sort_order ASC
              )
              FROM "event_categories" c
              WHERE c.family_space_id = fs.id
            ),
            '[]'::json
          ),
          'events', COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id', e.id,
                  'categoryId', e.category_id,
                  'title', e.title,
                  'startsAt', e.starts_at,
                  'endsAt', e.ends_at,
                  'isAllDay', e.is_all_day,
                  'location', e.location,
                  'note', e.note,
                  'assignedTo', e.assigned_to,
                  'category', CASE
                    WHEN c.id IS NULL THEN NULL
                    ELSE json_build_object(
                      'id', c.id,
                      'name', c.name,
                      'color', c.color
                    )
                  END,
                  'assignee', CASE
                    WHEN assignee.id IS NULL THEN NULL
                    ELSE json_build_object(
                      'id', assignee.id,
                      'displayName', assignee.display_name
                    )
                  END,
                  'assignees', COALESCE(
                    (
                      SELECT json_agg(
                        json_build_object(
                          'id', assigned_user.id,
                          'displayName', assigned_user.display_name
                        )
                        ORDER BY assigned_member.created_at ASC
                      )
                      FROM "event_assignments" ea
                      JOIN "users" assigned_user ON assigned_user.id = ea.user_id
                      LEFT JOIN "family_members" assigned_member
                        ON assigned_member.family_space_id = e.family_space_id
                       AND assigned_member.user_id = ea.user_id
                      WHERE ea.event_id = e.id
                    ),
                    '[]'::json
                  ),
                  'creator', json_build_object(
                    'id', creator.id,
                    'displayName', creator.display_name
                  )
                )
                ORDER BY e.starts_at ASC
              )
              FROM "events" e
              LEFT JOIN "event_categories" c ON c.id = e.category_id
              LEFT JOIN "users" assignee ON assignee.id = e.assigned_to
              JOIN "users" creator ON creator.id = e.created_by
              WHERE e.family_space_id = fs.id
                AND e.deleted_at IS NULL
                AND e.starts_at >= ${rangeStart}
                AND e.starts_at <= ${rangeEnd}
            ),
            '[]'::json
          )
        )
        FROM "family_spaces" fs
        WHERE fs.id = (SELECT family_space_id FROM selected_family)
      ) AS "family"
  `;

  if (!calendarData) {
    redirect("/login");
  }

  if (calendarData.memberships.length === 0) {
    redirect("/setup");
  }

  if (!calendarData.family) {
    redirect("/setup");
  }

  const family = calendarData.family;

  return (
    <CalendarWorkspace
      family={family}
      memberships={calendarData.memberships}
      initialMonth={formatMonthInput(monthDate)}
      initialDay={formatDateInput(selectedDate)}
      initialModal={normalizeModal(params.modal)}
      initialEventId={params.event}
    />
  );
}
