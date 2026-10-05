import type { HiddenCategory } from "@/lib/api/models";

/**
 * IZN-F4.2 — hassas alan kategorisi bu oturum için GİZLİ mi? (SAF katman; hook'u `useCategoryHidden.ts`.)
 *
 * 🔴 Bu fonksiyon bir GİZLEME KARARI VERMEZ. Alanı maskeleyen backend'dir (değer `null` gelir);
 * burada yalnız "null NEDEN geldi?" sorusu cevaplanır ki ekran kilit + "Bu bilgi rolünüz için gizli"
 * ipucunu yalnız gerçek gizlemede göstersin. Kategori gizli değilse `null` = veri yok → düz "—".
 *
 * Kaynak: ana rolde `me.hidden_fields`; proje bağlamında kişi o projenin ekibindeyse ve
 * `role_pages[rol]` varsa EKİP ROLÜNÜN `hidden_fields`ı (`pagesForProject` ile aynı karar ağacı).
 */
export interface HiddenFieldsMe {
  hidden_fields?: readonly HiddenCategory[];
  all_projects?: boolean;
  projects?: ReadonlyArray<{ project_id: string; role_key: string }>;
  role_pages?: Partial<Record<string, { hidden_fields?: readonly HiddenCategory[] }>>;
}

/** Ekranda gösterilen ipucu metni (kilit simgesinin yanında/başlığında). */
export const HIDDEN_FIELD_HINT = "Bu bilgi rolünüz için gizli";

/** Geçerli gizli kategori kümesi: proje rolü varsa o, yoksa ana rol. */
export function hiddenCategoriesFor(
  me: HiddenFieldsMe | null | undefined,
  projectId?: string | null,
): readonly HiddenCategory[] {
  const mainHidden = me?.hidden_fields ?? [];
  if (!me || !projectId || me.all_projects === true) return mainHidden;
  const member = me.projects?.find((project) => project.project_id === projectId);
  if (!member) return mainHidden;
  return me.role_pages?.[member.role_key]?.hidden_fields ?? mainHidden;
}

/** Verilen kategorilerden EN AZ BİRİ gizli mi? (para alanları hem kendi kategorisine hem `tum_tutarlar`a bağlıdır.) */
export function isCategoryHidden(
  me: HiddenFieldsMe | null | undefined,
  category: HiddenCategory | readonly HiddenCategory[],
  projectId?: string | null,
): boolean {
  const hidden = hiddenCategoriesFor(me, projectId);
  const wanted: readonly HiddenCategory[] = typeof category === "string" ? [category] : category;
  return wanted.some((item) => hidden.includes(item));
}
