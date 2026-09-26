import { TH } from "@/lib/i18n/th-dictionary";

const MONTHS: Record<string, string> = {
  jan: "ม.ค.", feb: "ก.พ.", mar: "มี.ค.", apr: "เม.ย.", may: "พ.ค.", jun: "มิ.ย.",
  jul: "ก.ค.", aug: "ส.ค.", sep: "ก.ย.", oct: "ต.ค.", nov: "พ.ย.", dec: "ธ.ค.",
};
const MONTHS_FULL: Record<string, string> = {
  january: "มกราคม", february: "กุมภาพันธ์", march: "มีนาคม", april: "เมษายน", may: "พฤษภาคม", june: "มิถุนายน",
  july: "กรกฎาคม", august: "สิงหาคม", september: "กันยายน", october: "ตุลาคม", november: "พฤศจิกายน", december: "ธันวาคม",
};
const WEEKDAYS: Record<string, string> = {
  monday: "วันจันทร์", tuesday: "วันอังคาร", wednesday: "วันพุธ", thursday: "วันพฤหัสบดี",
  friday: "วันศุกร์", saturday: "วันเสาร์", sunday: "วันอาทิตย์",
  mon: "จ.", tue: "อ.", wed: "พ.", thu: "พฤ.", fri: "ศ.", sat: "ส.", sun: "อา.",
};

const MONTH_RE =
  "(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\\.?";

function month(name: string) {
  const key = name.toLowerCase();
  return MONTHS_FULL[key] ?? MONTHS[key.slice(0, 3)] ?? name;
}

/** Rewrites English dates and times inside a string: "Mon, Sep 26, 2026"
 * becomes "จ. 26 ก.ย. 2026", "2:30 PM" becomes "14:30 น.". Years stay in
 * the Gregorian calendar so they match date pickers and payroll periods. */
function translateDates(text: string): string {
  if (!/\d/.test(text)) return text;
  let out = text.replace(/\b(\d{1,2}):(\d{2})\s?(AM|PM|am|pm)\b/g, (_, h: string, m: string, ap: string) => {
    let hour = Number(h) % 12;
    if (ap.toLowerCase() === "pm") hour += 12;
    return `${String(hour).padStart(2, "0")}:${m} น.`;
  });
  let hadDate = false;
  out = out.replace(new RegExp(`\\b${MONTH_RE} (\\d{1,2})(?:, (\\d{4}))?\\b`, "g"), (_, mo: string, d: string, y?: string) => {
    hadDate = true;
    return `${d} ${month(mo)}${y ? ` ${y}` : ""}`;
  });
  out = out.replace(new RegExp(`\\b(\\d{1,2}) ${MONTH_RE}(?:,? (\\d{4}))?\\b`, "g"), (_, d: string, mo: string, y?: string) => {
    hadDate = true;
    return `${d} ${month(mo)}${y ? ` ${y}` : ""}`;
  });
  out = out.replace(new RegExp(`\\b${MONTH_RE} (\\d{4})\\b`, "g"), (_, mo: string, y: string) => {
    hadDate = true;
    return `${month(mo)} ${y}`;
  });
  if (hadDate) {
    out = out.replace(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b,?/g, (_, w: string) =>
      WEEKDAYS[w.toLowerCase()] ?? w,
    );
  }
  return out;
}

/** English sentences with a value in the middle. */
const PATTERNS: [RegExp, string][] = [
  [/^Delete (.+)\? This removes their account and can't be undone\.$/, "ลบ $1 หรือไม่? บัญชีจะถูกลบและกู้คืนไม่ได้"],
  [/^Delete (\d+) therapists?\? This can't be undone\.$/, "ลบหมอนวด $1 คนหรือไม่? กู้คืนไม่ได้"],
  [/^Remove "(.+)"\?$/, "ลบ \"$1\" หรือไม่?"],
  [/^Remove (.+) from all services\? .*$/, "ลบภาษา $1 ออกจากทุกบริการหรือไม่? คำแปลที่บันทึกไว้จะยังอยู่และกลับมาเมื่อเพิ่มภาษานี้อีกครั้ง"],
  [/^Remove the (.+) photo\?$/, "ลบรูปนี้หรือไม่?"],
  [/^Remaining: (.+)$/, "คงเหลือ: $1"],
  [/^Payments must equal the total\. Remaining: (.+)\.$/, "ยอดชำระต้องเท่ากับยอดรวม คงเหลือ: $1"],
  [/^Sale complete — paid (.+) \(freelance\) in cash\.( Saved as (\S+)\.)?$/, "ขายสำเร็จ — จ่ายเงินสดให้ $1 (ฟรีแลนซ์) แล้ว บันทึกเป็น $3"],
  [/^Sale complete — (.+) is now in service\.( Saved as (\S+)\.)?$/, "ขายสำเร็จ — $1 กำลังให้บริการ บันทึกเป็น $3"],
  [/^In use by (.+)$/, "กำลังใช้งานโดย $1"],
  [/^Set password for (\d+)$/, "ตั้งรหัสผ่านให้ $1 คน"],
  [/^Select (.+)$/, "เลือก $1"],
  [/^(\d+) jobs?$/, "$1 งาน"],
  [/^(\d+) min$/, "$1 นาที"],
  [/^(\d+(?:\.\d+)?) ?h$/, "$1 ชม."],
  [/^Signed in as (.+)$/, "เข้าสู่ระบบในชื่อ $1"],
  [/^(\d+) min left$/, "เหลือ $1 นาที"],
  [/^(\d+) more$/, "อีก $1 รายการ"],
  [/^(\d+) selected$/, "เลือกแล้ว $1"],
  [/^Remove (.+)'s check-in\? You can check them in again afterwards\.$/, "ลบการเช็คอินของ $1 หรือไม่? เช็คอินใหม่ได้ภายหลัง"],
  [/^You already have a drawer open \((.+)\)\. Close it before opening another\.$/, "คุณเปิดลิ้นชักไว้แล้ว ($1) ปิดก่อนเปิดเครื่องอื่น"],
  [/^Already checked in at (.+) today\. A therapist can only work at one store per day\.$/, "เช็คอินที่ $1 แล้ววันนี้ หมอนวดทำงานได้วันละหนึ่งสาขาเท่านั้น"],
  [/^Starts in (\d+) min$/, "เริ่มในอีก $1 นาที"],
  [/^\(?Booked (\d{2}:\d{2}–\d{2}:\d{2})\)?$/, "จองแล้ว $1"],
  [/^\(?In service until about (\d{2}:\d{2})\)?$/, "ให้บริการถึงประมาณ $1"],
  [/^(.+) is already booked from (\S+) to (\S+)\. Pick another therapist or time\.$/, "$1 มีคิวจองแล้ว $2–$3 เลือกหมอนวดหรือเวลาอื่น"],
  [/^That therapist isn't free: (.+)\. Pick another therapist or time\.$/, "หมอนวดคนนี้ไม่ว่าง: $1 เลือกหมอนวดหรือเวลาอื่น"],
  [/^This therapist isn't free for (\d+) min: (.+)\. Pick another therapist or a shorter service\.$/, "หมอนวดคนนี้ไม่ว่าง $1 นาที: $2 เลือกหมอนวดอื่นหรือบริการที่สั้นกว่า"],
];

/**
 * Thai for one piece of English interface text, or null when there is no
 * translation. Surrounding whitespace is kept so inline text still spaces
 * correctly next to values.
 */
export function translateText(raw: string): string | null {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw);
  if (!match) return null;
  const [, lead, body, trail] = match;
  if (!body || !/[A-Za-z]/.test(body)) return null;
  const core = body.replace(/\s+/g, " ");

  const direct = TH[core];
  if (direct !== undefined) return lead + direct + trail;

  for (const [re, replacement] of PATTERNS) {
    if (re.test(core)) return lead + core.replace(re, replacement) + trail;
  }

  // "3 jobs · Signed in as Owner": translate each "·"-separated part.
  if (core.includes(" · ")) {
    const parts = core.split(" · ");
    const translated = parts.map((part) => translateText(part) ?? part);
    if (translated.some((t, i) => t !== parts[i])) return lead + translated.join(" · ") + trail;
  }

  const dated = translateDates(core);
  if (dated !== core) return lead + dated + trail;
  return null;
}
