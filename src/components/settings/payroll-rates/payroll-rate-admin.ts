import type { components } from "@/lib/api/schema";

import { checkRatePct, type BracketDraft, type DecimalCheck } from "./payroll-rate-guards";
import type { DeepScale } from "@/lib/api/scale";

export type WorkerSource = components["schemas"]["WorkerSource"];
export type IncomeKind = components["schemas"]["IncomeKind"];
export type PayrollRateResponse = DeepScale<components["schemas"]["PayrollRateResponse"]>;
export type PayrollTaxBracketResponse = DeepScale<components["schemas"]["PayrollTaxBracketResponse"]>;
export type PayrollPeriodListRow = components["schemas"]["PayrollPeriodListRow"];

/* ------------------------------------------------------------ personel tipi */

/**
 * 🔴 `WorkerSource` BEŞ üye taşır ama BORDRO TİPİ DÖRTTÜR.
 *
 * Ölçüldü (backend `site_diary/models.py::WorkerSource` docstring, sözleşmeye
 * birebir yansımış): *"`general` ("genel işçi", GK418-430) bordro tipi
 * DEĞİLDİR: BY dört bölüm çiziyor, bu değerin oran satırı yoktur."* Mockup da
 * DÖRT sekme çizer. Beşini körlemesine basmak, oran satırı hiç olmayacak bir
 * tip için sekme açardı.
 *
 * 🔑 Sözlük BEŞ üyeyi de taşır ve `Record<WorkerSource, …>`dır: enum'a yeni
 * üye eklendiğinde `pnpm typecheck` BURADA kırmızı döner. Hangi üyenin bordro
 * tipi olduğu ayrıca `payroll-rate-admin.contract.test.ts` ile `openapi.json`
 * OKUNARAK bekçilenir — elle yazılmış bir liste bayatlar.
 */
export const WORKER_SOURCE_LABELS: Record<WorkerSource, string> = {
  company: "Şirket Kadrosu",
  subcontractor: "Taşeron İşçisi",
  general: "Genel İşçi",
  freelance: "Serbest Meslek",
  intern: "Stajyer",
};

/** Oran seti tutulan DÖRT tip — mockup sekme sırası (`:104-121`). */
export const PAYROLL_TYPE_SOURCES: readonly WorkerSource[] = [
  "company",
  "subcontractor",
  "freelance",
  "intern",
];

/** Bordro tipi OLMAYAN üyeler. Birleşimleri enum'un TAMAMINI vermelidir. */
export const NON_PAYROLL_SOURCES: readonly WorkerSource[] = ["general"];

/* --------------------------------------------------------------- gelir türü */

export const INCOME_KIND_LABELS: Record<IncomeKind, string> = {
  wage: "Ücret",
  non_wage: "Ücret Dışı",
};

export const INCOME_KINDS: readonly IncomeKind[] = ["wage", "non_wage"];

/* ---------------------------------------------------------------- yıl kümesi */

/** Sözleşme kısıtı: `Path(ge=2000, le=2100)` — iki uçta da aynı. */
export const MIN_PAYROLL_YEAR = 2000;
export const MAX_PAYROLL_YEAR = 2100;

/**
 * 🔴 `GET /payroll/rates` BİR YIL KATALOĞU DEĞİLDİR — ölçüldü
 * (`payroll/service/rates.py::list_rates`): sorgu `select(PayrollRate)`tir,
 * yani YALNIZ GİRİLMİŞ satırları döner. Girilmemiş bir yıl (2027) için yanıt
 * `{items: [], total: 0}`dır; ekran o yılı kendi kümesine EKLEMEZSE kullanıcı
 * onu HİÇ seçemez ve *tam da bu ekranın var oluş sebebi olan* "2027 oranı gir"
 * işi yapılamaz. (F-OKROL kanonu: *bir ucun neyin kümesi olduğu sorgu
 * GÖVDESİNDEN cevaplanır, adından değil.*)
 *
 * Bu yüzden seçenek kümesi = **veride geçen yıllar** ∪ **bu yıl** ∪
 * **gelecek yıl**. Gelecek yıl olmadan ekran kendi işini yapamaz.
 */
export function buildYearOptions(
  dataYears: readonly number[],
  currentYear: number,
): number[] {
  const set = new Set<number>(dataYears);
  set.add(currentYear);
  set.add(currentYear + 1);
  return [...set]
    .filter((year) => year >= MIN_PAYROLL_YEAR && year <= MAX_PAYROLL_YEAR)
    .sort((a, b) => b - a);
}

/**
 * Açılışta seçili yıl. 🔴 `new Date().getFullYear()` DOĞRUDAN kullanılmaz:
 * takvim yılı verinin ötesine geçtiğinde ekran her açılışta BOŞ HÂLDE açılır
 * ve kullanıcı dolu yılı elle aramak zorunda kalırdı. Veride en yeni yıl
 * varsayılandır; hiç veri yoksa bu yıl.
 */
export function defaultYear(dataYears: readonly number[], currentYear: number): number {
  const known = dataYears.filter((year) => year <= currentYear + 1);
  return known.length > 0 ? Math.max(...known) : currentYear;
}

/* ------------------------------------------------------------- yıl kilitleri */

/** `service/rates.py::LOCKED_PERIOD_STATUSES` — hesabı DONMUŞ dönem durumları. */
export const LOCKED_PERIOD_STATUSES: readonly components["schemas"]["PayrollPeriodStatus"][] = [
  "approved",
  "paid",
];

/**
 * 🔴 GEÇMİŞ DÖNEM DEĞİŞMEZ — o yılda `approved`/`paid` bir dönem varsa İKİ
 * yazma ucu da **409** döner (`guards.RATES_LOCKED_BY_PERIOD` /
 * `TAX_BRACKETS_LOCKED_BY_PERIOD`). Kapı YILA kapanır, tipe değil.
 *
 * Bu ÖN kapıdır, TEK kapı değildir: sunucunun 409'u yine yakalanır ve
 * gösterilir (kilit `FOR UPDATE`lidir, istemcinin okuduğu liste bayatlayabilir).
 */
export function isYearLocked(periods: readonly PayrollPeriodListRow[], year: number): boolean {
  return periods.some(
    (period) => period.year === year && LOCKED_PERIOD_STATUSES.includes(period.status),
  );
}

/* ----------------------------------------------------------- oran taslakları */

/** Yedi oran alanının KANONİK sırası — `PayrollRateUpdate` gövde sırası. */
export const RATE_FIELDS = [
  "sgk_employee_pct",
  "unemployment_employee_pct",
  "income_tax_pct",
  "stamp_tax_pct",
  "sgk_employer_pct",
  "unemployment_employer_pct",
  "short_work_pct",
] as const;

export type RateField = (typeof RATE_FIELDS)[number];

/**
 * Ekrandaki oran taslağı. Alanlar METİNDİR: kullanıcı yazarken `Number`a
 * uğrayan bir değer "0,7590000000001" gibi geri basılırdı.
 *
 * `income_tax_pct` boş string ⇒ gövdede `null` ⇒ **DİLİMLİ REJİM**.
 */
export type RateDraft = Record<RateField, string> & { isActive: boolean };

export const EMPTY_RATE_DRAFT: RateDraft = {
  sgk_employee_pct: "",
  unemployment_employee_pct: "",
  income_tax_pct: "",
  stamp_tax_pct: "",
  sgk_employer_pct: "",
  unemployment_employer_pct: "",
  short_work_pct: "",
  isActive: true,
};

export function rateToDraft(rate: PayrollRateResponse): RateDraft {
  return {
    sgk_employee_pct: rate.sgk_employee_pct,
    unemployment_employee_pct: rate.unemployment_employee_pct,
    income_tax_pct: rate.income_tax_pct ?? "",
    stamp_tax_pct: rate.stamp_tax_pct,
    sgk_employer_pct: rate.sgk_employer_pct,
    unemployment_employer_pct: rate.unemployment_employer_pct,
    short_work_pct: rate.short_work_pct,
    isActive: rate.is_active,
  };
}

export type RateDraftCheck =
  | { ok: true; body: DeepScale<components["schemas"]["PayrollRateUpdate"]> }
  | { ok: false; field: RateField; reason: string };

/**
 * Taslağı `PUT /payroll/rates/{year}/{source}` gövdesine çevirir.
 *
 * 🔴 YEDİ ALANIN HEPSİ ZORUNLUDUR (`PayrollRateUpdate` `required`): kısmi
 * gönderim kabul edilseydi eksik alan sessizce 0 olur ve *"kesinti yok"*
 * yalanı üretilirdi. TEK istisna `income_tax_pct`tir ve o da EKSİK DEĞİL,
 * AÇIKÇA `null` gider.
 */
export function rateDraftToBody(draft: RateDraft): RateDraftCheck {
  const body: Record<string, string | null | boolean> = { is_active: draft.isActive };
  for (const field of RATE_FIELDS) {
    const raw = draft[field];
    if (field === "income_tax_pct" && raw.trim() === "") {
      body[field] = null;
      continue;
    }
    const checked: DecimalCheck = checkRatePct(raw);
    if (!checked.ok) return { ok: false, field, reason: checked.reason };
    body[field] = checked.value;
  }
  return { ok: true, body: body as DeepScale<components["schemas"]["PayrollRateUpdate"]> };
}

/* --------------------------------------------------------- dilim taslakları */

let bracketKeySeq = 0;
function nextBracketKey(): string {
  bracketKeySeq += 1;
  return `br-${bracketKeySeq}`;
}

export function bracketsToDrafts(
  brackets: readonly PayrollTaxBracketResponse[],
): BracketDraft[] {
  return [...brackets]
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((bracket) => ({
      key: nextBracketKey(),
      upperBound: bracket.upper_bound ?? "",
      ratePct: bracket.rate_pct,
    }));
}

/** Yeni satır SONDAN BİR ÖNCEYE girer: son dilim sınırsız KALMALIDIR (kural 5). */
export function appendBracketDraft(drafts: readonly BracketDraft[]): BracketDraft[] {
  const fresh: BracketDraft = { key: nextBracketKey(), upperBound: "", ratePct: "" };
  if (drafts.length === 0) return [fresh];
  return [...drafts.slice(0, -1), { ...fresh, upperBound: "" }, drafts[drafts.length - 1]!];
}

export function removeBracketDraft(
  drafts: readonly BracketDraft[],
  key: string,
): BracketDraft[] {
  return drafts.filter((draft) => draft.key !== key);
}

export function emptyBracketDrafts(): BracketDraft[] {
  return [{ key: nextBracketKey(), upperBound: "", ratePct: "" }];
}

/**
 * Bir dilimin ALT sınırı — mockup `:216` *"Her dilimin alt sınırı önceki
 * dilimin üst sınırı + 1 olarak hesaplanır — elle girilmez."*
 *
 * 🔴 TÜREVDİR, SUNUCUYA GİTMEZ: `PayrollTaxBracketInput` alt sınır alanı
 * TAŞIMAZ (tarife birikimli okunur, alt sınır bir öncekinin üstünden çıkar).
 * Ayrıştırılamayan/boş bir önceki sınır `null` verir — "—" basılır, UYDURULMAZ.
 */
export function bracketLowerBound(previousUpperBound: string | undefined): string | null {
  if (previousUpperBound === undefined) return "0";
  const trimmed = previousUpperBound.trim().replace(",", ".");
  if (trimmed === "" || !/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole = "0", fraction = ""] = trimmed.split(".");
  const cents = BigInt(whole) * 100n + BigInt(`${fraction}00`.slice(0, 2)) + 1n;
  const sign = cents < 0n ? "-" : "";
  const digits = (cents < 0n ? -cents : cents).toString().padStart(3, "0");
  const kurus = digits.slice(-2);
  const lira = digits.slice(0, -2);
  return kurus === "00" ? `${sign}${lira}` : `${sign}${lira}.${kurus}`;
}

/* ------------------------------------------------------------------ metinler */

export const RATES_CARD_TITLE = "SGK ve Kesinti Oranları";
export const BRACKETS_CARD_TITLE = "Gelir Vergisi Dilimleri";
export const RATE_TYPE_MISSING_BADGE = "EKSİK";
export const RATE_TYPE_PRESENT_BADGE = "TAM";

/**
 * 🔴 TAM KÜME YAZMA UYARISI — `PUT …/tax-brackets/{year}/{income_kind}`
 * gövdesi tarifenin TAMAMIDIR (`PayrollTaxBracketSetUpdate`: *"Kısmi
 * güncelleme YOKTUR ve bu bir tercih değil, ZORUNLULUKTUR"*). Ekranın
 * satır-satır "×" / "+ Dilim Ekle" deseni bunu GİZLER; kullanıcı kısmi
 * kaydettiğini sanmamalıdır.
 */
export const BRACKETS_FULL_SET_WARNING =
  "Kaydet, tarifenin TAMAMINI değiştirir: aşağıdaki satırlar neyse yılın tarifesi o olur. " +
  "Sildiğiniz dilim sunucudan da silinir, kısmi güncelleme yoktur.";

export const RATES_FULL_SET_WARNING =
  "Kaydet, seçili tipin YEDİ oranını birden değiştirir — kısmi yama yoktur.";

/** Gelir vergisi oranı boşken hangi rejimin işlediğini SÖYLER (mockup ters yazmış). */
export const INCOME_TAX_NULL_HINT =
  "Boş bırakılırsa aşağıdaki gelir vergisi DİLİMLERİ kullanılır (artan oranlı tarife). " +
  "Bir değer yazılırsa dilimler devre dışı kalır ve bu düz oran uygulanır.";

export function rateLockedReason(year: number): string {
  return `${year} yılında onaylanmış veya ödenmiş bir bordro dönemi var: geçmiş hesabı değiştirmemek için bu yılın oranları ve gelir vergisi tarifesi düzenlenemez.`;
}

export function emptyYearTitle(year: number): string {
  return `${year} oranları henüz girilmemiş`;
}

/**
 * 🔴 Mockup `:96` "2026 → 2027 Kopyala" yazar; `→` (U+2192) `src/styles/fonts.css`in
 * HİÇBİR `unicode-range` kümesinde YOKTUR (ölçüldü: kapsanan oklar yalnız
 * `u+2191`/`u+2193`). Kapsanmayan glif sistem yedeğine düşer ve kare
 * `ubuntu-latest`te turdan tura oynar (F-MU2 kanonu) → metin sözcükle yazılır,
 * ok `ui/icons`in inline SVG'siyle basılır.
 */
export function copyFromLabel(sourceYear: number, targetYear: number): string {
  return `${sourceYear} oranlarını ${targetYear} yılına kopyala`;
}

export function copiedNotice(sourceYear: number, targetYear: number): string {
  return (
    `${sourceYear} oranları ve gelir vergisi tarifesi ${targetYear} formuna KOPYALANDI — ` +
    `henüz KAYDEDİLMEDİ. Gözden geçirip her tip için “Oranları Kaydet”e basın.`
  );
}
