/**
 * TKL-F4.2 · teklif grup adı korkuluğu (SAF). Backend aynı adlı iki grubu teklifte ENGELLEMEZ ama dönüştürmede
 * 422 verir (SO-30: BOQ grubu ADLA açılır) → istemci çoğaltmaz.
 */

/** TD:421 — "+ Grup" yeni grubu bu adla açar; çakışırsa "Yeni grup 2", "3"… (TS:323 metni). */
const NEW_GROUP_NAME = "Yeni grup";
const FIRST_SUFFIX = 2;

export const MSG_GROUP_NAME_TAKEN = "Bu adla grup var";

export interface NamedGroup {
  id: string;
  name: string;
}

function normalized(name: string): string {
  return name.trim();
}

/** Kendisi (`exceptGroupId`) hariç başka bir grup bu adı (kırpılmış, birebir) taşıyor mu? */
export function isGroupNameTaken(groups: readonly NamedGroup[], name: string, exceptGroupId?: string): boolean {
  const wanted = normalized(name);
  return groups.some((group) => group.id !== exceptGroupId && normalized(group.name) === wanted);
}

/** "+ Grup" için ilk boş ad: "Yeni grup", yoksa "Yeni grup 2", "Yeni grup 3"… */
export function nextGroupName(groups: readonly NamedGroup[]): string {
  if (!isGroupNameTaken(groups, NEW_GROUP_NAME)) return NEW_GROUP_NAME;
  let suffix = FIRST_SUFFIX;
  while (isGroupNameTaken(groups, `${NEW_GROUP_NAME} ${suffix}`)) suffix += 1;
  return `${NEW_GROUP_NAME} ${suffix}`;
}
