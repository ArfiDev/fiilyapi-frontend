import type { OfferStatus } from "./offer-types";

/**
 * TKL-F3.5 · Teklif Detay EYLEM KAPISI — SAF (plan §4.2). Ekran düğmeleri yalnız bu tablodan
 * türer; güvenlik sınırı HER ZAMAN backend'dedir (tabloda olmayan geçiş 409).
 */

export type OfferAction = "save" | "newRevision" | "send" | "win" | "lose" | "withdraw" | "edit";

export const OFFER_ACTIONS: readonly OfferAction[] = ["save", "newRevision", "send", "win", "lose", "withdraw", "edit"];

export type OfferActionVerdict = { enabled: true } | { enabled: false; reason: string };

export interface OfferActionInput {
  /** SON revizyonun durumu (teklifin durumu). */
  status: OfferStatus;
  /** Görüntülenen revizyon son revizyon mu? */
  isLatest: boolean;
  /** Künye/oran/koşul formu kaydedilmemiş değişiklik taşıyor mu? */
  isDirty: boolean;
  /** `contracts:full` ∧ disiplin kısıtsız. */
  canWrite: boolean;
  /** Kalem/grup yazım kuyruğu dolu mu (uçuştaki ya da sıradaki blur PATCH'i)? Açık GEÇİŞ eylemleri kapanır. */
  isItemsBusy?: boolean;
}

const ENABLED: OfferActionVerdict = { enabled: true };

function no(reason: string): OfferActionVerdict {
  return { enabled: false, reason };
}

/** Metinler SABAH ONAYI ekidir (plan §4.2 yalnız taslak satırının gerekçelerini verir). */
export const OFFER_ACTION_REASONS = {
  readOnlyUser: "Teklifleri yalnız Sözleşmeler tam yetkisi değiştirir",
  oldRevision: "Eski revizyon salt okunur; güncel revizyona dönün",
  nothingToSave: "Kaydedilecek değişiklik yok",
  saveFirst: "Önce taslağı kaydedin",
  sendFirst: "Önce gönderildi olarak işaretleyin",
  draftNoNewRevision: "Taslak revizyon düzenlenebilir; yeni revizyon gönderilen ya da kaybedilen teklife açılır",
  sentLocked: "Gönderilmiş revizyon değiştirilemez; değişiklik için yeni revizyon açın",
  alreadySent: "Revizyon zaten gönderildi",
  wonLocked: "Kazanılan teklif kesinleşti; yeni revizyon açılamaz",
  lostClosed: "Revizyon zaten kapandı",
  withdrawnClosed: "Vazgeçilen teklife yeni revizyon açılamaz",
  closed: "Teklif kapandı; bu işlem yapılamaz",
  itemsSaving: "Kalem kaydediliyor",
} as const;

const R = OFFER_ACTION_REASONS;

type StatusRow = Record<OfferAction, OfferActionVerdict>;

/** `draft` — kirlilik `save`/`send`/`withdraw`ı belirler. */
function draftRow(isDirty: boolean): StatusRow {
  return {
    save: isDirty ? ENABLED : no(R.nothingToSave),
    newRevision: no(R.draftNoNewRevision),
    send: isDirty ? no(R.saveFirst) : ENABLED,
    win: no(R.sendFirst),
    lose: no(R.sendFirst),
    // Kirliyken kapanış eylemi KAPALI: kaydedilmemiş değer kapanan teklifte görünür kalmasın (TKL-F3.6.1).
    withdraw: isDirty ? no(R.saveFirst) : ENABLED,
    edit: ENABLED,
  };
}

const SENT_ROW: StatusRow = {
  save: no(R.sentLocked),
  newRevision: ENABLED,
  send: no(R.alreadySent),
  win: ENABLED,
  lose: ENABLED,
  withdraw: ENABLED,
  edit: no(R.sentLocked),
};

const WON_ROW: StatusRow = {
  save: no(R.closed),
  newRevision: no(R.wonLocked),
  send: no(R.closed),
  win: no(R.closed),
  lose: no(R.closed),
  withdraw: no(R.closed),
  edit: no(R.closed),
};

const LOST_ROW: StatusRow = {
  save: no(R.closed),
  newRevision: ENABLED,
  send: no(R.closed),
  win: no(R.closed),
  lose: no(R.lostClosed),
  withdraw: no(R.closed),
  edit: no(R.closed),
};

const WITHDRAWN_ROW: StatusRow = {
  save: no(R.closed),
  newRevision: no(R.withdrawnClosed),
  send: no(R.closed),
  win: no(R.closed),
  lose: no(R.closed),
  withdraw: no(R.closed),
  edit: no(R.closed),
};

function allDisabled(reason: string): StatusRow {
  return { save: no(reason), newRevision: no(reason), send: no(reason), win: no(reason), lose: no(reason), withdraw: no(reason), edit: no(reason) };
}

/**
 * §4.2 — yalnız SON revizyon görüntülenirken eylem açılır; eski revizyonda hepsi kapalı.
 * Yazma yetkisi yoksa (`contracts:full` ∧ kısıtsız değil) hepsi kapalı.
 */
export function offerActionGate(input: OfferActionInput): Record<OfferAction, OfferActionVerdict> {
  const gate = statusGate(input);
  return input.isItemsBusy === true ? lockTransitions(gate) : gate;
}

const TRANSITIONS: readonly OfferAction[] = ["newRevision", "send", "win", "lose", "withdraw"];

/**
 * Kalem yazımı SIRADAYKEN (blur PATCH'i uçuşta) açık geçiş eylemleri kapanır: yoksa "Gönderildi İşaretle"
 * kalemin kendi yazımıyla yarışır ve fiyatsız kararı bayat veriyle verilir (TKL-F3.6.1). Zaten kapalı olanın
 * gerekçesi korunur.
 */
function lockTransitions(gate: Record<OfferAction, OfferActionVerdict>): Record<OfferAction, OfferActionVerdict> {
  const locked = { ...gate };
  for (const action of TRANSITIONS) {
    if (locked[action].enabled) locked[action] = no(R.itemsSaving);
  }
  return locked;
}

function statusGate(input: OfferActionInput): Record<OfferAction, OfferActionVerdict> {
  if (!input.canWrite) return allDisabled(R.readOnlyUser);
  if (!input.isLatest) return allDisabled(R.oldRevision);
  switch (input.status) {
    case "draft":
      return draftRow(input.isDirty);
    case "sent":
      return SENT_ROW;
    case "won":
      return WON_ROW;
    case "lost":
      return LOST_ROW;
    case "withdrawn":
      return WITHDRAWN_ROW;
  }
}

/**
 * Düğmenin altında GÖRÜNÜR basılacak gerekçeler (devre-dışı düğme yalnız `title` ile yetinmez —
 * F-TH kanonu). Eski revizyonun gerekçesini bant zaten söyler; yinelenmez.
 */
export function visibleActionReasons(gate: Record<OfferAction, OfferActionVerdict>): string[] {
  const reasons: string[] = [];
  for (const action of ["newRevision", "send", "win", "lose"] as const) {
    const verdict = gate[action];
    if (verdict.enabled || verdict.reason === OFFER_ACTION_REASONS.oldRevision) continue;
    if (!reasons.includes(verdict.reason)) reasons.push(verdict.reason);
  }
  return reasons;
}
