/**
 * DSC-F3a (spec S4) — kısıtlı (disiplin atanmış) kullanıcıda kart/hero fiziksel %
 * etiketi. Backend (DSC-B4) bu yüzdeyi kullanıcının KENDİ disiplinlerinden hesaplar;
 * etiket de bunu söyler. Kısıtsızda metin bugünkü yüzeyin kendi metni AYNEN kalır.
 *
 * Yalnız B4-kapsamlı fiziksel yüzdeler için kullanılır. Mali ilerleme, "İnşaat
 * İlerlemesi" (boş zarf), "Satış Oranı" ve dashboard fosil kolonu KAPSAM DIŞIDIR.
 */
export const PHYSICAL_RESTRICTED_LABEL = "Fiziksel (disiplinlerim)";

export function physicalLabel(base: string, isRestricted: boolean): string {
  return isRestricted ? PHYSICAL_RESTRICTED_LABEL : base;
}
