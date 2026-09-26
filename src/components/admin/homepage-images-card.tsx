"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadSiteImage, removeSiteImage, type SiteImageSlot } from "@/lib/admin/site-content-actions";
import { Button } from "@/components/ui/button";
import { resizeImage } from "@/lib/client/resize-image";

const SLOTS: { slot: SiteImageSlot; title: string; hint: string }[] = [
  { slot: "hero", title: "Top banner", hint: "Behind “C&R Thai Massage / Relax further.” Text turns white over the photo." },
  { slot: "branches", title: "Branches section", hint: "Behind “Two branches. One booking.” and the two branch tiles." },
];

function SlotEditor({ slot, title, hint, url }: { slot: SiteImageSlot; title: string; hint: string; url: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setLoading("upload");
    setError(null);
    const formData = new FormData();
    formData.set("image", await resizeImage(file));
    const result = await uploadSiteImage(slot, formData);
    setLoading(null);
    if (inputRef.current) inputRef.current.value = "";
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Remove the ${title.toLowerCase()} photo?`)) return;
    setLoading("remove");
    setError(null);
    const result = await removeSiteImage(slot);
    setLoading(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div
        className="flex aspect-[16/7] items-center justify-center overflow-hidden rounded-xl bg-muted bg-cover bg-center text-xs text-muted-foreground"
        style={url ? { backgroundImage: `url("${url}")` } : undefined}
      >
        {!url && "No photo. The plain background is used."}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={loading !== null} onClick={() => inputRef.current?.click()}>
          {loading === "upload" ? "Uploading..." : url ? "Replace photo" : "Upload photo"}
        </Button>
        {url && (
          <Button type="button" size="sm" variant="ghost" disabled={loading !== null} onClick={remove}>
            {loading === "remove" ? "Removing..." : "Remove"}
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function HomepageImagesCard({ heroUrl, branchesUrl }: { heroUrl: string | null; branchesUrl: string | null }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {SLOTS.map((s) => (
        <SlotEditor key={s.slot} {...s} url={s.slot === "hero" ? heroUrl : branchesUrl} />
      ))}
    </div>
  );
}
