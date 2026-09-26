"use client";

import { useEffect, useState } from "react";

function format(now: Date) {
  const date = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
  const time = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Bangkok",
  });
  return { date, time };
}

/** Current Chiang Mai date and time, ticking every second. */
export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start the clock after mount to avoid a server/client time mismatch
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!now) return <span className="inline-block h-5" />;
  const { date, time } = format(now);
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <span>{date}</span>
      <span className="font-semibold tabular-nums text-foreground">{time}</span>
    </span>
  );
}
