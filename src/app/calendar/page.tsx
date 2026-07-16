import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CalendarWorkspace } from "@/app/calendar/CalendarWorkspace";
import {
  buildMonthGrid,
  endOfMonth,
  formatDateInput,
  formatMonthInput,
  getTodayDateKey,
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
  currentUser: {
    id: string;
    displayName: string;
  } | null;
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
    titlePresets: Array<{
      id: string;
      name: string;
    }>;
    recentlyDeletedEvents: Array<{
      id: string;
      title: string;
      startsAt: string;
      deletedAt: string;
      recurrenceSeriesId: string | null;
      recurrenceRule: string | null;
      deletedCount: number;
    }>;
    upcomingEvents: Array<{
      id: string;
      title: string;
      startsAt: string;
      endsAt: string;
      isAllDay: boolean;
      location: string | null;
      note: string | null;
      labelColor: string | null;
    }>;
    recentActivity: Array<{
      id: string;
      action: string;
      eventTitle: string;
      scope: string;
      createdAt: string;
      userName: string;
    }>;
    events: Array<{
      id: string;
      categoryId: string | null;
      labelColor: string | null;
      title: string;
      startsAt: string;
      endsAt: string;
      isAllDay: boolean;
      location: string | null;
      note: string | null;
      assignedTo: string | null;
      recurrenceSeriesId: string | null;
      recurrenceRule: string | null;
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
    role: string;
    familySpace: {
      id: string;
      name: string;
    };
  }>;
  archivedMemberships: Array<{
    id: string;
    familySpaceId: string;
    role: string;
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
  const upcomingStart = new Date(`${getTodayDateKey()}T00:00:00Z`);
  const upcomingEnd = new Date(upcomingStart);
  upcomingEnd.setUTCFullYear(upcomingEnd.getUTCFullYear() + 1);

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
        fm.role,
        fm.created_at,
        fs.name AS family_space_name,
        fs.archived_at
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
            AND archived_at IS NULL
          LIMIT 1
        ),
        (
          SELECT family_space_id
          FROM user_memberships
          WHERE archived_at IS NULL
          ORDER BY created_at ASC
          LIMIT 1
        )
      ) AS family_space_id
    )
    SELECT
      (
        SELECT json_build_object(
          'id', u.id,
          'displayName', u.display_name
        )
        FROM "users" u
        WHERE u.id = (SELECT user_id FROM current_session)
      ) AS "currentUser",
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', id,
              'familySpaceId', family_space_id,
              'role', role,
              'familySpace', json_build_object(
                'id', family_space_id,
                'name', family_space_name
              )
            )
            ORDER BY created_at ASC
          )
          FROM user_memberships
          WHERE archived_at IS NULL
        ),
        '[]'::json
      ) AS "memberships",
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', id,
              'familySpaceId', family_space_id,
              'role', role,
              'familySpace', json_build_object(
                'id', family_space_id,
                'name', family_space_name
              )
            )
            ORDER BY created_at ASC
          )
          FROM user_memberships
          WHERE archived_at IS NOT NULL
        ),
        '[]'::json
      ) AS "archivedMemberships",
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
          'titlePresets', COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id', tp.id,
                  'name', tp.name
                )
                ORDER BY tp.sort_order ASC, tp.created_at ASC
              )
              FROM "event_title_presets" tp
              WHERE tp.family_space_id = fs.id
            ),
            '[]'::json
          ),
          'recentlyDeletedEvents', COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id', deleted_event.id,
                  'title', deleted_event.title,
                  'startsAt', deleted_event.starts_at,
                  'deletedAt', deleted_event.deleted_at,
                  'recurrenceSeriesId', deleted_event.recurrence_series_id,
                  'recurrenceRule', deleted_event.recurrence_rule,
                  'deletedCount', deleted_event.deleted_count
                )
                ORDER BY deleted_event.deleted_at DESC
              )
              FROM (
                SELECT
                  e.id,
                  e.title,
                  e.starts_at,
                  e.deleted_at,
                  e.recurrence_series_id,
                  e.recurrence_rule,
                  CASE
                    WHEN e.recurrence_series_id IS NULL THEN 1
                    ELSE (
                      SELECT COUNT(*)::int
                      FROM "events" series_event
                      WHERE series_event.family_space_id = e.family_space_id
                        AND series_event.recurrence_series_id = e.recurrence_series_id
                        AND series_event.deleted_at IS NOT NULL
                    )
                  END AS deleted_count
                FROM "events" e
                WHERE e.family_space_id = fs.id
                  AND e.deleted_at IS NOT NULL
                  AND (
                    e.recurrence_series_id IS NULL
                    OR e.id = (
                      SELECT latest_series_event.id
                      FROM "events" latest_series_event
                      WHERE latest_series_event.family_space_id = e.family_space_id
                        AND latest_series_event.recurrence_series_id = e.recurrence_series_id
                        AND latest_series_event.deleted_at IS NOT NULL
                      ORDER BY latest_series_event.deleted_at DESC, latest_series_event.starts_at DESC
                      LIMIT 1
                    )
                  )
                ORDER BY e.deleted_at DESC
                LIMIT 20
              ) deleted_event
            ),
            '[]'::json
          ),
          'upcomingEvents', COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id', upcoming_event.id,
                  'title', upcoming_event.title,
                  'startsAt', upcoming_event.starts_at,
                  'endsAt', upcoming_event.ends_at,
                  'isAllDay', upcoming_event.is_all_day,
                  'location', upcoming_event.location,
                  'note', upcoming_event.note,
                  'labelColor', upcoming_event.label_color
                )
                ORDER BY upcoming_event.starts_at ASC
              )
              FROM (
                SELECT
                  e.id,
                  e.title,
                  e.starts_at,
                  e.ends_at,
                  e.is_all_day,
                  e.location,
                  e.note,
                  COALESCE(e.label_color, upcoming_category.color) AS label_color
                FROM "events" e
                LEFT JOIN "event_categories" upcoming_category ON upcoming_category.id = e.category_id
                WHERE e.family_space_id = fs.id
                  AND e.deleted_at IS NULL
                  AND e.starts_at >= ${upcomingStart}
                  AND e.starts_at <= ${upcomingEnd}
                ORDER BY e.starts_at ASC
                LIMIT 200
              ) upcoming_event
            ),
            '[]'::json
          ),
          'recentActivity', COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id', activity.id,
                  'action', activity.action,
                  'eventTitle', activity.event_title,
                  'scope', activity.scope,
                  'createdAt', activity.created_at,
                  'userName', activity.user_name
                )
                ORDER BY activity.created_at DESC
              )
              FROM (
                SELECT
                  log.id,
                  log.action,
                  log.event_title,
                  log.scope,
                  TO_CHAR(log.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
                  log_user.display_name AS user_name
                FROM "event_change_logs" log
                JOIN "users" log_user ON log_user.id = log.user_id
                WHERE log.family_space_id = fs.id
                ORDER BY log.created_at DESC
                LIMIT 20
              ) activity
            ),
            '[]'::json
          ),
          'events', COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id', e.id,
                  'categoryId', e.category_id,
                  'labelColor', e.label_color,
                  'title', e.title,
                  'startsAt', e.starts_at,
                  'endsAt', e.ends_at,
                  'isAllDay', e.is_all_day,
                  'location', e.location,
                  'note', e.note,
                  'assignedTo', e.assigned_to,
                  'recurrenceSeriesId', e.recurrence_series_id,
                  'recurrenceRule', e.recurrence_rule,
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
      currentUserName={calendarData.currentUser?.displayName ?? ""}
      family={family}
      memberships={calendarData.memberships}
      archivedMemberships={calendarData.archivedMemberships}
      initialMonth={formatMonthInput(monthDate)}
      initialDay={formatDateInput(selectedDate)}
      initialModal={normalizeModal(params.modal)}
      initialEventId={params.event}
    />
  );
}
