"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  PencilLine,
  LogOut,
  MapPin,
  SquarePen,
  X,
  Trash2,
  Users,
} from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { createEventAction, deleteEventAction, updateEventAction } from "@/app/actions/events";
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
  const monthDate = parseMonth(initialMonth);
  const monthKey = formatMonthInput(monthDate);
  const monthDays = buildMonthGrid(monthDate);
  const currentMonth = monthDate.getMonth();
  const selectedDate = parseDate(selectedDayKey);
  const previousMonth = formatMonthInput(addMonths(monthDate, -1));
  const nextMonth = formatMonthInput(addMonths(monthDate, 1));
  const thisMonth = formatMonthInput(new Date());
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
        <div>
          <p className="eyebrow">Shared calendar</p>
          <h1>{family.name}</h1>
        </div>
        <form action={logoutAction}>
          <button className="icon-button" type="submit" aria-label="ログアウト" title="ログアウト">
            <LogOut aria-hidden="true" size={19} />
          </button>
        </form>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <section className="side-section">
            <div className="section-title">
              <Users aria-hidden="true" size={18} />
              <h2>家族</h2>
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

          <section className="side-section">
            <h2>招待コード</h2>
            <div className="invite-code">{family.inviteCode}</div>
          </section>

          {memberships.length > 1 ? (
            <section className="side-section">
              <h2>カレンダー切替</h2>
              <div className="family-switcher">
                {memberships.map((membership) => (
                  <Link
                    aria-current={membership.familySpaceId === family.id ? "page" : undefined}
                    href={`/calendar?family=${membership.familySpaceId}`}
                    key={membership.id}
                  >
                    {membership.familySpace.name}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </aside>

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
              <Link className="today-button" href={`/calendar?family=${family.id}&month=${thisMonth}`}>
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
                    {dayEvents.slice(0, 3).map((event) => (
                      <span
                        className="event-pill"
                        key={event.id}
                        style={{
                          borderColor: event.category?.color ?? "#6b7280",
                          backgroundColor: `${event.category?.color ?? "#6b7280"}18`,
                        }}
                      >
                        {event.title}
                      </span>
                    ))}
                    {dayEvents.length > 3 ? <span className="more-pill">+{dayEvents.length - 3}</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

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
