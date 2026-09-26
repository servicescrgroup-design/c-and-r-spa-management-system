"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateTherapistProfile,
  uploadTherapistPhoto,
  setTherapistSkills,
  setTherapistBranches,
  upsertStaffDocument,
  deleteStaffDocument,
  getDocumentSignedUrl,
  type DocCompletenessRow,
} from "@/lib/admin/staff-hr-actions";
import {
  addStaffCertification,
  approveStaffCertification,
  removeStaffCertification,
  type Certification,
  type StaffCertification,
} from "@/lib/admin/certification-actions";
import { DOC_TYPES, docLabel } from "@/lib/staff-document-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type TherapistProfile = {
  staff_id: string;
  nickname: string | null;
  line_id: string | null;
  dob: string | null;
  gender: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "active" | "probation" | "suspended" | "resigned";
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  notes: string | null;
  experience_notes: string | null;
  photo_url: string | null;
  guarantee_override_cents: number | null;
  min_hours_override: number | null;
} | null;

type StaffDocument = {
  id: string;
  doc_type: string;
  is_required: boolean;
  number: string | null;
  issuer: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  file_url: string | null;
  file_url_back: string | null;
  notes: string | null;
};

function isExpired(expiryDate: string | null) {
  return Boolean(expiryDate && new Date(expiryDate) < new Date());
}

function ProfileForm({ staffId, profile }: { staffId: string; profile: TherapistProfile }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await updateTherapistProfile(staffId, new FormData(event.currentTarget));
    setLoading(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="nickname">Nickname</Label>
          <Input id="nickname" name="nickname" defaultValue={profile?.nickname ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lineId">LINE ID</Label>
          <Input id="lineId" name="lineId" defaultValue={profile?.line_id ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dob">Date of birth</Label>
          <Input id="dob" name="dob" type="date" defaultValue={profile?.dob ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gender">Gender</Label>
          <Input id="gender" name="gender" defaultValue={profile?.gender ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            defaultValue={profile?.status ?? "active"}
            className="flex h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="active">Active</option>
            <option value="probation">Probation</option>
            <option value="suspended">Suspended</option>
            <option value="resigned">Resigned</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="startDate">Join date</Label>
          <Input id="startDate" name="startDate" type="date" defaultValue={profile?.start_date ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endDate">End date</Label>
          <Input id="endDate" name="endDate" type="date" defaultValue={profile?.end_date ?? ""} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="bankName">Bank</Label>
          <Input id="bankName" name="bankName" defaultValue={profile?.bank_name ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bankAccountNumber">Account number</Label>
          <Input id="bankAccountNumber" name="bankAccountNumber" defaultValue={profile?.bank_account_number ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bankAccountName">Account name</Label>
          <Input id="bankAccountName" name="bankAccountName" defaultValue={profile?.bank_account_name ?? ""} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="guaranteeOverride">Custom guarantee (฿/day)</Label>
          <Input
            id="guaranteeOverride"
            name="guaranteeOverride"
            type="number"
            min="0"
            step="0.01"
            placeholder="Company default"
            defaultValue={profile?.guarantee_override_cents ? profile.guarantee_override_cents / 100 : ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="minHoursOverride">Custom minimum hours</Label>
          <Input
            id="minHoursOverride"
            name="minHoursOverride"
            type="number"
            min="0"
            step="0.25"
            placeholder="Company default"
            defaultValue={profile?.min_hours_override ?? ""}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="experienceNotes">Massage experience</Label>
        <Input
          id="experienceNotes"
          name="experienceNotes"
          placeholder="e.g. 5 years, Thai &amp; oil massage"
          defaultValue={profile?.experience_notes ?? ""}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={profile?.notes ?? ""}
          className="flex w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading}>
        {loading ? "Saving..." : "Save HR profile"}
      </Button>
    </form>
  );
}

function PhotoUpload({ staffId, photoUrl }: { staffId: string; photoUrl: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await uploadTherapistPhoto(staffId, new FormData(event.currentTarget));
    setLoading(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-4">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
      ) : (
        <div className="h-16 w-16 rounded-full bg-secondary" />
      )}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input type="file" name="photo" accept="image/*" required className="text-sm" />
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? "Uploading..." : "Upload"}
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function SkillsAndBranches({
  staffId,
  services,
  skillServiceIds,
  branches,
  assignedBranchIds,
  homeBranchId,
}: {
  staffId: string;
  services: { id: string; name: string }[];
  skillServiceIds: string[];
  branches: { id: string; name: string }[];
  assignedBranchIds: string[];
  homeBranchId: string | null;
}) {
  const router = useRouter();
  const [skills, setSkills] = useState<string[]>(skillServiceIds);
  const [branchIds, setBranchIds] = useState<string[]>(assignedBranchIds);
  const [homeId, setHomeId] = useState<string | null>(homeBranchId);
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    await Promise.all([setTherapistSkills(staffId, skills), setTherapistBranches(staffId, branchIds, homeId)]);
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Services this therapist can perform</Label>
        <div className="flex flex-wrap gap-2">
          {services.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSkills((prev) => (prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]))}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                skills.includes(s.id) ? "border-primary bg-primary text-primary-foreground" : "border-border",
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Assigned branches (for the live queue)</Label>
        <div className="flex flex-wrap gap-2">
          {branches.map((b) => {
            const selected = branchIds.includes(b.id);
            return (
              <div key={b.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setBranchIds((prev) => {
                      const next = prev.includes(b.id) ? prev.filter((x) => x !== b.id) : [...prev, b.id];
                      if (!next.includes(homeId ?? "")) setHomeId(next[0] ?? null);
                      return next;
                    })
                  }
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    selected ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}
                >
                  {b.name}
                </button>
                {selected && branchIds.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setHomeId(b.id)}
                    className={cn("text-xs", homeId === b.id ? "font-medium text-accent-foreground" : "text-muted-foreground hover:underline")}
                    title="Set as home branch"
                  >
                    {homeId === b.id ? "★ home" : "set home"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {branchIds.length > 1 && (
          <p className="text-xs text-muted-foreground">
            Clocking in away from the home branch adds that branch&apos;s transportation fee automatically.
          </p>
        )}
      </div>

      <Button type="button" size="sm" disabled={loading} onClick={save}>
        {loading ? "Saving..." : "Save skills & branches"}
      </Button>
    </div>
  );
}

function DocumentRow({ staffId, doc }: { staffId: string; doc: StaffDocument }) {
  const router = useRouter();
  const expired = isExpired(doc.expiry_date);

  async function viewFile(path: string) {
    const url = await getDocumentSignedUrl(path);
    if (url) window.open(url, "_blank");
  }

  async function remove() {
    if (!confirm("Delete this document?")) return;
    await deleteStaffDocument(staffId, doc.id);
    router.refresh();
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
      <div>
        <p className="font-medium">
          {docLabel(doc.doc_type)}
          {doc.is_required && <span className="ml-1.5 text-xs text-muted-foreground">(required)</span>}
        </p>
        <p className="text-xs text-muted-foreground">
          {doc.number ? `${doc.number} · ` : ""}
          {doc.expiry_date ? (
            <span className={cn(expired && "font-medium text-destructive")}>
              {expired ? "Expired" : "Expires"} {doc.expiry_date}
            </span>
          ) : (
            "No expiry"
          )}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {doc.file_url && (
          <button type="button" onClick={() => viewFile(doc.file_url!)} className="text-primary hover:underline">
            View
          </button>
        )}
        <button type="button" onClick={remove} className="text-muted-foreground hover:text-destructive">
          Delete
        </button>
      </div>
    </li>
  );
}

function AddDocumentForm({ staffId }: { staffId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = event.currentTarget;
    const result = await upsertStaffDocument(staffId, new FormData(form));
    setLoading(false);
    if (!result.ok) return setError(result.error);
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border p-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="docType">Document type</Label>
          <select id="docType" name="docType" className="flex h-10 w-full rounded-md border border-border bg-background px-3 text-sm">
            {DOC_TYPES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="isRequired" /> Required for clock-in
        </label>
        <div className="space-y-2">
          <Label htmlFor="number">ID / certificate number</Label>
          <Input id="number" name="number" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="issuer">Issuer</Label>
          <Input id="issuer" name="issuer" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="issuedDate">Issued date</Label>
          <Input id="issuedDate" name="issuedDate" type="date" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="expiryDate">Expiry date</Label>
          <Input id="expiryDate" name="expiryDate" type="date" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fileFront">File (front)</Label>
          <input id="fileFront" name="fileFront" type="file" className="text-sm" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fileBack">File (back, optional)</Label>
          <input id="fileBack" name="fileBack" type="file" className="text-sm" />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="sm" disabled={loading}>
        {loading ? "Saving..." : "Add document"}
      </Button>
    </form>
  );
}

function CompletenessChecklist({ rows }: { rows: DocCompletenessRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No documents are configured as required yet. Set them up in Settings.</p>;
  }
  const allComplete = rows.every((r) => r.status === "complete");

  return (
    <div className="space-y-2">
      {allComplete && <p className="text-sm text-primary">All required documents are on file and current.</p>}
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.docType} className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                r.status === "complete" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700",
              )}
            >
              {r.status === "complete" ? "✓" : "✕"}
            </span>
            <span className={r.status === "complete" ? "" : "text-destructive"}>
              {r.label}
              {r.status === "expired" && " — expired"}
              {r.status === "missing" && " — missing"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CertificationsCard({
  staffId,
  staffCertifications,
  allCertifications,
  isOwnerViewer,
}: {
  staffId: string;
  staffCertifications: StaffCertification[];
  allCertifications: Certification[];
  isOwnerViewer: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const assignedIds = new Set(staffCertifications.map((c) => c.certificationId));
  const available = allCertifications.filter((c) => !assignedIds.has(c.id));

  async function add() {
    if (!selected) return;
    setLoading("add");
    setError(null);
    const result = await addStaffCertification(staffId, selected);
    setLoading(null);
    if (!result.ok) return setError(result.error);
    setSelected("");
    router.refresh();
  }

  async function approve(id: string) {
    setLoading(id);
    setError(null);
    const result = await approveStaffCertification(staffId, id);
    setLoading(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  async function remove(id: string) {
    setLoading(id);
    setError(null);
    const result = await removeStaffCertification(staffId, id);
    setLoading(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {staffCertifications.length === 0 ? (
        <p className="text-sm text-muted-foreground">No specialties/certifications assigned yet.</p>
      ) : (
        <ul className="space-y-2">
          {staffCertifications.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-sm">
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium",
                    c.status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800",
                  )}
                >
                  {c.status === "approved" ? "Approved" : "Pending"}
                </span>
                {c.name}
              </span>
              <span className="flex items-center gap-3">
                {c.status === "pending" && isOwnerViewer && (
                  <button type="button" disabled={loading === c.id} onClick={() => approve(c.id)} className="text-xs text-primary hover:underline">
                    {loading === c.id ? "Approving..." : "Approve"}
                  </button>
                )}
                <button type="button" disabled={loading === c.id} onClick={() => remove(c.id)} className="text-xs text-muted-foreground hover:text-destructive">
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="flex h-9 rounded-md border border-border bg-background px-2.5 text-sm"
          >
            <option value="">Choose a specialty...</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button type="button" size="sm" disabled={!selected || loading === "add"} onClick={add}>
            {loading === "add" ? "Adding..." : "Assign"}
          </Button>
        </div>
      )}
      {allCertifications.length === 0 && (
        <p className="text-xs text-muted-foreground">No certifications defined yet — add some in Settings.</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function StaffHRDetail({
  staffId,
  profile,
  documents,
  skillServiceIds,
  services,
  assignedBranchIds,
  homeBranchId,
  branches,
  documentCompleteness,
  staffCertifications,
  allCertifications,
  isOwnerViewer,
}: {
  staffId: string;
  profile: TherapistProfile;
  documents: StaffDocument[];
  skillServiceIds: string[];
  services: { id: string; name: string }[];
  assignedBranchIds: string[];
  homeBranchId: string | null;
  branches: { id: string; name: string }[];
  documentCompleteness: DocCompletenessRow[];
  staffCertifications: StaffCertification[];
  allCertifications: Certification[];
  isOwnerViewer: boolean;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Completeness</CardTitle>
        </CardHeader>
        <CardContent>
          <CompletenessChecklist rows={documentCompleteness} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Specialties &amp; certifications</CardTitle>
        </CardHeader>
        <CardContent>
          <CertificationsCard
            staffId={staffId}
            staffCertifications={staffCertifications}
            allCertifications={allCertifications}
            isOwnerViewer={isOwnerViewer}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Photo</CardTitle>
        </CardHeader>
        <CardContent>
          <PhotoUpload staffId={staffId} photoUrl={profile?.photo_url ?? null} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>HR profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm staffId={staffId} profile={profile} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Skills &amp; branches</CardTitle>
        </CardHeader>
        <CardContent>
          <SkillsAndBranches
            staffId={staffId}
            services={services}
            skillServiceIds={skillServiceIds}
            branches={branches}
            assignedBranchIds={assignedBranchIds}
            homeBranchId={homeBranchId}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {documents.length > 0 ? (
            <ul className="divide-y divide-border">
              {documents.map((d) => (
                <DocumentRow key={d.id} staffId={staffId} doc={d} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No documents on file yet.</p>
          )}
          <AddDocumentForm staffId={staffId} />
        </CardContent>
      </Card>
    </div>
  );
}
