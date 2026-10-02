import type { OfferTemplateContentBody } from "@/lib/api/hooks/useOfferTemplateMutations";
import type { OfferTemplateDetail } from "@/lib/api/hooks/useOfferTemplates";
import { MSG_GROUP_NAME_TAKEN, isGroupNameTaken, nextGroupName } from "@/components/offers/offer-group-names";

/**
 * TKL-F4.5 · şablon İÇERİK düzenlemesinin SAF çekirdeği (TKL-F4-PLAN §3).
 *
 * Backend içeriği TEK uçla, TAM DEĞİŞTİRME olarak yazar (`PUT …/content`): her işlem sunucudaki SON detaydan
 * yeni grup listesi kurar. İşlemler `Edit` döndürür (`Draft → sonuç`) — kuyruktaki işlem, bir önceki PUT'un
 * yanıtı üzerinde ÇALIŞIR (bayat tabandan PUT = veri kaybı).
 *
 * Dizinle çalışan çekirdek (`removeItem(g, i)` …) + KİMLİKLE çözen sarmalayıcılar (`editRemoveItem(grupAdı,
 * katalogId, sıra)`): UI, bir önceki işlem bitmeden çizilmiş görüntüden tıklar; dizin kaymış olabilir ve yanlış
 * kalemi silerdi.
 *
 * 🔴 KALICI KİMLİK (TKL-F4.6b): backend her `PUT …/content`te TÜM grup/kalem kimliklerini YENİDEN üretir
 * (`_replace_rows`) — sunucu kimliği ekranda KALICI DEĞİLDİR. Grup, (ad, aynı adlı gruplar arasındaki sıra)
 * çiftiyle (`ad#sıra`, `groupKey`) anılır. Aynı adlı grup backend'de engellenmez (tekliften şablon / F3 "Yeni
 * grup" kopyaları): ad tek başına ilk eşleşmeye giderdi. Çift çözülemezse AÇIK hata (sessiz no-op YOK).
 */

export const MAX_TEMPLATE_GROUPS = 100;
export const MAX_TEMPLATE_ITEMS = 1000;
/** Backend metinleri AYNEN (`template_schemas.py:28-29`). */
export const MSG_GROUPS_TOO_MANY = `Şablonda en fazla ${MAX_TEMPLATE_GROUPS} grup olabilir`;
export const MSG_ITEMS_TOO_MANY = `Şablonda en fazla ${MAX_TEMPLATE_ITEMS} kalem olabilir`;
/** GECE KURALI: mockup'ta yok — "Şablon adı zorunlu" (TS:287) kalıbında. */
export const MSG_GROUP_NAME_REQUIRED = "Grup adı zorunlu";
export const MSG_GROUP_NOT_EMPTY = "Yalnız boş grup silinebilir";
export const MSG_GROUP_MISSING = "Grup bulunamadı";

export interface DraftItem {
  catalog_item_id: string;
}
export interface DraftGroup {
  /** Sunucu grup kimliği; yeni grup için yerel (`new:<ad>`). Ad tekilliği denetimi `NamedGroup` ile ortaktır. */
  id: string;
  name: string;
  items: readonly DraftItem[];
}
export type Draft = readonly DraftGroup[];
export type EditResult = { ok: true; groups: Draft } | { ok: false; error: string };
export type Edit = (groups: Draft) => EditResult;

/** Grubun kalıcı anahtarı: `ad#sıra` (sıra = aynı adlı gruplar arasında, 0'dan). */
const GROUP_KEY_SEPARATOR = "#";

export interface GroupRef {
  name: string;
  nth: number;
}

export function groupKey(name: string, nth: number): string {
  return `${name}${GROUP_KEY_SEPARATOR}${nth}`;
}

/** Son ayırıcıdan böler (ad `#` içerebilir); biçim bozuksa `null`. */
export function parseGroupKey(key: string): GroupRef | null {
  const at = key.lastIndexOf(GROUP_KEY_SEPARATOR);
  if (at < 0) return null;
  const nth = Number(key.slice(at + 1));
  return Number.isInteger(nth) && nth >= 0 ? { name: key.slice(0, at), nth } : null;
}

/** Her grubun (ad, sıra) çifti (taslak/detay sırasıyla). */
export function groupRefsOf(groups: readonly { name: string }[]): GroupRef[] {
  const seen = new Map<string, number>();
  return groups.map((group) => {
    const nth = seen.get(group.name) ?? 0;
    seen.set(group.name, nth + 1);
    return { name: group.name, nth };
  });
}

/** Her grubun kalıcı anahtarı (taslak/detay sırasıyla). */
export function groupKeysOf(groups: readonly { name: string }[]): string[] {
  return groupRefsOf(groups).map((ref) => groupKey(ref.name, ref.nth));
}

function findGroupIndex(groups: Draft, name: string, nth: number): number {
  let seen = 0;
  for (let index = 0; index < groups.length; index += 1) {
    if (groups[index]?.name !== name) continue;
    if (seen === nth) return index;
    seen += 1;
  }
  return -1;
}

export type AddItemsTarget = { groupIndex: number } | { newGroupName: string };

export type ApplyResult =
  | { ok: true; changed: false }
  | { ok: true; changed: true; body: OfferTemplateContentBody }
  | { ok: false; error: string };

const fail = (error: string): EditResult => ({ ok: false, error });
const done = (groups: Draft): EditResult => ({ ok: true, groups });

export function toDraft(detail: OfferTemplateDetail): Draft {
  return detail.groups.map((group) => ({
    id: group.id,
    name: group.name,
    items: group.items.map((item) => ({ catalog_item_id: item.catalog_item_id })),
  }));
}

/** `PUT …/content` gövdesi; `expected_updated_at` HER ZAMAN `detail.updated_at` (iyimser kilit, K-F4-1). */
export function toBody(detail: OfferTemplateDetail, groups: Draft = toDraft(detail)): OfferTemplateContentBody {
  return {
    groups: groups.map((group) => ({
      name: group.name,
      items: group.items.map((item) => ({ catalog_item_id: item.catalog_item_id })),
    })),
    expected_updated_at: detail.updated_at,
  };
}

function itemCount(groups: Draft): number {
  return groups.reduce((sum, group) => sum + group.items.length, 0);
}

function newGroup(name: string, items: readonly DraftItem[] = []): DraftGroup {
  return { id: `new:${name}`, name, items };
}

/** "+ Grup": ad verilmezse "Yeni grup", çakışırsa "Yeni grup 2"… (TS:323). */
export function addGroup(name?: string): Edit {
  return (groups) => {
    if (groups.length >= MAX_TEMPLATE_GROUPS) return fail(MSG_GROUPS_TOO_MANY);
    const finalName = name === undefined ? nextGroupName(groups) : name.trim();
    if (finalName === "") return fail(MSG_GROUP_NAME_REQUIRED);
    if (isGroupNameTaken(groups, finalName)) return fail(MSG_GROUP_NAME_TAKEN);
    return done([...groups, newGroup(finalName)]);
  };
}

export function renameGroup(index: number, name: string): Edit {
  return (groups) => {
    const target = groups[index];
    if (target === undefined) return fail(MSG_GROUP_MISSING);
    const finalName = name.trim();
    if (finalName === "") return fail(MSG_GROUP_NAME_REQUIRED);
    if (isGroupNameTaken(groups, finalName, target.id)) return fail(MSG_GROUP_NAME_TAKEN);
    if (finalName === target.name) return done(groups);
    return done(groups.map((group, i) => (i === index ? { ...group, name: finalName } : group)));
  };
}

/** ÜS-F4-4: yalnız BOŞ grup silinir (kalem kaybı yok). */
export function removeGroup(index: number): Edit {
  return (groups) => {
    const target = groups[index];
    if (target === undefined) return fail(MSG_GROUP_MISSING);
    if (target.items.length > 0) return fail(MSG_GROUP_NOT_EMPTY);
    return done(groups.filter((_, i) => i !== index));
  };
}

/** F4.6 (katalogdan ekle) kullanır: mevcut gruba ya da yeni açılacak gruba sona ekler. */
export function addItems(target: AddItemsTarget, catalogIds: readonly string[]): Edit {
  return (groups) => {
    if (itemCount(groups) + catalogIds.length > MAX_TEMPLATE_ITEMS) return fail(MSG_ITEMS_TOO_MANY);
    const added = catalogIds.map((id) => ({ catalog_item_id: id }));
    if ("groupIndex" in target) {
      if (groups[target.groupIndex] === undefined) return fail(MSG_GROUP_MISSING);
      return done(
        groups.map((group, i) => (i === target.groupIndex ? { ...group, items: [...group.items, ...added] } : group)),
      );
    }
    const name = target.newGroupName.trim();
    if (groups.length >= MAX_TEMPLATE_GROUPS) return fail(MSG_GROUPS_TOO_MANY);
    if (name === "") return fail(MSG_GROUP_NAME_REQUIRED);
    if (isGroupNameTaken(groups, name)) return fail(MSG_GROUP_NAME_TAKEN);
    return done([...groups, newGroup(name, added)]);
  };
}

export function removeItem(groupIndex: number, itemIndex: number): Edit {
  return (groups) => {
    const target = groups[groupIndex];
    if (target === undefined || target.items[itemIndex] === undefined) return fail(MSG_GROUP_MISSING);
    return done(
      groups.map((group, i) =>
        i === groupIndex ? { ...group, items: group.items.filter((_, j) => j !== itemIndex) } : group,
      ),
    );
  };
}

// ── Kimlikle çözen sarmalayıcılar (UI bunları kullanır) ────────────────────────────────────────

/** Kalem zaten yoksa (başka işlem sildi) değişiklik YOK: aynı taslak döner. GRUP bulunamazsa açık hata. */
export function editRemoveItem(groupName: string, catalogItemId: string, nth = 0): Edit {
  return (groups) => {
    const groupIndex = findGroupIndex(groups, groupName, nth);
    if (groupIndex < 0) return fail(MSG_GROUP_MISSING);
    const itemIndex = groups[groupIndex]?.items.findIndex((item) => item.catalog_item_id === catalogItemId) ?? -1;
    return itemIndex < 0 ? done(groups) : removeItem(groupIndex, itemIndex)(groups);
  };
}

/** Hedef grup: ad + (varsa) aynı adlılar arasındaki sıra (varsayılan 0) — ya da yeni açılacak grup. */
export type AddItemsByName = { groupName: string; nth?: number } | { newGroupName: string };

/** F4.6: seçici hedef grubu (ad, sıra) ile verir; kuyrukta dizin kayması yanlış gruba yazmasın. */
export function editAddItems(target: AddItemsByName, catalogIds: readonly string[]): Edit {
  return (groups) => {
    if (!("groupName" in target)) return addItems(target, catalogIds)(groups);
    const groupIndex = findGroupIndex(groups, target.groupName, target.nth ?? 0);
    return groupIndex < 0 ? fail(MSG_GROUP_MISSING) : addItems({ groupIndex }, catalogIds)(groups);
  };
}

export function editRenameGroup(groupName: string, newName: string, nth = 0): Edit {
  return (groups) => {
    const index = findGroupIndex(groups, groupName, nth);
    return index < 0 ? fail(MSG_GROUP_MISSING) : renameGroup(index, newName)(groups);
  };
}

export function editRemoveGroup(groupName: string, nth = 0): Edit {
  return (groups) => {
    const index = findGroupIndex(groups, groupName, nth);
    return index < 0 ? fail(MSG_GROUP_MISSING) : removeGroup(index)(groups);
  };
}

/** Düzenlemeyi SON detaya uygular; değişiklik yoksa PUT atılmaz. */
export function applyEdit(detail: OfferTemplateDetail, edit: Edit): ApplyResult {
  const draft = toDraft(detail);
  const result = edit(draft);
  if (!result.ok) return result;
  if (result.groups === draft) return { ok: true, changed: false };
  return { ok: true, changed: true, body: toBody(detail, result.groups) };
}
