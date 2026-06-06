"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  PencilLine,
  LogOut,
  MapPin,
  Settings,
  SquarePen,
  X,
  Trash2,
  Users,
} from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { createEventAction, deleteEventAction, updateEventAction } from "@/app/actions/events";
import { createCalendarAction, deleteCalendarAction, updateCalendarNameAction } from "@/app/actions/family";
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

type CalendarEvent = {
  id: string;
  categoryId: string | null;
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
  events: CalendarEvent[];
};

type CalendarWorkspaceProps = {
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
  family,
  memberships,
  initialMonth,
  initialDay,
  initialModal,
  initialEventId,
}: CalendarWorkspaceProps) {
  const [selectedDayKey, setSelectedDayKey] = useState(initialDay);
  const [modal, setModal] = useState<ModalMode>(initialModal);
  const [editingEventId, setEditingEventId] = useState(initialEventId ?? null);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const editingEvent = editingEventId ? family.events.find((event) => event.id === editingEventId) : null;
  const showSelectedDayModal = modal === "day";
  const showEventFormModal = modal === "event";
  const showEditEventModal = modal === "edit" && editingEvent;

  function openDay(key: string) {
    const nextModal = (eventsByDay.get(key)?.length ?? 0) > 0 ? "day" : "event";
    setSelectedDayKey(key);
    setEditingEventId(null);
    setModal(nextModal);
    updateCalendarUrl(family.id, monthKey, key, nextModal);
  }

  function closeModal() {
    setModal(null);
    setEditingEventId(null);
    updateCalendarUrl(family.id, monthKey, selectedDayKey, null);
  }

  function openAddForm() {
    setEditingEventId(null);
    setModal("event");
    updateCalendarUrl(family.id, monthKey, selectedDayKey, "event");
  }

  function openEditForm(eventId: string) {
    setEditingEventId(eventId);
    setModal("edit");
    updateCalendarUrl(family.id, monthKey, selectedDayKey, "edit", eventId);
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
          <form action={logoutAction}>
            <button className="icon-button" type="submit" aria-label="ログアウト" title="ログアウト">
              <LogOut aria-hidden="true" size={19} />
            </button>
          </form>
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
              <Link className="today-button" href={`/calendar?family=${family.id}&month=${thisMonth}&day=${todayKey}`}>
                今日
              </Link>
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
                    {dayEvents.slice(0, 2).map((event) => (
                      <span
                        className="event-pill"
                        key={event.id}
                        style={{
                          backgroundColor: event.category?.color ?? "#e4e6e5",
                          color: getLabelTextColor(event.category?.color),
                        }}
                      >
                        {event.title}
                      </span>
                    ))}
                  </div>
                  {dayEvents.length > 2 ? <span className="more-pill">+{dayEvents.length - 2}</span> : null}
                </button>
              );
            })}
          </div>
        </section>

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
                  <div className="section-title">
                    <Users aria-hidden="true" size={18} />
                    <h3>家族</h3>
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
                </section>

                <section className="settings-section">
                  <h3>招待コード</h3>
                  <div className="invite-code">{family.inviteCode}</div>
                </section>

                <section className="settings-section">
                  <h3>カレンダー</h3>
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

                        <form action={updateCalendarNameAction} className="calendar-name-form">
                          <input type="hidden" name="familySpaceId" value={membership.familySpaceId} />
                          <input type="hidden" name="currentFamilySpaceId" value={family.id} />
                          <label htmlFor={`calendarName-${membership.id}`}>名前を変更</label>
                          <div className="inline-form-row">
                            <input
                              id={`calendarName-${membership.id}`}
                              name="name"
                              defaultValue={membership.familySpace.name}
                              required
                            />
                            <button className="secondary-button" type="submit">
                              保存
                            </button>
                          </div>
                        </form>

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

                    return (
                      <article className="event-card" key={event.id}>
                        <div className="event-card-head">
                          <span
                            className="category-bar"
                            style={{ backgroundColor: event.category?.color ?? "#6b7280" }}
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
                        {event.assignee ? <p className="event-meta">担当: {event.assignee.displayName}</p> : null}
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

              <form action={createEventAction} className="event-form modal-event-form" key={`create-${selectedDayKey}`}>
                <input type="hidden" name="familySpaceId" value={family.id} />

                <div>
                  <label htmlFor="titlePreset">タイトル</label>
                  <select id="titlePreset" name="titlePreset" defaultValue="">
                    <option value="">選択してください</option>
                    {titleOptions.map((option) => (
                      <option value={option} key={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="titleCustom">自由記述</label>
                  <input id="titleCustom" name="titleCustom" placeholder="例: 子どもの発表会" />
                </div>

                <div className="two-cols">
                  <div>
                    <label htmlFor="date">開始日</label>
                    <input id="date" name="date" type="date" defaultValue={selectedDayKey} required />
                  </div>
                  <div>
                    <label htmlFor="endDate">終了日</label>
                    <input id="endDate" name="endDate" type="date" defaultValue={selectedDayKey} />
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
                    <input name="isAllDay" type="checkbox" />
                    終日
                  </label>
                </div>

                <div className="two-cols">
                  <div>
                    <label htmlFor="startTime">開始</label>
                    <input id="startTime" name="startTime" type="time" defaultValue="09:00" />
                  </div>
                  <div>
                    <label htmlFor="endTime">終了</label>
                    <input id="endTime" name="endTime" type="time" defaultValue="10:00" />
                  </div>
                </div>

                <div className="two-cols">
                  <div>
                    <label htmlFor="assignedTo">担当</label>
                    <select id="assignedTo" name="assignedTo" defaultValue="">
                      <option value="">未設定</option>
                      {family.members.map((member) => (
                        <option value={member.userId} key={member.id}>
                          {member.user.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="categoryId">カテゴリ</label>
                    <select id="categoryId" name="categoryId" defaultValue={family.categories[0]?.id ?? ""}>
                      <option value="">なし</option>
                      {family.categories.map((category) => (
                        <option value={category.id} key={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="location">場所</label>
                  <input id="location" name="location" placeholder="例: 駅前クリニック" />
                </div>

                <div>
                  <label htmlFor="note">メモ</label>
                  <textarea id="note" name="note" rows={3} placeholder="持ち物や連絡事項" />
                </div>

                <button className="primary-button" type="submit">
                  予定を保存
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
                    defaultValue={titleOptions.includes(editingEvent.title) ? editingEvent.title : ""}
                  >
                    <option value="">選択してください</option>
                    {titleOptions.map((option) => (
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
                    defaultValue={titleOptions.includes(editingEvent.title) ? "" : editingEvent.title}
                    placeholder="例: 子どもの発表会"
                  />
                </div>

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

                <div className="two-cols">
                  <div>
                    <label htmlFor="editAssignedTo">担当</label>
                    <select id="editAssignedTo" name="assignedTo" defaultValue={editingEvent.assignedTo ?? ""}>
                      <option value="">未設定</option>
                      {family.members.map((member) => (
                        <option value={member.userId} key={member.id}>
                          {member.user.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="editCategoryId">カテゴリ</label>
                    <select id="editCategoryId" name="categoryId" defaultValue={editingEvent.categoryId ?? ""}>
                      <option value="">なし</option>
                      {family.categories.map((category) => (
                        <option value={category.id} key={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

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
