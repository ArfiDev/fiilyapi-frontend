/**
 * PLN-F2.3 · Gönder kontrol çubuğu (İ:493-510, Ek Formlar "(b) Gerekçe boş ·
 * Gönder engelli") + çekirdeğe verilen `submitGate` — SAF.
 *
 * TEK KAYNAK backend'dir: `days/{day}.submit` (`can_submit` + `reasons[]`,
 * B2 `submit_blockers`). Backend kaydedilmiş hâli bilir; bu yüzden istemci
 * yalnız KENDİ bildiğini ekler: kilitli gün ve — taslak kirliyken — önizlenen
 * saat gerekçesi (kayıt `onBeforeSave` ile gönderimden önce yazılır, S1).
 *
 * Çipler backend gerekçe KODUNA göre ayrılır (EV-BORC-2 kapandı — backend
 * `schemas_day.py` `reason_items`); metin
 * yalnız gösterilir. Tanınmayan kod kaybolmaz: kendi metniyle ayrı uyarı çipi olur.
 */
import type { EvSubmitCheck } from "@/lib/api/models";

import { formatHours, type Centi } from "./hours";

export type CheckTone = "ok" | "warn";

export interface SubmitCheck {
  key: string;
  tone: CheckTone;
  label: string;
  /** "gerekçe yaz" bağlantısı (İ:500) — yalnız saat çipinde. */
  canWriteReason: boolean;
}

export interface SubmitInput {
  submit: EvSubmitCheck | null;
  /** Önizlenen dağıtılmamış saat (K14). */
  unallocated: Centi;
  reason: string;
  isDirty: boolean;
  isLocked: boolean;
  isForeman: boolean;
}

export interface SubmitState {
  checks: SubmitCheck[];
  note: { text: string; tone: CheckTone };
  /** S4: gerekçeler yalnız kontrol çubuğunda — çekirdek kendi kutusunda listelemez. */
  gate: { canSubmit: boolean; reasons: readonly string[]; showReasonsInCore: false } | null;
}

export const LOCKED_DAY_REASON = "Gün kilitli";

export type ReasonKind = "quantity" | "overrun" | "weather" | "hours" | "other";

interface SubmitReason {
  code: string;
  message: string;
}

/** Backend `diary_adapter.submit_blockers` kodları; kalanlar (izin, `unspecified`, yeni kodlar) "other". */
const KIND_BY_CODE: ReadonlyMap<string, ReasonKind> = new Map([
  ["no_quantity", "quantity"],
  ["overrun_without_reason", "overrun"],
  ["weather_incomplete", "weather"],
  ["undistributed_hours", "hours"],
]);

/** Gerekçe kodunun çip TÜRÜ — ayrımın TEK yeri; bilinmeyen kod güvenli varsayılana ("other") düşer. */
export function reasonKind(code: string): ReasonKind {
  return KIND_BY_CODE.get(code) ?? "other";
}

/** `reason_items` yoksa (eski yanıt) her metin kodsuz sayılır — kaybolmaz, "other" çipi olur. */
function reasonItems(submit: EvSubmitCheck): readonly SubmitReason[] {
  return submit.reason_items ?? submit.reasons.map((message) => ({ code: "unspecified", message }));
}

function check(key: string, tone: CheckTone, label: string, canWriteReason = false): SubmitCheck {
  return { key, tone, label, canWriteReason };
}

function hoursCheck(unallocated: Centi, reason: string): SubmitCheck {
  if (unallocated === 0) return check("hours", "ok", "Bütün saatler dağıtıldı");
  const direction = unallocated > 0 ? "dağıtılmamış" : "fazla dağıtılmış";
  const hasReason = reason.trim() !== "";
  const tail = hasReason ? "gerekçe yazıldı" : "gönderim engelli";
  return check("hours", "warn", `${formatHours(Math.abs(unallocated))} a-s ${direction} · ${tail}`, !hasReason);
}

function buildChecks(reasons: readonly SubmitReason[], input: SubmitInput): SubmitCheck[] {
  const quantity = reasons.filter((r) => ["quantity", "overrun"].includes(reasonKind(r.code)));
  const weather = reasons.find((r) => reasonKind(r.code) === "weather");
  const others = reasons.filter((r) => reasonKind(r.code) === "other");
  return [
    // Kısıtlı kullanıcıda aynı `overrun_without_reason` kodu iki madde döner (DSC-B2: kendi, sonra opak).
    ...(quantity.length === 0
      ? [check("quantity", "ok", "Miktarlar girildi")]
      : quantity.map((r, i) => check(i === 0 ? "quantity" : `quantity-${i}`, "warn", r.message))),
    hoursCheck(input.unallocated, input.reason),
    weather ? check("weather", "warn", "Hava eksik") : check("weather", "ok", "Hava girildi"),
    ...others.map((r, i) => check(`other-${i}`, "warn", r.message)),
  ];
}

/**
 * Kaydedilmemiş dağıtım kapıyı KAPATMAZ: "Kaydet & Gönder" önce `onBeforeSave`
 * ile dağıtımı yazar (S1). Backend'in saat gerekçesi KAYDEDİLMİŞ hâle aittir;
 * taslak kirliyken o gerekçe yerine önizlemeden kurulan saat gerekçesi konur
 * (gerekçe yazıldıysa açılır). Backend gönderimde yine 422 ile doğrular.
 */
function buildGate(input: SubmitInput): SubmitState["gate"] {
  if (input.submit === null) return null;
  const items = reasonItems(input.submit);
  const reasons = (input.isDirty ? items.filter((r) => reasonKind(r.code) !== "hours") : items).map((r) => r.message);
  const hoursBlocked = input.unallocated !== 0 && input.reason.trim() === "";
  if (input.isDirty && hoursBlocked) reasons.push(`${formatHours(input.unallocated)} a-s dağıtılmamış; gerekçe gerekli`);
  if (input.isLocked) reasons.push(LOCKED_DAY_REASON);
  const backendAllows = input.isDirty || input.submit.can_submit;
  return { canSubmit: backendAllows && reasons.length === 0, reasons, showReasonsInCore: false };
}

function buildNote(input: SubmitInput, gate: SubmitState["gate"]): SubmitState["note"] {
  if (input.isLocked) return { text: "Gün kilitli", tone: "warn" };
  if (input.isForeman) return { text: "Gönderim mühendiste", tone: "warn" };
  if (input.unallocated !== 0 && input.reason.trim() === "") {
    return { text: "Dağıtılmamış saat gönderimi engelliyor", tone: "warn" };
  }
  const items = input.submit === null ? [] : reasonItems(input.submit);
  if (items.some((r) => reasonKind(r.code) === "overrun")) return { text: "Aşım gerekçesi gönderimi engelliyor", tone: "warn" };
  if (gate !== null && !gate.canSubmit) return { text: "Gönderim engelli", tone: "warn" };
  return { text: input.unallocated !== 0 ? "Gerekçeyle gönderilebilir" : "Gönderime hazır", tone: "ok" };
}

export function buildSubmitState(input: SubmitInput): SubmitState {
  const gate = buildGate(input);
  const items = input.submit === null ? [] : reasonItems(input.submit);
  return { checks: buildChecks(items, input), note: buildNote(input, gate), gate };
}

export interface AccessInput {
  /**
   * IZN-F6b · sayfa izni kararları (`useButtonGate`) — ZORUNLU.
   * Dağıtımı yazma = adam-saat bütçesi Düzenler; Kilidi aç = bütçe/günlük rapor Onaylar.
   */
  canWriteAllocation: boolean;
  canUnlockDay: boolean;
  diaryCanWrite: boolean;
  isLocked: boolean;
  isSiteCompleted: boolean;
}

export interface AllocationAccess {
  canEdit: boolean;
  /** İ:401 "Salt okunur · …" metni; düzenlenebilirse `null`. */
  readOnlyText: string | null;
  isForeman: boolean;
  /** İ:150-155 formen bandı: günlüğü yazar ama planlamayı yazamaz. */
  showForemanBand: boolean;
  /** "Kilidi aç (yetkili)" — `earned_value` approve (K17, B2 uç tablosu). */
  canUnlock: boolean;
}

/**
 * K17: dağıtımı düzenleme = bütçe sayfası Düzenler; altı (formen) salt okur.
 * Kilitli gün ve tamamlanmış şantiye (backend 409, F1.6.2 deseni) herkese
 * salt okunur.
 */
export function resolveAllocationAccess(input: AccessInput): AllocationAccess {
  const isForeman = !input.canWriteAllocation;
  const readOnlyText = input.isLocked
    ? "gün kilitli"
    : input.isSiteCompleted
      ? "şantiye tamamlandı"
      : isForeman
        ? "Saat Dağıtımı mühendis tarafından yapılır"
        : null;
  return {
    canEdit: readOnlyText === null,
    readOnlyText,
    isForeman,
    showForemanBand: isForeman && input.diaryCanWrite && !input.isLocked,
    canUnlock: input.canUnlockDay && !input.isSiteCompleted,
  };
}
