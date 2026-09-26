"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCategory, updateCategory } from "@/lib/admin/category-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Category = { id: string; name: string; name_th: string | null; description: string | null; image_url: string | null };

function CategoryEditForm({ category }: { category: Category }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);
    const result = await updateCategory(category.id, new FormData(event.currentTarget));
    setLoading(false);
    if (!result.ok) return setError(result.error);
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center gap-3">
        {category.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={category.image_url} alt="" className="h-14 w-14 rounded-lg object-cover" />
        ) : (
          <div className="h-14 w-14 rounded-lg bg-gradient-to-b from-[#5c7c62] to-[#2f4a3f]" />
        )}
        <input type="file" name="image" accept="image/*" className="text-xs" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Name (English)</Label>
          <Input name="name" defaultValue={category.name} required className="h-8 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Name (Thai)</Label>
          <Input name="nameTh" defaultValue={category.name_th ?? ""} className="h-8 text-xs" />
        </div>
      </div>
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
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {categories.map((c) => (
            <CategoryEditForm key={c.id} category={c} />
          ))}
        </div>
        <NewCategoryForm />
      </CardContent>
    </Card>
  );
}
