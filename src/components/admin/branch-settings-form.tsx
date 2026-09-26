"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateBranchSettings,
  updateBranchHours,
  setBranchTherapists,
  getBranchServiceOverrides,
  setBranchServiceOffered,
  type WeekHours,
} from "@/lib/admin/branch-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Branch = {
  id: string;
  payroll_min_hours: number;
  payroll_guarantee_cents: number;
  transportation_fee_cents: number;
  queue_send_to_back: boolean;
  require_documents_for_clockin: boolean;
  hours: Partial<WeekHours> | null;
};

type Therapist = { id: string; name: string; nickname: string | null };

const DAYS: { key: keyof WeekHours; label: string }[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

const DEFAULT_DAY = { open: "09:00", close: "21:00", closed: false };

function normalizeHours(hours: Partial<WeekHours> | null): WeekHours {
  const result = {} as WeekHours;
  for (const { key } of DAYS) result[key] = hours?.[key] ?? { ...DEFAULT_DAY };
  return result;
}

function SettingsSection({ branch }: { branch: Branch }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await updateBranchSettings(branch.id, new FormData(event.currentTarget));
    setLoading(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`min-hours-${branch.id}`} className="text-xs">
            Minimum hours (T)
          </Label>
          <Input id={`min-hours-${branch.id}`} name="payrollMinHours" type="number" min="0" step="0.25" defaultValue={branch.payroll_min_hours} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`guarantee-${branch.id}`} className="text-xs">
            Daily guarantee ฿ (G)
          </Label>
          <Input
            id={`guarantee-${branch.id}`}
            name="payrollGuaranteeDollars"
            type="number"
            min="0"
            step="1"
            defaultValue={branch.payroll_guarantee_cents / 100}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`transport-${branch.id}`} className="text-xs">
            Transportation fee ฿ (non-home)
          </Label>
          <Input
            id={`transport-${branch.id}`}
            name="transportationFeeDollars"
            type="number"
            min="0"
            step="1"
            defaultValue={branch.transportation_fee_cents / 100}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="queueSendToBack" defaultChecked={branch.queue_send_to_back} />
        Completed jobs go to the back of the queue
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="requireDocumentsForClockin" defaultChecked={branch.require_documents_for_clockin} />
        Block clock-in if a required document is missing or expired
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="sm" disabled={loading}>
        {loading ? "Saving..." : "Save payroll & queue settings"}
      </Button>
    </form>
  );
}

function HoursSection({ branchId, hours }: { branchId: string; hours: Partial<WeekHours> | null }) {
  const router = useRouter();
  const [week, setWeek] = useState<WeekHours>(normalizeHours(hours));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(day: keyof WeekHours, patch: Partial<WeekHours[keyof WeekHours]>) {
    setWeek((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
  }

  async function save() {
    setLoading(true);
    setError(null);
    const result = await updateBranchHours(branchId, week);
    setLoading(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {DAYS.map(({ key, label }) => (
        <div key={key} className="grid grid-cols-[3rem_1fr_1fr_auto] items-center gap-2 text-sm">
          <span className="text-muted-foreground">{label}</span>
          <Input
            type="time"
            value={week[key].open}
            disabled={week[key].closed}
            onChange={(e) => update(key, { open: e.target.value })}
          />
          <Input
            type="time"
            value={week[key].close}
            disabled={week[key].closed}
            onChange={(e) => update(key, { close: e.target.value })}
          />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={week[key].closed} onChange={(e) => update(key, { closed: e.target.checked })} />
            Closed
          </label>
        </div>
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="button" size="sm" disabled={loading} onClick={save}>
        {loading ? "Saving..." : "Save opening hours"}
      </Button>
    </div>
  );
}

function TherapistsSection({
  branchId,
  therapists,
  assignedIds,
}: {
  branchId: string;
  therapists: Therapist[];
  assignedIds: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(assignedIds);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setLoading(true);
    setError(null);
    const result = await setBranchTherapists(branchId, selected);
    setLoading(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {therapists.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSelected((prev) => (prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id]))}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              selected.includes(t.id) ? "border-primary bg-primary text-primary-foreground" : "border-border",
            )}
          >
            {t.nickname || t.name}
          </button>
        ))}
        {therapists.length === 0 && <p className="text-sm text-muted-foreground">No therapists yet.</p>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="button" size="sm" disabled={loading} onClick={save}>
        {loading ? "Saving..." : "Save assigned therapists"}
      </Button>
    </div>
  );
}

function ServicesSection({ branchId, services }: { branchId: string; services: { id: string; name: string }[] }) {
  const [overrides, setOverrides] = useState<Record<string, boolean> | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBranchServiceOverrides(branchId).then(setOverrides);
  }, [branchId]);

  async function toggle(serviceId: string, currentlyOffered: boolean) {
    setBusyId(serviceId);
    setError(null);
    const result = await setBranchServiceOffered(branchId, serviceId, !currentlyOffered);
    setBusyId(null);
    if (!result.ok) return setError(result.error);
    setOverrides((prev) => ({ ...prev, [serviceId]: !currentlyOffered }));
  }

  if (overrides === null) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        On by default everywhere — turn a service off here if this branch doesn&apos;t offer it (or leave a
        branch-only service, like bamboo massage, off everywhere except the one store that has it).
      </p>
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {services.map((s) => {
          const offered = overrides[s.id] ?? true;
          return (
            <label key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
              <span className={offered ? "" : "text-muted-foreground line-through"}>{s.name}</span>
              <input
                type="checkbox"
                checked={offered}
                disabled={busyId === s.id}
                onChange={() => toggle(s.id, offered)}
              />
            </label>
          );
        })}
        {services.length === 0 && <p className="text-sm text-muted-foreground">No services in the catalogue yet.</p>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function BranchSettingsForm({
  branch,
  therapists,
  assignedTherapistIds,
  services,
}: {
  branch: Branch;
  therapists: Therapist[];
  assignedTherapistIds: string[];
  services: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"settings" | "hours" | "therapists" | "services">("settings");

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-primary hover:underline">
        Branch settings, hours &amp; therapists
      </button>
    );
  }

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="flex gap-1 rounded-full border border-border bg-secondary/40 p-1 text-xs">
        {([
          ["settings", "Payroll & queue"],
          ["hours", "Opening hours"],
          ["therapists", "Therapists"],
          ["services", "Services"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn("rounded-full px-3 py-1.5 transition-colors", tab === key ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "settings" && <SettingsSection branch={branch} />}
      {tab === "hours" && <HoursSection branchId={branch.id} hours={branch.hours} />}
      {tab === "therapists" && <TherapistsSection branchId={branch.id} therapists={therapists} assignedIds={assignedTherapistIds} />}
      {tab === "services" && <ServicesSection branchId={branch.id} services={services} />}

      <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:underline">
        Close
      </button>
    </div>
  );
}
