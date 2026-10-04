import { hasAtLeast, type AccessLevel } from "@/lib/auth/permissions";
import { formatDateDots, toIstanbulDateOnly } from "@/lib/format";
import type { EvBudgetView, EvRevisionOut } from "@/lib/api/models";

/**
 * PLN-F1.6 · Revizyon durum makinesi (B1-5) — SAF türetmeler.
 *
 *   (revizyon yok) --ilk yazma--> Rev 0 TASLAK
 *   TASLAK --dondur [approve, engel yok]--> AKTİF (önceki AKTİF → ARŞİV)
 *   AKTİF  --"Taslak aç" [draft, taslak yoksa]--> Rev N+1 TASLAK
 *   TASLAK --"Taslağı sil" [approve]--> (yok)
 *
 * Donmuş revizyon (aktif/arşiv) salt okunurdur; backend `editable` bayrağı
 * HER ZAMAN kazanır (istemci kapısı yalnız görsel gürültüyü azaltır).
 */

export type RevisionMode = "none" | "draft" | "active" | "archived";

export interface BudgetAccess {
  /** draft: oran/eşleme/pencere/dağılım yazar + "Taslak aç" (F0-5). */
  canDraft: boolean;
  /** approve: dondur (B1-8). IZN-F2.x: adam-saat bütçesi Onaylar (Baseline Dondur). */
  canApprove: boolean;
  /**
   * IZN-F2.x: taslak sil = YALNIZ sistem yöneticisi. Verilmezse bugünkü kural (`canApprove`) geçerlidir
   * (eski çağıranlar/fikstürler).
   */
  canDeleteDraft?: boolean;
}

export interface ScreenState {
  mode: RevisionMode;
  editable: boolean;
  /** Taslak görüntüleniyor ama kullanıcı yalnız görüntüleyici (V). */
  isViewer: boolean;
  /** B1-12: tamamlanmış şantiyenin bütçesi salt okunur (backend yazmaları 409). */
  siteCompleted: boolean;
  /** Eylem düğmeleri (katalogdan öner, toplu oran, dondur, sil) gizlenir: görüntüleyici YA DA tamamlanmış şantiye. */
  hideActions: boolean;
  canFreeze: boolean;
  canDeleteDraft: boolean;
  canOpenDraft: boolean;
  /** Şantiyede mevcut taslak (görüntülenen revizyondan bağımsız). */
  draft: EvRevisionOut | null;
  active: EvRevisionOut | null;
  nextDraftNumber: number;
}

export type BadgeTone = "warning" | "success" | "neutral";

export function revisionMode(view: EvBudgetView): RevisionMode {
  if (view.revision === null) return "none";
  if (view.revision.status === "draft") return "draft";
  return view.revision.status === "active" ? "active" : "archived";
}

export function budgetAccess(level: AccessLevel | undefined, gates: Partial<BudgetAccess> = {}): BudgetAccess {
  return {
    canDraft: gates.canDraft ?? hasAtLeast(level, "draft"),
    canApprove: gates.canApprove ?? hasAtLeast(level, "approve"),
    canDeleteDraft: gates.canDeleteDraft,
  };
}

/** F0-5: numara yalnız baseline'a verilir → yeni taslak = en büyük donmuş numara + 1. */
export function nextDraftNumber(revisions: readonly EvRevisionOut[]): number {
  const frozen = revisions.filter((r) => r.status !== "draft").map((r) => r.number);
  return frozen.length === 0 ? 0 : Math.max(...frozen) + 1;
}

/**
 * `siteCompleted` (B1-12 · PLN-F1.6.2): backend tamamlanmış şantiyede bütçe
 * yazmalarını 409 ile reddeder AMA `BudgetView.editable` yalnız revizyon moduna
 * bakar (taslakta true döner). Bayrağa güvenilse kullanıcı düzenler ve her yazma
 * 409 alırdı — bu yüzden şantiye durumu burada AYRICA kapıdır (AYP F0-8 deseni).
 */
export function screenState(
  view: EvBudgetView,
  access: BudgetAccess,
  revisions: readonly EvRevisionOut[],
  siteCompleted = false,
): ScreenState {
  const mode = revisionMode(view);
  const draft = revisions.find((r) => r.status === "draft") ?? null;
  const active = revisions.find((r) => r.status === "active") ?? null;
  const isWritableMode = mode === "draft" || mode === "none";
  const writable = !siteCompleted;
  const isViewer = isWritableMode && !access.canDraft;
  return {
    mode,
    editable: writable && view.editable && isWritableMode && access.canDraft,
    isViewer,
    siteCompleted,
    hideActions: isViewer || siteCompleted,
    canFreeze: writable && mode === "draft" && access.canApprove,
    canDeleteDraft: writable && mode === "draft" && (access.canDeleteDraft ?? access.canApprove),
    canOpenDraft: writable && mode !== "draft" && mode !== "none" && draft === null && access.canDraft,
    draft,
    active,
    nextDraftNumber: nextDraftNumber(revisions),
  };
}

function frozenDate(rev: EvRevisionOut): string {
  return rev.frozen_at ? formatDateDots(toIstanbulDateOnly(rev.frozen_at)) : "";
}

/** Başlık rozeti (Adam-Saat Bütçesi.dc.html:91 + :654 · Ek Formlar M5 d). */
export function revisionBadge(view: EvBudgetView): { label: string; tone: BadgeTone } {
  const rev = view.revision;
  if (rev === null) return { label: "Revizyon yok", tone: "neutral" };
  if (rev.status === "draft") return { label: `Taslak — Rev ${rev.number}`, tone: "warning" };
  if (rev.status === "active") return { label: `Aktif — Rev ${rev.number}`, tone: "success" };
  return { label: `Görüntülenen: Rev ${rev.number}`, tone: "neutral" };
}

/** "Aktif: Rev 1 · 02.07.2026" (BÜT:92, :655). */
export function activeRevisionChip(revisions: readonly EvRevisionOut[]): string {
  const active = revisions.find((r) => r.status === "active");
  return active ? `Aktif: Rev ${active.number} · ${frozenDate(active)}` : "Aktif: —";
}

const STATUS_LABEL: Record<EvRevisionOut["status"], string> = {
  draft: "Taslak",
  active: "Aktif",
  archived: "Arşiv",
};

/** Revizyon açılır listesi satırı (BÜT:650). */
export function revisionOption(rev: EvRevisionOut): { label: string; sub: string } {
  const label = `Rev ${rev.number} · ${STATUS_LABEL[rev.status]}`;
  if (rev.status === "draft") {
    return { label, sub: `Son düzenleme ${formatDateDots(toIstanbulDateOnly(rev.last_edited_at))}` };
  }
  return { label, sub: `Donduruldu ${frozenDate(rev)}` };
}

/** Açılır düğme metni (BÜT:656): taslak "Rev 2 · Taslak", donmuş "Rev 1". */
export function revisionButtonLabel(view: EvBudgetView): string {
  const rev = view.revision;
  if (rev === null) return "Revizyon yok";
  return rev.status === "draft" ? `Rev ${rev.number} · Taslak` : `Rev ${rev.number}`;
}

/** Son okunan sözcüğün yönelme eki: birler (1-9, 0=sıfır) ve onlar/yüzler. */
const UNIT_DATIVE = ["a", "e", "ye", "e", "e", "e", "ya", "ye", "e", "a"] as const;
const TENS_DATIVE = ["", "a", "ye", "a", "a", "ye", "a", "e", "e", "a"] as const;
const HUNDRED_DATIVE = "e"; // yüz, bin — ikisi de ince ünlü

/** "Rev 2'ye" · "Rev 1'e" · "Rev 10'a" (ReadOnlyStrip eylemi, "Rev N'e göre"). */
export function revDative(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  let suffix: string;
  if (abs === 0 || abs % 10 !== 0) suffix = UNIT_DATIVE[abs % 10];
  else if (abs % 100 !== 0) suffix = TENS_DATIVE[(abs / 10) % 10];
  else suffix = HUNDRED_DATIVE;
  return `Rev ${n}'${suffix}`;
}
