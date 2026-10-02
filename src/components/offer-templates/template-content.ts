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
 * katalogId)`): UI, bir önceki işlem bitmeden çizilmiş görüntüden tıklar; dizin kaymış olabilir ve yanlış
 * kalemi silerdi. Grup adı şablonda tekildir (istemci korkuluğu), kalem (grup, katalog kimliği) ile bulunur.
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

/** Kalem zaten yoksa (başka işlem sildi) değişiklik YOK: aynı taslak döner. */
export function editRemoveItem(groupName: string, catalogItemId: string): Edit {
  return (groups) => {
    const groupIndex = groups.findIndex((group) => group.name === groupName);
    const itemIndex = groups[groupIndex]?.items.findIndex((item) => item.catalog_item_id === catalogItemId) ?? -1;
    return itemIndex < 0 ? done(groups) : removeItem(groupIndex, itemIndex)(groups);
  };
}

export function editRenameGroup(groupName: string, newName: string): Edit {
  return (groups) => {
    const index = groups.findIndex((group) => group.name === groupName);
    return index < 0 ? fail(MSG_GROUP_MISSING) : renameGroup(index, newName)(groups);
  };
}

export function editRemoveGroup(groupName: string): Edit {
  return (groups) => {
    const index = groups.findIndex((group) => group.name === groupName);
    return index < 0 ? done(groups) : removeGroup(index)(groups);
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
