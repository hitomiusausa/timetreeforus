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
  Settings,
  SquarePen,
  X,
  Trash2,
  Users,
} from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { createEventAction, deleteEventAction, updateEventAction } from "@/app/actions/events";
import {
  createCalendarAction,
  createTitlePresetAction,
  deleteCalendarAction,
  deleteTitlePresetAction,
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
  parseDate,
  parseMonth,
} from "@/lib/calendar";
import { titleLabelColors } from "@/lib/categories";

type ModalMode = "day" | "event" | "edit" | null;

type CalendarMembership = {
  id: string;
  familySpaceId: string;
  familySpace: {
    id: string;
    name: string;
  };
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
};

type CalendarWorkspaceProps = {
  currentUserName: string;
  family: CalendarFamily;
  memberships: CalendarMembership[];
  initialMonth: string;
  initialDay: string;
  initialModal: ModalMode;
  initialEventId?: string;
};

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
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
  const today = new Date();
  const todayKey = formatDateInput(today);
  const thisMonth = formatMonthInput(today);
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
  const copySourceDateKey = copySourceEvent ? formatDateInput(asDate(copySourceEvent.startsAt)) : eventFormDateKey;
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
  const canAutoRefresh = !modal && !settingsOpen && !exportOpen && !logoutConfirmOpen;
  const currentMembership = memberships.find((membership) => membership.familySpaceId === family.id);

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
  }, [canAutoRefresh, refreshCalendar]);

  function openDay(key: string) {
    const nextModal = (eventsByDay.get(key)?.length ?? 0) > 0 ? "day" : "event";
    setSelectedDayKey(key);
    setEventFormDateKey(key);
    setEditingEventId(null);
    setCopySourceEvent(null);
    setModal(nextModal);
    updateCalendarUrl(family.id, monthKey, key, nextModal);
  }

  function closeModal() {
    setModal(null);
    setEditingEventId(null);
    setCopySourceEvent(null);
    updateCalendarUrl(family.id, monthKey, selectedDayKey, null);
  }

  function openAddForm() {
    setEditingEventId(null);
    setCopySourceEvent(null);
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
    setModal("event");
    updateCalendarUrl(family.id, monthKey, eventDateKey, "event");
  }

  function openEditForm(eventId: string) {
    setEditingEventId(eventId);
    setCopySourceEvent(null);
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
            <div>
              <p className="eyebrow">Month</p>
              <h2>{monthLabel}</h2>
            </div>
            <div className="toolbar-actions">
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
              <Link
                className="icon-button"
                href={`/calendar?family=${family.id}&month=${nextMonth}&day=${selectedDayKey}`}
                aria-label="次の月"
                title="次の月"
              >
                <ChevronRight aria-hidden="true" size={19} />
              </Link>
            </div>
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

              return (
                <button
                  className={`day-cell ${isOutsideMonth ? "muted-day" : ""} ${
                    isSelected ? "selected-day" : ""
                  }`}
                  key={key}
                  onClick={() => openDay(key)}
                  type="button"
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

                        <details className="calendar-delete-details">
                          <summary>このカレンダーを削除</summary>
                          <form action={deleteCalendarAction} className="calendar-delete-form">
                            <input type="hidden" name="familySpaceId" value={membership.familySpaceId} />
                            <input type="hidden" name="currentFamilySpaceId" value={family.id} />
                            <label htmlFor={`deleteCalendar-${membership.id}`}>確認のため「削除」と入力</label>
                            <div className="inline-form-row">
                              <input
                                id={`deleteCalendar-${membership.id}`}
                                name="confirmDelete"
                                placeholder="削除"
                                required
                              />
                              <button className="danger-button" type="submit">
                                削除
                              </button>
                            </div>
                          </form>
                        </details>
                      </article>
                    ))}
                  </div>
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
                            <form action={deleteEventAction}>
                              <input type="hidden" name="eventId" value={event.id} />
                              <input type="hidden" name="familySpaceId" value={family.id} />
                              <input type="hidden" name="day" value={selectedDayKey} />
                              <button className="mini-icon-button" type="submit" aria-label="予定を削除" title="予定を削除">
                                <Trash2 aria-hidden="true" size={16} />
                              </button>
                            </form>
                          </div>
                        </div>
                        <p className="event-meta">
                          <PencilLine aria-hidden="true" size={14} />
                          入力: {event.creator.displayName}
                        </p>
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

                <div className="two-cols">
                  <div>
                    <label htmlFor="date">開始日</label>
                    <input
                      id="date"
                      name="date"
                      type="date"
                      value={eventFormDateKey}
                      onChange={(event) => setEventFormDateKey(event.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="endDate">終了日</label>
                    <input id="endDate" name="endDate" type="date" defaultValue={copySourceDateKey} />
                  </div>
                </div>

                <div className="two-cols">
                  <div>
                    <label htmlFor="repeatRule">繰り返し</label>
                    <select id="repeatRule" name="repeatRule" defaultValue="none">
                      <option value="none">なし</option>
                      <option value="daily">毎日</option>
                      <option value="weekly">毎週</option>
                      <option value="monthly">毎月</option>
                    </select>
                  </div>
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

                <div className="two-cols">
                  <div>
                    <label htmlFor="editDate">開始日</label>
                    <input
                      id="editDate"
                      name="date"
                      type="date"
                      defaultValue={formatDateInput(asDate(editingEvent.startsAt))}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="editEndDate">終了日</label>
                    <input
                      id="editEndDate"
                      name="endDate"
                      type="date"
                      defaultValue={formatDateInput(asDate(editingEvent.startsAt))}
                    />
                  </div>
                </div>

                <div className="two-cols">
                  <div>
                    <label htmlFor="editRepeatRule">繰り返し</label>
                    <select id="editRepeatRule" name="repeatRule" defaultValue="none">
                      <option value="none">なし</option>
                      <option value="daily">毎日</option>
                      <option value="weekly">毎週</option>
                      <option value="monthly">毎月</option>
                    </select>
                  </div>
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

                <CopyDatesField inputId="editCopyDates" baseDate={formatDateInput(asDate(editingEvent.startsAt))} />

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
