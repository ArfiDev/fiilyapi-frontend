/**
 * URL-1 · Uygulama içi rotaların TEK üreticisi.
 *
 * KÖK OLAY: `/projeler/<uuid>` biçimi kullanıcıya ham UUID gösteriyordu ve
 * ad slug'ına geçirilmesi istendi. Ölçüm: bu yol kodda TEK BİR yerde değil,
 * ONLARCA yerde elle birleştirilmiş string olarak kuruluyordu — biçimi
 * değiştirmek her birini tek tek elden geçirmek demekti ve ATLANAN bir
 * nokta SESSİZCE bozuk link üretirdi (kusur ancak tıklanınca görülür).
 *
 * 🔴 BU MODÜL BUGÜNKÜ URL'LERİ BİREBİR ÜRETİR. URL-1 dilimi görünürde
 * hiçbir şeyi değiştirmez; kazanç, bir sonraki biçim değişikliğinin
 * BURADA ve yalnız burada olmasıdır.
 *
 * ─── Tip güvenliği ───────────────────────────────────────────────────────
 * Parametreli rotalar ADLANDIRILMIŞ nesne alır, sırayla değil. Bu tercih
 * bilinçlidir: bu uygulamadaki her kimlik `string`tir, dolayısıyla konumsal
 * imzada `detail(siteId, projectId)` gibi bir SIRA HATASI derleyiciden
 * SESSİZCE geçerdi ve çalışma anında 404 üretirdi. Adlandırılmış alanlarla
 * eksik/yanlış/fazla anahtar `pnpm typecheck`te patlar.
 *
 * ─── UUID → slug göçü (URL-2/URL-3 için hazırlık) ────────────────────────
 * Kimlik tipi `RouteId = string`tir ve her segment `seg()`ten geçer
 * (`encodeURIComponent`). UUID de slug de bir `string`tir; bu yüzden
 * imzaların HİÇBİRİ değişmeden `/projeler/<uuid>` → `/projeler/<slug>`
 * geçişi yapılabilir: çağıran taraf `projectId` yerine `project.slug ??
 * project.id` geçirir, üretici aynı kalır. Eski UUID linklerinin çalışmaya
 * devam etmesi ise ÜRETİCİNİN değil ÇÖZÜCÜNÜN (sayfa/backend) işidir —
 * bu modül kimliği yorumlamaz, yalnız güvenle kodlar.
 *
 * ─── 🔴 KURAL: YOL SEGMENTİ OKUNUR ANAHTAR, SORGU PARAMETRESİ UUID ────────
 * URL-3 bu ayrımı BİLEREK ve AÇIKÇA koyar; "karma URL" bir kaza değil, yazılı
 * bir karardır. Gerekçe ÖLÇÜLDÜ:
 *
 * 1. Slug'ı kabul eden uç YALNIZ ÜÇTÜR (`GET /projects|sites|sections/{key}`).
 *    Kalan 42 yol/sorgu parametresi UUID BEKLER. Sorgu parametreleri bu
 *    depoda tam olarak o uçlara BESLENİR (`?section=` → `section_id`,
 *    `?site=` → `site_id`, `?project_id=` → `project_id`); slug'a
 *    çevrilselerdi ekran 422 alırdı.
 * 2. Sorgu parametrelerini DOLDURAN seçicinin kaynağı `GET /sites`tir
 *    (`SiteOptionListResponse`) ve o şemada `slug` alanı HİÇ YOKTUR — seçici
 *    slug'ı ÜRETEMEZ. Yarım bir göç yerine kural yazıldı.
 *
 * Yani: `/projeler/<slug>/santiyeler/<slug>` ama `?section=<uuid>`. Kullanıcı
 * ADRESİ okur; sorgu dizesi makine anahtarıdır. Bu kuralı değiştirmek
 * `SiteOptionListResponse`e slug eklenmesini (BACKEND işi) gerektirir —
 * URL-3'ün kapsamı DIŞINDA, borç olarak kayıtlıdır.
 */

import { OFFER_PRINT_KIND_PARAM, OFFER_REV_PARAM, type OfferPrintKind } from "./navigation-params";

/** URL'ye giren kaynak kimliği — bugün UUID, yarın slug; ikisi de `string`. */
export type RouteId = string;

/**
 * URL-3 · Bir kaydın URL'de taşınacak anahtarı: **`slug ?? id`**.
 *
 * 🔴 `slug` SÖZLEŞMEDE HEM OPSİYONEL HEM NULLABLE'dır (`slug?: string | null`
 * — yedi şemanın yedisinde de). `slug!` yazmak ya da `slug` varmış gibi
 * davranmak CANLIDA BOZUK LİNK üretir: adı slug'lanamayan kayıt (`null`)
 * yalnız kimliğiyle yaşar. Bu yardımcı o düşüşü TEK yerde yapar, yoksa
 * `?? id` ellinin üstünde çağrı noktasında tekrarlanır ve biri unutulduğunda
 * kusur ancak kullanıcı tıklayınca görülür.
 *
 * ⚠️ NE DEĞİLDİR: bu bir çözücü DEĞİLDİR. Anahtarı ÜRETİR; onu geri kayda
 * çevirmek okuma ucunun işidir (üç uç UUID'yi de slug'ı da kabul eder).
 */
export function routeKeyOf(entity: { id: string; slug?: string | null }): RouteId {
  return entity.slug ?? entity.id;
}

/**
 * `?donus=` — kayıt sonrası dönülecek uygulama içi yolun sorgu anahtarı.
 *
 * 🔴 Anahtar burada TEK tanımdır ve OKUYAN taraf (`PersonnelForm`) onu buradan
 * alır. İki ayrı sabit olsaydı biri değiştirilip öteki unutulduğunda form
 * dönüş hedefini SESSİZCE kaybederdi (kullanıcı kaydettikten sonra yanlış
 * ekrana düşerdi) — üretim ile okumanın ayrışması tam olarak bu dilimin
 * kapattığı çürüme sınıfıdır.
 */
export const PERSONNEL_RETURN_PARAM = "donus";

/**
 * DET-1.2 · S4 — Bölüm Detay'ın açık sekmesinin sorgu anahtarı (`?sekme=`).
 *
 * Sekmeler eskiden YEREL state'ti; günlük kayıt detayından kırıntı/geri ile
 * dönen kullanıcı "Günlük Kayıt" yerine "İş Kalemleri"ne düşüyordu. Anahtar
 * `donus` deseninde TEK tanımdır: üreten (`sections.detail`) ile okuyan
 * (`SectionDetailView`) aynı sabiti paylaşır.
 */
export const SECTION_TAB_PARAM = "sekme";

/**
 * Bölüm Detay sekme kimlikleri — `SectionDetailTabs`in `siteSlug`
 * değerleriyle BİREBİR aynıdır (şerit bu tipi kullanır; biri değişirse tip
 * denetimi kırılır). Varsayılan sekme ("is-kalemleri") URL'e yazılmaz.
 */
export type SectionTabKey = "is-kalemleri" | "puantaj" | "stok" | "hakedisler" | "gunluk-kayit";

/**
 * PLN-F3.0 · `?tarih=` — Günlük Kayıt'ın açık GÜNÜNÜN sorgu anahtarı.
 *
 * `donus`/`sekme` deseninde TEK tanımdır: üreten (`routes.projects.sites.diary`
 * / `routes.siteDiary`) ile okuyan (`SiteDiaryEntryView` — `DiaryEntryScreen`)
 * aynı sabiti paylaşır. `YYYY-MM-DD` taşır; verilmezse (ya da geçersizse)
 * ekran BUGÜNE düşer.
 */
export const DIARY_DATE_PARAM = "tarih";

/** Günlük Kayıt'ın şantiye altı ikizi — gün opsiyoneldir (`?tarih=`). */
export interface SiteDiaryParams extends SiteParams {
  date?: string;
}

/** Günlük Kayıt'ın KÖK ikizi — şantiye ve gün ikisi de URL'de opsiyoneldir. */
export interface GeneralDiaryParams {
  site?: RouteId;
  date?: string;
}

/**
 * PLN-F3.6a · Planlama raporları (Panel/GİR/QURR).
 * `?hafta=` — Haftalık QURR'un açık haftasının sorgu anahtarı; `EVB_WEEK_PARAM`
 * ile ekran (`WeeklyQurrScreen`, B) AYNI sabiti paylaşır.
 */
export const EVB_WEEK_PARAM = "hafta";

/** Günlük İlerleme Raporu'nun şantiye altı ikizi — gün opsiyoneldir (`?tarih=`, `DIARY_DATE_PARAM` ile AYNI anahtar). */
export interface SiteEvDailyReportParams extends SiteParams {
  date?: string;
}

/** Haftalık QURR'un şantiye altı ikizi — hafta opsiyoneldir (`?hafta=`). */
export interface SiteEvWeeklyReportParams extends SiteParams {
  week?: number;
}

/** Planlama kök ikizleri (Bütçe/Panel) — şantiye opsiyoneldir (`?site=`). */
export interface GeneralPlanningParams {
  site?: RouteId;
}

/** GİR kök ikizi — şantiye VE gün opsiyoneldir. */
export interface GeneralEvDailyReportRootParams extends GeneralPlanningParams {
  date?: string;
}

/** QURR kök ikizi — şantiye VE hafta opsiyoneldir. */
export interface GeneralEvWeeklyReportRootParams extends GeneralPlanningParams {
  week?: number;
}

/** Tek bir yol segmentini güvenle kodlar (slug'da Türkçe karakter olabilir). */
function seg(value: RouteId): string {
  return encodeURIComponent(value);
}

/**
 * Sorgu dizesini kurar; `undefined`/boş değerli anahtarlar ATLANIR ve hiç
 * anahtar kalmazsa "?" bile eklenmez — böylece süzgeçsiz çağrı bugünkü
 * çıplak yolla BİREBİR aynı string'i üretir.
 *
 * 🔴 `URLSearchParams` KULLANILMAZ, `encodeURIComponent` KULLANILIR. İlk
 * yazımda `URLSearchParams` vardı ve ÜRETİLEN URL'İ DEĞİŞTİRDİ: o sınıf
 * `application/x-www-form-urlencoded` kodlar — boşluk `%20` değil `+`, `/`
 * ise `%2F` olur. `?donus=/personel` bağlantısı sessizce `?donus=%2Fpersonel`
 * hâline geldi. Kusuru elle URL yazan testler yakaladı (bkz. bekçinin
 * "testler kapsam dışı" gerekçesi) — üretici ile iddia aynı yardımcıyı
 * paylaşsaydı ikisi BİRLİKTE kayar ve hiçbir şey kırılmazdı.
 */
function qs(params: Record<string, string | number | undefined | null>): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    pairs.push(`${key}=${encodeURIComponent(String(value))}`);
  }
  return pairs.length === 0 ? "" : `?${pairs.join("&")}`;
}

/* ─── Parametre nesneleri ──────────────────────────────────────────────── */

export interface ProjectParams {
  projectId: RouteId;
}
export interface SiteParams extends ProjectParams {
  siteId: RouteId;
}
export interface SectionParams extends SiteParams {
  sectionId: RouteId;
}

/** Bölüm Detay — `sekme` verilmezse `?sekme=` EKLENMEZ (varsayılan sekme). */
export interface SectionDetailParams extends SectionParams {
  sekme?: SectionTabKey;
}

/** DET-1.2 · günlük kayıt detayı — kayıt KİMLİKLE açılır (`GET /diary/{entry_id}`). */
export interface SectionDiaryEntryParams extends SectionParams {
  entryId: RouteId;
}

/** Şantiye puantajı bölüm süzgecini OKUR (`SiteTimesheetView` `?section=`). */
export interface SiteTimesheetParams extends SiteParams {
  /** Verilmezse süzgeçsiz şantiye görünümü — `?section=` EKLENMEZ. */
  section?: RouteId;
  /** Açılış haftası (PLN-F2.1b) — ekran `?iso_year=&iso_week=` okur (`SiteTimesheetView` `parseIsoWeek`). */
  isoYear?: number;
  isoWeek?: number;
}

/**
 * 🔴 STOK-BOLUM (2026-08-29) — şantiye stok ekranı ARTIK bölüm süzgeci OKUR.
 *
 * Önceki tur `stock`u bilerek `SiteParams` bırakmıştı ve gerekçesi ÖLÇÜLMÜŞTÜ:
 * *"`SiteStockView` HİÇ `useSearchParams` kullanmaz → parametre eklemek ÖLÜ
 * query yazmak olurdu"*. O ölçüm BUGÜN BAYATLADI: backend `186ffe9`
 * `GET /sites/{site_id}/stock`a `?section_id=` süzgecini açtı ve ekran onu
 * okumaya başladı.
 *
 * ⚠️ SÜZGECİN ANLAMI DAR: satır KÜMESİNİ daraltır, `balance`ı DEĞİŞTİRMEZ.
 * Cümlesi *"bu bölümde kullanılmış malzemelerin ŞANTİYE bakiyesi"*dir — bölümün
 * KENDİ miktarları `GET /sections/{id}/stock`tan gelir. Üretici bu ayrımı
 * taşıyamaz; etiketi basan ekran (`SiteStockView`) taşır.
 *
 * Query anahtarı `section`tır — `timesheet` ile AYNI ad (iki ekran aynı kavramı
 * aynı adla taşır); backend sorgu parametresi `section_id` ise HOOK katmanında
 * kurulur, URL'de değil.
 */
export interface SiteStockParams extends SiteParams {
  /** Verilmezse süzgeçsiz şantiye görünümü — `?section=` EKLENMEZ. */
  section?: RouteId;
}

const PROJECTS = "/projeler";
const SITES_SEGMENT = "santiyeler";
const SECTIONS_SEGMENT = "bolumler";

/** `/projeler/<id>` — proje kimliğinin URL'deki TEK gövdesi. */
function projectBase(p: ProjectParams): string {
  return `${PROJECTS}/${seg(p.projectId)}`;
}

/** `/projeler/<id>/santiyeler/<id>` — şantiye alt ağacının TEK gövdesi. */
function siteBase(p: SiteParams): string {
  return `${projectBase(p)}/${SITES_SEGMENT}/${seg(p.siteId)}`;
}

function sectionBase(p: SectionParams): string {
  return `${siteBase(p)}/${SECTIONS_SEGMENT}/${seg(p.sectionId)}`;
}

/* ─── Rota ağacı ───────────────────────────────────────────────────────── */

export const routes = {
  home: () => "/",
  login: () => "/login",
  designSystem: () => "/design-system",
  /**
   * F-RAPOR (2026-08-30): rota ARTIK YAZILDI — `src/app/(app)/raporlar/page.tsx`
   * (rapor KATALOĞU). Bu satırın eski notu ("rotası henüz YAZILMADI") bugün
   * YALAN olurdu; `nav-config.test.ts` bu yolun statik bir sayfaya düştüğünü
   * ayrıca çakar.
   */
  reports: () => "/raporlar",
  /** Kabuk nav'ında var, rotası henüz YAZILMADI — `[...slug]` ComingSoon'a düşer. */
  companyAssets: () => "/sirket-varliklari",
  approvalInbox: () => "/onay-kutusu",
  // AI-1 · FİİL AI Asistanı. Segment `/asistan` (`/ai` DEĞİL): bkz.
  // `src/app/(app)/asistan/page.tsx` başlığı — `ai` kökü açılırsa BFF
  // rotasındaki üst-kaynak yol sabiti kaçak URL sayılırdı.
  assistant: () => "/asistan",
  // GLS-F1 GEÇİCİ — Geliştirme sayfası silinince kaldır
  development: () => "/gelistirme",

  projects: {
    list: () => PROJECTS,
    new: () => `${PROJECTS}/yeni`,
    calendar: () => `${PROJECTS}/takvim`,
    detail: (p: ProjectParams) => projectBase(p),
    summary: (p: ProjectParams) => `${projectBase(p)}/ozet`,
    sharing: (p: ProjectParams) => `${projectBase(p)}/paylasim`,

    sites: {
      new: (p: ProjectParams) => `${projectBase(p)}/${SITES_SEGMENT}/yeni`,
      detail: (p: SiteParams) => siteBase(p),
      boq: (p: SiteParams) => `${siteBase(p)}/is-kalemleri`,
      /** BDG · kalem x bölüm dağılım matrisi; yan menüde ÖĞESİ yok (BOQ başlığından girilir). */
      boqDistribution: (p: SiteParams) => `${siteBase(p)}/is-kalemleri/bolum-dagilimi`,
      documents: (p: SiteParams) => `${siteBase(p)}/belgeler`,
      progressPayments: (p: SiteParams) => `${siteBase(p)}/hakedisler`,
      stock: ({ section, ...p }: SiteStockParams) => `${siteBase(p)}/stok${qs({ section })}`,
      stockEntry: (p: SiteParams) => `${siteBase(p)}/stok/giris`,
      timesheet: ({ section, isoYear, isoWeek, ...p }: SiteTimesheetParams) =>
        `${siteBase(p)}/puantaj${qs({ section, iso_year: isoYear, iso_week: isoWeek })}`,
      diary: ({ date, ...p }: SiteDiaryParams) => `${siteBase(p)}/gunluk-kayit${qs({ [DIARY_DATE_PARAM]: date })}`,
      diarySummary: (p: SiteParams) => `${siteBase(p)}/gunluk-kayit/ozet`,
      diaryPlanning: (p: SiteParams) => `${siteBase(p)}/gunluk-kayit/planlama`,
      /**
       * PLN-F1 · Adam-Saat Bütçesi (EV). F-PL ızgarasının `diaryPlanning`inden
       * AYRI bir modüldür (backend `earned_value`); ad `ev*` ile ayrılır.
       */
      evBudget: (p: SiteParams) => `${siteBase(p)}/adam-saat-butcesi`,
      /**
       * PLN-F3.6a · Planlama Paneli (S21 K21 "İlerleme Raporları" parçası
       * YOK — üç rapor kırıntıda GRUPLANMAZ). Kendi filtrelerini
       * (`?tarih&aralik&disiplin&yuklenici`) KENDİSİ okur/yazar (`PanelScreen`).
       */
      evPanel: (p: SiteParams) => `${siteBase(p)}/planlama-paneli`,
      /** Günlük İlerleme Raporu (GİR); `date` verilmezse `?tarih=` EKLENMEZ. */
      evDailyReport: ({ date, ...p }: SiteEvDailyReportParams) =>
        `${siteBase(p)}/gunluk-ilerleme-raporu${qs({ [DIARY_DATE_PARAM]: date })}`,
      /** Haftalık QURR; `week` verilmezse `?hafta=` EKLENMEZ (backend bugünün haftası). */
      evWeeklyReport: ({ week, ...p }: SiteEvWeeklyReportParams) =>
        `${siteBase(p)}/haftalik-qurr${qs({ [EVB_WEEK_PARAM]: week })}`,

      sections: {
        new: (p: SiteParams) => `${siteBase(p)}/${SECTIONS_SEGMENT}/yeni`,
        detail: ({ sekme, ...p }: SectionDetailParams) =>
          `${sectionBase(p)}${qs({ [SECTION_TAB_PARAM]: sekme })}`,
        edit: (p: SectionParams) => `${sectionBase(p)}/duzenle`,
        /**
         * DET-1.2 · salt okunur günlük kayıt detayı. Bölüm bağlamı yolda
         * taşınır: kırıntı, "Bu bölüm" grubu ve (DET-1.B) önceki/sonraki
         * gezinmesi bölüme göredir. Şantiye düzeyindeki `gunluk-kayit/{x}`
         * seçilmedi — `ozet`/`planlama` statik kardeşleriyle çakışırdı.
         */
        diaryEntry: ({ entryId, ...p }: SectionDiaryEntryParams) =>
          `${sectionBase(p)}/gunluk-kayit/${seg(entryId)}`,
      },
    },
  },

  settings: {
    root: () => "/ayarlar",
    company: () => "/ayarlar/sirket-bilgileri",
    users: () => "/ayarlar/kullanicilar",
    roles: () => "/ayarlar/roller",
    permissionMatrix: () => "/ayarlar/izin-matrisi",
    approvalRoles: () => "/ayarlar/onay-rolleri",
    notifications: () => "/ayarlar/bildirimler",
    appearance: () => "/ayarlar/gorunum",
    integrations: () => "/ayarlar/entegrasyonlar",
    backup: () => "/ayarlar/yedekleme",
    auditLog: () => "/ayarlar/denetim-gunlugu",
    payrollRates: () => "/ayarlar/bordro-oranlari",
    /** PLN-F1 · Planlama (EV) şantiye ayarları; şantiye sayfada seçilir (K1). */
    planning: () => "/ayarlar/planlama",
  },

  /** Belge arşivi; proje süzgeci ekran tarafından OKUNUR (`?proje=`). */
  documents: (params: { projectId?: RouteId } = {}) =>
    `/belgeler${qs({ proje: params.projectId })}`,

  payroll: {
    root: () => "/bordro",
    history: () => "/bordro/gecmis",
    sgk: () => "/bordro/sgk",
  },

  invoices: {
    list: () => "/faturalar",
    new: () => "/faturalar/kes",
    detail: (p: { invoiceId: RouteId }) => `/faturalar/${seg(p.invoiceId)}`,
  },

  progressPayments: {
    /** İşveren hakedişleri; liste ekranı `?project_id=` süzgecini OKUR. */
    list: (params: { projectId?: RouteId } = {}) =>
      `/hakedisler${qs({ project_id: params.projectId })}`,
    /** Yeni işveren hakedişi; sihirbaz `?project=` ile ön seçim YAPAR. */
    new: (params: { projectId?: RouteId } = {}) =>
      `/hakedisler/yeni${qs({ project: params.projectId })}`,
    detail: (p: { paymentId: RouteId }) => `/hakedisler/${seg(p.paymentId)}`,
    edit: (p: { paymentId: RouteId }) => `/hakedisler/${seg(p.paymentId)}/duzenle`,

    subcontractor: {
      list: (params: { projectId?: RouteId } = {}) =>
        `/hakedisler/taseron${qs({ project_id: params.projectId })}`,
      /** Yeni taşeron hakedişi; sihirbaz `?contract=` ile ön seçim YAPAR. */
      new: (params: { contractId?: RouteId } = {}) =>
        `/hakedisler/taseron/yeni${qs({ contract: params.contractId })}`,
      detail: (p: { paymentId: RouteId }) => `/hakedisler/taseron/${seg(p.paymentId)}`,
      edit: (p: { paymentId: RouteId }) => `/hakedisler/taseron/${seg(p.paymentId)}/duzenle`,
    },
  },

  treasury: {
    root: () => "/hazine",
    financialInstruments: () => "/hazine/cek-senet",
  },

  equipment: {
    list: () => "/makine",
    new: () => "/makine/yeni",
    work: () => "/makine/calisma",
    fuel: () => "/makine/yakit",
    detail: (p: { equipmentId: RouteId }) => `/makine/${seg(p.equipmentId)}`,
    edit: (p: { equipmentId: RouteId }) => `/makine/${seg(p.equipmentId)}/duzenle`,
    /**
     * Kira faturaları listesi. Ekran kendi süzgeçlerini OKUR; anahtar kümesi
     * ekranın kendi sabitlerinde yaşadığı için hazır bir `URLSearchParams`
     * kabul edilir (anahtarları burada İKİNCİ KEZ tanımlamak, ekranla
     * ayrışabilecek bir kopya yaratırdı).
     */
    rentalInvoices: (params?: URLSearchParams | string) => {
      const rendered = params === undefined ? "" : String(params);
      return `/makine/kira${rendered === "" ? "" : `?${rendered}`}`;
    },
    rentalInvoiceDetail: (p: { invoiceId: RouteId }) => `/makine/kira/${seg(p.invoiceId)}`,
  },

  financialStatements: {
    root: () => "/mali-tablolar",
    balanceSheet: () => "/mali-tablolar/bilanco",
    cashFlow: () => "/mali-tablolar/nakit-akisi",
  },

  accounting: {
    root: () => "/muhasebe",
    chartOfAccounts: () => "/muhasebe/hesap-plani",
    trialBalance: () => "/muhasebe/mizan",
    vatReturn: () => "/muhasebe/kdv-beyani",
    bankReconciliation: () => "/muhasebe/banka-mutabakati",
    periodClosing: () => "/muhasebe/donem-kapanisi",
  },

  personnel: {
    list: () => "/personel",
    /** Kayıt sonrası dönüş hedefi `?donus=` ile taşınır (`RETURN_PARAM`). */
    new: (params: { returnTo?: string } = {}) =>
      `/personel/yeni${qs({ [PERSONNEL_RETURN_PARAM]: params.returnTo })}`,
    documents: () => "/personel/belgeler",
    leaves: () => "/personel/izinler",
    detail: (p: { personnelId: RouteId }) => `/personel/${seg(p.personnelId)}`,
    edit: (p: { personnelId: RouteId }) => `/personel/${seg(p.personnelId)}/duzenle`,
  },

  timesheet: () => "/puantaj",

  /**
   * F-NAVSAHA · "Günlük Kayıt"ın KÖK rotası — kabuk sol menüsündeki `Saha`
   * grubunun üçüncü öğesi. Şantiye kapsamlı ikizi `projects.sites.diary`dir
   * (`.../santiyeler/[siteId]/gunluk-kayit`); ikisi AYNI ekranı basar, fark
   * şantiyenin NEREDEN geldiğidir (kökte seçici + `?site=`, şantiye altında
   * rotadan sabit) — `timesheet()` ↔ `projects.sites.timesheet()` ikizliğinin
   * birebir aynısı.
   *
   * Seçili şantiye `?site=` ile taşınır (`timesheet` ile AYNI anahtar: iki
   * ekran aynı kavramı aynı adla taşır); değeri URL'de yaşadığı için bağlantı
   * paylaşılabilirdir. Parametre üreticiye alınMADI — `GeneralTimesheetView`
   * emsalinde olduğu gibi seçici `usePathname()` üzerine yazar, yani kök yol
   * elle kurulmaz (URL-1).
   */
  siteDiary: (params: GeneralDiaryParams = {}) =>
    `/gunluk-kayit${qs({ site: params.site, [DIARY_DATE_PARAM]: params.date })}`,

  /**
   * PLN-F1 · kabuk nav'ının "Planlama" grubu (K21). `budget` şantiye kapsamlı
   * ekranın KÖK İKİZİDİR (`siteDiary` deseni): seçili şantiye `?site=` ile
   * taşınır, seçici `usePathname()` üzerine yazar. `catalog` şirket genelidir.
   */
  planning: {
    /**
     * PLN-F3.6a-ek (lider denetimi) · `site` OPSİYONELDİR — kök ikiz KENDİSİ
     * `useEvSiteParam` ile çözer, ama BAŞKA bir kök ikizden (ör. QURR → GİR)
     * gelen bağlantı seçili şantiyeyi TAŞIMALIDIR, yoksa hedef ekran
     * `?site=`SİZ açılır ve İLK seçeneğe döner — kullanıcı başka bir şantiye
     * görür. Verilmezse eski çıplak yolla BİREBİR (`routes.siteDiary` deseni).
     */
    budget: (params: GeneralPlanningParams = {}) => `/planlama/adam-saat-butcesi${qs({ site: params.site })}`,
    catalog: () => "/planlama/birim-oran-katalogu",
    /** TKL-F1.3 · fiyatlı İş Kalemi Kataloğu (`contracts` kapısı; KAT fiyatsızdır). */
    workItemCatalog: () => "/planlama/is-kalemi-katalogu",
    /** Panel/GİR/QURR'un KÖK İKİZLERİ (`budget` deseni). */
    panel: (params: GeneralPlanningParams = {}) => `/planlama/panel${qs({ site: params.site })}`,
    dailyReport: (params: GeneralEvDailyReportRootParams = {}) =>
      `/planlama/gunluk-rapor${qs({ site: params.site, [DIARY_DATE_PARAM]: params.date })}`,
    weeklyReport: (params: GeneralEvWeeklyReportRootParams = {}) =>
      `/planlama/haftalik-qurr${qs({ site: params.site, [EVB_WEEK_PARAM]: params.week })}`,
  },

  purchasing: {
    root: () => "/satinalma",
    orders: () => "/satinalma/siparisler",
    suppliers: () => "/satinalma/tedarikciler",
    newRequest: () => "/satinalma/talep/yeni",
    requestQuotes: (p: { requestId: RouteId }) =>
      `/satinalma/talepler/${seg(p.requestId)}/teklifler`,
  },

  sales: {
    root: () => "/satis",
    new: () => "/satis/yeni",
    addBlock: () => "/satis/blok-ekle",
    addUnit: () => "/satis/unite-ekle",
    bulkUnits: () => "/satis/toplu-uretim",
    importUnits: () => "/satis/excel-ice-aktar",
    landShareAllocation: () => "/satis/paylasim-girisi",
  },

  contracts: {
    /** Sözleşme listesi; sekme seçimi ekranın kendi sorgu anahtarını taşır. */
    list: (params: { tabParam?: string; tab?: string } = {}) =>
      `/sozlesmeler${
        params.tabParam === undefined || params.tab === undefined
          ? ""
          : qs({ [params.tabParam]: params.tab })
      }`,
    subcontractorList: () => "/sozlesmeler/taseronlar",
    employerDetail: (p: ProjectParams) => `/sozlesmeler/isveren/${seg(p.projectId)}`,
    employerItemDistribution: (p: ProjectParams) =>
      `/sozlesmeler/isveren/${seg(p.projectId)}/poz-dagilimi`,
    newSubcontractor: () => "/sozlesmeler/taseron/yeni",
    subcontractorDetail: (p: { contractId: RouteId }) =>
      `/sozlesmeler/taseron/${seg(p.contractId)}`,
  },

  /**
   * TKL-F3 · Teklif Hazırlama (işverene verilen fiyat teklifi). Kök segment menü adından
   * (T31); `/satinalma/talepler/{id}/teklifler` (tedarikçi teklifi) ile KARIŞMAZ.
   * `rev` = revizyon no (0'dan), `tur` = yazdırma türü (isveren | ic).
   */
  offers: {
    list: () => "/teklif-hazirlama",
    new: () => "/teklif-hazirlama/yeni",
    detail: (p: { offerId: RouteId; rev?: number }) =>
      `/teklif-hazirlama/${seg(p.offerId)}${qs({ [OFFER_REV_PARAM]: p.rev })}`,
    // `rev`/`kind` opsiyonel: kırıntı düğümü (`route-tree.ts`) çıplak yazdırma adresini üretir; ekranlar ikisini de verir.
    print: (p: { offerId: RouteId; rev?: number; kind?: OfferPrintKind }) =>
      `/teklif-hazirlama/${seg(p.offerId)}/yazdir${qs({ [OFFER_REV_PARAM]: p.rev, [OFFER_PRINT_KIND_PARAM]: p.kind })}`,
  },

  stock: () => "/stok",
} as const;
