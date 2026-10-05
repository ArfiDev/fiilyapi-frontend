import type { JournalLineInput } from "@/lib/api/hooks/useJournalEntryFormMutations";
import type { ChartAccountResponse } from "@/lib/api/hooks/useChartOfAccounts";
import type {
  JournalEntryDetailResponse,
  JournalEntryResponse,
} from "@/lib/api/hooks/useJournalEntries";
import type { JournalEntryUpdate } from "@/lib/api/hooks/useJournalEntryFormMutations";
import { normalizeDecimalInput, isZeroDecimalString, subtractDecimalStrings, sumDecimalStrings } from "@/lib/decimal";

/**
 * Yevmiye fişi diyaloğunun SAF katmanı: satır taslakları, tek-taraf kısıtı,
 * denge aritmetiği, kaydet kapısının engelleri ve ekranın SABİT METİNLERİ.
 *
 * 🔴 GÖVDE ŞEMADAN TÜRER, MOCKUP'TAN DEĞİL: alanlar `backend/app/modules/
 * accounting/schemas.py`ten BİREBİRdir — `entry_date` · `description` ·
 * `detail_note` · `lines[]{account_id, debit, credit}`. Sunucunun türev/damga
 * alanları (`status`, `total_debit`/`total_credit`, `period_year`/
 * `period_month`, `reversal_of_id`, satırın `sort_order`ı) gövdeye GİREMEZ:
 * şemalar `extra="forbid"`dir, gönderilirse **422**dir.
 *
 * 🔴 BAYAT SATIR DÜZELTİLDİ (F-MUF T4, sonra F-FISNO T3): burada eskiden "form
 * mockup'ı YOKTUR (S-FRM kanonu)" yazıyordu. ARTIK VAR — `projedesign/Form -
 * Yevmiye Kaydi.dc.html` (aşağıda `M:` = o dosyanın satırı) ve düzen/metin
 * ondan gelir. Şemadan türeme kuralı YİNE DE geçerlidir: `M:121` `Satır
 * Açıklaması` mockup'ın İCAT ETTİĞİ bir alandır ve BASILMAZ — gerekçe
 * `JournalLinesEditor` başında. `M:99-101` `Fiş No` ise ARTIK BASILIR: FIS-NO
 * dilimi `entry_no`yu üretti (`YEV-{yıl}-{sıra:04d}`), F-OK'un openapi devri
 * onu sözleşmeye `required` indirdi (`JournalEntryResponse` /
 * `JournalEntryDetailResponse`, nullable değil) — artık şemadan türer, gerekçe
 * `JournalEntryFormModal` başında.
 *
 * Bu modülde AĞ ve DOM yoktur; testi `journal-entry-form.test.ts`te yaşar.
 */

export interface JournalLineDraft {
  /** React `key`i — hesap kimliği DEĞİL: boş satırın da kimliği olmalı. */
  readonly key: string;
  readonly accountId: string;
  readonly debit: string;
  readonly credit: string;
  /**
   * 🔴 IZN-F4b.2 — sunucu bu bacağın tutarını GİZLEDİ (`debit`/`credit` `null`). Satır salt okunurdur:
   * tutarı bilinmeyen satır gövdeye KONMAZ ve boş/`0` sanılıp denge hesabına katılmaz.
   */
  readonly isMasked?: boolean;
}

export interface JournalEntryFormState {
  readonly entryDate: string;
  readonly description: string;
  readonly detailNote: string;
  readonly lines: readonly JournalLineDraft[];
}

/** Bir bacağın DOLU tarafı; ikisi de boşsa (ya da geçersizse) `null`. */
export type LineSide = "debit" | "credit";

/** Çift taraflı kaydın tanımı — sunucunun `MINIMUM_LINE_COUNT`u ile birebir. */
export const MINIMUM_LINE_COUNT = 2;

// --- Engel cümleleri -----------------------------------------------------

/**
 * 🔴 Denge ve satır sayısı cümleleri SUNUCUNUN metniyle birebirdir
 * (`validation.UNBALANCED` / `MIN_LINES_REQUIRED`). Aynı kural iki farklı
 * cümleyle anlatılsaydı, istemci kapısı ile sunucu 422'si aynı ekranda
 * çelişiyormuş gibi görünürdü.
 */
export const JOURNAL_FORM_BLOCKERS = {
  date: "Tarih zorunludur.",
  description: "Açıklama zorunludur.",
  minLines: "Fişte en az iki satır olmalıdır",
  account: "Her satırda hesap seçilmelidir.",
  amount: "Tutar geçerli bir sayı olmalıdır (negatif olamaz).",
  singleSide: "Fiş satırı ya borç ya alacak taşır; ikisi birden ya da ikisi de boş olamaz",
  unbalanced: "Fiş dengede değil: borç ve alacak toplamları eşit olmalıdır",
} as const;

// --- Ekranın sabit metinleri (M:) ----------------------------------------

/**
 * 🔴 `description` sınırı — ÖLÇÜLDÜ: `FREE_TEXT_MAX_LENGTH` = 2000
 * (`backend/app/core/text.py:15`, `accounting/schemas.py:292`).
 *
 * `M:96` "Maks 500 karakter" der ve YANLIŞTIR. `schema.d.ts` bu sınırı hiç
 * taşımaz (openapi üretimi Pydantic `Field` kısıtını düşürür), bu yüzden
 * ölçüm şemanın KENDİSİNDEN yapıldı. Mockup'ın sayısı basılsaydı kullanıcı
 * sunucunun İZİN VERDİĞİ metnin dörtte birinde durdurulurdu.
 */
export const JOURNAL_DESCRIPTION_MAX = 2000;

/** `M:105` detay notu sınırı — `_DETAIL_NOTE_MAX` (`schemas.py:239`). */
export const JOURNAL_DETAIL_NOTE_MAX = 200;

/** Mockup'ın çizili metinleri; `M:` = `Form - Yevmiye Kaydi.dc.html` satırı. */
export const JOURNAL_FORM_TEXT = {
  /** `M:83` */
  subtitle: "Çift taraflı kayıt — borç ve alacak toplamları eşit olmalı",
  /** `M:87` */
  headerCardTitle: "Fiş Bilgileri",
  /** `M:96` — sayı ölçümden gelir (yukarıdaki gerekçe). */
  descriptionHint: `Maks ${JOURNAL_DESCRIPTION_MAX} karakter · Yevmiye listesinde bu metin görünür`,
  /** `M:95` */
  descriptionPlaceholder: "Örn. Taşeron ödemesi — Akın İnşaat Hakediş #47",
  /** `M:100` */
  entryNoPlaceholder: "Otomatik",
  /** `M:101` — YALNIZ oluşturma kipinde basılır; numarası olan fişte YALAN olur. */
  entryNoHint: "Kayıtta üretilir",
  /** `M:106` */
  detailNotePlaceholder: "Fatura no, banka referansı, ek açıklama...",
  /** `M:113` */
  linesTitle: "Fiş Kalemleri",
  /** `M:114` */
  linesHint: "Her satırda ya borç ya alacak dolar — ikisi birden dolamaz",
} as const;

export interface BalanceNarration {
  readonly title: string;
  readonly detail: string;
}

/**
 * Denge bandının İKİ SATIRI (`M:200-201` dengesiz · `M:228-229` dengeli).
 *
 * 🔴 Tek cümle ("Fiş dengede değil; kaydedilemez.") ile İKİ satır arasındaki
 * fark biçimsel değildir: mockup gerekçeyi ("borç ve alacak toplamları eşit
 * olmadan") ikinci satırda AÇIKÇA yazar — kullanıcı neyi düzelteceğini
 * başlıktan değil oradan öğrenir.
 */
export function balanceNarration(isBalanced: boolean): BalanceNarration {
  return isBalanced
    ? { title: "Fiş dengede", detail: "Kaydedilmeye hazır" }
    : {
        title: "Fiş dengede değil",
        detail: "Borç ve alacak toplamları eşit olmadan kaydedilemez",
      };
}

/**
 * `M:251` — alt şeridin uyarısı. Fark BİÇİMLENMİŞ gelir (`formatAmount`);
 * burada biçimlendirme YAPILMAZ, aynı sayı iki farklı yerde iki farklı
 * biçimde görünmesin diye.
 *
 * `₺` (U+20BA) `fonts.css`in `u+20ad-20c0` aralığındadır — çıplak basılabilir
 * (çıplak glif yasağı `⚠`/`≠` içindir, bu ikisi ekranda HİÇ geçmez).
 */
export function differenceWarning(formattedDifference: string): string {
  return `Fark ₺${formattedDifference} — sıfırlanmadan fiş kaydedilemez`;
}

// --- Tarih ---------------------------------------------------------------

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Bugünün ISO tarihi — 🔴 **YEREL TAKVİMDEN**.
 *
 * `toISOString().slice(0,10)` YASAK: UTC'ye çevirir ve TR saatinde gün 03:00'ten
 * önce bir ÖNCEKİ güne düşerdi. Ayın ilk/son gününde bu, fişin DÖNEMİNİ
 * (`period_year`/`period_month`, sunucuda `entry_date`ten türer) bir ay
 * kaydırırdı — üretimde bulunmuş hata sınıfı (TB5), `accounting-labels`
 * `currentPeriod` ile aynı yaklaşım.
 */
export function todayIsoDate(today: Date): string {
  return `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
}

// --- Satır taslakları ----------------------------------------------------

export function emptyJournalLine(key: string): JournalLineDraft {
  return { key, accountId: "", debit: "", credit: "" };
}

/**
 * Yeni fiş İKİ boş satırla açılır: tek satır sunucunun `MIN_LINES_REQUIRED`
 * engeline takılır ve kullanıcı formu ancak "+ Satır Ekle"yi bulduktan sonra
 * kaydedebilirdi.
 */
export function initialJournalLines(): readonly JournalLineDraft[] {
  return [emptyJournalLine("line-0"), emptyJournalLine("line-1")];
}

/** Sunucudan gelen bacakları taslağa çevirir (düzenleme kipi). */
export function draftsFromEntry(
  entry: Pick<JournalEntryDetailResponse, "lines">,
): readonly JournalLineDraft[] {
  return entry.lines.map((line) => {
    // 🔴 IZN-F4b.2: `String(null)` = "null" olurdu; gizli bacak boş + `isMasked` taşır.
    if (line.debit === null || line.credit === null) {
      return { key: line.id, accountId: line.account_id, debit: "", credit: "", isMasked: true };
    }
    return {
      key: line.id,
      accountId: line.account_id,
      // Sunucu iki tarafı da basar; SIFIR olan taraf formda BOŞ görünür ki
      // tek-taraf kısıtı ekranda kendini anlatsın.
      debit: isZeroDecimalString(String(line.debit)) ? "" : String(line.debit),
      credit: isZeroDecimalString(String(line.credit)) ? "" : String(line.credit),
    };
  });
}

/** Satırlardan en az birinin tutarı gizli mi? Öyleyse satır kümesi TÜMÜYLE salt okunurdur (PUT bütün kümeyi değiştirir). */
export function hasMaskedLines(lines: readonly JournalLineDraft[]): boolean {
  return lines.some((line) => line.isMasked === true);
}

/**
 * Bir tarafa yazılan değer öteki tarafı TEMİZLER.
 *
 * 🔴 `ck_journal_lines_single_side` (DB) + `JournalLineInput._tek_taraf` (şema):
 * bir bacak TEK TARAFLIDIR. İstemci engellemeseydi kullanıcı iki tarafı da
 * doldurup 422 yer, hangi satırın suçlu olduğunu ekranda göremezdi.
 */
export function applyLineAmount(
  line: JournalLineDraft,
  side: LineSide,
  raw: string,
): JournalLineDraft {
  const isEmpty = raw.trim().length === 0;
  if (side === "debit") return { ...line, debit: raw, credit: isEmpty ? line.credit : "" };
  return { ...line, credit: raw, debit: isEmpty ? line.debit : "" };
}

/** Ondalık metni tutara indirger; geçersiz/negatif ise `null`. */
function positiveAmount(raw: string): string | null {
  const normalized = normalizeDecimalInput(raw);
  if (normalized === null) return null;
  if (normalized.startsWith("-")) return null;
  return isZeroDecimalString(normalized) ? null : normalized;
}

/**
 * Satırın dolu tarafı. "Dolu" = SIFIRDAN BÜYÜK: sunucu `(0,0)` satırını da
 * reddeder (`debit > 0` == `credit > 0` ise 422) — sıfır yazmak satırı doldurmaz.
 */
export function lineFilledSide(line: JournalLineDraft): LineSide | null {
  const debit = positiveAmount(line.debit);
  const credit = positiveAmount(line.credit);
  if (debit !== null && credit === null) return "debit";
  if (credit !== null && debit === null) return "credit";
  return null;
}

/** Öteki taraf kilitli mi? (bir tarafa değer girilince kutu kapanır) */
export function isSideLocked(line: JournalLineDraft, side: LineSide): boolean {
  const filled = lineFilledSide(line);
  return filled !== null && filled !== side;
}

// --- Denge ---------------------------------------------------------------

export interface JournalTotals {
  /** `null` = en az bir bacağın tutarı gizli (IZN-F4b.2); toplam BİLİNMEZ, 0 sayılmaz. */
  readonly totalDebit: string | null;
  readonly totalCredit: string | null;
  /** `Σ borç − Σ alacak`; gizli bacak varsa `null`. */
  readonly difference: string | null;
  readonly isBalanced: boolean;
  /** `false` = denge doğrulanamaz (gizli bacak): "dengesiz" uyarısı/engeli ÜRETİLMEZ. */
  readonly isVerifiable: boolean;
}

/**
 * 🔴 DENGE GÖSTERGESİ — para karşılaştırması KAYAN NOKTAYLA YAPILMAZ.
 *
 * `Number(a) === Number(b)` bir eşiği sessizce yanlış tarafa düşürür:
 * `0.1 + 0.2 !== 0.3`. Toplama `sumDecimalStrings`, fark
 * `subtractDecimalStrings`, sıfır denetimi `isZeroDecimalString` ile yapılır —
 * üçü de `lib/decimal.ts`in tek kaynağıdır, burada YENİ formül yazılmaz.
 *
 * Geçersiz/boş taraf `0` sayılır: o satır zaten kendi engelini üretir
 * (`amount`/`singleSide`), toplamın sayı olmayan bir terimle `NaN`a düşmesi ise
 * göstergeyi tamamen okunmaz yapardı.
 */
export function journalTotals(lines: readonly JournalLineDraft[]): JournalTotals {
  if (hasMaskedLines(lines)) {
    return { totalDebit: null, totalCredit: null, difference: null, isBalanced: true, isVerifiable: false };
  }
  const totalDebit = sumDecimalStrings(lines.map((line) => normalizeDecimalInput(line.debit) ?? "0"));
  const totalCredit = sumDecimalStrings(
    lines.map((line) => normalizeDecimalInput(line.credit) ?? "0"),
  );
  const difference = subtractDecimalStrings(totalDebit, totalCredit);
  return {
    totalDebit,
    totalCredit,
    difference,
    isBalanced: isZeroDecimalString(difference),
    isVerifiable: true,
  };
}

// --- Kaydet kapısı -------------------------------------------------------

/**
 * Kaydet düğmesinin kapısı: liste BOŞ değilse düğme KAPALIdır.
 *
 * Engeller LİSTE olarak döner (sunucunun `balance_blockers` deseni): kullanıcıya
 * eksikleri birer birer keşfettirmek çok satırlı bir fişte kabul edilemez.
 * Sıra sabittir — aynı formda cümlelerin yer değiştirmesi "başka bir hata"
 * izlenimi verirdi.
 */
export function journalFormBlockers(state: JournalEntryFormState): readonly string[] {
  const blockers: string[] = [];
  if (state.entryDate.trim().length === 0) blockers.push(JOURNAL_FORM_BLOCKERS.date);
  if (state.description.trim().length === 0) blockers.push(JOURNAL_FORM_BLOCKERS.description);
  if (state.lines.length < MINIMUM_LINE_COUNT) blockers.push(JOURNAL_FORM_BLOCKERS.minLines);
  if (state.lines.some((line) => line.accountId.length === 0))
    blockers.push(JOURNAL_FORM_BLOCKERS.account);
  // Gizli (maskeli) bacak tutar engellerine TAKILMAZ: tutarı kullanıcıya gösterilmez/gönderilmez.
  const visible = state.lines.filter((line) => line.isMasked !== true);
  if (visible.some((line) => hasInvalidAmount(line))) blockers.push(JOURNAL_FORM_BLOCKERS.amount);
  if (visible.some((line) => lineFilledSide(line) === null))
    blockers.push(JOURNAL_FORM_BLOCKERS.singleSide);
  const totals = journalTotals(state.lines);
  if (totals.isVerifiable && !totals.isBalanced) blockers.push(JOURNAL_FORM_BLOCKERS.unbalanced);
  return blockers;
}

/** Yazılmış ama sayı OLMAYAN (ya da negatif) taraf. Boş taraf geçersiz değildir. */
function hasInvalidAmount(line: JournalLineDraft): boolean {
  return [line.debit, line.credit].some((raw) => {
    if (raw.trim().length === 0) return false;
    const normalized = normalizeDecimalInput(raw);
    return normalized === null || normalized.startsWith("-");
  });
}

// --- Gövdeye çevirme -----------------------------------------------------

/**
 * 🔴 `debit` ve `credit` İKİSİ DE ZORUNLUDUR: boş bırakılan taraf `"0"` olarak
 * gider, `undefined` DEĞİL. Şema `| None` kabul etmez (NULL fail-closed) —
 * eksik alan **422**dir.
 */
export function toJournalLineInputs(
  lines: readonly JournalLineDraft[],
): readonly JournalLineInput[] {
  return lines.map((line) => ({
    account_id: line.accountId,
    debit: normalizeDecimalInput(line.debit) ?? "0",
    credit: normalizeDecimalInput(line.credit) ?? "0",
  }));
}

/** Satır kümesi gerçekten DEĞİŞTİ mi? Değişmediyse `PUT …/lines` hiç atılmaz. */
export function linesChanged(
  next: readonly JournalLineInput[],
  previous: readonly JournalLineInput[],
): boolean {
  if (next.length !== previous.length) return true;
  return next.some((line, index) => {
    const before = previous[index];
    return (
      line.account_id !== before.account_id ||
      !sameAmount(line.debit, before.debit) ||
      !sameAmount(line.credit, before.credit)
    );
  });
}

/** `"0"` ile `"0.00"` AYNI tutardır — metin eşitliği yanıltır. */
function sameAmount(a: number | string, b: number | string): boolean {
  return isZeroDecimalString(subtractDecimalStrings(String(a), String(b)));
}

/**
 * `PATCH` gövdesi yalnız DEĞİŞEN alanları taşır (`BoqItemFormModal` emsali).
 *
 * `detail_note` istisnadır: kolonu NULLABLE'dır, dolayısıyla boşaltmak GERÇEK
 * bir temizlemedir ve `null` olarak gönderilir.
 */
export function changedEntryFields(
  state: JournalEntryFormState,
  original: Pick<JournalEntryResponse, "entry_date" | "description" | "detail_note">,
): JournalEntryUpdate {
  const body: JournalEntryUpdate = {};
  if (state.entryDate !== original.entry_date) body.entry_date = state.entryDate;
  if (state.description.trim() !== original.description) body.description = state.description.trim();
  const nextNote = state.detailNote.trim();
  const previousNote = original.detail_note ?? "";
  if (nextNote !== previousNote) body.detail_note = nextNote.length === 0 ? null : nextNote;
  return body;
}

// --- Hesap seçici --------------------------------------------------------

/**
 * 🔴 **YAPRAK KURALI (backend §4c, `validation.leaf_blockers`)**: fiş satırı
 * yalnızca ÇOCUĞU OLMAYAN hesaba kesilebilir — üst hesabın bakiyesi
 * çocuklarınınkinin toplamıdır, ikisine birden kayıt atılırsa mizan ÇİFT SAYAR.
 *
 * Yaprak tanımı sunucudaki `repository.has_child_accounts` ile aynıdır: kodun
 * KENDİSİYLE BAŞLAYAN başka bir kod var mı (torunlar dahil, kendisi hariç).
 * `parent_id` FK yoktur, hiyerarşi kodun içindedir (K4).
 *
 * ⚠️ Katalog sayfalanmış (tavan 200) ya da süzülmüş gelirse bir çocuk listede
 * OLMAYABİLİR ve üst hesap yaprak SANILIR. Bu yüzden sunucunun 422'si son söz
 * olarak ekrana basılır — istemci süzgeci bir KOLAYLIK, kapı değildir.
 */
export function isLeafChartAccount(
  account: ChartAccountResponse,
  accounts: readonly ChartAccountResponse[],
): boolean {
  return !accounts.some(
    (other) => other.code !== account.code && other.code.startsWith(account.code),
  );
}

/** Satır seçicisinin seçenekleri — yalnız yaprak hesaplar. */
export function selectableLineAccounts(
  accounts: readonly ChartAccountResponse[] | undefined,
): readonly ChartAccountResponse[] {
  if (accounts === undefined) return [];
  return accounts.filter((account) => isLeafChartAccount(account, accounts));
}
