import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { DepositCardView, type DepositCard } from "@/components/deposit-card-view";

export const metadata: Metadata = {
  title: "Deposit card · C&R Thai Massage",
  robots: { index: false, follow: false },
};

export default async function DepositCardPage({ params }: PageProps<"/deposit/[token]">) {
  const { token } = await params;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc("get_deposit_card", { p_token: token });
  if (!data) notFound();
  return <DepositCardView card={data as unknown as DepositCard} />;
}
