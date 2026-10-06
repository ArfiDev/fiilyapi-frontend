import type { HiddenCategory, PageGrant, PageKey } from "@/lib/api/models";
import type { MeResponse } from "@/lib/auth/types";

/** IZN-F2.x test yardımcıları — sayfa izni (`me.pages`) taşıyan sahte oturum yükü. */
export function pageGrant(level: PageGrant["level"], approve = false): PageGrant {
  return { level, approve };
}

/**
 * IZN-F6a · katalogdaki TÜM sayfa anahtarları (openapi `PageKey` enum'u, 100 sayfa). Eksik/fazla anahtar
 * derleme zamanında yakalanır (aşağıdaki `_ALL_PAGE_KEYS_EXHAUSTIVE`).
 */
export const ALL_PAGE_KEYS = [
  "genel.gosterge_paneli",
  "genel.onay_kutusu",
  "genel.fiil_ai",
  "genel.raporlar",
  "genel.projeler",
  "genel.proje_takvimi",
  "saha.puantaj",
  "saha.makine_ekipman",
  "saha.makine_calisma",
  "saha.makine_yakit",
  "saha.makine_kira",
  "saha.gunluk_kayit",
  "ik.personel",
  "ik.izin_yonetimi",
  "ik.belge_sertifika",
  "planlama.panel",
  "planlama.adam_saat_butcesi",
  "planlama.gunluk_rapor",
  "planlama.haftalik_qurr",
  "planlama.birim_oran_katalogu",
  "planlama.disiplin_yonetimi",
  "teklif.teklif_hazirlama",
  "teklif.sablonlar",
  "teklif.sozlesmeler",
  "teklif.taseron_firmalar",
  "teklif.isveren_sozlesme",
  "teklif.poz_dagilimi",
  "teklif.taseron_sozlesme",
  "teklif.is_kalemi_katalogu",
  "stok.stok_depo",
  "stok.satinalma_talepleri",
  "stok.siparisler",
  "stok.tedarikciler",
  "stok.teklif_karsilastirma",
  "mali.satis",
  "mali.satis_blok",
  "mali.satis_unite",
  "mali.satis_toplu_uretim",
  "mali.satis_excel",
  "mali.satis_paylasim",
  "mali.yevmiye",
  "mali.hesap_plani",
  "mali.mizan",
  "mali.kdv_beyani",
  "mali.banka_mutabakati",
  "mali.donem_kapanisi",
  "mali.fatura",
  "mali.hazine",
  "mali.cek_odeme",
  "mali.hakedis_isveren",
  "mali.hakedis_taseron",
  "mali.gelir_tablosu",
  "mali.bilanco",
  "mali.nakit_akisi",
  "mali.bordro",
  "mali.bordro_gecmis",
  "mali.sgk_bildirimi",
  "mali.sirket_varliklari",
  "mali.belge_arsivi",
  "proje.santiyeler",
  "proje.ozet",
  "proje.paylasim_tablosu",
  "proje.is_kalemleri",
  "proje.isveren_hakedis",
  "proje.taseron_hakedis",
  "proje.belgeler",
  "santiye.bolumler",
  "santiye.is_kalemleri",
  "santiye.puantaj",
  "santiye.stok",
  "santiye.hakedisler",
  "santiye.gunluk_kayit",
  "santiye.belgeler",
  "santiye.bolum_dagilimi",
  "santiye.gunluk_ozet",
  "santiye.gunluk_planlama",
  "santiye.adam_saat_butcesi",
  "santiye.planlama_paneli",
  "santiye.gunluk_ilerleme_raporu",
  "santiye.haftalik_qurr",
  "bolum.detay",
  "bolum.is_kalemleri",
  "bolum.puantaj",
  "bolum.malzeme",
  "bolum.hakedis",
  "bolum.gunluk_kayit",
  "bolum.gunluk_kayit_detay",
  "ayarlar.sirket_bilgileri",
  "ayarlar.bildirimler",
  "ayarlar.gorunum",
  "ayarlar.planlama",
  "ayarlar.kullanicilar",
  "ayarlar.rol_yonetimi",
  "ayarlar.sayfa_izinleri",
  "ayarlar.onay_rolleri",
  "ayarlar.bordro_oranlari",
  "ayarlar.entegrasyonlar",
  "ayarlar.yedekleme",
  "ayarlar.denetim_gunlugu",
  "ayarlar.gelistirme",
] as const satisfies readonly PageKey[];

type MissingPageKey = Exclude<PageKey, (typeof ALL_PAGE_KEYS)[number]>;
const _ALL_PAGE_KEYS_EXHAUSTIVE: [MissingPageKey] extends [never] ? true : MissingPageKey = true;
void _ALL_PAGE_KEYS_EXHAUSTIVE;

/**
 * IZN-F6a · TAM ERİŞİM sayfa matrisi: her sayfa Düzenler + Onaylar (SA DEĞİL; `need: "sa"` kapıları kapalı kalır).
 * Onay eylemi olmayan sayfada `approve: true` zararsızdır (onay kapıları yalnız onay eylemli sayfalara bağlı).
 */
export function fullAccessPages(): Partial<Record<PageKey, PageGrant>> {
  return Object.fromEntries(ALL_PAGE_KEYS.map((key) => [key, pageGrant("edit", true)]));
}

/**
 * IZN-F6a.3 · bir sayfa kümesine (ör. `page-gates.ts` sabitleri) aynı izni veren harita. Birleştirmek için yay:
 * `{ ...pagesFor(ACCOUNTING_VIEW, "view"), ...pagesFor(JOURNAL_EDIT, "edit") }`.
 */
export function pagesFor(
  keys: readonly PageKey[],
  level: PageGrant["level"],
  approve = false,
): Partial<Record<PageKey, PageGrant>> {
  return Object.fromEntries(keys.map((key) => [key, pageGrant(level, approve)]));
}

export interface MeFixtureOptions {
  pages?: Partial<Record<PageKey, PageGrant>>;
  isSystemAdmin?: boolean;
  /** IZN-F3.2 · `true` = kişi her projeyi ana rolüyle görür. */
  allProjects?: boolean;
  /** IZN-F3.2 · proje ekibi satırları (proje UUID'si → o projedeki rol ANAHTARI). */
  projects?: ReadonlyArray<{ project_id: string; role_key: string }>;
  /** IZN-F3.2 · ekip rolü anahtarı → o rolün sayfa izinleri. */
  rolePages?: Record<string, Partial<Record<PageKey, PageGrant>>>;
  /** IZN-F4.2 · ana rolün gizli hassas alan kategorileri (`me.hidden_fields`). */
  hiddenFields?: readonly HiddenCategory[];
  /** IZN-F4.2 · ekip rolü anahtarı → o rolün gizli kategorileri (`rolePages` ile birlikte verilir). */
  roleHiddenFields?: Record<string, readonly HiddenCategory[]>;
}

/** `useSession().me` için kısmi yük; `pages` verilmezse TAM ERİŞİM sayfa matrisi (IZN-F6a). Eski `permissions` alanı (IZN-F6c) yok. */
export function meFixture({
  pages,
  isSystemAdmin = false,
  allProjects,
  projects,
  rolePages,
  hiddenFields,
  roleHiddenFields,
}: MeFixtureOptions = {}): MeResponse {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    email: "test@ornek.com",
    full_name: "Test Kullanıcı",
    title: null,
    role_key: "procurement",
    status: "active",
    is_system_admin: isSystemAdmin,
    // IZN-F6a · `pages` verilmediyse TAM ERİŞİM (sayfa modeli devrede); "yetkisiz" niyetli testler `pages`'i açıkça yazar.
    ...(pages !== undefined ? { pages } : { pages: fullAccessPages() }),
    ...(hiddenFields === undefined ? {} : { hidden_fields: hiddenFields }),
    ...(allProjects === undefined ? {} : { all_projects: allProjects }),
    ...(projects === undefined ? {} : { projects: projects.map((project) => ({ ...project, discipline_ids: [] })) }),
    ...(rolePages === undefined
      ? {}
      : {
          role_pages: Object.fromEntries(
            Object.entries(rolePages).map(([roleKey, pages]) => [roleKey, { pages, hidden_fields: roleHiddenFields?.[roleKey] ?? [] }]),
          ),
        }),
  } as unknown as MeResponse;
}
