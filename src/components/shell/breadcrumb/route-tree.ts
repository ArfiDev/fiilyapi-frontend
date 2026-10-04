/**
 * F-KIRINTI · kırıntı AĞACI — uygulamanın bütün rotalarının etiketi ve yolu.
 *
 * Tip sözleşmesi ve gerekçeler `trail-node.ts`tedir; burada yalnız VERİ vardır.
 * Üç kural bu dosyanın tamamında geçerlidir ve üçü de bekçilidir:
 *
 * 1. `href` VARSA segmentin `page.tsx`i vardır ve kırıntıda görünür; YOKSA
 *    segment yapısaldır (`santiyeler` · `bolumler` · `isveren` · `taseron`
 *    (sözleşmeler) · `talep` · `talepler`). Bekçi: dosya sistemiyle karşılaştırma.
 * 2. Her `href` `@/lib/routes` üreticisidir. Bu dosyada elle birleştirilmiş
 *    yol string'i YOKTUR. Bekçi: metin taraması + "üretilen href sentetik
 *    yolun önekine eşittir" iddiası.
 * 3. Etiketler ekranların KENDİ metinlerinden alındı (sekme adı, `h1`, form
 *    kırıntısının son parçası). Modül köklerinin etiketi kabuk nav'ıyla,
 *    Ayarlar alt sayfalarınınki `SETTINGS_NAV` ile BİREBİR aynıdır — bekçi
 *    ikisini de karşılaştırır, yani bir yeniden adlandırma sessizce ayrışamaz.
 */
import { routes } from "@/lib/routes";

import type { TrailNode } from "./trail-node";

/* ─── Şantiye alt ağacı ───────────────────────────────────────────────── */

const SECTION_NODE: TrailNode = {
  named: "section",
  label: "Bölüm",
  href: (k) =>
    routes.projects.sites.sections.detail({
      projectId: k.projectId,
      siteId: k.siteId,
      sectionId: k.sectionId,
    }),
  children: {
    duzenle: {
      label: "Bölümü Düzenle",
      href: (k) =>
        routes.projects.sites.sections.edit({
          projectId: k.projectId,
          siteId: k.siteId,
          sectionId: k.sectionId,
        }),
    },
    // DET-1.2 · S4 — `gunluk-kayit` segmentinin KENDİ sayfası YOK; kırıntıda
    // Bölüm Detay'ın "Günlük Kayıt" SEKMESİNE bağlanır (mockup 152). Geri
    // tuşu da buraya döner (sondan ikinci parça).
    "gunluk-kayit": {
      label: "Günlük Kayıt",
      crumbHref: (k) =>
        routes.projects.sites.sections.detail({
          projectId: k.projectId,
          siteId: k.siteId,
          sectionId: k.sectionId,
          sekme: "gunluk-kayit",
        }),
      dynamic: {
        param: "entityId",
        node: {
          named: "diaryEntry",
          label: "Kayıt Detayı",
          omitWhenUnresolved: true,
          href: (k) =>
            routes.projects.sites.sections.diaryEntry({
              projectId: k.projectId,
              siteId: k.siteId,
              sectionId: k.sectionId,
              entryId: k.entityId,
            }),
        },
      },
    },
  },
};

const SITE_NODE: TrailNode = {
  named: "site",
  label: "Şantiye",
  href: (k) => routes.projects.sites.detail({ projectId: k.projectId, siteId: k.siteId }),
  children: {
    "is-kalemleri": {
      label: "İş Kalemleri",
      href: (k) => routes.projects.sites.boq({ projectId: k.projectId, siteId: k.siteId }),
      children: {
        "bolum-dagilimi": {
          label: "Bölüm Dağılımı",
          href: (k) =>
            routes.projects.sites.boqDistribution({ projectId: k.projectId, siteId: k.siteId }),
        },
      },
    },
    belgeler: {
      label: "Belgeler",
      href: (k) => routes.projects.sites.documents({ projectId: k.projectId, siteId: k.siteId }),
    },
    hakedisler: {
      label: "Hakedişler",
      href: (k) =>
        routes.projects.sites.progressPayments({ projectId: k.projectId, siteId: k.siteId }),
    },
    puantaj: {
      label: "Puantaj",
      href: (k) => routes.projects.sites.timesheet({ projectId: k.projectId, siteId: k.siteId }),
    },
    stok: {
      label: "Stok Durumu",
      href: (k) => routes.projects.sites.stock({ projectId: k.projectId, siteId: k.siteId }),
      children: {
        giris: {
          label: "Stok Girişi",
          href: (k) =>
            routes.projects.sites.stockEntry({ projectId: k.projectId, siteId: k.siteId }),
        },
      },
    },
    "gunluk-kayit": {
      label: "Günlük Kayıt",
      href: (k) => routes.projects.sites.diary({ projectId: k.projectId, siteId: k.siteId }),
      children: {
        ozet: {
          label: "Hakediş Özeti",
          href: (k) =>
            routes.projects.sites.diarySummary({ projectId: k.projectId, siteId: k.siteId }),
        },
        planlama: {
          label: "Planlama",
          href: (k) =>
            routes.projects.sites.diaryPlanning({ projectId: k.projectId, siteId: k.siteId }),
        },
      },
    },
    // PLN-F1 · Adam-Saat Bütçesi (EV) — F-PL'nin `gunluk-kayit/planlama`sından
    // AYRI modül; mockup kırıntısı `… › A-Blok Şantiyesi › Adam-Saat Bütçesi`
    // (Planlama - Adam-Saat Bütçesi.dc.html:84-87).
    "adam-saat-butcesi": {
      label: "Adam-Saat Bütçesi",
      href: (k) => routes.projects.sites.evBudget({ projectId: k.projectId, siteId: k.siteId }),
    },
    // PLN-F3.6a · Panel/GİR/QURR — `adam-saat-butcesi`
    // ile AYNI seviyede, K21 "İlerleme Raporları" parçası YOK (gruplanmaz).
    "planlama-paneli": {
      label: "Planlama Paneli",
      href: (k) => routes.projects.sites.evPanel({ projectId: k.projectId, siteId: k.siteId }),
    },
    "gunluk-ilerleme-raporu": {
      label: "Günlük İlerleme Raporu",
      href: (k) => routes.projects.sites.evDailyReport({ projectId: k.projectId, siteId: k.siteId }),
    },
    "haftalik-qurr": {
      label: "Haftalık QURR",
      href: (k) => routes.projects.sites.evWeeklyReport({ projectId: k.projectId, siteId: k.siteId }),
    },
    // Yapısal: `/projeler/<p>/santiyeler/<s>/bolumler` diye bir sayfa YOK.
    bolumler: {
      children: {
        yeni: {
          label: "Yeni Bölüm",
          href: (k) =>
            routes.projects.sites.sections.new({ projectId: k.projectId, siteId: k.siteId }),
        },
      },
      dynamic: { param: "sectionId", node: SECTION_NODE },
    },
  },
};

const PROJECT_NODE: TrailNode = {
  named: "project",
  label: "Proje",
  href: (k) => routes.projects.detail({ projectId: k.projectId }),
  children: {
    ozet: { label: "Proje Özeti", href: (k) => routes.projects.summary({ projectId: k.projectId }) },
    paylasim: {
      label: "Paylaşım Tablosu",
      href: (k) => routes.projects.sharing({ projectId: k.projectId }),
    },
    // Yapısal: `/projeler/<p>/santiyeler` diye bir sayfa YOK (mockup da çizmez).
    santiyeler: {
      children: {
        yeni: {
          label: "Yeni Şantiye",
          href: (k) => routes.projects.sites.new({ projectId: k.projectId }),
        },
      },
      dynamic: { param: "siteId", node: SITE_NODE },
    },
  },
};

/* ─── Kök ──────────────────────────────────────────────────────────────── */

export const ROUTE_TRAIL_ROOT: TrailNode = {
  label: "Gösterge Paneli",
  href: () => routes.home(),
  children: {
    ayarlar: {
      label: "Ayarlar",
      href: () => routes.settings.root(),
      children: {
        "sirket-bilgileri": { label: "Şirket Bilgileri", href: () => routes.settings.company() },
        bildirimler: { label: "Bildirimler", href: () => routes.settings.notifications() },
        gorunum: { label: "Görünüm", href: () => routes.settings.appearance() },
        kullanicilar: { label: "Kullanıcılar", href: () => routes.settings.users() },
        roller: { label: "Rol Yönetimi", href: () => routes.settings.roles() },
        "izin-matrisi": { label: "Sayfa İzinleri", href: () => routes.settings.permissionMatrix() },
        "onay-rolleri": {
          label: "Onay Rolleri ve Eşik",
          href: () => routes.settings.approvalRoles(),
        },
        "bordro-oranlari": { label: "Bordro Oranları", href: () => routes.settings.payrollRates() },
        planlama: { label: "Planlama", href: () => routes.settings.planning() },
        entegrasyonlar: { label: "Entegrasyonlar", href: () => routes.settings.integrations() },
        yedekleme: { label: "Yedekleme", href: () => routes.settings.backup() },
        "denetim-gunlugu": { label: "Denetim Günlüğü", href: () => routes.settings.auditLog() },
      },
    },

    belgeler: { label: "Belge Arşivi", href: () => routes.documents() },

    bordro: {
      label: "Bordro",
      href: () => routes.payroll.root(),
      children: {
        gecmis: { label: "Bordro Geçmişi", href: () => routes.payroll.history() },
        sgk: { label: "SGK e-Bildirge", href: () => routes.payroll.sgk() },
      },
    },

    faturalar: {
      label: "Fatura Yönetimi",
      href: () => routes.invoices.list(),
      children: {
        kes: { label: "Yeni Fatura Kes", href: () => routes.invoices.new() },
      },
      // Faturanın numarası ekranda h1'dir ama kırıntıya İKİNCİ bir sorguyla
      // taşınmaz (K5): yüzeyin adı basılır, kayıt adı değil.
      dynamic: {
        param: "entityId",
        node: {
          label: "Fatura Detayı",
          href: (k) => routes.invoices.detail({ invoiceId: k.entityId }),
        },
      },
    },

    hakedisler: {
      label: "Hakedişler",
      href: () => routes.progressPayments.list(),
      children: {
        yeni: { label: "İşveren Hakediş Oluştur", href: () => routes.progressPayments.new() },
        taseron: {
          label: "Taşeron Hakedişi",
          href: () => routes.progressPayments.subcontractor.list(),
          children: {
            yeni: {
              label: "Taşeron Hakediş Oluştur",
              href: () => routes.progressPayments.subcontractor.new(),
            },
          },
          dynamic: {
            param: "entityId",
            node: {
              label: "Taşeron Hakediş Detayı",
              href: (k) => routes.progressPayments.subcontractor.detail({ paymentId: k.entityId }),
              children: {
                duzenle: {
                  label: "Düzenle",
                  href: (k) =>
                    routes.progressPayments.subcontractor.edit({ paymentId: k.entityId }),
                },
              },
            },
          },
        },
      },
      dynamic: {
        param: "entityId",
        node: {
          label: "Hakediş Detayı",
          href: (k) => routes.progressPayments.detail({ paymentId: k.entityId }),
          children: {
            duzenle: {
              label: "Düzenle",
              href: (k) => routes.progressPayments.edit({ paymentId: k.entityId }),
            },
          },
        },
      },
    },

    hazine: {
      label: "Hazine",
      href: () => routes.treasury.root(),
      children: {
        "cek-senet": {
          label: "Çek & Ödeme",
          href: () => routes.treasury.financialInstruments(),
        },
      },
    },

    makine: {
      label: "Makine & Ekipman",
      href: () => routes.equipment.list(),
      children: {
        yeni: { label: "Yeni Ekipman", href: () => routes.equipment.new() },
        calisma: { label: "Çalışma Kaydı", href: () => routes.equipment.work() },
        yakit: { label: "Yakıt Takibi", href: () => routes.equipment.fuel() },
        kira: {
          label: "Kira Hakedişi",
          href: () => routes.equipment.rentalInvoices(),
          dynamic: {
            param: "entityId",
            node: {
              label: "Detay",
              href: (k) => routes.equipment.rentalInvoiceDetail({ invoiceId: k.entityId }),
            },
          },
        },
      },
      dynamic: {
        param: "entityId",
        node: {
          // `EquipmentDetailView`in kendi kırıntısındaki yedek metinle AYNI.
          label: "Ekipman Detay",
          href: (k) => routes.equipment.detail({ equipmentId: k.entityId }),
          children: {
            duzenle: {
              label: "Ekipmanı Düzenle",
              href: (k) => routes.equipment.edit({ equipmentId: k.entityId }),
            },
          },
        },
      },
    },

    "mali-tablolar": {
      label: "Mali Tablolar",
      href: () => routes.financialStatements.root(),
      children: {
        bilanco: { label: "Bilanço", href: () => routes.financialStatements.balanceSheet() },
        "nakit-akisi": {
          label: "Nakit Akış Tablosu",
          href: () => routes.financialStatements.cashFlow(),
        },
      },
    },

    muhasebe: {
      label: "Muhasebe",
      href: () => routes.accounting.root(),
      children: {
        "hesap-plani": { label: "Hesap Planı", href: () => routes.accounting.chartOfAccounts() },
        mizan: { label: "Mizan", href: () => routes.accounting.trialBalance() },
        "kdv-beyani": { label: "KDV Beyannamesi", href: () => routes.accounting.vatReturn() },
        "banka-mutabakati": {
          label: "Banka Mutabakatı",
          href: () => routes.accounting.bankReconciliation(),
        },
        "donem-kapanisi": {
          label: "Dönem Kapanışı",
          href: () => routes.accounting.periodClosing(),
        },
      },
    },

    asistan: { label: "FİİL AI", href: () => routes.assistant() },
    // GLS-F1 GEÇİCİ — Geliştirme sayfası silinince kaldır
    gelistirme: { label: "Geliştirme", href: () => routes.development() },

    "onay-kutusu": { label: "Onay Kutusu", href: () => routes.approvalInbox() },

    // F-NAVSAHA · `/gunluk-kayit` bu dilimde GERÇEK bir `page.tsx` oldu (kabuk
    // nav'ındaki `Saha › Günlük Kayıt`). Düğüm ZORUNLUDUR: "her `page.tsx`
    // ağaçta" bekçisi (`trail.test.ts`) yeni klasörü görür ve karşılığı yoksa
    // kırmızı verir. Etiket kabuk nav'ıyla BİREBİR aynıdır ("Günlük Kayıt");
    // şantiye altındaki ikizinin kırıntısı `PROJECT_NODE` dalındadır ve orada
    // ŞANTİYENİN altında yaşar — bu kök düğüm onun yerini ALMAZ.
    "gunluk-kayit": { label: "Günlük Kayıt", href: () => routes.siteDiary() },

    // PLN-F1 · kabuk nav'ının `Planlama` grubu. `/planlama` diye bir sayfa
    // YOK → yapısal düğüm (href'siz, `bolumler` deseni); etiketi Katalog
    // kırıntısının ilk parçasıdır (Birim Oran Kataloğu.dc.html:80
    // `FİİL Yapı › Planlama › Birim Oran Kataloğu`).
    planlama: {
      label: "Planlama",
      children: {
        "adam-saat-butcesi": { label: "Adam-Saat Bütçesi", href: () => routes.planning.budget() },
        "birim-oran-katalogu": {
          label: "Birim Oran Kataloğu",
          href: () => routes.planning.catalog(),
        },
        // TKL-F1.3 · fiyatlı İş Kalemi Kataloğu (`FİİL Yapı › Planlama › İş Kalemi Kataloğu`, KIK:71).
        "is-kalemi-katalogu": {
          label: "İş Kalemi Kataloğu",
          href: () => routes.planning.workItemCatalog(),
        },
        // PLN-F3.6a · Panel/GİR/QURR KÖK İKİZLERİ — `adam-saat-butcesi` ile
        // AYNI seviyede, K21 "İlerleme Raporları" parçası YOK (gruplanmaz).
        panel: { label: "Planlama Paneli", href: () => routes.planning.panel() },
        "gunluk-rapor": { label: "Günlük İlerleme Raporu", href: () => routes.planning.dailyReport() },
        "haftalik-qurr": { label: "Haftalık QURR", href: () => routes.planning.weeklyReport() },
        // NAV-F2 · Disiplin Yönetimi (M6 liste sayfası); etiket kabuk nav'ıyla BİREBİR.
        "disiplin-yonetimi": { label: "Disiplin Yönetimi", href: () => routes.planning.disciplineManagement() },
      },
    },

    // F-RAPOR · `/raporlar` bu dilimde GERÇEK bir `page.tsx` oldu. Düğüm
    // ZORUNLUDUR: "her `page.tsx` ağaçta" bekçisi (`trail.test.ts`) yeni
    // klasörü görür ve karşılığı yoksa kırmızı verir. Etiket kabuk nav'ıyla
    // BİREBİR aynıdır ("Raporlar") — o eşitlik de ayrıca bekçilidir.
    raporlar: { label: "Raporlar", href: () => routes.reports() },

    personel: {
      label: "Personel",
      href: () => routes.personnel.list(),
      children: {
        belgeler: { label: "Belge & Sertifika", href: () => routes.personnel.documents() },
        izinler: { label: "İzin Yönetimi", href: () => routes.personnel.leaves() },
        yeni: { label: "Yeni Personel", href: () => routes.personnel.new() },
      },
      dynamic: {
        param: "entityId",
        node: {
          label: "Personel Kartı",
          href: (k) => routes.personnel.detail({ personnelId: k.entityId }),
          children: {
            duzenle: {
              label: "Personeli Düzenle",
              href: (k) => routes.personnel.edit({ personnelId: k.entityId }),
            },
          },
        },
      },
    },

    projeler: {
      label: "Projeler",
      href: () => routes.projects.list(),
      children: {
        yeni: { label: "Yeni Proje", href: () => routes.projects.new() },
        takvim: { label: "Proje Takvimi", href: () => routes.projects.calendar() },
      },
      dynamic: { param: "projectId", node: PROJECT_NODE },
    },

    puantaj: { label: "Puantaj", href: () => routes.timesheet() },

    satinalma: {
      label: "Satınalma & Teklif",
      href: () => routes.purchasing.root(),
      children: {
        siparisler: { label: "Siparişler", href: () => routes.purchasing.orders() },
        tedarikciler: { label: "Tedarikçiler", href: () => routes.purchasing.suppliers() },
        // Yapısal: `/satinalma/talep` diye bir sayfa YOK.
        talep: {
          children: {
            yeni: { label: "Yeni Talep", href: () => routes.purchasing.newRequest() },
          },
        },
        // Yapısal: ne `/satinalma/talepler` ne de `/satinalma/talepler/<id>`
        // bir sayfadır — yalnız `/teklifler` yazılıdır.
        talepler: {
          dynamic: {
            param: "entityId",
            node: {
              children: {
                teklifler: {
                  label: "Teklif Karşılaştırması",
                  href: (k) => routes.purchasing.requestQuotes({ requestId: k.entityId }),
                },
              },
            },
          },
        },
      },
    },

    satis: {
      label: "Satış Yönetimi",
      href: () => routes.sales.root(),
      children: {
        yeni: { label: "Yeni Satış", href: () => routes.sales.new() },
        "blok-ekle": { label: "Blok Ekle", href: () => routes.sales.addBlock() },
        "unite-ekle": { label: "Ünite Ekle", href: () => routes.sales.addUnit() },
        "toplu-uretim": { label: "Toplu Ünite Üretimi", href: () => routes.sales.bulkUnits() },
        "excel-ice-aktar": {
          label: "Excel'den Ünite İçe Aktarma",
          href: () => routes.sales.importUnits(),
        },
        "paylasim-girisi": {
          label: "Kat Karşılığı Paylaşım Girişi",
          href: () => routes.sales.landShareAllocation(),
        },
      },
    },

    sozlesmeler: {
      label: "Sözleşmeler",
      href: () => routes.contracts.list(),
      children: {
        taseronlar: { label: "Taşeron Listesi", href: () => routes.contracts.subcontractorList() },
        // Yapısal: `/sozlesmeler/isveren` diye bir sayfa YOK.
        isveren: {
          dynamic: {
            param: "projectId",
            node: {
              // 🔴 Adı ÇÖZÜLÜR: `EmployerContractDetailView` rota parametresiyle
              // `useProject(projectId)` çağırır — önbellek anahtarı
              // `["project", <projectId>]`, yani proje kırıntısıyla AYNI.
              named: "project",
              label: "Proje",
              href: (k) => routes.contracts.employerDetail({ projectId: k.projectId }),
              children: {
                "poz-dagilimi": {
                  label: "Poz Dağılımı",
                  href: (k) => routes.contracts.employerItemDistribution({ projectId: k.projectId }),
                },
              },
            },
          },
        },
        // Yapısal: `/sozlesmeler/taseron` diye bir sayfa YOK (liste
        // `/sozlesmeler/taseronlar`tadır — ayrı segment).
        taseron: {
          children: {
            yeni: {
              label: "Yeni Taşeron Sözleşmesi",
              href: () => routes.contracts.newSubcontractor(),
            },
          },
          dynamic: {
            param: "entityId",
            node: {
              label: "Sözleşme Detayı",
              href: (k) => routes.contracts.subcontractorDetail({ contractId: k.entityId }),
            },
          },
        },
      },
    },

    // TKL-F3.3/F3.4/F3.5 · Teklif Hazırlama. `yeni` ve `[offerId]` (named: "offer": kırıntı adı teklif
    // numarası, sayfanın kendi `useOffer` önbelleğinden) sayfalarıyla BİRLİKTE geldi; `yazdir` düğümü
    // (F3.7) kendi sayfasıyla geldi: "ağaçtaki her href bir page.tsx" bekçisi sayfasız düğümü reddeder.
    "teklif-hazirlama": {
      label: "Teklif Hazırlama",
      href: () => routes.offers.list(),
      children: {
        yeni: { label: "Yeni Teklif", href: () => routes.offers.new() },
        // TKL-F4.5 · statik segment `[offerId]`den önce eşleşir; kırıntı adı TS:65 birebir.
        sablonlar: { label: "Teklif Şablonları", href: () => routes.offers.templates() },
      },
      dynamic: {
        param: "entityId",
        node: {
          named: "offer",
          label: "Teklif",
          href: (k) => routes.offers.detail({ offerId: k.entityId }),
          children: {
            // Ekran adı "Yazdır / PDF"; kırıntı son parçası. `rev`/`tur` URL durumudur (kırıntı bağlantısı
            // çıplak adrestir; sayfanın kendisi `?rev=`/`?tur=` okur, eksikse güncel revizyon + işveren).
            yazdir: { label: "Yazdır", href: (k) => routes.offers.print({ offerId: k.entityId }) },
            // TKL-F5.1 · TDN:65 kırıntı metni birebir; `?rev=` yok (uç hep son revizyon).
            donustur: {
              label: "Proje ve Sözleşmeye Dönüştür",
              href: (k) => routes.offers.convert({ offerId: k.entityId }),
            },
          },
        },
      },
    },

    stok: { label: "Stok & Depo", href: () => routes.stock() },
  },
};
