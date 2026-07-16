"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  FileDown,
  PencilLine,
  RefreshCw,
  LogOut,
  MapPin,
  Send,
  Search,
  Settings,
  SquarePen,
  X,
  Trash2,
  Users,
} from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { createEventAction, deleteEventAction, restoreEventAction, updateEventAction } from "@/app/actions/events";
import {
  archiveCalendarAction,
  createCalendarAction,
  createTitlePresetAction,
  deleteTitlePresetAction,
  regenerateInviteCodeAction,
  restoreCalendarAction,
  updateCalendarNameAction,
} from "@/app/actions/family";
import {
  addMonths,
  buildMonthGrid,
  formatDateInput,
  formatJapaneseDate,
  formatMonthInput,
  formatTime,
  formatTimeInput,
  getTodayDateKey,
  parseDate,
  parseMonth,
} from "@/lib/calendar";
import { titleLabelColors } from "@/lib/categories";

type ModalMode = "day" | "event" | "edit" | null;
type EditScope = "occurrence" | "future" | "series";

type CalendarMembership = {
  id: string;
  familySpaceId: string;
  role: string;
  familySpace: {
    id: string;
    name: string;
  };
};

type ArchivedCalendarMembership = CalendarMembership;

type RecentlyDeletedEvent = {
  id: string;
  title: string;
  startsAt: string;
  deletedAt: string;
  recurrenceSeriesId: string | null;
  recurrenceRule: string | null;
  deletedCount: number;
};

type UpcomingEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  isAllDay: boolean;
  location: string | null;
  note: string | null;
  labelColor: string | null;
};

type RecentActivity = {
  id: string;
  action: string;
  eventTitle: string;
  scope: string;
  createdAt: string;
  userName: string;
};

type CalendarMember = {
  id: string;
  userId: string;
  role: string;
  color: string;
  user: {
    id: string;
    displayName: string;
  };
};

type CalendarCategory = {
  id: string;
  name: string;
  color: string;
};

type CalendarTitlePreset = {
  id: string;
  name: string;
};

type CalendarEvent = {
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
  category: CalendarCategory | null;
  assignee: {
    id: string;
    displayName: string;
  } | null;
  assignees: {
    id: string;
    displayName: string;
  }[];
  creator: {
    id: string;
    displayName: string;
  };
};

type CalendarFamily = {
  id: string;
  name: string;
  inviteCode: string;
  members: CalendarMember[];
  categories: CalendarCategory[];
  titlePresets: CalendarTitlePreset[];
  events: CalendarEvent[];
  recentlyDeletedEvents: RecentlyDeletedEvent[];
  upcomingEvents: UpcomingEvent[];
  recentActivity: RecentActivity[];
};

type CalendarWorkspaceProps = {
  currentUserName: string;
  family: CalendarFamily;
  memberships: CalendarMembership[];
  archivedMemberships: ArchivedCalendarMembership[];
  initialMonth: string;
  initialDay: string;
  initialModal: ModalMode;
  initialEventId?: string;
};

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
let hasOpenedCalendarInThisDocument = false;
const repeatRuleLabels: Record<string, string> = {
  daily: "毎日",
  weekly: "毎週",
  monthly: "毎月",
};
const activityLabels: Record<string, string> = {
  created: "作成",
  updated: "編集",
  deleted: "削除",
  restored: "復元",
};
const titleOptions = [
  "デート",
  "旅行",
  "ダンス",
  "麻雀",
  "病院",
  "買い物",
  "洗車",
  "アポ",
  "ミーティング",
  "会議",
  "電話",
  "オフ",
  "パーティ",
  "練習",
  "イベント",
  "耳鼻科",
  "歯医者",
  "皮膚科",
  "内科",
  "リハビリ",
  "トレーニング",
  "食事会",
  "仕事",
  "学校",
  "美容院",
  "ジム",
  "プール",
  "飲み会",
];

function asDate(value: string) {
  return new Date(value);
}

function getLabelTextColor(backgroundColor?: string | null) {
  if (!backgroundColor?.startsWith("#")) {
    return "#1f2d2b";
  }

  const hex = backgroundColor.slice(1);
  const normalizedHex = hex.length === 3 ? hex.split("").map((value) => value + value).join("") : hex;
  const red = Number.parseInt(normalizedHex.slice(0, 2), 16);
  const green = Number.parseInt(normalizedHex.slice(2, 4), 16);
  const blue = Number.parseInt(normalizedHex.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

  return luminance > 0.58 ? "#1f2d2b" : "#ffffff";
}

function getAssigneeLabel(event: CalendarEvent, memberCount: number) {
  const assignees = event.assignees.length > 0 ? event.assignees : event.assignee ? [event.assignee] : [];

  if (assignees.length === 0) {
    return null;
  }

  if (memberCount > 0 && assignees.length >= memberCount) {
    return "全員";
  }

  return assignees.map((assignee) => assignee.displayName).join("、");
}

function addDateDays(dateKey: string, amount: number) {
  const date = parseDate(dateKey);
  date.setDate(date.getDate() + amount);
  return formatDateInput(date);
}

function buildCopyDateChoices(baseDate: string) {
  return Array.from({ length: 14 }, (_, index) => addDateDays(baseDate, index + 1));
}

function formatCopyDateLabel(dateKey: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(parseDate(dateKey));
}

function getEventLabelColor(event: CalendarEvent) {
  return event.labelColor ?? event.category?.color ?? "#fcf36d";
}

function TitleLabelColorFields({ defaultColor }: { defaultColor?: string | null }) {
  return (
    <div className="title-label-color-box">
      <fieldset className="color-fieldset">
        <legend>自由記述タイトルの色</legend>
        <div className="color-choice-grid">
          {titleLabelColors.map((color, index) => (
            <label className="color-choice" key={color.value}>
              <input
                name="labelColor"
                type="radio"
                value={color.value}
                defaultChecked={defaultColor ? defaultColor === color.value : index === 0}
              />
              <span
                className="color-swatch"
                style={{ "--category-color": color.value } as CSSProperties}
                aria-hidden="true"
              />
              <span>{color.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function CopyDatesField({ inputId, baseDate }: { inputId: string; baseDate: string }) {
  const [draftDate, setDraftDate] = useState("");
  const [copyDates, setCopyDates] = useState<string[]>([]);
  const copyDateChoices = useMemo(() => buildCopyDateChoices(baseDate), [baseDate]);
  const shortcutDates = useMemo(
    () => [
      { label: "翌日", value: addDateDays(baseDate, 1) },
      { label: "1週間後", value: addDateDays(baseDate, 7) },
      { label: "2週間後", value: addDateDays(baseDate, 14) },
    ],
    [baseDate],
  );

  function addCopyDate(dateKey: string) {
    if (!dateKey || dateKey === baseDate) {
      return;
    }

    setCopyDates((currentDates) =>
      currentDates.includes(dateKey) ? currentDates : [...currentDates, dateKey].sort(),
    );
    setDraftDate("");
  }

  function toggleCopyDate(dateKey: string) {
    if (dateKey === baseDate) {
      return;
    }

    setCopyDates((currentDates) =>
      currentDates.includes(dateKey)
        ? currentDates.filter((currentDate) => currentDate !== dateKey)
        : [...currentDates, dateKey].sort(),
    );
  }

  function removeCopyDate(dateKey: string) {
    setCopyDates((currentDates) => currentDates.filter((currentDate) => currentDate !== dateKey));
  }

  return (
    <div className="copy-dates-field">
      <label htmlFor={inputId}>別の日にもコピー</label>
      <p className="field-hint">日付を選ぶとすぐ追加されます。選択済みの日付をもう一度押すと解除できます。</p>
      <div className="copy-date-row">
        <input
          id={inputId}
          type="date"
          value={draftDate}
          aria-label="コピー先の日付を選択"
          onChange={(event) => {
            addCopyDate(event.target.value);
            setDraftDate("");
          }}
        />
      </div>
      <div className="copy-date-shortcuts" aria-label="コピー先の候補日">
        {shortcutDates.map((date) => {
          const isSelected = copyDates.includes(date.value);

          return (
            <button
              className={isSelected ? "is-selected" : ""}
              type="button"
              key={date.label}
              aria-pressed={isSelected}
              onClick={() => toggleCopyDate(date.value)}
            >
              {isSelected ? <Check aria-hidden="true" size={13} /> : null}
              {date.label}
            </button>
          );
        })}
      </div>
      <div className="copy-date-calendar" aria-label="近い日付からコピー先を選択">
        {copyDateChoices.map((dateKey) => {
          const isSelected = copyDates.includes(dateKey);

          return (
            <button
              className={isSelected ? "is-selected" : ""}
              type="button"
              key={dateKey}
              aria-pressed={isSelected}
              onClick={() => toggleCopyDate(dateKey)}
            >
              {isSelected ? <Check aria-hidden="true" size={13} /> : null}
              {formatCopyDateLabel(dateKey)}
            </button>
          );
        })}
      </div>
      {copyDates.length > 0 ? (
        <>
          <p className="copy-date-selected-title">コピー先: {copyDates.length}件</p>
          <div className="copy-date-chips" aria-label="選択中のコピー先日付">
            {copyDates.map((dateKey) => (
              <span className="copy-date-chip" key={dateKey}>
                <input type="hidden" name="copyDates" value={dateKey} />
                {formatCopyDateLabel(dateKey)}
                <button type="button" onClick={() => removeCopyDate(dateKey)} aria-label={`${dateKey}を解除`}>
                  解除
                  <X aria-hidden="true" size={13} />
                </button>
              </span>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function getDefaultRepeatEndDate(dateKey: string) {
  const date = parseDate(dateKey);
  const targetYear = date.getFullYear() + 1;
  const targetMonth = date.getMonth();
  const targetDay = Math.min(date.getDate(), new Date(targetYear, targetMonth + 1, 0).getDate());
  return formatDateInput(new Date(targetYear, targetMonth, targetDay));
}

function RepeatFields({ baseDate }: { baseDate: string }) {
  const [repeatRule, setRepeatRule] = useState("none");
  const endDateId = "endDate";
  const repeatRuleId = "repeatRule";

  return (
    <div className="two-cols recurrence-fields">
      <div>
        <label htmlFor={repeatRuleId}>繰り返し</label>
        <select
          id={repeatRuleId}
          name="repeatRule"
          value={repeatRule}
          onChange={(event) => setRepeatRule(event.target.value)}
        >
          <option value="none">なし</option>
          <option value="daily">毎日</option>
          <option value="weekly">毎週</option>
          <option value="monthly">毎月</option>
        </select>
      </div>
      {repeatRule !== "none" ? (
        <div>
          <label htmlFor={endDateId}>繰り返し終了日</label>
          <input
            id={endDateId}
            name="endDate"
            type="date"
            min={baseDate}
            max={getDefaultRepeatEndDate(baseDate)}
            defaultValue={getDefaultRepeatEndDate(baseDate)}
            key={`${endDateId}-${baseDate}`}
            required
          />
          <p className="field-hint">初期値は1年後です。終了日を含めて予定を作成します。</p>
        </div>
      ) : null}
    </div>
  );
}

function updateCalendarUrl(familyId: string, month: string, day: string, modal: ModalMode, eventId?: string) {
  const params = new URLSearchParams({ family: familyId, month, day });

  if (modal) {
    params.set("modal", modal);
  }

  if (eventId) {
    params.set("event", eventId);
  }

  window.history.replaceState(null, "", `/calendar?${params.toString()}`);
}

export function CalendarWorkspace({
  currentUserName,
  family,
  memberships,
  archivedMemberships,
  initialMonth,
  initialDay,
  initialModal,
  initialEventId,
}: CalendarWorkspaceProps) {
  const router = useRouter();
  const [selectedDayKey, setSelectedDayKey] = useState(initialDay);
  const [modal, setModal] = useState<ModalMode>(initialModal);
  const [editingEventId, setEditingEventId] = useState(initialEventId ?? null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [agendaQuery, setAgendaQuery] = useState("");
  const [deletingEvent, setDeletingEvent] = useState<CalendarEvent | null>(null);
  const [editScope, setEditScope] = useState<EditScope>("occurrence");
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  const [copySourceEvent, setCopySourceEvent] = useState<CalendarEvent | null>(null);
  const [eventFormDateKey, setEventFormDateKey] = useState(initialDay);
  const monthDate = parseMonth(initialMonth);
  const monthKey = formatMonthInput(monthDate);
  const monthDays = buildMonthGrid(monthDate);
  const currentMonth = monthDate.getMonth();
  const selectedDate = parseDate(selectedDayKey);
  const previousMonth = formatMonthInput(addMonths(monthDate, -1));
  const nextMonth = formatMonthInput(addMonths(monthDate, 1));
  const todayKey = getTodayDateKey();
  const thisMonth = todayKey.slice(0, 7);
  const monthLabel = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
  }).format(monthDate);

  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>();

    for (const event of family.events) {
      const key = formatDateInput(asDate(event.startsAt));
      grouped.set(key, [...(grouped.get(key) ?? []), event]);
    }

    return grouped;
  }, [family.events]);

  const selectedEvents = eventsByDay.get(selectedDayKey) ?? [];
  const availableTitleOptions = useMemo(() => {
    const options = new Set(titleOptions);

    for (const preset of family.titlePresets) {
      options.add(preset.name);
    }

    return Array.from(options);
  }, [family.titlePresets]);
  const editingEvent = editingEventId ? family.events.find((event) => event.id === editingEventId) : null;
  const copySourceTitleIsPreset = copySourceEvent ? availableTitleOptions.includes(copySourceEvent.title) : false;
  const copySourceAssignedUserIds = new Set(
    copySourceEvent
      ? copySourceEvent.assignees.length > 0
        ? copySourceEvent.assignees.map((assignee) => assignee.id)
        : copySourceEvent.assignedTo
          ? [copySourceEvent.assignedTo]
          : []
      : [],
  );
  const copySourceAssignsEveryone =
    family.members.length > 0 && copySourceAssignedUserIds.size >= family.members.length;
  const editingAssignedUserIds = new Set(
    editingEvent
      ? editingEvent.assignees.length > 0
        ? editingEvent.assignees.map((assignee) => assignee.id)
        : editingEvent.assignedTo
          ? [editingEvent.assignedTo]
          : []
      : [],
  );
  const editingAssignsEveryone = family.members.length > 0 && editingAssignedUserIds.size >= family.members.length;
  const showSelectedDayModal = modal === "day";
  const showEventFormModal = modal === "event";
  const showEditEventModal = modal === "edit" && editingEvent;
  const canAutoRefresh = !modal && !settingsOpen && !exportOpen && !logoutConfirmOpen && !agendaOpen;
  const currentMembership = memberships.find((membership) => membership.familySpaceId === family.id);
  const filteredUpcomingEvents = useMemo(() => {
    const query = agendaQuery.trim().toLocaleLowerCase("ja");

    if (!query) {
      return family.upcomingEvents;
    }

    return family.upcomingEvents.filter((event) =>
      [event.title, event.location, event.note].filter(Boolean).some((value) => value!.toLocaleLowerCase("ja").includes(query)),
    );
  }, [agendaQuery, family.upcomingEvents]);

  useEffect(() => {
    if (hasOpenedCalendarInThisDocument) {
      return;
    }

    hasOpenedCalendarInThisDocument = true;

    if (!initialModal && (initialMonth !== thisMonth || initialDay !== todayKey)) {
      router.replace(`/calendar?family=${family.id}&month=${thisMonth}&day=${todayKey}`);
    }
  }, [family.id, initialDay, initialModal, initialMonth, router, thisMonth, todayKey]);

  const refreshCalendar = useCallback(() => {
    router.refresh();
  }, [router]);

  useEffect(() => {
    if (!canAutoRefresh) {
      return;
    }

    const intervalId = window.setInterval(refreshCalendar, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [canAutoRefresh, refreshCalendar]);

  useEffect(() => {
    if (!canAutoRefresh) {
      return;
    }

    function refreshWhenActive() {
      if (document.visibilityState === "visible") {
        const activeTodayKey = getTodayDateKey();

        if (activeTodayKey !== todayKey) {
          router.replace(
            `/calendar?family=${family.id}&month=${activeTodayKey.slice(0, 7)}&day=${activeTodayKey}`,
          );
          return;
        }

        refreshCalendar();
      }
    }

    window.addEventListener("focus", refreshWhenActive);
    window.addEventListener("pageshow", refreshWhenActive);
    document.addEventListener("visibilitychange", refreshWhenActive);

    return () => {
      window.removeEventListener("focus", refreshWhenActive);
      window.removeEventListener("pageshow", refreshWhenActive);
      document.removeEventListener("visibilitychange", refreshWhenActive);
    };
  }, [canAutoRefresh, family.id, refreshCalendar, router, todayKey]);

  function openDay(key: string) {
    const nextModal = (eventsByDay.get(key)?.length ?? 0) > 0 ? "day" : "event";
    setSelectedDayKey(key);
    setEventFormDateKey(key);
    setEditingEventId(null);
    setCopySourceEvent(null);
    setDeletingEvent(null);
    setModal(nextModal);
    updateCalendarUrl(family.id, monthKey, key, nextModal);
  }

  function closeModal() {
    setModal(null);
    setEditingEventId(null);
    setCopySourceEvent(null);
    setDeletingEvent(null);
    updateCalendarUrl(family.id, monthKey, selectedDayKey, null);
  }

  function openAddForm() {
    setEditingEventId(null);
    setCopySourceEvent(null);
    setDeletingEvent(null);
    setEventFormDateKey(selectedDayKey);
    setModal("event");
    updateCalendarUrl(family.id, monthKey, selectedDayKey, "event");
  }

  function openCopyForm(event: CalendarEvent) {
    const eventDateKey = formatDateInput(asDate(event.startsAt));
    setSelectedDayKey(eventDateKey);
    setEventFormDateKey(eventDateKey);
    setEditingEventId(null);
    setCopySourceEvent(event);
    setDeletingEvent(null);
    setModal("event");
    updateCalendarUrl(family.id, monthKey, eventDateKey, "event");
  }

  function openEditForm(eventId: string) {
    setEditingEventId(eventId);
    setCopySourceEvent(null);
    setDeletingEvent(null);
    setEditScope("occurrence");
    setModal("edit");
    updateCalendarUrl(family.id, monthKey, selectedDayKey, "edit", eventId);
  }

  function selectToday() {
    setSelectedDayKey(todayKey);
    setEventFormDateKey(todayKey);
    setEditingEventId(null);
    setCopySourceEvent(null);
    setModal(null);

    if (monthKey === thisMonth) {
      updateCalendarUrl(family.id, thisMonth, todayKey, null);
      return;
    }

    router.push(`/calendar?family=${family.id}&month=${thisMonth}&day=${todayKey}`);
  }

  function getInviteUrl() {
    const invitePath = `/join?invite=${encodeURIComponent(family.inviteCode)}`;

    if (typeof window === "undefined") {
      return invitePath;
    }

    return `${window.location.origin}${invitePath}`;
  }

  function showInviteFeedback(message: string) {
    setInviteFeedback(message);
    window.setTimeout(() => setInviteFeedback(null), 2200);
  }

  async function copyInviteCode() {
    try {
      await navigator.clipboard.writeText(family.inviteCode);
      showInviteFeedback("招待コードをコピーしました");
    } catch {
      showInviteFeedback("コピーできませんでした");
    }
  }

  async function shareInviteMessage() {
    const inviteUrl = getInviteUrl();
    const senderName = currentUserName || "家族";
    const inviteText = `TimeTree For Usで家族のカレンダーを作ろう。${senderName}さんから「${family.name}」カレンダーに招待されています。リンクをクリックしてさっそく参加してください。`;
    const shareText = `${inviteText}\n\n参加リンク:\n${inviteUrl}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "TimeTree For Us",
          text: shareText,
        });
        return;
      }

      await navigator.clipboard.writeText(shareText);
      showInviteFeedback("招待メッセージをコピーしました");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      showInviteFeedback("共有できませんでした");
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="app-title-lockup">
          <Image className="app-logo" src="/logo.webp" alt="" width={54} height={54} priority />
          <div>
            <p className="eyebrow">Shared calendar</p>
            <h1>{family.name}</h1>
          </div>
        </div>
        <div className="app-header-actions">
          <button
            className="icon-button"
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="設定を開く"
            title="設定"
          >
            <Settings aria-hidden="true" size={19} />
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => setLogoutConfirmOpen(true)}
            aria-label="ログアウト"
            title="ログアウト"
          >
            <LogOut aria-hidden="true" size={19} />
          </button>
        </div>
      </header>

      <section className="workspace">
        <section className="calendar-panel">
          <div className="calendar-toolbar">
            <div className="calendar-heading-row">
              <div>
                <p className="eyebrow">Month</p>
                <h2>{monthLabel}</h2>
              </div>
              <div className="toolbar-actions" role="group" aria-label="カレンダーの補助操作">
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => setAgendaOpen(true)}
                  aria-label="予定を検索"
                  title="予定を検索"
                >
                  <Search aria-hidden="true" size={18} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => setExportOpen(true)}
                  aria-label="予定を書き出し"
                  title="書き出し"
                >
                  <FileDown aria-hidden="true" size={18} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  onClick={refreshCalendar}
                  aria-label="カレンダーを更新"
                  title="更新"
                >
                  <RefreshCw aria-hidden="true" size={18} />
                </button>
              </div>
            </div>

            <nav className="month-navigation" aria-label="月の移動">
              <Link
                className="icon-button"
                href={`/calendar?family=${family.id}&month=${previousMonth}&day=${selectedDayKey}`}
                aria-label="前の月"
                title="前の月"
              >
                <ChevronLeft aria-hidden="true" size={19} />
              </Link>
              <button className="today-button" type="button" onClick={selectToday}>
                今日
              </button>
              <Link
                className="icon-button"
                href={`/calendar?family=${family.id}&month=${nextMonth}&day=${selectedDayKey}`}
                aria-label="次の月"
                title="次の月"
              >
                <ChevronRight aria-hidden="true" size={19} />
              </Link>
            </nav>
          </div>

          <div className="weekday-grid">
            {weekdays.map((weekday) => (
              <div key={weekday}>{weekday}</div>
            ))}
          </div>

          <div className="month-grid">
            {monthDays.map((day) => {
              const key = formatDateInput(day);
              const dayEvents = eventsByDay.get(key) ?? [];
              const isOutsideMonth = day.getMonth() !== currentMonth;
              const isSelected = key === selectedDayKey;
              const isToday = key === todayKey;

              return (
                <button
                  className={`day-cell ${isOutsideMonth ? "muted-day" : ""} ${isToday ? "today-day" : ""} ${
                    isSelected ? "selected-day" : ""
                  }`}
                  key={key}
                  onClick={() => openDay(key)}
                  type="button"
                  aria-current={isToday ? "date" : undefined}
                >
                  <span className="day-number">{day.getDate()}</span>
                  <div className="day-events">
                    {dayEvents.slice(0, 4).map((event, eventIndex) => (
                      <span
                        className={`event-pill ${eventIndex >= 3 ? "desktop-only-event" : ""}`}
                        key={event.id}
                        style={{
                          backgroundColor: getEventLabelColor(event),
                          color: getLabelTextColor(getEventLabelColor(event)),
                        }}
                      >
                        {event.title}
                      </span>
                    ))}
                  </div>
                  {dayEvents.length > 3 ? <span className="more-pill mobile-more-pill">+{dayEvents.length - 3}</span> : null}
                  {dayEvents.length > 4 ? <span className="more-pill desktop-more-pill">+{dayEvents.length - 4}</span> : null}
                </button>
              );
            })}
          </div>
        </section>

        {logoutConfirmOpen ? (
          <section className="selected-day-modal" aria-labelledby="logout-title">
            <button
              className="selected-day-backdrop"
              type="button"
              onClick={() => setLogoutConfirmOpen(false)}
              aria-label="ログアウト確認を閉じる"
            />
            <div className="selected-day-dialog confirm-dialog" role="dialog" aria-modal="true">
              <div className="selected-day-header">
                <div>
                  <p className="eyebrow">Confirm</p>
                  <h2 id="logout-title">ログアウトしますか？</h2>
                  <p className="confirm-message">もう一度ログインすれば、同じカレンダーを続きから使えます。</p>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => setLogoutConfirmOpen(false)}
                  aria-label="ログアウト確認を閉じる"
                  title="閉じる"
                >
                  <X aria-hidden="true" size={19} />
                </button>
              </div>

              <div className="confirm-actions">
                <button className="secondary-button" type="button" onClick={() => setLogoutConfirmOpen(false)}>
                  キャンセル
                </button>
                <form action={logoutAction}>
                  <button className="danger-button" type="submit">
                    ログアウトする
                  </button>
                </form>
              </div>
            </div>
          </section>
        ) : null}

        {exportOpen ? (
          <section className="selected-day-modal" aria-labelledby="export-title">
            <button
              className="selected-day-backdrop"
              type="button"
              onClick={() => setExportOpen(false)}
              aria-label="書き出しを閉じる"
            />
            <div className="selected-day-dialog export-dialog" role="dialog" aria-modal="true">
              <div className="selected-day-header">
                <div>
                  <p className="eyebrow">Export</p>
                  <h2 id="export-title">予定を書き出し</h2>
                  <p className="modal-date">{monthLabel}</p>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => setExportOpen(false)}
                  aria-label="書き出しを閉じる"
                  title="閉じる"
                >
                  <X aria-hidden="true" size={19} />
                </button>
              </div>

              <div className="export-option-list">
                <a
                  className="export-option"
                  href={`/api/exports/month?family=${family.id}&month=${monthKey}&format=pdf`}
                  onClick={() => setExportOpen(false)}
                >
                  <span>PDF</span>
                  <small>印刷や共有向け</small>
                </a>
                <a
                  className="export-option"
                  href={`/api/exports/month?family=${family.id}&month=${monthKey}&format=xlsx`}
                  onClick={() => setExportOpen(false)}
                >
                  <span>Excel</span>
                  <small>編集や保存向け</small>
                </a>
                <a
                  className="export-option"
                  href={`/api/exports/month?family=${family.id}&month=${monthKey}&format=txt`}
                  onClick={() => setExportOpen(false)}
                >
                  <span>テキスト</span>
                  <small>メッセージへの貼り付け向け</small>
                </a>
              </div>
            </div>
          </section>
        ) : null}

        {agendaOpen ? (
          <section className="selected-day-modal" aria-labelledby="agenda-title">
            <button
              className="selected-day-backdrop"
              type="button"
              onClick={() => setAgendaOpen(false)}
              aria-label="予定検索を閉じる"
            />
            <div className="selected-day-dialog agenda-dialog" role="dialog" aria-modal="true">
              <div className="selected-day-header">
                <div>
                  <p className="eyebrow">Upcoming</p>
                  <h2 id="agenda-title">今後の予定</h2>
                  <p className="field-hint">今日から1年以内の予定を検索できます。</p>
                </div>
                <button className="icon-button" type="button" onClick={() => setAgendaOpen(false)} aria-label="予定検索を閉じる">
                  <X aria-hidden="true" size={19} />
                </button>
              </div>
              <div className="agenda-search">
                <Search aria-hidden="true" size={17} />
                <input
                  value={agendaQuery}
                  onChange={(event) => setAgendaQuery(event.target.value)}
                  placeholder="タイトル・場所・メモを検索"
                  aria-label="予定を検索"
                  autoFocus
                />
              </div>
              <div className="agenda-list">
                {filteredUpcomingEvents.length > 0 ? (
                  filteredUpcomingEvents.map((event) => {
                    const eventDay = formatDateInput(asDate(event.startsAt));
                    return (
                      <button
                        className="agenda-item"
                        type="button"
                        key={event.id}
                        onClick={() => {
                          setAgendaOpen(false);
                          router.push(`/calendar?family=${family.id}&month=${eventDay.slice(0, 7)}&day=${eventDay}&modal=day`);
                        }}
                      >
                        <span className="agenda-color" style={{ backgroundColor: event.labelColor ?? "#fcf36d" }} />
                        <span>
                          <strong>{event.title}</strong>
                          <small>
                            {formatJapaneseDate(asDate(event.startsAt))}・
                            {event.isAllDay ? "終日" : `${formatTime(asDate(event.startsAt))} - ${formatTime(asDate(event.endsAt))}`}
                          </small>
                          {event.location ? <small>{event.location}</small> : null}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="empty-text">該当する予定はありません。</p>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {settingsOpen ? (
          <section className="selected-day-modal" aria-labelledby="settings-title">
            <button
              className="selected-day-backdrop"
              type="button"
              onClick={() => setSettingsOpen(false)}
              aria-label="設定を閉じる"
            />
            <div className="selected-day-dialog settings-dialog" role="dialog" aria-modal="true">
              <div className="selected-day-header">
                <div>
                  <p className="eyebrow">Settings</p>
                  <h2 id="settings-title">カレンダー設定</h2>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  aria-label="設定を閉じる"
                  title="閉じる"
                >
                  <X aria-hidden="true" size={19} />
                </button>
              </div>

              <div className="settings-content">
                <section className="settings-section">
                  <div className="settings-section-head">
                    <h3>最近削除した予定</h3>
                    <p>削除した予定を元に戻せます。繰り返し予定はまとめて復元できます。</p>
                  </div>
                  {family.recentlyDeletedEvents.length > 0 ? (
                    <div className="deleted-event-list">
                      {family.recentlyDeletedEvents.map((event) => (
                        <article className="deleted-event-item" key={event.id}>
                          <div>
                            <strong>{event.title}</strong>
                            <small>{formatJapaneseDate(asDate(event.startsAt))}</small>
                            {event.recurrenceSeriesId ? (
                              <small>
                                {repeatRuleLabels[event.recurrenceRule ?? ""] ?? "一括作成"}・削除済み{event.deletedCount}件
                              </small>
                            ) : null}
                          </div>
                          <div className="deleted-event-actions">
                            <form action={restoreEventAction}>
                              <input type="hidden" name="eventId" value={event.id} />
                              <input type="hidden" name="familySpaceId" value={family.id} />
                              <input type="hidden" name="restoreScope" value="occurrence" />
                              <button className="secondary-button" type="submit">
                                {event.recurrenceSeriesId ? "この回を復元" : "復元"}
                              </button>
                            </form>
                            {event.recurrenceSeriesId ? (
                              <form action={restoreEventAction}>
                                <input type="hidden" name="eventId" value={event.id} />
                                <input type="hidden" name="familySpaceId" value={family.id} />
                                <input type="hidden" name="restoreScope" value="series" />
                                <button className="secondary-button" type="submit">すべて復元</button>
                              </form>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-text">復元できる予定はありません。</p>
                  )}
                </section>

                <section className="settings-section">
                  <div className="settings-section-head">
                    <h3>変更履歴</h3>
                    <p>予定の作成・編集・削除・復元を新しい順に表示します。</p>
                  </div>
                  {family.recentActivity.length > 0 ? (
                    <div className="activity-list">
                      {family.recentActivity.map((activity) => (
                        <div className="activity-item" key={activity.id}>
                          <span className={`activity-action activity-${activity.action}`}>
                            {activityLabels[activity.action] ?? activity.action}
                          </span>
                          <span>
                            <strong>{activity.eventTitle}</strong>
                            <small>
                              {activity.userName}・{new Intl.DateTimeFormat("ja-JP", {
                                month: "numeric",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              }).format(asDate(activity.createdAt))}
                            </small>
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-text">これからの変更がここに記録されます。</p>
                  )}
                </section>

                <section className="settings-section">
                  <div className="settings-section-head">
                    <h3>表示中のカレンダー</h3>
                    <p>名前の変更、メンバー確認、招待コードの共有ができます。</p>
                  </div>
                  <article className="calendar-management-item current-calendar-item">
                    <div className="calendar-management-head">
                      <div>
                        <p>{currentMembership?.familySpace.name ?? family.name}</p>
                        <small>表示中</small>
                      </div>
                    </div>
                    <form action={updateCalendarNameAction} className="calendar-name-form">
                      <input type="hidden" name="familySpaceId" value={family.id} />
                      <input type="hidden" name="currentFamilySpaceId" value={family.id} />
                      <label htmlFor="currentCalendarName">カレンダー名</label>
                      <div className="inline-form-row">
                        <input id="currentCalendarName" name="name" defaultValue={family.name} required />
                        <button className="secondary-button" type="submit">
                          保存
                        </button>
                      </div>
                    </form>

                    <div className="calendar-family-block">
                      <div className="section-title">
                        <Users aria-hidden="true" size={18} />
                        <h4>家族</h4>
                      </div>
                      <div className="member-list">
                        {family.members.map((member) => (
                          <div className="member-row" key={member.id}>
                            <span className="member-dot" style={{ backgroundColor: member.color }} />
                            <span>{member.user.displayName}</span>
                            {member.role === "admin" ? <small>管理者</small> : null}
                          </div>
                        ))}
                      </div>

                      <div className="invite-block">
                        <h4>招待コード</h4>
                        <div className="invite-code-row">
                          <div className="invite-code">{family.inviteCode}</div>
                          <button
                            className="mini-icon-button invite-copy-button"
                            type="button"
                            onClick={copyInviteCode}
                            aria-label="招待コードをコピー"
                            title="招待コードをコピー"
                          >
                            <Copy aria-hidden="true" size={16} />
                          </button>
                        </div>
                        <button className="secondary-button invite-share-button" type="button" onClick={shareInviteMessage}>
                          <Send aria-hidden="true" size={16} />
                          メッセージで送る
                        </button>
                        {currentMembership?.role === "admin" ? (
                          <details className="invite-regenerate-details">
                            <summary>招待コードを再発行</summary>
                            <p className="field-hint">以前の招待コードとリンクは使えなくなります。</p>
                            <form action={regenerateInviteCodeAction}>
                              <input type="hidden" name="familySpaceId" value={family.id} />
                              <button className="danger-button" type="submit">新しいコードを発行</button>
                            </form>
                          </details>
                        ) : null}
                        {inviteFeedback ? <p className="invite-feedback">{inviteFeedback}</p> : null}
                      </div>
                    </div>
                  </article>
                </section>

                <section className="settings-section">
                  <div className="settings-section-head">
                    <h3>タイトル候補</h3>
                    <p>予定作成時のタイトル候補を追加できます。</p>
                  </div>
                  <form action={createTitlePresetAction} className="title-preset-form">
                    <input type="hidden" name="familySpaceId" value={family.id} />
                    <div>
                      <label htmlFor="newTitlePreset">候補を追加</label>
                      <input id="newTitlePreset" name="name" placeholder="例: いつものクリニック" required />
                    </div>
                    <button className="secondary-button" type="submit">
                      追加
                    </button>
                  </form>

                  {family.titlePresets.length > 0 ? (
                    <div className="title-preset-list">
                      {family.titlePresets.map((preset) => (
                        <div className="title-preset-item" key={preset.id}>
                          <span>{preset.name}</span>
                          <form action={deleteTitlePresetAction}>
                            <input type="hidden" name="familySpaceId" value={family.id} />
                            <input type="hidden" name="titlePresetId" value={preset.id} />
                            <button className="mini-icon-button" type="submit" aria-label={`${preset.name}を削除`} title="削除">
                              <Trash2 aria-hidden="true" size={15} />
                            </button>
                          </form>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>

                <section className="settings-section">
                  <div className="settings-section-head">
                    <h3>カレンダー追加・切り替え</h3>
                    <p>別のカレンダーを作成したり、開くカレンダーを切り替えられます。</p>
                  </div>
                  <form action={createCalendarAction} className="calendar-add-form">
                    <input type="hidden" name="currentFamilySpaceId" value={family.id} />
                    <div>
                      <label htmlFor="newCalendarName">カレンダー追加</label>
                      <input id="newCalendarName" name="name" placeholder="例: 仕事用" required />
                    </div>
                    <button className="secondary-button" type="submit">
                      追加
                    </button>
                  </form>

                  <div className="calendar-management-list">
                    {memberships.map((membership) => (
                      <article className="calendar-management-item" key={membership.id}>
                        <div className="calendar-management-head">
                          <div>
                            <p>{membership.familySpace.name}</p>
                            {membership.familySpaceId === family.id ? <small>表示中</small> : null}
                          </div>
                          <Link
                            aria-current={membership.familySpaceId === family.id ? "page" : undefined}
                            className="calendar-open-link"
                            href={`/calendar?family=${membership.familySpaceId}`}
                          >
                            開く
                          </Link>
                        </div>

                        {membership.role === "admin" ? (
                        <details className="calendar-delete-details">
                          <summary>このカレンダーをアーカイブ</summary>
                          <form action={archiveCalendarAction} className="calendar-delete-form">
                            <input type="hidden" name="familySpaceId" value={membership.familySpaceId} />
                            <input type="hidden" name="currentFamilySpaceId" value={family.id} />
                            <label htmlFor={`deleteCalendar-${membership.id}`}>確認のため「アーカイブ」と入力</label>
                            <div className="inline-form-row">
                              <input
                                id={`deleteCalendar-${membership.id}`}
                                name="confirmDelete"
                                placeholder="アーカイブ"
                                required
                              />
                              <button className="danger-button" type="submit">
                                アーカイブ
                              </button>
                            </div>
                          </form>
                        </details>
                        ) : null}
                      </article>
                    ))}
                  </div>

                  {archivedMemberships.length > 0 ? (
                    <div className="archived-calendar-settings">
                      <h4>アーカイブ済み</h4>
                      {archivedMemberships.map((membership) => (
                        <form action={restoreCalendarAction} className="archived-calendar-item" key={membership.id}>
                          <input type="hidden" name="familySpaceId" value={membership.familySpaceId} />
                          <span>{membership.familySpace.name}</span>
                          {membership.role === "admin" ? (
                            <button className="secondary-button" type="submit">復元</button>
                          ) : (
                            <small>管理者のみ復元できます</small>
                          )}
                        </form>
                      ))}
                    </div>
                  ) : null}
                </section>
              </div>
            </div>
          </section>
        ) : null}

        {showSelectedDayModal ? (
          <section className="selected-day-modal" aria-labelledby="selected-day-title">
            <button
              className="selected-day-backdrop"
              type="button"
              onClick={closeModal}
              aria-label="Selected dayを閉じる"
            />
            <div className="selected-day-dialog" role="dialog" aria-modal="true">
              <div className="selected-day-header">
                <div>
                  <p className="eyebrow">Selected day</p>
                  <h2 id="selected-day-title">{formatJapaneseDate(selectedDate)}</h2>
                </div>
                <button className="icon-button" type="button" onClick={closeModal} aria-label="Selected dayを閉じる" title="閉じる">
                  <X aria-hidden="true" size={19} />
                </button>
              </div>

              <div className="event-list selected-day-list">
                {selectedEvents.length === 0 ? (
                  <p className="empty-text">この日の予定はまだありません。</p>
                ) : (
                  selectedEvents.map((event) => {
                    const startsAt = asDate(event.startsAt);
                    const endsAt = asDate(event.endsAt);
                    const assigneeLabel = getAssigneeLabel(event, family.members.length);

                    return (
                      <article className="event-card" key={event.id}>
                        <div className="event-card-head">
                          <span
                            className="category-bar"
                            style={{ backgroundColor: getEventLabelColor(event) }}
                          />
                          <div>
                            <h3>{event.title}</h3>
                            <p>
                              <Clock aria-hidden="true" size={14} />
                              {event.isAllDay ? "終日" : `${formatTime(startsAt)} - ${formatTime(endsAt)}`}
                            </p>
                          </div>
                          <div className="event-card-actions">
                            <button
                              className="mini-icon-button"
                              type="button"
                              onClick={() => openCopyForm(event)}
                              aria-label="予定を複製"
                              title="予定を複製"
                            >
                              <Copy aria-hidden="true" size={16} />
                            </button>
                            <button
                              className="mini-icon-button"
                              type="button"
                              onClick={() => openEditForm(event.id)}
                              aria-label="予定を編集"
                              title="予定を編集"
                            >
                              <SquarePen aria-hidden="true" size={16} />
                            </button>
                            <button
                              className="mini-icon-button"
                              type="button"
                              onClick={() => setDeletingEvent(event)}
                              aria-label="予定を削除"
                              title="予定を削除"
                            >
                              <Trash2 aria-hidden="true" size={16} />
                            </button>
                          </div>
                        </div>
                        <p className="event-meta">
                          <PencilLine aria-hidden="true" size={14} />
                          入力: {event.creator.displayName}
                        </p>
                        {event.recurrenceSeriesId ? (
                          <p className="event-meta">
                            <RefreshCw aria-hidden="true" size={14} />
                            繰り返し: {repeatRuleLabels[event.recurrenceRule ?? ""] ?? "あり"}
                          </p>
                        ) : null}
                        {assigneeLabel ? <p className="event-meta">担当: {assigneeLabel}</p> : null}
                        {event.location ? (
                          <p className="event-meta">
                            <MapPin aria-hidden="true" size={14} />
                            {event.location}
                          </p>
                        ) : null}
                        {event.note ? <p className="event-note">{event.note}</p> : null}
                      </article>
                    );
                  })
                )}
              </div>

              <button className="primary-button modal-add-button" type="button" onClick={openAddForm}>
                この日に予定を追加
              </button>

              {deletingEvent ? (
                <div className="delete-event-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-event-title">
                  <div>
                    <h3 id="delete-event-title">「{deletingEvent.title}」を削除しますか？</h3>
                    <p className="field-hint">
                      {deletingEvent.recurrenceSeriesId
                        ? "この回だけ削除するか、この繰り返し予定をすべて削除するか選べます。"
                        : "この予定だけを削除します。"}
                    </p>
                  </div>
                  <div className="delete-event-actions">
                    <button className="secondary-button" type="button" onClick={() => setDeletingEvent(null)}>
                      キャンセル
                    </button>
                    <form action={deleteEventAction}>
                      <input type="hidden" name="eventId" value={deletingEvent.id} />
                      <input type="hidden" name="familySpaceId" value={family.id} />
                      <input type="hidden" name="day" value={selectedDayKey} />
                      <input type="hidden" name="deleteScope" value="occurrence" />
                      <button className="danger-button" type="submit">
                        {deletingEvent.recurrenceSeriesId ? "今回だけ消す" : "削除する"}
                      </button>
                    </form>
                    {deletingEvent.recurrenceSeriesId ? (
                      <form action={deleteEventAction}>
                        <input type="hidden" name="eventId" value={deletingEvent.id} />
                        <input type="hidden" name="familySpaceId" value={family.id} />
                        <input type="hidden" name="day" value={selectedDayKey} />
                        <input type="hidden" name="deleteScope" value="series" />
                        <button className="danger-button danger-button-strong" type="submit">
                          すべて消す
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {showEventFormModal ? (
          <section className="selected-day-modal" aria-labelledby="event-form-title">
            <button
              className="selected-day-backdrop"
              type="button"
              onClick={closeModal}
              aria-label="予定追加を閉じる"
            />
            <div className="selected-day-dialog event-form-dialog" role="dialog" aria-modal="true">
              <div className="selected-day-header">
                <div>
                  <p className="eyebrow">Add schedule</p>
                  <h2 id="event-form-title">予定を追加</h2>
                  <p className="modal-date">{formatJapaneseDate(selectedDate)}</p>
                </div>
                <button className="icon-button" type="button" onClick={closeModal} aria-label="予定追加を閉じる" title="閉じる">
                  <X aria-hidden="true" size={19} />
                </button>
              </div>

              <form
                action={createEventAction}
                className="event-form modal-event-form"
                key={`create-${selectedDayKey}-${copySourceEvent?.id ?? "new"}`}
              >
                <input type="hidden" name="familySpaceId" value={family.id} />
                {copySourceEvent ? (
                  <div className="copy-source-banner">
                    <Copy aria-hidden="true" size={16} />
                    <span>コピー元: {copySourceEvent.title}</span>
                  </div>
                ) : null}

                <div>
                  <label htmlFor="titlePreset">タイトル</label>
                  <select
                    id="titlePreset"
                    name="titlePreset"
                    defaultValue={copySourceTitleIsPreset ? copySourceEvent?.title : ""}
                  >
                    <option value="">選択してください</option>
                    {availableTitleOptions.map((option) => (
                      <option value={option} key={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="titleCustom">自由記述</label>
                  <input
                    id="titleCustom"
                    name="titleCustom"
                    defaultValue={copySourceEvent && !copySourceTitleIsPreset ? copySourceEvent.title : ""}
                    placeholder="例: 子どもの発表会"
                  />
                </div>

                <TitleLabelColorFields defaultColor={copySourceEvent?.labelColor} />

                <div>
                  <label htmlFor="date">日付</label>
                  <input
                    id="date"
                    name="date"
                    type="date"
                    value={eventFormDateKey}
                    onChange={(event) => setEventFormDateKey(event.target.value)}
                    required
                  />
                </div>

                <RepeatFields baseDate={eventFormDateKey} />

                <div>
                  <label className="checkbox-row">
                    <input name="isAllDay" type="checkbox" defaultChecked={copySourceEvent?.isAllDay ?? false} />
                    終日
                  </label>
                </div>

                <div className="two-cols">
                  <div>
                    <label htmlFor="startTime">開始</label>
                    <input
                      id="startTime"
                      name="startTime"
                      type="time"
                      defaultValue={copySourceEvent ? formatTimeInput(asDate(copySourceEvent.startsAt)) : "09:00"}
                    />
                  </div>
                  <div>
                    <label htmlFor="endTime">終了</label>
                    <input
                      id="endTime"
                      name="endTime"
                      type="time"
                      defaultValue={copySourceEvent ? formatTimeInput(asDate(copySourceEvent.endsAt)) : "10:00"}
                    />
                  </div>
                </div>

                <CopyDatesField inputId="copyDates" baseDate={eventFormDateKey} />

                <fieldset className="assignee-fieldset">
                  <legend>担当</legend>
                  <div className="assignee-options">
                    <label className="checkbox-row">
                      <input name="assignAll" type="checkbox" defaultChecked={copySourceAssignsEveryone} />
                      全員
                    </label>
                    {family.members.map((member) => (
                      <label className="checkbox-row" key={member.id}>
                        <input
                          name="assignedUserIds"
                          type="checkbox"
                          value={member.userId}
                          defaultChecked={copySourceAssignedUserIds.has(member.userId)}
                        />
                        {member.user.displayName}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <label htmlFor="location">場所</label>
                  <input
                    id="location"
                    name="location"
                    defaultValue={copySourceEvent?.location ?? ""}
                    placeholder="例: 駅前クリニック"
                  />
                </div>

                <div>
                  <label htmlFor="note">メモ</label>
                  <textarea
                    id="note"
                    name="note"
                    rows={3}
                    defaultValue={copySourceEvent?.note ?? ""}
                    placeholder="持ち物や連絡事項"
                  />
                </div>

                <button className="primary-button" type="submit">
                  {copySourceEvent ? "コピーして保存" : "予定を保存"}
                </button>
              </form>
            </div>
          </section>
        ) : null}

        {showEditEventModal ? (
          <section className="selected-day-modal" aria-labelledby="edit-event-form-title">
            <button
              className="selected-day-backdrop"
              type="button"
              onClick={() => {
                setModal("day");
                setEditingEventId(null);
                updateCalendarUrl(family.id, monthKey, selectedDayKey, "day");
              }}
              aria-label="予定編集を閉じる"
            />
            <div className="selected-day-dialog event-form-dialog" role="dialog" aria-modal="true">
              <div className="selected-day-header">
                <div>
                  <p className="eyebrow">Edit schedule</p>
                  <h2 id="edit-event-form-title">予定を編集</h2>
                  <p className="modal-date">{formatJapaneseDate(asDate(editingEvent.startsAt))}</p>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => {
                    setModal("day");
                    setEditingEventId(null);
                    updateCalendarUrl(family.id, monthKey, selectedDayKey, "day");
                  }}
                  aria-label="予定編集を閉じる"
                  title="閉じる"
                >
                  <X aria-hidden="true" size={19} />
                </button>
              </div>

              <form action={updateEventAction} className="event-form modal-event-form" key={`edit-${editingEvent.id}`}>
                <input type="hidden" name="eventId" value={editingEvent.id} />
                <input type="hidden" name="familySpaceId" value={family.id} />

                {editingEvent.recurrenceSeriesId ? (
                  <div>
                    <label htmlFor="editScope">変更する範囲</label>
                    <select
                      id="editScope"
                      name="editScope"
                      value={editScope}
                      onChange={(event) => setEditScope(event.target.value as EditScope)}
                    >
                      <option value="occurrence">今回だけ</option>
                      <option value="future">今回以降すべて</option>
                      <option value="series">すべての予定</option>
                    </select>
                    <p className="field-hint">
                      複数回を選んだ場合、各予定の日付は保ったままタイトル・時間・担当・場所・メモを変更します。
                    </p>
                  </div>
                ) : (
                  <input type="hidden" name="editScope" value="occurrence" />
                )}

                <div>
                  <label htmlFor="editTitlePreset">タイトル</label>
                  <select
                    id="editTitlePreset"
                    name="titlePreset"
                    defaultValue={availableTitleOptions.includes(editingEvent.title) ? editingEvent.title : ""}
                  >
                    <option value="">選択してください</option>
                    {availableTitleOptions.map((option) => (
                      <option value={option} key={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="editTitleCustom">自由記述</label>
                  <input
                    id="editTitleCustom"
                    name="titleCustom"
                    defaultValue={availableTitleOptions.includes(editingEvent.title) ? "" : editingEvent.title}
                    placeholder="例: 子どもの発表会"
                  />
                </div>

                <TitleLabelColorFields defaultColor={editingEvent.labelColor} />

                <div>
                  <label htmlFor="editDate">日付</label>
                  {editScope === "occurrence" ? (
                    <input
                      id="editDate"
                      name="date"
                      type="date"
                      defaultValue={formatDateInput(asDate(editingEvent.startsAt))}
                      required
                    />
                  ) : (
                    <>
                      <input
                        id="editDate"
                        type="date"
                        value={formatDateInput(asDate(editingEvent.startsAt))}
                        disabled
                      />
                      <input type="hidden" name="date" value={formatDateInput(asDate(editingEvent.startsAt))} />
                    </>
                  )}
                </div>

                {editingEvent.recurrenceSeriesId ? (
                  <p className="recurrence-edit-note">
                    {editScope === "occurrence" ? "この回だけを編集します。" : "選択した範囲へ同じ変更を適用します。"}
                  </p>
                ) : null}

                <div>
                  <label className="checkbox-row">
                    <input name="isAllDay" type="checkbox" defaultChecked={editingEvent.isAllDay} />
                    終日
                  </label>
                </div>

                <div className="two-cols">
                  <div>
                    <label htmlFor="editStartTime">開始</label>
                    <input
                      id="editStartTime"
                      name="startTime"
                      type="time"
                      defaultValue={formatTimeInput(asDate(editingEvent.startsAt))}
                    />
                  </div>
                  <div>
                    <label htmlFor="editEndTime">終了</label>
                    <input
                      id="editEndTime"
                      name="endTime"
                      type="time"
                      defaultValue={formatTimeInput(asDate(editingEvent.endsAt))}
                    />
                  </div>
                </div>

                {editScope === "occurrence" ? (
                  <CopyDatesField inputId="editCopyDates" baseDate={formatDateInput(asDate(editingEvent.startsAt))} />
                ) : null}

                <fieldset className="assignee-fieldset">
                  <legend>担当</legend>
                  <div className="assignee-options">
                    <label className="checkbox-row">
                      <input name="assignAll" type="checkbox" defaultChecked={editingAssignsEveryone} />
                      全員
                    </label>
                    {family.members.map((member) => (
                      <label className="checkbox-row" key={member.id}>
                        <input
                          name="assignedUserIds"
                          type="checkbox"
                          value={member.userId}
                          defaultChecked={editingAssignedUserIds.has(member.userId)}
                        />
                        {member.user.displayName}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <label htmlFor="editLocation">場所</label>
                  <input id="editLocation" name="location" defaultValue={editingEvent.location ?? ""} />
                </div>

                <div>
                  <label htmlFor="editNote">メモ</label>
                  <textarea id="editNote" name="note" rows={3} defaultValue={editingEvent.note ?? ""} />
                </div>

                <button className="primary-button" type="submit">
                  変更を保存
                </button>
              </form>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
