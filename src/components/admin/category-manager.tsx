"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCategory, updateCategory } from "@/lib/admin/category-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ColorPicker } from "@/components/admin/color-picker";
import { contrastTextColor } from "@/lib/color";

type TranslationLang = "th" | "zh" | "ko" | "ja";
type Category = {
  id: string;
  name: string;
  name_th: string | null;
  name_zh: string | null;
  name_ko: string | null;
  name_ja: string | null;
  description: string | null;
  image_url: string | null;
  background_color: string | null;
};

const TRANSLATION_LANGS: { value: TranslationLang; label: string }[] = [
  { value: "th", label: "Thai" },
  { value: "zh", label: "Chinese" },
  { value: "ko", label: "Korean" },
  { value: "ja", label: "Japanese" },
];

function CategoryEditForm({ category }: { category: Category }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [translationLang, setTranslationLang] = useState<TranslationLang>("th");
  const [translations, setTranslations] = useState<Record<TranslationLang, string>>({
    th: category.name_th ?? "",
    zh: category.name_zh ?? "",
    ko: category.name_ko ?? "",
    ja: category.name_ja ?? "",
  });
  const [color, setColor] = useState<string | null>(category.background_color);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);
    const formData = new FormData(event.currentTarget);
    formData.set("translationLang", translationLang);
    formData.set("translationName", translations[translationLang]);
    formData.set("backgroundColor", color ?? "");
    const result = await updateCategory(category.id, formData);
    setLoading(false);
    if (!result.ok) return setError(result.error);
    setSaved(true);
    router.refresh();
  }

  const filledLangs = TRANSLATION_LANGS.filter((l) => translations[l.value].trim());

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-3">
        {category.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={category.image_url} alt="" className="h-14 w-14 rounded-lg object-cover" />
        ) : (
          <div
            className="flex h-14 w-14 items-center justify-center rounded-lg text-[10px]"
            style={
              color
                ? { backgroundColor: color, color: contrastTextColor(color) }
                : { background: "linear-gradient(180deg, #5c7c62, #2f4a3f)", color: "#fff" }
            }
          >
            {!color && "no image"}
          </div>
        )}
        <input type="file" name="image" accept="image/*" className="text-xs" />
      </div>

      {!category.image_url && (
        <div className="space-y-1">
          <Label className="text-xs">Color (used when there&apos;s no image)</Label>
          <ColorPicker name="backgroundColor" value={color} onChange={setColor} />
        </div>
      )}
      <div className="space-y-1">
        <Label className="text-xs">Name (English)</Label>
        <Input name="name" defaultValue={category.name} required className="h-8 text-xs" />
      </div>

      <div className="grid grid-cols-[7rem_1fr] gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Translate to</Label>
          <select
            value={translationLang}
            onChange={(e) => setTranslationLang(e.target.value as TranslationLang)}
            className="h-8 w-full rounded-md border border-border bg-background px-1.5 text-xs"
          >
            {TRANSLATION_LANGS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Translated name</Label>
          <Input
            value={translations[translationLang]}
            onChange={(e) => setTranslations((prev) => ({ ...prev, [translationLang]: e.target.value }))}
            className="h-8 text-xs"
          />
        </div>
      </div>
      {filledLangs.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Also set: {filledLangs.map((l) => `${l.label} (${translations[l.value]})`).join(", ")}
        </p>
      )}

      <div className="space-y-1">
        <Label className="text-xs">Short description (shown on the booking page)</Label>
        <Input name="description" defaultValue={category.description ?? ""} className="h-8 text-xs" placeholder="e.g. Traditional Thai techniques" />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {saved && !error && <p className="text-xs text-primary">Saved.</p>}
      <Button type="submit" size="sm" disabled={loading}>
        {loading ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}

function CategoryRow({ category }: { category: Category }) {
  const [editing, setEditing] = useState(false);
  const translationCount = [category.name_th, category.name_zh, category.name_ko, category.name_ja].filter(
    (v) => v && v.trim(),
  ).length;

  return (
    <>
      <tr className="border-b border-border last:border-0">
        <td className="py-2 pr-3">
          {category.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={category.image_url} alt="" className="h-9 w-9 rounded-md object-cover" />
          ) : (
            <div
              className="h-9 w-9 rounded-md"
              style={
                category.background_color
                  ? { backgroundColor: category.background_color }
                  : { background: "linear-gradient(180deg, #5c7c62, #2f4a3f)" }
              }
            />
          )}
        </td>
        <td className="px-3 py-2 text-sm font-medium">{category.name}</td>
        <td className="px-3 py-2 text-sm text-muted-foreground">
          {translationCount > 0 ? `${translationCount} language${translationCount === 1 ? "" : "s"}` : "English only"}
        </td>
        <td className="max-w-[16rem] truncate px-3 py-2 text-sm text-muted-foreground">
          {category.description || "—"}
        </td>
        <td className="py-2 pl-3 text-right">
          <button type="button" onClick={() => setEditing((v) => !v)} className="text-sm text-primary hover:underline">
            {editing ? "Close" : "Edit"}
          </button>
        </td>
      </tr>
      {editing && (
        <tr className="border-b border-border last:border-0">
          <td colSpan={5} className="px-0 py-2">
            <CategoryEditForm category={category} />
          </td>
        </tr>
      )}
    </>
  );
}

function NewCategoryForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = event.currentTarget;
    const result = await createCategory(new FormData(form));
    setLoading(false);
    if (!result.ok) return setError(result.error);
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Input name="name" placeholder="New category name" required className="h-9 max-w-xs" />
      <Button type="submit" size="sm" disabled={loading}>
        {loading ? "Adding..." : "Add category"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}

export function CategoryManager({ categories }: { categories: Category[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Categories</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">No categories yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Image</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Translations</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="py-2 pl-3" />
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <CategoryRow key={c.id} category={c} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <NewCategoryForm />
      </CardContent>
    </Card>
  );
}
