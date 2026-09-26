"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CalendarDay, CalendarEvent } from "@/lib/admin/calendar-data";
import { cn } from "@/lib/utils";

const PX_PER_MIN = 1.1;
const TZ = "Asia/Bangkok";

// One tint per branch, in branch order, so both stores read apart at a glance.
const BRANCH_TINTS = [
  { bar: "bg-[#1f7a35]", soft: "bg-[#1f7a35]/10", ring: "ring-[#1f7a35]/30", text: "text-[#1f7a35]", dot: "bg-[#1f7a35]" },
  { bar: "bg-[#0071e3]", soft: "bg-[#0071e3]/10", ring: "ring-[#0071e3]/30", text: "text-[#0060c0]", dot: "bg-[#0071e3]" },
  { bar: "bg-[#bf4800]", soft: "bg-[#bf4800]/10", ring: "ring-[#bf4800]/30", text: "text-[#bf4800]", dot: "bg-[#bf4800]" },
  { bar: "bg-[#8944ab]", soft: "bg-[#8944ab]/10", ring: "ring-[#8944ab]/30", text: "text-[#8944ab]", dot: "bg-[#8944ab]" },
];

type Column = { key: string; branchIndex: number; branchId: string; roomId: string | null; label: string };

function minutesIntoDay(iso: string, date: string) {
  return (new Date(iso).getTime() - new Date(`${date}T00:00:00+07:00`).getTime()) / 60_000;
}

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00+07:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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

export function ScheduleCalendar({ day, today }: { day: CalendarDay; today: string }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    // Pull fresh bookings and walk-ins every 2 minutes.
    const refresh = setInterval(() => router.refresh(), 120_000);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [router]);

  const isToday = day.date === today;
  const branchIndex = useMemo(() => new Map(day.branches.map((b, i) => [b.id, i])), [day.branches]);

  const columns = useMemo<Column[]>(() => {
    const cols: Column[] = [];
    day.branches.forEach((b, bi) => {
      for (const r of b.rooms) cols.push({ key: r.id, branchIndex: bi, branchId: b.id, roomId: r.id, label: r.name });
      const roomIds = new Set(b.rooms.map((r) => r.id));
      const hasUnroomed = day.events.some((e) => e.branchId === b.id && (!e.roomId || !roomIds.has(e.roomId)));
      if (hasUnroomed || b.rooms.length === 0) {
        cols.push({ key: `none-${b.id}`, branchIndex: bi, branchId: b.id, roomId: null, label: "No room" });
      }
    });
    return cols;
  }, [day]);

  const eventsByColumn = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of day.events) {
      const branch = day.branches.find((b) => b.id === e.branchId);
      const inRoom = e.roomId && branch?.rooms.some((r) => r.id === e.roomId);
      const key = inRoom ? e.roomId! : `none-${e.branchId}`;
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return map;
  }, [day]);

  // Visible hours: 9:00–23:00, stretched to fit anything earlier or later.
  const { startMin, endMin } = useMemo(() => {
    let s = 9 * 60;
    let e = 23 * 60;
    for (const ev of day.events) {
      s = Math.min(s, Math.floor(minutesIntoDay(ev.startAt, day.date) / 60) * 60);
      e = Math.max(e, Math.ceil(minutesIntoDay(ev.endAt, day.date) / 60) * 60);
    }
    return { startMin: Math.max(0, s), endMin: Math.min(24 * 60, e) };
  }, [day]);

  const height = (endMin - startMin) * PX_PER_MIN;
  const hours = Array.from({ length: (endMin - startMin) / 60 + 1 }, (_, i) => startMin / 60 + i);
  const nowMin = minutesIntoDay(new Date(now).toISOString(), day.date);

  const inService = day.events.filter((e) => {
    const s = new Date(e.startAt).getTime();
    const en = new Date(e.endAt).getTime();
    return e.status !== "completed" && ((now >= s && now < en) || (e.kind === "walk_in" && now >= s));
  });
  const bookedCount = day.events.filter((e) => e.kind === "appointment").length;
  const walkInCount = day.events.filter((e) => e.kind === "walk_in").length;

  const dateLabel = new Date(`${day.date}T12:00:00+07:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: TZ,
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-muted p-0.5">
            <button
              type="button"
              aria-label="Previous day"
              onClick={() => router.push(`/admin/scheduling?date=${addDays(day.date, -1)}`)}
              className="rounded-full px-3 py-1 text-sm hover:bg-card"
            >
              &lsaquo;
            </button>
            <button
              type="button"
              onClick={() => router.push(`/admin/scheduling?date=${today}`)}
              className={cn("rounded-full px-3 py-1 text-[13px]", isToday ? "bg-card font-medium shadow-sm" : "hover:bg-card")}
            >
              Today
            </button>
            <button
              type="button"
              aria-label="Next day"
              onClick={() => router.push(`/admin/scheduling?date=${addDays(day.date, 1)}`)}
              className="rounded-full px-3 py-1 text-sm hover:bg-card"
            >
              &rsaquo;
            </button>
          </div>
          <input
            type="date"
            aria-label="Pick a date"
            value={day.date}
            onChange={(e) => e.target.value && router.push(`/admin/scheduling?date=${e.target.value}`)}
            className="h-8 rounded-full border border-border bg-card px-3 text-[13px]"
          />
        </div>
        <p className="font-display text-xl">{dateLabel}</p>
      </div>

      {/* Summary */}
      <div className="flex flex-wrap gap-2 text-[13px]">
        <span className="rounded-full bg-[#1f7a35]/10 px-3 py-1 text-[#1f7a35]">
          In service now: <b>{isToday ? inService.length : 0}</b>
        </span>
        <span className="rounded-full bg-muted px-3 py-1">
          Booked: <b>{bookedCount}</b>
        </span>
        <span className="rounded-full bg-muted px-3 py-1">
          Walk-ins: <b>{walkInCount}</b>
        </span>
        {day.branches.map((b, i) => (
          <span key={b.id} className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1">
            <span className={cn("size-2 rounded-full", BRANCH_TINTS[i % BRANCH_TINTS.length].dot)} />
            {b.name}
          </span>
        ))}
      </div>

      {isToday && inService.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {inService.map((e) => {
            const tint = BRANCH_TINTS[(branchIndex.get(e.branchId) ?? 0) % BRANCH_TINTS.length];
            const room = day.branches.find((b) => b.id === e.branchId)?.rooms.find((r) => r.id === e.roomId);
            return (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-2xl bg-card p-3 ring-1 ring-black/[0.05]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    <span data-no-translate>{e.therapist ?? "Unassigned"}</span> &middot; <span data-no-translate>{e.service}</span>
                  </p>
                  <p className={cn("truncate text-xs", tint.text)}>
                    <span data-no-translate>{room?.name ?? "No room"}</span> &middot;{" "}
                    <span data-no-translate>{day.branches[branchIndex.get(e.branchId) ?? 0]?.name}</span>
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[#1f7a35] px-2.5 py-1 text-xs font-medium text-white">
                  {statusLabel(e, now)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Timeline */}
      <div className="overflow-x-auto rounded-[18px] bg-card ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
        <div className="flex w-full min-w-max">
          {/* Hour labels */}
          <div className="sticky left-0 z-20 w-14 shrink-0 bg-card">
            <div className="h-[68px] border-b border-border" />
            <div className="relative" style={{ height }}>
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

          {columns.length === 0 && (
            <p className="p-8 text-sm text-muted-foreground">No rooms set up yet. Add rooms under Branch setup below.</p>
          )}

          {columns.map((col, i) => {
            const tint = BRANCH_TINTS[col.branchIndex % BRANCH_TINTS.length];
            const branch = day.branches[col.branchIndex];
            const firstOfBranch = i === 0 || columns[i - 1].branchId !== col.branchId;
            const { placed, lanes } = assignLanes(eventsByColumn.get(col.key) ?? []);
            return (
              <div
                key={col.key}
                className={cn("min-w-44 flex-1 border-l border-border", firstOfBranch && i > 0 && "border-l-2 border-l-foreground/15")}
              >
                <div className="h-[68px] border-b border-border px-3 py-2">
                  <p className={cn("truncate text-[11px] font-medium", tint.text, !firstOfBranch && "opacity-0")} data-no-translate>
                    {branch?.name}
                  </p>
                  <div className={cn("mt-1 h-1 rounded-full", tint.bar)} />
                  <p className="mt-1.5 truncate text-sm font-medium" data-no-translate={col.roomId ? true : undefined}>
                    {col.label}
                  </p>
                </div>
                <div className="relative" style={{ height }}>
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="absolute inset-x-0 border-t border-border/60"
                      style={{ top: (h * 60 - startMin) * PX_PER_MIN }}
                    />
                  ))}
                  {placed.map(({ event: e, lane }) => {
                    const top = (minutesIntoDay(e.startAt, day.date) - startMin) * PX_PER_MIN;
                    const h = Math.max(30, ((new Date(e.endAt).getTime() - new Date(e.startAt).getTime()) / 60_000) * PX_PER_MIN);
                    const live = isToday && e.status !== "completed" && now >= new Date(e.startAt).getTime() && now < new Date(e.endAt).getTime();
                    const done = e.status === "completed" || (!live && new Date(e.endAt).getTime() < now && e.kind === "appointment");
                    return (
                      <div
                        key={e.id}
                        title={`${e.therapist ?? "Unassigned"} · ${e.service} · ${clock(e.startAt)}–${clock(e.endAt)}`}
                        className={cn(
                          "absolute overflow-hidden rounded-lg px-2 py-1 text-left text-[11px] leading-tight ring-1",
                          done ? "bg-muted text-muted-foreground ring-border" : cn(tint.soft, tint.ring),
                          live && "ring-2 ring-[#1f7a35]",
                        )}
                        style={{
                          top,
                          height: h,
                          left: `calc(${(lane / lanes) * 100}% + 3px)`,
                          width: `calc(${100 / lanes}% - 6px)`,
                        }}
                      >
                        <p className="truncate font-semibold" data-no-translate>
                          {e.therapist ?? "Unassigned"}
                        </p>
                        <p className="truncate" data-no-translate>
                          {e.service}
                        </p>
                        <p className="truncate tabular-nums text-muted-foreground">
                          {clock(e.startAt)}–{clock(e.endAt)}
                          {e.bedName ? <span data-no-translate> · {e.bedName}</span> : null}
                        </p>
                        {h > 56 && (
                          <p className={cn("mt-0.5 truncate font-medium", live ? "text-[#1f7a35]" : "text-muted-foreground")}>
                            {isToday ? statusLabel(e, now) : e.kind === "walk_in" ? "Walk-in" : "Booked"}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {isToday && nowMin >= startMin && nowMin <= endMin && (
                    <div className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-[#ff3b30]" style={{ top: (nowMin - startMin) * PX_PER_MIN }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
