"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CalendarDay, CalendarEvent, CalendarView } from "@/lib/admin/calendar-data";
import { BookingEditor } from "@/components/admin/booking-editor";
import { cn } from "@/lib/utils";

const PX_PER_MIN = 1.1;
const TZ = "Asia/Bangkok";
const FILTER_KEY = "cr-calendar-branches";

// One color per branch, in branch order, like Apple Calendar's calendars.
const BRANCH_TINTS = [
  { hex: "#1f7a35", text: "text-[#1f7a35]" },
  { hex: "#0071e3", text: "text-[#0060c0]" },
  { hex: "#bf4800", text: "text-[#bf4800]" },
  { hex: "#8944ab", text: "text-[#8944ab]" },
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ---------- date helpers (all in Chiang Mai time) ----------

function dayStartMs(date: string) {
  return new Date(`${date}T00:00:00+07:00`).getTime();
}

function minutesInto(iso: string, date: string) {
  return (new Date(iso).getTime() - dayStartMs(date)) / 60_000;
}

function shift(date: string, days: number) {
  const d = new Date(`${date}T12:00:00+07:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function shiftMonth(date: string, months: number) {
  const [y, m] = date.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1, 12));
  return d.toISOString().slice(0, 10);
}

function localDate(iso: string) {
  return new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

function weekStart(date: string) {
  return shift(date, -new Date(`${date}T12:00:00+07:00`).getUTCDay());
}

function monthGridStart(date: string) {
  return weekStart(`${date.slice(0, 8)}01`);
}

/** Lays overlapping events side by side within one column. */
function assignLanes(events: CalendarEvent[]) {
  const sorted = [...events].sort((a, b) => a.startAt.localeCompare(b.startAt));
  const laneEnds: number[] = [];
  const placed = sorted.map((e) => {
    const start = new Date(e.startAt).getTime();
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = new Date(e.endAt).getTime();
    return { event: e, lane };
  });
  return { placed, lanes: Math.max(1, laneEnds.length) };
}

function statusLabel(e: CalendarEvent, now: number) {
  const start = new Date(e.startAt).getTime();
  const end = new Date(e.endAt).getTime();
  if (e.status === "completed") return "Done";
  if (now >= start && now < end) return `${Math.ceil((end - now) / 60_000)} min left`;
  if (now >= end && e.kind === "walk_in") return "Running over";
  if (now < start) {
    const mins = Math.round((start - now) / 60_000);
    return mins < 90 ? `Starts in ${mins} min` : e.status === "pending" ? "Pending" : "Booked";
  }
  return e.status === "checked_in" ? "Checked in" : "Booked";
}

function hourRange(events: CalendarEvent[], dates: string[]) {
  let s = 9 * 60;
  let e = 23 * 60;
  for (const ev of events) {
    const d = localDate(ev.startAt);
    if (!dates.includes(d)) continue;
    s = Math.min(s, Math.floor(minutesInto(ev.startAt, d) / 60) * 60);
    e = Math.max(e, Math.ceil(minutesInto(ev.endAt, d) / 60) * 60);
  }
  return { startMin: Math.max(0, s), endMin: Math.min(24 * 60, e) };
}

// ---------- shared pieces ----------

function EventBlock({
  e,
  color,
  now,
  isToday,
  top,
  height,
  left,
  width,
  showRoom,
  roomName,
  onOpen,
}: {
  e: CalendarEvent;
  color: string;
  now: number;
  isToday: boolean;
  top: number;
  height: number;
  left: string;
  width: string;
  showRoom?: boolean;
  roomName?: string | null;
  onOpen: (e: CalendarEvent) => void;
}) {
  const live = isToday && e.status !== "completed" && now >= new Date(e.startAt).getTime() && now < new Date(e.endAt).getTime();
  const done = e.status === "completed" || (!live && new Date(e.endAt).getTime() < now);
  return (
    <button
      type="button"
      onClick={() => onOpen(e)}
      title={`${e.therapist ?? "Unassigned"} · ${e.service} · ${clock(e.startAt)}–${clock(e.endAt)}`}
      className={cn(
        "absolute overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left text-[11px] leading-tight transition-[filter] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        live && "ring-2 ring-[#1f7a35]",
      )}
      style={{
        top,
        height,
        left,
        width,
        borderLeftColor: color,
        background: done ? "var(--muted)" : `${color}24`,
        color: done ? "var(--muted-foreground)" : undefined,
      }}
    >
      <p className="truncate tabular-nums" style={{ color: done ? undefined : color }}>
        {clock(e.startAt)}
      </p>
      <p className="truncate font-semibold" data-no-translate>
        {e.therapist ?? "Unassigned"}
      </p>
      <p className="truncate" data-no-translate>
        {e.service}
      </p>
      {height > 62 && (
        <p className="truncate text-muted-foreground">
          {showRoom && roomName ? <span data-no-translate>{roomName} · </span> : null}
          {isToday ? statusLabel(e, now) : e.kind === "walk_in" ? "Walk-in" : "Booked"}
        </p>
      )}
    </button>
  );
}

function HourGutter({ startMin, endMin, headerHeight }: { startMin: number; endMin: number; headerHeight: number }) {
  const hours = Array.from({ length: (endMin - startMin) / 60 + 1 }, (_, i) => startMin / 60 + i);
  return (
    <div className="sticky left-0 z-20 w-14 shrink-0 bg-card">
      <div className="border-b border-border" style={{ height: headerHeight }} />
      <div className="relative" style={{ height: (endMin - startMin) * PX_PER_MIN }}>
        {hours.map((h) => (
          <span
            key={h}
            className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground"
            style={{ top: (h * 60 - startMin) * PX_PER_MIN }}
          >
            {String(h % 24).padStart(2, "0")}:00
          </span>
        ))}
      </div>
    </div>
  );
}

function GridLines({ startMin, endMin }: { startMin: number; endMin: number }) {
  const hours = Array.from({ length: (endMin - startMin) / 60 + 1 }, (_, i) => startMin / 60 + i);
  return (
    <>
      {hours.map((h) => (
        <div
          key={h}
          className="absolute inset-x-0 border-t border-border/60"
          style={{ top: (h * 60 - startMin) * PX_PER_MIN }}
        />
      ))}
    </>
  );
}

function NowLine({ date, now, startMin, endMin }: { date: string; now: number; startMin: number; endMin: number }) {
  const m = minutesInto(new Date(now).toISOString(), date);
  if (m < startMin || m > endMin) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: (m - startMin) * PX_PER_MIN }}>
      <div className="absolute -left-1 -top-[4px] size-2.5 rounded-full bg-[#ff3b30]" />
      <div className="h-0.5 bg-[#ff3b30]" />
    </div>
  );
}

// ---------- main ----------

export function ScheduleCalendar({
  day,
  view,
  today,
  services,
}: {
  day: CalendarDay;
  view: CalendarView;
  today: string;
  services: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [selected, setSelected] = useState<string[]>(() => day.branches.map((b) => b.id));

  // Remember which stores are shown, per browser.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FILTER_KEY) ?? "null") as string[] | null;
      const valid = saved?.filter((id) => day.branches.some((b) => b.id === id));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a saved preference after mount
      if (valid && valid.length > 0) setSelected(valid);
    } catch {
      /* storage unavailable: show every store */
    }
  }, [day.branches]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const refresh = setInterval(() => router.refresh(), 120_000);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [router]);

  function toggleBranch(id: string) {
    setSelected((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (next.length === 0) return prev; // keep at least one store visible
      try {
        localStorage.setItem(FILTER_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const go = useCallback(
    (nextView: CalendarView, date: string) => router.push(`/admin/scheduling?view=${nextView}&date=${date}`),
    [router],
  );

  const branchIndex = useMemo(() => new Map(day.branches.map((b, i) => [b.id, i])), [day.branches]);
  const colorFor = (branchId: string) => BRANCH_TINTS[(branchIndex.get(branchId) ?? 0) % BRANCH_TINTS.length].hex;
  const roomNameFor = (e: CalendarEvent) =>
    day.branches.find((b) => b.id === e.branchId)?.rooms.find((r) => r.id === e.roomId)?.name ?? null;

  const events = useMemo(() => day.events.filter((e) => selected.includes(e.branchId)), [day.events, selected]);
  const visibleBranches = day.branches.filter((b) => selected.includes(b.id));

  const anchor = new Date(`${day.date}T12:00:00+07:00`);
  const monthName = anchor.toLocaleDateString("en-US", { month: "long", timeZone: TZ });
  const year = anchor.toLocaleDateString("en-US", { year: "numeric", timeZone: TZ });
  const dayNum = anchor.toLocaleDateString("en-US", { day: "numeric", timeZone: TZ });
  const weekdayName = anchor.toLocaleDateString("en-US", { weekday: "long", timeZone: TZ });

  function step(direction: -1 | 1) {
    if (view === "day") go(view, shift(day.date, direction));
    else if (view === "week") go(view, shift(day.date, 7 * direction));
    else go(view, shiftMonth(day.date, direction));
  }

  const todayEvents = events.filter((e) => localDate(e.startAt) === today);
  const inService = todayEvents.filter((e) => {
    const s = new Date(e.startAt).getTime();
    const en = new Date(e.endAt).getTime();
    return e.status !== "completed" && ((now >= s && now < en) || (e.kind === "walk_in" && now >= s));
  });

  return (
    <div className="space-y-4">
      {/* Title row, like Apple Calendar */}
      <div className="grid grid-cols-1 items-center gap-3 lg:grid-cols-[1fr_auto_1fr]">
        <h2 className="text-[30px] leading-tight tracking-tight sm:text-[34px]">
          {view === "day" ? (
            <>
              <span className="font-bold">
                {monthName} {dayNum},
              </span>{" "}
              <span className="font-normal">{year}</span>
              <span className="ml-3 align-middle text-base font-normal text-muted-foreground">{weekdayName}</span>
            </>
          ) : (
            <>
              <span className="font-bold">{monthName}</span> <span className="font-normal">{year}</span>
            </>
          )}
        </h2>

        <div className="flex justify-start lg:justify-center">
          <div role="tablist" aria-label="Calendar view" className="flex rounded-full bg-muted p-0.5">
            {(["day", "week", "month"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => go(v, day.date)}
                className={cn(
                  "rounded-full px-4 py-1 text-[13px] capitalize transition-colors",
                  view === v ? "bg-card font-medium shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-foreground/70 hover:text-foreground",
                )}
              >
                {v === "day" ? "Day" : v === "week" ? "Week" : "Month"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-start gap-1.5 lg:justify-end">
          <input
            type="date"
            aria-label="Pick a date"
            value={day.date}
            onChange={(e) => e.target.value && go(view, e.target.value)}
            className="mr-1 h-8 rounded-full border border-border bg-card px-3 text-[13px]"
          />
          <button
            type="button"
            aria-label="Previous"
            onClick={() => step(-1)}
            className="flex size-8 items-center justify-center rounded-full bg-muted text-lg hover:bg-secondary"
          >
            &lsaquo;
          </button>
          <button
            type="button"
            onClick={() => go(view, today)}
            className="h-8 rounded-full bg-muted px-4 text-[13px] font-medium hover:bg-secondary"
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={() => step(1)}
            className="flex size-8 items-center justify-center rounded-full bg-muted text-lg hover:bg-secondary"
          >
            &rsaquo;
          </button>
        </div>
      </div>

      {/* Store filter: tap to show or hide each store; both on = overlapping */}
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="text-muted-foreground">Show:</span>
        {day.branches.map((b, i) => {
          const on = selected.includes(b.id);
          const color = BRANCH_TINTS[i % BRANCH_TINTS.length].hex;
          return (
            <button
              key={b.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggleBranch(b.id)}
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1 ring-1 transition-colors",
                on ? "bg-card ring-black/10 dark:ring-white/15" : "bg-transparent text-muted-foreground ring-border",
              )}
            >
              <span
                className="flex size-3.5 items-center justify-center rounded-[4px] text-[9px] text-white"
                style={{ background: on ? color : "transparent", boxShadow: `inset 0 0 0 1.5px ${color}` }}
              >
                {on ? "✓" : ""}
              </span>
              <span data-no-translate>{b.name}</span>
            </button>
          );
        })}
        <span className="ml-auto flex flex-wrap gap-2">
          {view === "day" && day.date === today && (
            <span className="rounded-full bg-[#1f7a35]/10 px-3 py-1 text-[#1f7a35]">
              In service now: <b>{inService.length}</b>
            </span>
          )}
          <span className="rounded-full bg-muted px-3 py-1">
            Booked: <b>{events.filter((e) => e.kind === "appointment").length}</b>
          </span>
          <span className="rounded-full bg-muted px-3 py-1">
            Walk-ins: <b>{events.filter((e) => e.kind === "walk_in").length}</b>
          </span>
        </span>
      </div>

      {view === "day" && (
        <DayView
          date={day.date}
          isToday={day.date === today}
          branches={visibleBranches}
          allBranchIndex={branchIndex}
          events={events}
          now={now}
          onOpen={setEditing}
        />
      )}
      {view === "week" && (
        <WeekView
          date={day.date}
          today={today}
          events={events}
          now={now}
          colorFor={colorFor}
          roomNameFor={roomNameFor}
          onOpen={setEditing}
          onPickDay={(d) => go("day", d)}
        />
      )}
      {view === "month" && (
        <MonthView
          date={day.date}
          today={today}
          events={events}
          colorFor={colorFor}
          onOpen={setEditing}
          onPickDay={(d) => go("day", d)}
        />
      )}

      {editing && (
        <BookingEditor
          event={editing}
          branchName={day.branches.find((b) => b.id === editing.branchId)?.name ?? ""}
          roomName={roomNameFor(editing)}
          services={services}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ---------- Day: one column per room, both stores side by side ----------

function DayView({
  date,
  isToday,
  branches,
  allBranchIndex,
  events,
  now,
  onOpen,
}: {
  date: string;
  isToday: boolean;
  branches: CalendarDay["branches"];
  allBranchIndex: Map<string, number>;
  events: CalendarEvent[];
  now: number;
  onOpen: (e: CalendarEvent) => void;
}) {
  const dayEvents = events.filter((e) => localDate(e.startAt) === date || localDate(e.endAt) === date);
  const columns = branches.flatMap((b) => {
    const roomIds = new Set(b.rooms.map((r) => r.id));
    const cols = b.rooms.map((r) => ({ key: r.id, branch: b, label: r.name, roomId: r.id as string | null }));
    const unroomed = dayEvents.some((e) => e.branchId === b.id && (!e.roomId || !roomIds.has(e.roomId)));
    if (unroomed || b.rooms.length === 0) cols.push({ key: `none-${b.id}`, branch: b, label: "No room", roomId: null });
    return cols;
  });
  const byColumn = new Map<string, CalendarEvent[]>();
  for (const e of dayEvents) {
    const branch = branches.find((b) => b.id === e.branchId);
    const key = e.roomId && branch?.rooms.some((r) => r.id === e.roomId) ? e.roomId : `none-${e.branchId}`;
    byColumn.set(key, [...(byColumn.get(key) ?? []), e]);
  }
  const { startMin, endMin } = hourRange(dayEvents, [date]);
  const height = (endMin - startMin) * PX_PER_MIN;

  return (
    <div className="overflow-x-auto rounded-[18px] bg-card ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
      <div className="flex w-full min-w-max">
        <HourGutter startMin={startMin} endMin={endMin} headerHeight={68} />
        {columns.length === 0 && (
          <p className="p-8 text-sm text-muted-foreground">No rooms set up yet. Add rooms under Branch setup below.</p>
        )}
        {columns.map((col, i) => {
          const tint = BRANCH_TINTS[(allBranchIndex.get(col.branch.id) ?? 0) % BRANCH_TINTS.length];
          const firstOfBranch = i === 0 || columns[i - 1].branch.id !== col.branch.id;
          const { placed, lanes } = assignLanes(byColumn.get(col.key) ?? []);
          return (
            <div
              key={col.key}
              className={cn("min-w-44 flex-1 border-l border-border", firstOfBranch && i > 0 && "border-l-2 border-l-foreground/15")}
            >
              <div className="h-[68px] border-b border-border px-3 py-2">
                <p className={cn("truncate text-[11px] font-medium", tint.text, !firstOfBranch && "opacity-0")} data-no-translate>
                  {col.branch.name}
                </p>
                <div className="mt-1 h-1 rounded-full" style={{ background: tint.hex }} />
                <p className="mt-1.5 truncate text-sm font-medium" data-no-translate={col.roomId ? true : undefined}>
                  {col.label}
                </p>
              </div>
              <div className="relative" style={{ height }}>
                <GridLines startMin={startMin} endMin={endMin} />
                {placed.map(({ event: e, lane }) => (
                  <EventBlock
                    key={e.id}
                    e={e}
                    color={tint.hex}
                    now={now}
                    isToday={isToday}
                    top={(minutesInto(e.startAt, date) - startMin) * PX_PER_MIN}
                    height={Math.max(30, ((new Date(e.endAt).getTime() - new Date(e.startAt).getTime()) / 60_000) * PX_PER_MIN)}
                    left={`calc(${(lane / lanes) * 100}% + 3px)`}
                    width={`calc(${100 / lanes}% - 6px)`}
                    onOpen={onOpen}
                  />
                ))}
                {isToday && <NowLine date={date} now={now} startMin={startMin} endMin={endMin} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Week: seven days, stores overlap in each day ----------

function WeekView({
  date,
  today,
  events,
  now,
  colorFor,
  roomNameFor,
  onOpen,
  onPickDay,
}: {
  date: string;
  today: string;
  events: CalendarEvent[];
  now: number;
  colorFor: (branchId: string) => string;
  roomNameFor: (e: CalendarEvent) => string | null;
  onOpen: (e: CalendarEvent) => void;
  onPickDay: (date: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => shift(weekStart(date), i));
  const { startMin, endMin } = hourRange(events, days);
  const height = (endMin - startMin) * PX_PER_MIN;

  return (
    <div className="overflow-x-auto rounded-[18px] bg-card ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
      <div className="flex w-full min-w-max">
        <HourGutter startMin={startMin} endMin={endMin} headerHeight={56} />
        {days.map((d, i) => {
          const isToday = d === today;
          const { placed, lanes } = assignLanes(events.filter((e) => localDate(e.startAt) === d));
          return (
            <div key={d} className="min-w-36 flex-1 border-l border-border">
              <button
                type="button"
                onClick={() => onPickDay(d)}
                className="flex h-14 w-full items-center justify-center gap-1.5 border-b border-border text-sm hover:bg-muted/50"
              >
                <span className={cn(isToday ? "text-[#ff3b30]" : "text-muted-foreground")}>{WEEKDAYS[i]}</span>
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full text-[15px]",
                    isToday ? "bg-[#ff3b30] font-semibold text-white" : "font-medium",
                  )}
                >
                  {Number(d.slice(8))}
                </span>
              </button>
              <div className={cn("relative", isToday && "bg-[#ff3b30]/[0.03]")} style={{ height }}>
                <GridLines startMin={startMin} endMin={endMin} />
                {placed.map(({ event: e, lane }) => (
                  <EventBlock
                    key={e.id}
                    e={e}
                    color={colorFor(e.branchId)}
                    now={now}
                    isToday={isToday}
                    top={(minutesInto(e.startAt, d) - startMin) * PX_PER_MIN}
                    height={Math.max(30, ((new Date(e.endAt).getTime() - new Date(e.startAt).getTime()) / 60_000) * PX_PER_MIN)}
                    left={`calc(${(lane / lanes) * 100}% + 2px)`}
                    width={`calc(${100 / lanes}% - 4px)`}
                    showRoom
                    roomName={roomNameFor(e)}
                    onOpen={onOpen}
                  />
                ))}
                {isToday && <NowLine date={d} now={now} startMin={startMin} endMin={endMin} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Month: six weeks, colored rows per booking ----------

const MAX_PER_CELL = 4;

function MonthView({
  date,
  today,
  events,
  colorFor,
  onOpen,
  onPickDay,
}: {
  date: string;
  today: string;
  events: CalendarEvent[];
  colorFor: (branchId: string) => string;
  onOpen: (e: CalendarEvent) => void;
  onPickDay: (date: string) => void;
}) {
  const start = monthGridStart(date);
  const cells = Array.from({ length: 42 }, (_, i) => shift(start, i));
  const month = date.slice(0, 7);
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const d = localDate(e.startAt);
    byDay.set(d, [...(byDay.get(d) ?? []), e]);
  }

  return (
    <div className="overflow-hidden rounded-[18px] bg-card ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map((w) => (
          <p key={w} className="px-2 py-2 text-right text-[13px] text-muted-foreground sm:px-3">
            {w}
          </p>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const inMonth = d.slice(0, 7) === month;
          const isToday = d === today;
          const list = (byDay.get(d) ?? []).sort((a, b) => a.startAt.localeCompare(b.startAt));
          const shown = list.slice(0, MAX_PER_CELL);
          return (
            <div
              key={d}
              className={cn(
                "min-h-24 border-border p-1 sm:min-h-32 sm:p-1.5",
                i % 7 !== 0 && "border-l",
                i >= 7 && "border-t",
                !inMonth && "bg-muted/30",
              )}
            >
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => onPickDay(d)}
                  aria-label={`Open ${d}`}
                  className={cn(
                    "flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-[15px] hover:bg-muted",
                    isToday && "bg-[#ff3b30] font-semibold text-white hover:bg-[#ff3b30]",
                    !inMonth && !isToday && "text-muted-foreground/60",
                  )}
                >
                  {Number(d.slice(8)) === 1 && !isToday
                    ? new Date(`${d}T12:00:00+07:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ })
                    : Number(d.slice(8))}
                </button>
              </div>
              <div className="mt-0.5 space-y-0.5">
                {shown.map((e) => {
                  const color = colorFor(e.branchId);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => onOpen(e)}
                      className="flex w-full items-center gap-1.5 rounded px-1 py-[1px] text-left text-[11px] hover:bg-muted sm:text-[12px]"
                    >
                      <span className="h-3.5 w-[3px] shrink-0 rounded-full" style={{ background: color }} />
                      <span className="min-w-0 flex-1 truncate">
                        <span data-no-translate>{e.therapist ?? "Unassigned"}</span>
                        <span className="hidden sm:inline" data-no-translate>
                          {" "}
                          · {e.service}
                        </span>
                      </span>
                      <span className="hidden shrink-0 tabular-nums text-muted-foreground sm:inline">{clock(e.startAt)}</span>
                    </button>
                  );
                })}
                {list.length > MAX_PER_CELL && (
                  <button
                    type="button"
                    onClick={() => onPickDay(d)}
                    className="px-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    {list.length - MAX_PER_CELL} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
