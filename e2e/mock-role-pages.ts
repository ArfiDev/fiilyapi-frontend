// IZN-F2 · SAHTE BACKEND — Sayfa İzinleri (`GET /pages`, `GET|PUT /roles/{id}/pages`, `POST /roles/{id}/copy`).
//
// Backend ikizi: `app/core/sayfalar.py` (100 sayfalık katalog, menü sırası) + IZN-B2 rol/sayfa uçları.
// Katalog TEK tablodur; satır sayısı/anahtarlar `PageKey` enum'una karşı DERLEME zamanında denetlenir
// (`satisfies`), rol matrisi katalogdan ÜRETİLİR — ikinci bir elle liste yoktur.
//
// ⚠️ YAZMA KALICI DEĞİLDİR: paylaşılan sahte backend tüm e2e koşusunda tek örnektir; `PUT` ve `POST copy`
// gövdeyi doğrular ve YANKILAR, durumu DEĞİŞTİRMEZ (yeniden yükleme özgün matrisi görür).
import type { components } from "@/lib/api/schema";

type PageKey = components["schemas"]["PageKey"];
type PageGroup = components["schemas"]["PageGroup"];
type PageLevel = components["schemas"]["PageLevel"];
type PageGrant = components["schemas"]["PageGrant"];
type PageResponse = components["schemas"]["PageResponse"];
type RolePagesResponse = components["schemas"]["RolePagesResponse"];
type RoleResponse = components["schemas"]["RoleResponse"];
type HiddenCategory = components["schemas"]["HiddenCategory"];

/** Sahte rol kaydı (`state.roles` satırı). */
export interface MockRoleRow {
  id: string;
  key: string;
  name: string;
  emoji: string;
  description: string;
  is_system: boolean;
}

const GROUP_NAMES: Record<PageGroup, string> = {
  genel: "Genel",
  saha: "Saha",
  ik: "İK",
  planlama: "Planlama",
  teklif: "Teklif ve Sözleşmeler",
  stok: "Stok & Satınalma",
  mali: "Mali",
  proje_ici: "Proje içi sekmeler",
  ayarlar: "Ayarlar",
};

// [anahtar, ad, grup, alt başlık, rota, onay eylemi var mı, ikizler]
type CatalogRow = readonly [PageKey, string, PageGroup, string | null, string, boolean, readonly PageKey[]];

const CATALOG_ROWS = [
  ["genel.gosterge_paneli", "Gösterge Paneli", "genel", null, "/", false, []],
  ["genel.onay_kutusu", "Onay Kutusu", "genel", null, "/onay-kutusu", false, []],
  ["genel.fiil_ai", "FİİL AI", "genel", null, "/asistan", false, []],
  ["genel.raporlar", "Raporlar", "genel", null, "/raporlar", false, []],
  ["genel.projeler", "Projeler", "genel", null, "/projeler", false, []],
  ["genel.proje_takvimi", "Proje Takvimi", "genel", null, "/projeler/takvim", false, []],
  ["saha.puantaj", "Puantaj", "saha", null, "/puantaj", false, ["santiye.puantaj", "bolum.puantaj"]],
  ["saha.makine_ekipman", "Makine & Ekipman › Ekipman Listesi", "saha", null, "/makine", false, []],
  ["saha.makine_calisma", "Makine & Ekipman › Çalışma Kaydı", "saha", null, "/makine/calisma", false, []],
  ["saha.makine_yakit", "Makine & Ekipman › Yakıt Takibi", "saha", null, "/makine/yakit", false, []],
  ["saha.makine_kira", "Makine & Ekipman › Kira Hakedişi", "saha", null, "/makine/kira", true, []],
  ["saha.gunluk_kayit", "Günlük Kayıt", "saha", null, "/gunluk-kayit", true, ["santiye.gunluk_kayit", "bolum.gunluk_kayit", "bolum.gunluk_kayit_detay"]],
  ["ik.personel", "Personel › Personel Listesi", "ik", null, "/personel", false, []],
  ["ik.izin_yonetimi", "Personel › İzin Yönetimi", "ik", null, "/personel/izinler", true, []],
  ["ik.belge_sertifika", "Personel › Belge & Sertifika", "ik", null, "/personel/belgeler", false, []],
  ["planlama.panel", "Planlama Paneli", "planlama", null, "/planlama/panel", false, ["santiye.planlama_paneli"]],
  ["planlama.adam_saat_butcesi", "Adam-Saat Bütçesi", "planlama", null, "/planlama/adam-saat-butcesi", true, ["santiye.adam_saat_butcesi"]],
  ["planlama.gunluk_rapor", "Günlük İlerleme Raporu", "planlama", null, "/planlama/gunluk-rapor", true, ["santiye.gunluk_ilerleme_raporu"]],
  ["planlama.haftalik_qurr", "Haftalık QURR", "planlama", null, "/planlama/haftalik-qurr", false, ["santiye.haftalik_qurr"]],
  ["planlama.birim_oran_katalogu", "Birim Oran Kataloğu", "planlama", null, "/planlama/birim-oran-katalogu", false, []],
  ["planlama.disiplin_yonetimi", "Disiplin Yönetimi", "planlama", null, "/planlama/disiplin-yonetimi", false, []],
  ["teklif.teklif_hazirlama", "Teklif Hazırlama", "teklif", null, "/teklif-hazirlama", true, []],
  ["teklif.sablonlar", "Teklif Şablonları", "teklif", null, "/teklif-hazirlama/sablonlar", false, []],
  ["teklif.sozlesmeler", "Sözleşmeler (İşveren · Taşeron)", "teklif", null, "/sozlesmeler", false, []],
  ["teklif.taseron_firmalar", "Taşeron Firmalar", "teklif", null, "/sozlesmeler/taseronlar", false, []],
  ["teklif.isveren_sozlesme", "İşveren Sözleşme Detayı", "teklif", null, "/sozlesmeler/isveren/[projectId]", false, []],
  ["teklif.poz_dagilimi", "İşveren Sözleşmesi › Poz Dağılımı", "teklif", null, "/sozlesmeler/isveren/[projectId]/poz-dagilimi", false, []],
  ["teklif.taseron_sozlesme", "Taşeron Sözleşme Detayı", "teklif", null, "/sozlesmeler/taseron/[contractId]", false, []],
  ["teklif.is_kalemi_katalogu", "İş Kalemi Kataloğu", "teklif", null, "/planlama/is-kalemi-katalogu", false, []],
  ["stok.stok_depo", "Stok & Depo", "stok", null, "/stok", false, ["santiye.stok", "bolum.malzeme"]],
  ["stok.satinalma_talepleri", "Satınalma & Teklif › Satın Alma Talepleri", "stok", null, "/satinalma", true, []],
  ["stok.siparisler", "Satınalma & Teklif › Siparişler", "stok", null, "/satinalma/siparisler", false, []],
  ["stok.tedarikciler", "Satınalma & Teklif › Tedarikçiler", "stok", null, "/satinalma/tedarikciler", false, []],
  ["stok.teklif_karsilastirma", "Satınalma & Teklif › Teklif Karşılaştırma", "stok", null, "/satinalma/talepler/[id]/teklifler", true, []],
  ["mali.satis", "Satış Yönetimi", "mali", null, "/satis", true, []],
  ["mali.satis_blok", "Satış › Blok Ekle", "mali", null, "/satis/blok-ekle", false, []],
  ["mali.satis_unite", "Satış › Ünite Ekle", "mali", null, "/satis/unite-ekle", false, []],
  ["mali.satis_toplu_uretim", "Satış › Toplu Üretim", "mali", null, "/satis/toplu-uretim", false, []],
  ["mali.satis_excel", "Satış › Excel İçe Aktar", "mali", null, "/satis/excel-ice-aktar", false, []],
  ["mali.satis_paylasim", "Satış › Paylaşım Girişi", "mali", null, "/satis/paylasim-girisi", false, []],
  ["mali.yevmiye", "Muhasebe › Yevmiye", "mali", null, "/muhasebe", true, []],
  ["mali.hesap_plani", "Muhasebe › Hesap Planı", "mali", null, "/muhasebe/hesap-plani", false, []],
  ["mali.mizan", "Muhasebe › Mizan", "mali", null, "/muhasebe/mizan", false, []],
  ["mali.kdv_beyani", "Muhasebe › KDV Beyanı", "mali", null, "/muhasebe/kdv-beyani", false, []],
  ["mali.banka_mutabakati", "Muhasebe › Banka Mutabakatı", "mali", null, "/muhasebe/banka-mutabakati", false, []],
  ["mali.donem_kapanisi", "Muhasebe › Dönem Kapanışı", "mali", null, "/muhasebe/donem-kapanisi", true, []],
  ["mali.fatura", "Fatura Yönetimi (Giden · Gelen)", "mali", null, "/faturalar", true, []],
  ["mali.hazine", "Hazine", "mali", null, "/hazine", false, []],
  ["mali.cek_odeme", "Çek & Ödeme", "mali", null, "/hazine/cek-senet", true, []],
  ["mali.hakedis_isveren", "Hakedişler › İşveren", "mali", null, "/hakedisler", true, ["proje.isveren_hakedis", "santiye.hakedisler", "bolum.hakedis"]],
  ["mali.hakedis_taseron", "Hakedişler › Taşeron", "mali", null, "/hakedisler/taseron", true, ["proje.taseron_hakedis", "santiye.hakedisler", "bolum.hakedis"]],
  ["mali.gelir_tablosu", "Mali Tablolar › Gelir Tablosu", "mali", null, "/mali-tablolar", false, []],
  ["mali.bilanco", "Mali Tablolar › Bilanço", "mali", null, "/mali-tablolar/bilanco", false, []],
  ["mali.nakit_akisi", "Mali Tablolar › Nakit Akışı", "mali", null, "/mali-tablolar/nakit-akisi", false, []],
  ["mali.bordro", "Bordro › Aylık Bordro", "mali", null, "/bordro", true, []],
  ["mali.bordro_gecmis", "Bordro › Bordro Geçmişi", "mali", null, "/bordro/gecmis", false, []],
  ["mali.sgk_bildirimi", "Bordro › SGK Bildirimi", "mali", null, "/bordro/sgk", true, []],
  ["mali.sirket_varliklari", "Şirket Varlıkları", "mali", null, "/sirket-varliklari", false, []],
  ["mali.belge_arsivi", "Belge Arşivi", "mali", null, "/belgeler", false, ["proje.belgeler", "santiye.belgeler"]],
  ["proje.santiyeler", "Proje › Şantiyeler", "proje_ici", "Proje", "/projeler/[projectId]", false, []],
  ["proje.ozet", "Proje › Proje Özeti", "proje_ici", "Proje", "/projeler/[projectId]/ozet", false, []],
  ["proje.paylasim_tablosu", "Proje › Paylaşım Tablosu", "proje_ici", "Proje", "/projeler/[projectId]/paylasim", false, []],
  ["proje.is_kalemleri", "Proje › İş Kalemleri", "proje_ici", "Proje", "/sozlesmeler/isveren/[projectId]?tab=items", false, []],
  ["proje.isveren_hakedis", "Proje › İşveren Hakediş", "proje_ici", "Proje", "/hakedisler?project_id=", true, []],
  ["proje.taseron_hakedis", "Proje › Taşeron Hakediş", "proje_ici", "Proje", "/hakedisler/taseron?project_id=", true, []],
  ["proje.belgeler", "Proje › Belgeler", "proje_ici", "Proje", "/belgeler?proje=", false, []],
  ["santiye.bolumler", "Şantiye › Bölümler", "proje_ici", "Şantiye", "/projeler/[p]/santiyeler/[s]", false, []],
  ["santiye.is_kalemleri", "Şantiye › İş Kalemleri", "proje_ici", "Şantiye", "/projeler/[p]/santiyeler/[s]/is-kalemleri", false, []],
  ["santiye.puantaj", "Şantiye › Puantaj", "proje_ici", "Şantiye", "/projeler/[p]/santiyeler/[s]/puantaj", false, []],
  ["santiye.stok", "Şantiye › Stok", "proje_ici", "Şantiye", "/projeler/[p]/santiyeler/[s]/stok", false, []],
  ["santiye.hakedisler", "Şantiye › Hakedişler", "proje_ici", "Şantiye", "/projeler/[p]/santiyeler/[s]/hakedisler", true, []],
  ["santiye.gunluk_kayit", "Şantiye › Günlük Kayıt", "proje_ici", "Şantiye", "/projeler/[p]/santiyeler/[s]/gunluk-kayit", true, []],
  ["santiye.belgeler", "Şantiye › Belgeler", "proje_ici", "Şantiye", "/projeler/[p]/santiyeler/[s]/belgeler", false, []],
  ["santiye.bolum_dagilimi", "Şantiye › İş Kalemleri › Bölüm Dağılımı", "proje_ici", "Şantiye", "/projeler/[p]/santiyeler/[s]/is-kalemleri/bolum-dagilimi", false, []],
  ["santiye.gunluk_ozet", "Şantiye › Günlük Kayıt › Aylık Özet", "proje_ici", "Şantiye", "/projeler/[p]/santiyeler/[s]/gunluk-kayit/ozet", false, []],
  ["santiye.gunluk_planlama", "Şantiye › Günlük Kayıt › Planlama", "proje_ici", "Şantiye", "/projeler/[p]/santiyeler/[s]/gunluk-kayit/planlama", false, []],
  ["santiye.adam_saat_butcesi", "Şantiye › Adam-Saat Bütçesi", "proje_ici", "Şantiye", "/projeler/[p]/santiyeler/[s]/adam-saat-butcesi", true, []],
  ["santiye.planlama_paneli", "Şantiye › Planlama Paneli", "proje_ici", "Şantiye", "/projeler/[p]/santiyeler/[s]/planlama-paneli", false, []],
  ["santiye.gunluk_ilerleme_raporu", "Şantiye › Günlük İlerleme Raporu", "proje_ici", "Şantiye", "/projeler/[p]/santiyeler/[s]/gunluk-ilerleme-raporu", true, []],
  ["santiye.haftalik_qurr", "Şantiye › Haftalık QURR", "proje_ici", "Şantiye", "/projeler/[p]/santiyeler/[s]/haftalik-qurr", false, []],
  ["bolum.detay", "Bölüm Detayı", "proje_ici", "Bölüm", "/projeler/[p]/santiyeler/[s]/bolumler/[sectionId]", false, []],
  ["bolum.is_kalemleri", "Bölüm › İş Kalemleri", "proje_ici", "Bölüm", "/projeler/[p]/…/bolumler/[sectionId]?sekme=is-kalemleri", false, []],
  ["bolum.puantaj", "Bölüm › İşçiler & Puantaj", "proje_ici", "Bölüm", "/projeler/[p]/…/bolumler/[sectionId]?sekme=puantaj", false, []],
  ["bolum.malzeme", "Bölüm › Malzeme", "proje_ici", "Bölüm", "/projeler/[p]/…/bolumler/[sectionId]?sekme=malzeme", false, []],
  ["bolum.hakedis", "Bölüm › Hakediş", "proje_ici", "Bölüm", "/projeler/[p]/…/bolumler/[sectionId]?sekme=hakedis", false, []],
  ["bolum.gunluk_kayit", "Bölüm › Günlük Kayıt", "proje_ici", "Bölüm", "/projeler/[p]/…/bolumler/[sectionId]?sekme=gunluk-kayit", false, []],
  ["bolum.gunluk_kayit_detay", "Bölüm › Günlük Kayıt Detayı", "proje_ici", "Bölüm", "/projeler/[p]/santiyeler/[s]/bolumler/[sectionId]/gunluk-kayit/[entryId]", true, []],
  ["ayarlar.gelistirme", "Geliştirme (geçici)", "ayarlar", null, "/gelistirme", false, []],
  ["ayarlar.sirket_bilgileri", "Şirket Bilgileri", "ayarlar", null, "/ayarlar/sirket-bilgileri", false, []],
  ["ayarlar.bildirimler", "Bildirimler", "ayarlar", null, "/ayarlar/bildirimler", false, []],
  ["ayarlar.gorunum", "Görünüm", "ayarlar", null, "/ayarlar/gorunum", false, []],
  ["ayarlar.planlama", "Planlama Ayarları", "ayarlar", null, "/ayarlar/planlama", false, []],
  ["ayarlar.kullanicilar", "Kullanıcılar", "ayarlar", null, "/ayarlar/kullanicilar", false, []],
  ["ayarlar.rol_yonetimi", "Rol Yönetimi", "ayarlar", null, "/ayarlar/roller", false, []],
  ["ayarlar.sayfa_izinleri", "Sayfa İzinleri", "ayarlar", null, "/ayarlar/izin-matrisi", false, []],
  ["ayarlar.onay_rolleri", "Onay Eşiği", "ayarlar", null, "/ayarlar/onay-rolleri", false, []],
  ["ayarlar.bordro_oranlari", "Bordro Oranları", "ayarlar", null, "/ayarlar/bordro-oranlari", false, []],
  ["ayarlar.entegrasyonlar", "Entegrasyonlar", "ayarlar", null, "/ayarlar/entegrasyonlar", false, []],
  ["ayarlar.yedekleme", "Yedekleme", "ayarlar", null, "/ayarlar/yedekleme", false, []],
  ["ayarlar.denetim_gunlugu", "Denetim Günlüğü", "ayarlar", null, "/ayarlar/denetim-gunlugu", false, []],
] as const satisfies readonly CatalogRow[];

export const MOCK_PAGE_CATALOG: readonly PageResponse[] = CATALOG_ROWS.map(
  ([key, name, group, subgroup, route, hasApproval, twins]): PageResponse => ({
    key,
    name,
    group,
    group_name: GROUP_NAMES[group],
    subgroup,
    route,
    kind: group === "proje_ici" ? "proje" : "sirket",
    has_approval: hasApproval,
    twins: [...twins],
    source: key.split(".")[0],
  }),
);

/**
 * IZN-F6d · mock oturum kullanıcısının (`ME.pages`) sayfa matrisi: 100 sayfanın HEPSİ `edit`, onay eylemi
 * olanlarda `approve`. Bugünkü fiili izin ("her şey yazılabilir + onaylanabilir") ile eşdeğerdir; sistem
 * yöneticisi DEĞİLDİR (`need: "sa"` kapıları kapalı kalır). Elle liste yok: katalogdan türetilir.
 */
export function mockFullAccessPages(): Record<string, PageGrant> {
  const pages: Record<string, PageGrant> = {};
  for (const page of MOCK_PAGE_CATALOG) {
    pages[page.key] = { level: "edit", approve: page.has_approval };
  }
  return pages;
}

/**
 * IZN-F6d · `ME.pages` üzerinde kadraja özel düzey ezmesi (paylaşılan mock'a YAZILMAZ; `page.route` içinde
 * `/auth/me` yanıtına uygulanır). Eski `permissions` düşürmesi sayfa modeli devredeyken ETKİSİZ kaldığından
 * görüntüleyici/formen kadrajları artık sayfa grant'ı ile kurulur. `approve` yalnız `"edit"` + `canApprove`.
 */
export function withPageLevels(
  pages: Record<string, PageGrant> | undefined,
  keys: readonly string[],
  level: PageLevel,
  canApprove = false,
): Record<string, PageGrant> {
  const next: Record<string, PageGrant> = { ...pages };
  for (const key of keys) next[key] = { level, approve: level === "edit" && canApprove };
  return next;
}

/** Katalogdan, verilen yüklemi sağlayan sayfa anahtarları. */
export function catalogKeys(isMatch: (page: PageResponse) => boolean): string[] {
  return MOCK_PAGE_CATALOG.filter(isMatch).map((page) => page.key);
}

/** Planlama (EV) sayfaları: `planlama.*` + şantiye içi EV ikizleri + `ayarlar.planlama`. */
export const MOCK_EV_PAGE_KEYS: readonly string[] = catalogKeys(
  (page) =>
    page.group === "planlama" ||
    page.key === "ayarlar.planlama" ||
    /^santiye\.(adam_saat_butcesi|planlama_paneli|gunluk_ilerleme_raporu|haftalik_qurr)$/.test(page.key),
);

/** Teklif ve Sözleşmeler grubu (eski `contracts` modülü). */
export const MOCK_CONTRACTS_PAGE_KEYS: readonly string[] = catalogKeys((page) => page.group === "teklif");

/** Rol anahtarı → grup bazında düzey (yazılmayan grup "none"; Şantiye Şefi dışı roller yalnız Genel'i görür). */
const LEVELS_BY_ROLE: Record<string, Partial<Record<PageGroup, PageLevel>>> = {
  site_chief: { genel: "view", saha: "edit", planlama: "view", stok: "view", proje_ici: "view" },
};
const DEFAULT_LEVELS: Partial<Record<PageGroup, PageLevel>> = { genel: "view" };

const HIDDEN_BY_ROLE: Record<string, readonly HiddenCategory[]> = {
  site_chief: ["maas_kisisel"],
};

/** Rolün sayfa matrisi (100 anahtarın HEPSİ). Sistem Yöneticisi: her sayfa `edit` + onay eylemi olanda `approve`. */
export function mockRolePages(role: MockRoleRow): RolePagesResponse {
  const isLocked = role.key === "system_admin";
  const levels = LEVELS_BY_ROLE[role.key] ?? DEFAULT_LEVELS;
  const pages: Record<string, PageGrant> = {};
  for (const page of MOCK_PAGE_CATALOG) {
    const level: PageLevel = isLocked ? "edit" : (levels[page.group] ?? "none");
    pages[page.key] = { level, approve: isLocked && page.has_approval };
  }
  // Kira Hakedişi: Görür (önce: Görür kareleri bu satırdan beslenir).
  if (role.key === "site_chief") pages["saha.makine_kira"] = { level: "view", approve: false };
  return {
    role_id: role.id,
    is_locked: isLocked,
    pages,
    hidden_fields: isLocked ? [] : [...(HIDDEN_BY_ROLE[role.key] ?? [])],
    // IZN-B4a: maske backend'de UYGULANIYOR → alan true; "sonraki güncellemede devreye girer" notu karelerde GÖRÜNMEZ.
    hidden_fields_effective: true,
  };
}

export function mockRoleResponse(role: MockRoleRow, userCount: number): RoleResponse {
  return {
    ...role,
    is_assignable: true,
    is_locked: role.key === "system_admin",
    user_count: userCount,
  };
}

/** Backend `PUT /roles/{id}/pages` 422 kuralları: eksik sayfa, onay eylemi olmayan sayfada onay, Görmez'de onay. */
export function rolePagesViolation(body: { pages?: Record<string, PageGrant> }): string | null {
  const pages = body.pages ?? {};
  const problems: string[] = [];
  for (const page of MOCK_PAGE_CATALOG) {
    const grant = pages[page.key];
    if (!grant) problems.push(`${page.key}: sayfa eksik`);
    else if (grant.approve && !page.has_approval) problems.push(`${page.key}: onay eylemi yok`);
    else if (grant.approve && grant.level === "none") problems.push(`${page.key}: Görmez'de onay verilemez`);
  }
  return problems.length > 0 ? problems.join(" · ") : null;
}
