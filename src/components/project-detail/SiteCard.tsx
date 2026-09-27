import Link from "next/link";

import { cx } from "@/lib/cx";
import { formatMonthYear, formatPercent } from "@/lib/format";
import { pendingModuleLabel, type PendingModuleKey } from "@/lib/pending-modules";
import { asPercent } from "@/lib/api/scale";
import type { SiteListItem } from "@/lib/api/hooks/useSites";
import type { ProjectType } from "@/lib/api/hooks/useProjects";

import "./project-detail.css";
import { routes, routeKeyOf } from "@/lib/routes";

export interface SiteCardProps {
  /**
   * URL-3 · ADRESTEKI proje anahtari (slug VEYA UUID) — cip href'leri YOL
   * kurar, dolayisiyla kanonik UUID DEGIL bu tasinir. Kullanici UUID'li bir
   * linkle geldiyse ic baglantilar da UUID kalir (yonlendirme YOK karari).
   */
  projectKey: string;
  site: SiteListItem;
  /**
   * Kayıt 201 — kart şeridi/ilerleme çubuğu proje TÜRÜNE göre boyanır
   * (`ProjectCard`teki `prj-card--{type}` deseniyle aynı); önceden bu bilgi
   * taşınmadığı için ayrım YAPISAL OLARAK imkânsızdı ve şerit her zaman
   * taahhüt gradyanına düşüyordu.
   */
  projectType: ProjectType;
}

const STATUS_LABELS: Record<SiteListItem["status"], string> = {
  // T0 (2026-07-30): backend `site_status`'e `preparation` eklendi.
  preparation: "Hazırlık",
  active: "Aktif",
  on_hold: "Beklemede",
  completed: "Tamamlandı",
};

// Rozet stili duruma gore ayri sinif tasir — on_hold'u "aktif" (yesil) grubuna
// dusurmemek icin kendi (--pending, notr) sinifi var (kod inceleme bulgusu).
const STATUS_BADGE_CLASS: Record<SiteListItem["status"], string> = {
  // Hazirlik henuz basslamamis is demek — notr rozet grubuna girer.
  preparation: "site-card__status--pending",
  active: "site-card__status--active",
  on_hold: "site-card__status--pending",
  completed: "site-card__status--muted",
};

const NO_END_DATE_TITLE = "Bitiş tarihi girilmemiş";

// "Kuyubaşı Mah. · Şantiye Şefi: S. Öztürk" — ikisi de bos olabilir (spec §4.3).
function subtitle(site: SiteListItem): string {
  const parts = [
    site.address,
    site.site_manager_name ? `Şantiye Şefi: ${site.site_manager_name}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

// Yer tutucu KPI hucresi — duzeni korur, "—" basar, title'da aciklama verir (spec §7.1).
function PlaceholderValue({
  valueClassName,
  pendingModule,
}: {
  valueClassName: string;
  pendingModule: PendingModuleKey;
}) {
  return (
    <div
      className={cx(valueClassName, "site-card__kpi-value--pending")}
      // 🔴 K-ZARF 3. HÂL (src/lib/placeholder-cell.ts:14-20): `available:false`
      // + `pending_module:null` = ROLÜN İZNİ YOK (backend `restricted()`).
      // O hâlde `pendingModuleLabel(null)`ın döndürdüğü "İlgili modülle
      // birlikte gelir" cümlesi YALANDIR — modül vardır, izin yoktur. Gerekçe
      // bilinmiyorsa ipucu HİÇ basılmaz (aynı ekranın alt şeridi de böyle
      // yapar: SiteTotalsStrip.tsx:77-78).
      title={pendingModule ? pendingModuleLabel(pendingModule) : undefined}
    >
      —
    </div>
  );
}

// Ucuncu hucre: aktif/beklemede -> "Kalan Gun" (gecikmede kirmizi "X gun gecikme"),
// tamamlanmis -> "Teslim" + teslim tarihi (spec §4.3, §7.5).
function ThirdCell({ site }: { site: SiteListItem }) {
  if (site.status === "completed") {
    return (
      <div className="site-card__kpi">
        <div className="site-card__kpi-value site-card__kpi-value--days site-card__kpi-value--delivered">
          Teslim
        </div>
        <div className="site-card__kpi-label">
          {site.delivery_date ? formatMonthYear(site.delivery_date) : "—"}
        </div>
      </div>
    );
  }

  if (site.remaining_days === null) {
    return (
      <div className="site-card__kpi">
        <div
          className="site-card__kpi-value site-card__kpi-value--days site-card__kpi-value--pending"
          title={NO_END_DATE_TITLE}
        >
          —
        </div>
        <div className="site-card__kpi-label">Kalan Gün</div>
      </div>
    );
  }

  const isDelayed = site.remaining_days < 0;
  return (
    <div className="site-card__kpi">
      <div
        className={cx(
          "site-card__kpi-value",
          "site-card__kpi-value--days",
          isDelayed && "site-card__kpi-value--delay",
        )}
      >
        {isDelayed ? `${Math.abs(site.remaining_days)} gün gecikme` : site.remaining_days}
      </div>
      <div className="site-card__kpi-label">Kalan Gün</div>
    </div>
  );
}

function ProgressBar({ site }: { site: SiteListItem }) {
  const { progress_pct: progress } = site;
  return (
    <div className="site-card__progress-track">
      {progress.available && progress.value !== null && progress.value !== undefined && (
        <div
          className="site-card__progress-fill"
          data-testid="site-card-progress-fill"
          style={{ width: `${Math.min(Number(progress.value), 100)}%` }}
        />
      )}
    </div>
  );
}

interface ChipDef {
  label: string;
  emoji: string;
  href: string;
  variant?: "detay";
}

// 🔴 F-BLMPOZ — ÇİP HEDEFLERİ ÖLÇÜLEREK DÜZELTİLDİ.
//
// Eski hâl proje seviyesinde `/projeler/{id}/is-kalemleri`,
// `.../isveren-hakedis`, `.../taseron-hakedis`e gidiyordu ve bu ÜÇ rotanın
// ÜÇÜ DE `src/app` altında YOKTU — kullanıcı canlıda 404 alıyordu. Eski
// gerekçe yorumu ("§7.3: gezinilebilir kalır, title ile 'yakında' denir") o
// gün doğruydu; rotalar SONRADAN şantiye seviyesinde yazıldı ve çipler
// güncellenmedi. Gerekçe bayatlayınca çalışan ekranı yalanlar hâle geldi.
//
// 🔑 ASIL KUSUR SEVİYE UYUŞMAZLIĞIYDI: çipler ŞANTİYE kartındadır, hedefleri
// PROJE seviyesindeydi ve `site.id` taşımıyordu. Doğru hedefler şantiye
// kapsamlıdır ve diskte VARDIR (`sectionScopedChipTargets` bekçisi bunu her
// koşuda diskten ölçer):
//   · .../santiyeler/{siteId}/is-kalemleri   → Ekran 13 (BOQ)
//   · .../santiyeler/{siteId}/hakedisler     → İşveren VE Taşeron panelleri
//                                              (SiteProgressPaymentsView)
//
// 🔴 F-PRJKALEM · AYNI ETİKET, İKİ FARKLI KÜME — çelişki DEĞİLDİR.
// `ProjectDetailTabs`teki "İş Kalemleri" sekmesi de artık CANLIDIR ama
// BAŞKA bir yere gider ve BAŞKA bir veri kümesini gösterir:
//   · Proje sekmesi → SÖZLEŞME POZLARI
//     (`GET /projects/{project_id}/contract/items`,
//      ekran `/sozlesmeler/isveren/{projectId}?tab=items`)
//   · Buradaki çip   → ŞANTİYE BOQ'u
//     (`GET /sites/{id}/boq`, ekran `.../santiyeler/{siteId}/is-kalemleri`)
// İkisi FARKLI KÜMELERDİR: proje düzeyinde "tüm şantiyelerin BOQ'u" diye bir
// kavram yoktur, şantiye düzeyinde de sözleşme pozu tutulmaz. Çip şantiye
// kimliğini taşıdığı için kartta durur ve DEĞİŞMEZ; ayrımı, yeni gelen taraf
// olan proje SEKMESİ kendi `title`ında anlatır (bkz. WORK_ITEMS_TAB_TITLE).
function chipsFor(projectKey: string, site: SiteListItem): ChipDef[] {
  // 🔴 Santiye anahtari KAYITTAN gelir (`slug ?? id`): proje detayindan
  // santiyeye GIRIS baglantisidir, yani okunur bicimi burada dogar.
  // `SiteCard` semasi `slug`i tasir (URL-2) — ekstra istek YOK.
  // 🔴 Kayıt 198 — segmentler ELLE EKLENMEZ: `routes.ts`teki kanonik
  // kurucular (`boq`/`progressPayments`) kullanılır. Dize burada da elle
  // kurulsaydı, segment adı ya da kanonik-kısa-URL kuralı değiştiğinde çip
  // sessizce ayrışırdı (`ProjectDetailTabs`in `employerContractTabHref`
  // için uyguladığı kanonla aynı gerekçe).
  const siteParams = { projectId: projectKey, siteId: routeKeyOf(site) };
  const siteBase = routes.projects.sites.detail(siteParams);
  const chips: ChipDef[] = [
    { label: "İş Kalemleri", emoji: "📋", href: routes.projects.sites.boq(siteParams) },
  ];
  // 🔴 "İşveren Hak." / "Final Hakediş" / "Taşeron Hak." çiplerinin ÜÇÜ DE
  // aynı şantiye hakediş ekranına gider ve bu ÖLÇÜLMÜŞ bir karardır, tembellik
  // değil: `SiteProgressPaymentsView` tek sayfada İKİ paneli birden basar
  // ("İşveren & Taşeron hakedişleri" alt başlığı + `spp__panel--employer` ve
  // `SiteSubcontractorPaymentsPanel`). Şantiye seviyesinde AYRI bir taşeron
  // rotası diskte YOKTUR; proje seviyesindeki `/hakedisler/taseron?project_id=`
  // ise şantiye kimliğini DÜŞÜRÜR ve kullanıcıyı kartın kapsamından dışarı
  // atardı. Çipi silmek de yanlıştır (kanon: karşılığı olan öğe silinmez) —
  // karşılığı VARDIR, aynı ekranın taşeron panelidir.
  const progressPaymentsHref = routes.projects.sites.progressPayments(siteParams);
  if (site.status === "completed") {
    chips.push({ label: "Final Hakediş", emoji: "💰", href: progressPaymentsHref });
  } else {
    chips.push({ label: "İşveren Hak.", emoji: "💰", href: progressPaymentsHref });
    chips.push({ label: "Taşeron Hak.", emoji: "🏗", href: progressPaymentsHref });
  }
  chips.push({
    label: "→ Detay",
    emoji: "",
    href: siteBase,
    variant: "detay",
  });
  return chips;
}

export function SiteCard({ projectKey, site, projectType }: SiteCardProps) {
  const isCompleted = site.status === "completed";
  const sub = subtitle(site);

  return (
    <article
      className={cx(
        "site-card",
        `site-card--${projectType}`,
        isCompleted && "site-card--completed",
      )}
    >
      <div className="site-card__strip" aria-hidden="true" />
      <div className="site-card__body">
        <div className="site-card__head">
          <div>
            <h3 className="site-card__name">{site.name}</h3>
            {sub && <p className="site-card__subtitle">{sub}</p>}
          </div>
          <span className={cx("site-card__status", STATUS_BADGE_CLASS[site.status])}>
            {STATUS_LABELS[site.status]}
          </span>
        </div>

        <div className="site-card__kpis">
          <div className="site-card__kpi">
            {site.worker_count.available && site.worker_count.count !== null && site.worker_count.count !== undefined ? (
              <div className="site-card__kpi-value site-card__kpi-value--worker">
                {site.worker_count.count}
              </div>
            ) : (
              <PlaceholderValue
                valueClassName="site-card__kpi-value site-card__kpi-value--worker"
                pendingModule={site.worker_count.pending_module}
              />
            )}
            <div className="site-card__kpi-label">İşçi</div>
          </div>

          <div className="site-card__kpi">
            {site.progress_pct.available && site.progress_pct.value !== null && site.progress_pct.value !== undefined ? (
              // KAÇIŞ (MetricPlaceholder jenerik zarf, madde 8 aynı kök) —
              // asPercent(site.progress_pct.value) aşağıda.
              <div className="site-card__kpi-value site-card__kpi-value--progress">
                {formatPercent(asPercent(site.progress_pct.value))}
              </div>
            ) : (
              <PlaceholderValue
                valueClassName="site-card__kpi-value site-card__kpi-value--progress"
                pendingModule={site.progress_pct.pending_module}
              />
            )}
            <div className="site-card__kpi-label">İlerleme</div>
          </div>

          <ThirdCell site={site} />
        </div>

        <ProgressBar site={site} />

        <div className="site-card__chips">
          {chipsFor(projectKey, site).map((chip) => (
            <Link
              key={chip.label}
              href={chip.href}
              // 🔴 `title="Bu bölüm yakında"` KALDIRILDI: dört çipin dördü de
              // artık diskte VAR OLAN bir rotaya gidiyor. Bayat ipucu, çalışan
              // ekranların üstünde "yakında" yalanını basıyordu.
              className={cx(
                "site-card__chip",
                chip.variant === "detay" && "site-card__chip--detay",
              )}
            >
              {chip.emoji ? `${chip.emoji} ${chip.label}` : chip.label}
            </Link>
          ))}
        </div>
      </div>
    </article>
  );
}
