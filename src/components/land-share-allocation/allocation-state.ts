/**
 * F-UNIT2 · PG'nin BEKLEYEN (kaydedilmemiş) atama katmanı.
 *
 * 🔴 SUNUCU SATIRLARI DEĞİŞTİRİLMEZ, ÜZERİNE KATMAN KONUR. `LandShareUnitRow`
 * dizisi `GET land-share/units`in yanıtıdır ve sayfalıdır; kullanıcı
 * atamalarını doğrudan o satırlara yazmak "sunucudaki hâl" ile "ekrandaki
 * hâl"i tek nesnede birleştirirdi ve `build-body.ts` DEĞİŞENİ bulamazdı
 * (uç ATOMİKTİR, gereksiz büyük gövde tüm kaydın yıkılma yüzeyini büyütür).
 * Bu yüzden bekleyen atamalar AYRI bir `unit_id → {ownerSide, shareholderId}`
 * eşlemesinde durur ve `effectiveAllocation()` ikisini birleştirir.
 *
 * 🔴 HİSSEDAR YALNIZ ARSA TARAFINDA ANLAMLIDIR. Sunucu bunu 422 ile zorlar
 * (`UnitAllocationItem` docstring'i: *"`shareholder_id` YALNIZ
 * `owner_side=landowner` iken anlamlidir … aksi hâlde 422"*) ve PG de öyle
 * çizer (PG 221 hissedar `<select>`i yalnız ARSA satırında; PG 190 BİZ satırı
 * "Yüklenici payı" basar). Bu yüzden `contractor` ya da `null` ataması
 * hissedarı AYNI adımda TEMİZLER — sunucunun kendi cümlesiyle: *"ARSA'dan
 * cikan unitenin hissedari AYNI istekte temizlenir; ayri bir istek beklenmez."*
 *
 * 🔴 PG 270-272 "Paylaşım tutanağı PDF" kutucuğunun burada KARŞILIĞI YOKTUR
 * (sunucuda uç yok) — gövdeye sızması yapısal olarak imkânsızdır.
 *
 * Bütün işlemler DEĞİŞMEZDİR: girdi satırları, girdi eşlemesi ve girdi seçim
 * kümesi HİÇBİR ZAMAN yerinde değiştirilmez.
 */

import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

export type LandShareUnitRow = DeepScale<components["schemas"]["LandShareUnitRow"]>;
export type UnitOwnerSide = components["schemas"]["UnitOwnerSide"];

export interface PendingAllocation {
  /** PG 140/141/144 — `contractor` · `landowner` · `null` ("Atanmadı"). */
  ownerSide: UnitOwnerSide | null;
  /** PG 221 — yalnız `landowner` tarafında anlamlıdır. */
  shareholderId: string | null;
}

export interface AllocationState {
  /** YALNIZ kullanıcının değiştirdiği satırlar. Boşsa gönderilecek bir şey yok. */
  pending: ReadonlyMap<string, PendingAllocation>;
  /** PG 132 kutucukları — toplu işlemin hedefi. */
  selected: ReadonlySet<string>;
}

export function emptyAllocationState(): AllocationState {
  return { pending: new Map(), selected: new Set() };
}

/** Sunucu satırı + bekleyen katman = ekranda GÖRÜNEN hâl. */
export function effectiveAllocation(
  row: LandShareUnitRow,
  state: AllocationState,
): PendingAllocation {
  const pending = state.pending.get(row.unit_id);
  if (pending !== undefined) return pending;
  return { ownerSide: row.owner_side, shareholderId: row.shareholder_id };
}

function withPending(
  state: AllocationState,
  entries: readonly (readonly [string, PendingAllocation])[],
): AllocationState {
  const pending = new Map(state.pending);
  for (const [unitId, allocation] of entries) pending.set(unitId, allocation);
  return { pending, selected: state.selected };
}

/**
 * Tek satırın atamasını hesaplar. 🔴 GUARD 10: hissedar YALNIZ `landowner`
 * tarafında hayatta kalır.
 */
function allocationFor(
  row: LandShareUnitRow,
  state: AllocationState,
  ownerSide: UnitOwnerSide | null,
): PendingAllocation {
  if (ownerSide !== "landowner") return { ownerSide, shareholderId: null };
  return { ownerSide, shareholderId: effectiveAllocation(row, state).shareholderId };
}

export function toggleUnitSelection(state: AllocationState, unitId: string): AllocationState {
  const selected = new Set(state.selected);
  if (selected.has(unitId)) selected.delete(unitId);
  else selected.add(unitId);
  return { pending: state.pending, selected };
}

/** PG 109 "Tümünü Seç" — GÖRÜNEN (süzgeçlenmiş) satır kümesi üzerinde çalışır. */
export function selectAllUnits(
  state: AllocationState,
  rows: readonly LandShareUnitRow[],
): AllocationState {
  return { pending: state.pending, selected: new Set(rows.map((row) => row.unit_id)) };
}

export function clearUnitSelection(state: AllocationState): AllocationState {
  return { pending: state.pending, selected: new Set<string>() };
}

/**
 * 🔴 KAYITTAN SONRA YALNIZ GÖNDERİLEN ÜNİTELERİN BEKLEYENİ SİLİNİR.
 * Gövde YALNIZ GÖRÜNEN satırlardan kurulur (`build-body.ts` kural 4) ve sayfa
 * değişiminde bekleyen atamalar KASITLI olarak korunur; `pending`in tamamını
 * boşaltmak, başka sayfada yapılmış ve HİÇ GÖNDERİLMEMİŞ atamaları sessizce
 * yok ederdi (kullanıcı kaydettiğini sanır, sayfaya döndüğünde satırları
 * "Atanmadı" bulur).
 */
export function clearPendingUnits(
  state: AllocationState,
  unitIds: readonly string[],
): AllocationState {
  const pending = new Map(state.pending);
  for (const unitId of unitIds) pending.delete(unitId);
  return { pending, selected: state.selected };
}

/** PG 140/141 — satır içi ikili düğme. */
export function assignUnit(
  state: AllocationState,
  row: LandShareUnitRow,
  ownerSide: UnitOwnerSide | null,
): AllocationState {
  return withPending(state, [[row.unit_id, allocationFor(row, state, ownerSide)]]);
}

/** PG 92/93 — seçili satırların tamamını tek adımda atar. */
export function assignSelected(
  state: AllocationState,
  rows: readonly LandShareUnitRow[],
  ownerSide: UnitOwnerSide | null,
): AllocationState {
  const entries = rows
    .filter((row) => state.selected.has(row.unit_id))
    .map((row) => [row.unit_id, allocationFor(row, state, ownerSide)] as const);
  return withPending(state, entries);
}

/**
 * PG 221 hissedar seçicisi.
 *
 * 🔴 BİZ (ya da atanmamış) satırında hissedar atanamaz ve durum DEĞİŞMEDEN
 * geri döner. Ekran seçiciyi zaten yalnız ARSA satırında çizer, yani bu dal
 * UI'dan ulaşılmaz; buradaki bekçi, ileride başka bir çağıranın sunucunun
 * 422'sini — ve ATOMİK uç yüzünden TÜM kaydın düşmesini — sessizce
 * tetiklemesini engeller.
 */
export function setUnitShareholder(
  state: AllocationState,
  row: LandShareUnitRow,
  shareholderId: string | null,
): AllocationState {
  const current = effectiveAllocation(row, state);
  if (current.ownerSide !== "landowner") return state;
  return withPending(state, [[row.unit_id, { ownerSide: "landowner", shareholderId }]]);
}
