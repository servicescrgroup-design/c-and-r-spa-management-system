"use client";

import { useMemo, useState } from "react";
import { findAvailableSlots, submitBooking, createDepositPaymentIntent } from "@/lib/booking/actions";
import { DepositCheckout } from "@/components/booking/deposit-checkout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, cn } from "@/lib/utils";
import { contrastTextColor } from "@/lib/color";

type PriceOption = { duration_minutes: number; price_cents: number };
type Service = {
  id: string;
  name: string;
  name_th: string | null;
  category_id: string | null;
  image_url: string | null;
  background_color: string | null;
  duration_minutes: number;
  default_price_cents: number;
  service_price_options: PriceOption[];
};
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

type Selection = { serviceId: string; duration: number; priceCents: number };

type Lang = "en" | "th" | "zh" | "ko" | "ja";

const LANG_OPTIONS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "th", label: "ไทย" },
  { code: "zh", label: "中文" },
  { code: "ko", label: "한국어" },
  { code: "ja", label: "日本語" },
];

// Only English and Thai have real translated content in the database (name_th
// on services/categories). Chinese/Korean/Japanese translate the surrounding
// interface below; service and category names fall back to English for those
// three until translated names are added to the catalogue.
const DICT: Record<Lang, Record<string, string>> = {
  en: {
    chooseCategory: "Choose a category",
    allCategories: "All",
    changeCategory: "Change category",
    chooseServices: "Choose your service(s)",
    duration: "Duration",
    chooseTime: "Pick a date and time",
    findTimes: "Find times",
    yourDetails: "Your details",
    confirm: "Confirm booking",
    booked: "You're booked!",
    total: "Total",
    noOpenings: "No openings that day — try another date.",
    payDeposit: "Pay deposit",
    depositTitle: "Secure your booking with a deposit",
    depositNote: "deposit required to confirm",
    noServices: "No services are available online yet.",
    date: "Date",
    firstName: "First name",
    lastName: "Last name",
    phone: "Phone",
  },
  th: {
    chooseCategory: "เลือกหมวดหมู่",
    allCategories: "ทั้งหมด",
    changeCategory: "เปลี่ยนหมวดหมู่",
    chooseServices: "เลือกบริการของคุณ",
    duration: "ระยะเวลา",
    chooseTime: "เลือกวันและเวลา",
    findTimes: "ค้นหาเวลาว่าง",
    yourDetails: "ข้อมูลของคุณ",
    confirm: "ยืนยันการจอง",
    booked: "จองสำเร็จแล้ว!",
    total: "ยอดรวม",
    noOpenings: "ไม่มีคิวว่างในวันนี้ ลองเลือกวันอื่น",
    payDeposit: "ชำระเงินมัดจำ",
    depositTitle: "ชำระมัดจำเพื่อยืนยันการจอง",
    depositNote: "ต้องชำระมัดจำเพื่อยืนยัน",
    noServices: "ยังไม่มีบริการให้จองออนไลน์",
    date: "วันที่",
    firstName: "ชื่อ",
    lastName: "นามสกุล",
    phone: "เบอร์โทร",
  },
  zh: {
    chooseCategory: "选择类别",
    allCategories: "全部",
    changeCategory: "更改类别",
    chooseServices: "选择您的服务",
    duration: "时长",
    chooseTime: "选择日期和时间",
    findTimes: "查找可用时间",
    yourDetails: "您的信息",
    confirm: "确认预约",
    booked: "预约成功！",
    total: "总计",
    noOpenings: "当天没有空档，请选择其他日期。",
    payDeposit: "支付押金",
    depositTitle: "支付押金以确认预约",
    depositNote: "需支付押金以确认",
    noServices: "暂无可在线预约的服务。",
    date: "日期",
    firstName: "名",
    lastName: "姓",
    phone: "电话",
  },
  ko: {
    chooseCategory: "카테고리 선택",
    allCategories: "전체",
    changeCategory: "카테고리 변경",
    chooseServices: "서비스를 선택하세요",
    duration: "소요 시간",
    chooseTime: "날짜와 시간 선택",
    findTimes: "가능한 시간 찾기",
    yourDetails: "고객 정보",
    confirm: "예약 확정",
    booked: "예약이 완료되었습니다!",
    total: "합계",
    noOpenings: "해당 날짜에 빈 자리가 없습니다. 다른 날짜를 선택해 주세요.",
    payDeposit: "예약금 결제",
    depositTitle: "예약금을 결제하여 예약을 확정하세요",
    depositNote: "확정을 위해 예약금이 필요합니다",
    noServices: "아직 온라인 예약 가능한 서비스가 없습니다.",
    date: "날짜",
    firstName: "이름",
    lastName: "성",
    phone: "전화번호",
  },
  ja: {
    chooseCategory: "カテゴリーを選択",
    allCategories: "すべて",
    changeCategory: "カテゴリーを変更",
    chooseServices: "サービスを選択してください",
    duration: "所要時間",
    chooseTime: "日時を選択",
    findTimes: "空き時間を検索",
    yourDetails: "お客様情報",
    confirm: "予約を確定する",
    booked: "予約が完了しました！",
    total: "合計",
    noOpenings: "その日は空きがありません。別の日をお試しください。",
    payDeposit: "デポジットを支払う",
    depositTitle: "デポジットを支払って予約を確定してください",
    depositNote: "確定にはデポジットが必要です",
    noServices: "オンライン予約可能なサービスはまだありません。",
    date: "日付",
    firstName: "名",
    lastName: "姓",
    phone: "電話番号",
  },
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function optionsFor(service: Service): PriceOption[] {
  return service.service_price_options.length > 0
    ? [...service.service_price_options].sort((a, b) => a.duration_minutes - b.duration_minutes)
    : [{ duration_minutes: service.duration_minutes, price_cents: service.default_price_cents }];
}

export function BookingFlow({
  branchId,
  services,
  categories,
  depositRequired,
}: {
  branchId: string;
  services: Service[];
  categories: Category[];
  depositRequired: boolean;
}) {
  const [lang, setLang] = useState<Lang>("en");
  const [categoryId, setCategoryId] = useState<string | "all" | null>(categories.length > 0 ? null : "all");
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [date, setDate] = useState(todayIso());
  const [slots, setSlots] = useState<string[] | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [depositSecret, setDepositSecret] = useState<string | null>(null);
  const [depositAmountCents, setDepositAmountCents] = useState<number | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const t = DICT[lang];

  function categoryName(c: Category) {
    if (lang === "th" && c.name_th) return c.name_th;
    if (lang === "zh" && c.name_zh) return c.name_zh;
    if (lang === "ko" && c.name_ko) return c.name_ko;
    if (lang === "ja" && c.name_ja) return c.name_ja;
    return c.name;
  }

  function serviceName(s: Service) {
    return lang === "th" && s.name_th ? s.name_th : s.name;
  }

  const visibleServices = useMemo(
    () => (categoryId && categoryId !== "all" ? services.filter((s) => s.category_id === categoryId) : services),
    [services, categoryId],
  );

  function toggleService(service: Service) {
    setSlots(null);
    setSelectedSlot(null);
    setSelections((prev) => {
      const next = { ...prev };
      if (next[service.id]) {
        delete next[service.id];
      } else {
        const firstOption = optionsFor(service)[0];
        next[service.id] = {
          serviceId: service.id,
          duration: firstOption.duration_minutes,
          priceCents: firstOption.price_cents,
        };
      }
      return next;
    });
  }

  function setDuration(service: Service, duration: number) {
    const option = optionsFor(service).find((o) => o.duration_minutes === duration);
    if (!option) return;
    setSlots(null);
    setSelectedSlot(null);
    setSelections((prev) => ({
      ...prev,
      [service.id]: { serviceId: service.id, duration: option.duration_minutes, priceCents: option.price_cents },
    }));
  }

  const selectionList = Object.values(selections);
  const totalDuration = selectionList.reduce((sum, s) => sum + s.duration, 0);
  const totalPrice = selectionList.reduce((sum, s) => sum + s.priceCents, 0);

  async function handleFindSlots() {
    setLoadingSlots(true);
    setError(null);
    const result = await findAvailableSlots({ branchId, date, durationMinutes: totalDuration });
    setLoadingSlots(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSlots(result.slots);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedSlot) return;
    setSubmitting(true);
    setError(null);
    const result = await submitBooking({
      branchId,
      serviceIds: selectionList.map((s) => s.serviceId),
      durations: selectionList.map((s) => s.duration),
      startAt: selectedSlot,
      firstName,
      lastName,
      email,
      phone,
    });

    if (!result.ok) {
      setSubmitting(false);
      setError(result.error);
      return;
    }

    if (depositRequired && result.appointmentId) {
      const deposit = await createDepositPaymentIntent({
        appointmentId: result.appointmentId,
        branchId,
        totalPriceCents: totalPrice,
      });
      setSubmitting(false);
      if (!deposit.ok) {
        setError(deposit.error);
        return;
      }
      setDepositSecret(deposit.clientSecret);
      setDepositAmountCents(deposit.amountCents);
      return;
    }

    setSubmitting(false);
    setConfirmed(true);
  }

  const langToggle = (
    <div className="flex flex-wrap justify-end gap-1">
      <div className="inline-flex flex-wrap items-center gap-0.5 rounded-full border border-border bg-secondary/50 p-0.5 text-sm">
        {LANG_OPTIONS.map((opt) => (
          <button
            key={opt.code}
            type="button"
            onClick={() => setLang(opt.code)}
            className={cn(
              "rounded-full px-3 py-1 transition-colors",
              lang === opt.code ? "bg-card font-medium shadow-sm" : "text-muted-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );

  if (depositSecret && !confirmed) {
    return (
      <div className="space-y-4">
        {langToggle}
        <Card>
          <CardHeader>
            <CardTitle>{t.depositTitle}</CardTitle>
            <CardDescription>
              {t.total}: {depositAmountCents !== null ? formatCents(depositAmountCents) : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DepositCheckout
              clientSecret={depositSecret}
              onSuccess={() => setConfirmed(true)}
              payLabel={t.payDeposit}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="space-y-4">
        {langToggle}
        <Card>
          <CardHeader>
            <CardTitle>{t.booked}</CardTitle>
            <CardDescription>
              {new Date(selectedSlot!).toLocaleString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {firstName} {lastName}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {langToggle}

      {categoryId === null ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.chooseCategory}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {categories.map((c) => {
                const textColor = c.background_color ? contrastTextColor(c.background_color) : "#fff";
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategoryId(c.id)}
                    className="group flex aspect-square flex-col overflow-hidden rounded-2xl border border-border shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div
                      className="relative flex-[3] bg-cover bg-center"
                      style={
                        c.image_url
                          ? { backgroundImage: `linear-gradient(180deg, rgba(47,74,63,0.15), rgba(30,50,42,0.55)), url(${c.image_url})` }
                          : c.background_color
                            ? { backgroundColor: c.background_color }
                            : { backgroundImage: "linear-gradient(160deg, #7fa085 0%, #4c6b52 55%, #2f4a3f 100%)" }
                      }
                    />
                    <div
                      className="flex flex-1 flex-col items-start justify-center gap-0.5 px-3 py-2 text-left"
                      style={{
                        backgroundColor: c.background_color ?? "#25382d",
                        color: textColor,
                      }}
                    >
                      <span className="font-display text-sm font-medium leading-tight">{categoryName(c)}</span>
                      {c.description && (
                        <span className="line-clamp-2 text-[11px]" style={{ opacity: 0.8 }}>
                          {c.description}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setCategoryId("all")}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border bg-muted/40 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground"
              >
                {t.allCategories}
              </button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {categories.length > 0 && (
            <button
              type="button"
              onClick={() => setCategoryId(null)}
              className="text-sm text-primary hover:underline"
            >
              &larr; {t.changeCategory}
            </button>
          )}
          <Card>
            <CardHeader>
              <CardTitle>{t.chooseServices}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {visibleServices.map((service) => {
                const selection = selections[service.id];
                const options = optionsFor(service);
                return (
                  <div
                    key={service.id}
                    className={cn(
                      "rounded-xl border p-4 text-sm transition-colors",
                      selection ? "border-primary/50 bg-secondary/50" : "border-border hover:border-primary/30",
                    )}
                  >
                    <label className="flex cursor-pointer items-center justify-between gap-3">
                      <span className="flex items-center gap-3">
                        <span
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                            selection ? "border-primary bg-primary text-primary-foreground" : "border-border",
                          )}
                          aria-hidden
                        >
                          {selection && (
                            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
                              <path
                                d="M2.5 6.5L4.75 8.75L9.5 3.5"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </span>
                        <input
                          type="checkbox"
                          checked={Boolean(selection)}
                          onChange={() => toggleService(service)}
                          className="sr-only"
                        />
                        {service.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={service.image_url} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                        ) : service.background_color ? (
                          <span
                            className="h-8 w-8 shrink-0 rounded-lg"
                            style={{ backgroundColor: service.background_color }}
                            aria-hidden
                          />
                        ) : null}
                        <span className="font-medium">{serviceName(service)}</span>
                      </span>
                      {selection && (
                        <span className="whitespace-nowrap font-display text-base">
                          {formatCents(selection.priceCents)}
                        </span>
                      )}
                    </label>
                    {selection && options.length > 0 && (
                      <div className="mt-3 flex items-center gap-2 pl-8">
                        <Label htmlFor={`duration-${service.id}`} className="normal-case tracking-normal">
                          {t.duration}
                        </Label>
                        <select
                          id={`duration-${service.id}`}
                          value={selection.duration}
                          onChange={(e) => setDuration(service, Number(e.target.value))}
                          className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
                        >
                          {options.map((o) => (
                            <option key={o.duration_minutes} value={o.duration_minutes}>
                              {o.duration_minutes} min &middot; {formatCents(o.price_cents)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
              {visibleServices.length === 0 && <p className="text-muted-foreground">{t.noServices}</p>}
            </CardContent>
          </Card>
        </>
      )}

      {selectionList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t.chooseTime}</CardTitle>
            <CardDescription>
              {t.total}: {totalDuration} min &middot;{" "}
              <span className="font-display text-foreground">{formatCents(totalPrice)}</span>
              {depositRequired && <span className="text-accent"> &middot; {t.depositNote}</span>}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="date">{t.date}</Label>
                <Input
                  id="date"
                  type="date"
                  min={todayIso()}
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setSlots(null);
                    setSelectedSlot(null);
                  }}
                />
              </div>
              <Button type="button" onClick={handleFindSlots} disabled={loadingSlots}>
                {loadingSlots ? "..." : t.findTimes}
              </Button>
            </div>

            {slots && (
              <div className="flex flex-wrap gap-2">
                {slots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={cn(
                      "rounded-full border px-4 py-1.5 text-sm transition-colors hover:border-primary/50",
                      selectedSlot === slot
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border",
                    )}
                  >
                    {new Date(slot).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </button>
                ))}
                {slots.length === 0 && <p className="text-sm text-muted-foreground">{t.noOpenings}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedSlot && (
        <Card>
          <CardHeader>
            <CardTitle>{t.yourDetails}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName">{t.firstName}</Label>
                  <Input id="firstName" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">{t.lastName}</Label>
                  <Input id="lastName" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">{t.phone}</Label>
                <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "..." : t.confirm}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
