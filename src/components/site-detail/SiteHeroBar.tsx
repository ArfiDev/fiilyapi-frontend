import Link from "next/link";

import { DeleteRecordButton } from "@/components/delete-confirm/DeleteRecordButton";
import { cx } from "@/lib/cx";
import { formatCompactCurrency, formatMonthYear, formatPercent } from "@/lib/format";
import { pendingModuleHint, type PendingModuleKey } from "@/lib/pending-modules";
import { HIDDEN_FIELD_HINT } from "@/lib/auth/hidden-fields";
import { isRestrictedEnvelope } from "@/lib/placeholder-cell";
import { HiddenMark } from "@/components/ui/hidden-mark/HiddenMark";
import type { SiteDetail } from "@/lib/api/hooks/useSites";
import { routes, routeKeyOf } from "@/lib/routes";
import { useDisciplineScope } from "@/lib/auth/useDisciplineScope";
import { physicalLabel } from "@/lib/auth/physicalLabel";

const NO_END_DATE_TITLE = "Bitiş tarihi girilmemiş";

export interface SiteHeroBarProps {
  site: SiteDetail;
}

// "Güneşkent Konut Projesi · İşveren: Güneşkent Gayrimenkul A.Ş." — işveren
// bos olabilir, o zaman yalniz proje adi basilir (spec §5.2).
//
// 🔴 DRILL-KALDIR (kullanıcı kararı 2026-08-29): proje adı artık Proje
// Detay'a giden bir BAĞLANTIDIR. Drill kenar çubuğu kaldırılınca ŞANTİYEDEN
// PROJEYE ÇIKIŞ karşılıksız kalan TEK gezinme yoluydu (çubuğun `backHref`i +
// bağlam grubundaki proje adı öğesi); kanon gereği sessizce kaybedilmez.
// Kırıntı-bağlantı ürünün kendi desenidir (`.spp__crumb-link` /
// `.boq__crumb-link`) — yeni tasarım İCAT EDİLMEDİ. Tek fark rengidir: bu
// satır marka gradyanının (`--gradient-hero-site`) üstünde yaşar, oradaki
// `--color-primary` mavisi okunmaz; `--color-on-brand` + altçizgi kullanılır.
// Metin İÇERİĞİ değişmedi — yalnız proje adı parçası sarmalandı.
function BreadcrumbLine({ site }: { site: SiteDetail }) {
  return (
    <p className="site-hero__breadcrumb">
      <Link
        // PROJEYE CIKIS = projeye GIRIS baglantisi; okunur anahtar kayittan
        // gelir (`SiteProjectSummary.slug` — URL-2 yayinladi, ekstra istek YOK).
        href={routes.projects.detail({ projectId: routeKeyOf(site.project) })}
        className="site-hero__crumb-link"
      >
        {site.project.name} Projesi
      </Link>
      {site.project.employer_name ? ` · İşveren: ${site.project.employer_name}` : null}
    </p>
  );
}

// "📍 Kuyubaşı Mah. Ankara · 👷 Şantiye Şefi: Sercan Öztürk · Mar 2025 – Ara 2026"
function metaParts(site: SiteDetail): string[] {
  const parts: string[] = [];
  const address = [site.address, site.city].filter(Boolean).join(" ");
  if (address) parts.push(`📍 ${address}`);
  if (site.site_manager_name) parts.push(`👷 Şantiye Şefi: ${site.site_manager_name}`);
  if (site.start_date && site.end_date) {
    parts.push(`${formatMonthYear(site.start_date)} – ${formatMonthYear(site.end_date)}`);
  }
  return parts;
}

// Yer tutucu KPI değeri — düzeni korur, "—" basar, title'da açıklama verir (spec §7.1).
// IZN-F4.2: 3. hâl (rolün izni yok) → kilit + "Bu bilgi rolünüz için gizli".
function PlaceholderValue({ pendingModule, isRestricted = false }: { pendingModule: PendingModuleKey; isRestricted?: boolean }) {
  return (
    <div
      className="site-hero__kpi-value site-hero__kpi-value--pending"
      title={isRestricted ? HIDDEN_FIELD_HINT : pendingModuleHint(pendingModule)}
    >
      —
      {isRestricted && <HiddenMark />}
    </div>
  );
}

// 1. hücre: Fiziksel İlerleme (yer tutucu — progress_payments). Yer tutucuyken
// mini çubuk çizilmez, sahte %0 izlenimi verilmez (spec §7.1).
function ProgressCell({ progress }: { progress: SiteDetail["progress_pct"] }) {
  const { isRestricted } = useDisciplineScope();
  const isReal = progress.available && progress.value !== null && progress.value !== undefined;
  return (
    <div className="site-hero__kpi" data-testid="site-hero-kpi-progress">
      <div className="site-hero__kpi-label">{physicalLabel("Fiziksel İlerleme", isRestricted)}</div>
      {isReal ? (
        // FAZ 2d: `.value` artık DeepScale'in `innerScale: "percent"`
        // eşlemesiyle `Percent` marka'lı geliyor (bkz. `scale-table.ts`
        // SiteDetailResponse.progress_pct) — kaçış YOK.
        <div className="site-hero__kpi-value">{formatPercent(progress.value ?? "0")}</div>
      ) : (
        <PlaceholderValue pendingModule={progress.pending_module} isRestricted={isRestrictedEnvelope(progress)} />
      )}
      <div className="site-hero__kpi-track">
        {isReal && (
          <div
            className="site-hero__kpi-track-fill"
            data-testid="site-hero-progress-fill"
            style={{ width: `${Math.min(Number(progress.value), 100)}%` }}
          />
        )}
      </div>
    </div>
  );
}

// 2. hücre: Aktif İşçi (yer tutucu — timesheet).
function WorkerCell({ worker }: { worker: SiteDetail["worker_count"] }) {
  const isReal = worker.available && worker.count !== null && worker.count !== undefined;
  return (
    <div className="site-hero__kpi" data-testid="site-hero-kpi-worker">
      <div className="site-hero__kpi-label">Aktif İşçi</div>
      {isReal ? (
        <div className="site-hero__kpi-value">{worker.count}</div>
      ) : (
        <PlaceholderValue pendingModule={worker.pending_module} isRestricted={isRestrictedEnvelope(worker)} />
      )}
    </div>
  );
}

// 3. hücre: Toplam Hakediş (yer tutucu — progress_payments), paydası da
// yer tutucu (contract_amount); ikisi de gercekse "/ ₺11,2M" basilir.
function PaymentCell({
  payment,
  contractAmount,
}: {
  payment: SiteDetail["total_progress_payment"];
  contractAmount: SiteDetail["contract_amount"];
}) {
  const isReal = payment.available && payment.value !== null && payment.value !== undefined;
  const hasNote =
    isReal && contractAmount.available && contractAmount.value !== null && contractAmount.value !== undefined;
  return (
    <div className="site-hero__kpi" data-testid="site-hero-kpi-payment">
      <div className="site-hero__kpi-label">Toplam Hakediş</div>
      {isReal ? (
        <div className="site-hero__kpi-value site-hero__kpi-value--money">
          {formatCompactCurrency(payment.value as string)}
        </div>
      ) : (
        <PlaceholderValue pendingModule={payment.pending_module} isRestricted={isRestrictedEnvelope(payment)} />
      )}
      {hasNote && (
        <div className="site-hero__kpi-note">/ {formatCompactCurrency(contractAmount.value as string)}</div>
      )}
    </div>
  );
}

// 4. hücre: Kalan Gün — GERÇEK değer (`sites.end_date` - bugün, backend spec §4.2).
// `remaining_days` negatifse kırmızı "X gün gecikme" (spec §7.5); bitiş tarihi
// hiç girilmemişse (null) düzeni koruyan dürüst "—" basılır (yer tutucu değil).
function RemainingDaysCell({ site }: { site: SiteDetail }) {
  if (site.remaining_days === null) {
    return (
      <div className="site-hero__kpi" data-testid="site-hero-kpi-days">
        <div className="site-hero__kpi-label">Kalan Gün</div>
        <div className="site-hero__kpi-value site-hero__kpi-value--pending" title={NO_END_DATE_TITLE}>
          —
        </div>
      </div>
    );
  }

  const isDelayed = site.remaining_days < 0;
  return (
    <div className="site-hero__kpi" data-testid="site-hero-kpi-days">
      <div className="site-hero__kpi-label">Kalan Gün</div>
      <div className={cx("site-hero__kpi-value", isDelayed && "site-hero__kpi-value--delay")}>
        {isDelayed ? `${Math.abs(site.remaining_days)} gün gecikme` : site.remaining_days}
      </div>
      {site.end_date && <div className="site-hero__kpi-note">{formatMonthYear(site.end_date)}</div>}
    </div>
  );
}

// "3 aktif · 2 bekliyor" kırılımı — yalnız gerçekleşen kategoriler basılır.
function sectionBreakdown(counts: SiteDetail["section_status_counts"]): string {
  const parts: string[] = [];
  if (counts.active) parts.push(`${counts.active} aktif`);
  if (counts.planned) parts.push(`${counts.planned} bekliyor`);
  return parts.join(" · ");
}

// 5. hücre: Bölüm Sayısı — GERÇEK değer (`section_count` + durum kırılımı).
// Bölümsüz şantiyede de 0 basılır; bu geçerli bir durumdur, yer tutucu değildir (spec §7.4).
function SectionCountCell({ site }: { site: SiteDetail }) {
  const breakdown = sectionBreakdown(site.section_status_counts);
  return (
    <div className="site-hero__kpi" data-testid="site-hero-kpi-sections">
      <div className="site-hero__kpi-label">Bölüm Sayısı</div>
      <div className="site-hero__kpi-value">{site.section_count}</div>
      {breakdown && <div className="site-hero__kpi-note">{breakdown}</div>}
    </div>
  );
}

// Şantiye Detay hero şeridi (spec §5.2). Beş KPI hücresinden yalnız Bölüm
// Sayısı ve Kalan Gün gerçek değerdir; Fiziksel İlerleme/Aktif İşçi/Toplam
// Hakediş `progress_payments`/`timesheet` yer tutucularıdır (§7.1).
// 🔴 F-UNIT1 T5: iki modül de CANLIDIR (`/hakedisler`, `/puantaj`) — eksik olan
// verinin BU ŞERİDE toplanmasıdır, modülün kendisi değil.
export function SiteHeroBar({ site }: SiteHeroBarProps) {
  const base = routes.projects.sites.detail({
    projectId: routeKeyOf(site.project),
    siteId: routeKeyOf(site),
  });
  const meta = metaParts(site);

  return (
    <div className="site-hero">
      <div className="site-hero__top">
        <div>
          <BreadcrumbLine site={site} />
          <h1 className="site-hero__title">{site.name}</h1>
          {meta.length > 0 && (
            <div className="site-hero__meta">
              {meta.map((part, i) => (
                <span key={part}>
                  {i > 0 && <span aria-hidden="true"> · </span>}
                  {part}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="site-hero__actions">
          <Link
            href={`${base}/gunluk-kayit`}
            title="Bu bölüm yakında"
            className="site-hero__btn site-hero__btn--ghost"
          >
            Günlük Kayıt
          </Link>
          {/* SectionFormModal EMEKLİ edildi (F-P6 T3) — "+ Bölüm Ekle" artık
              tam sayfa forma link verir. */}
          <Link href={`${base}/bolumler/yeni`} className="site-hero__btn site-hero__btn--solid">
            + Bölüm Ekle
          </Link>
          {/* SIL-F1.2 — yalnız Sistem Yöneticisi görür; silince projeye döner. */}
          <DeleteRecordButton
            kind="site"
            recordId={site.id}
            redirectTo={routes.projects.detail({ projectId: routeKeyOf(site.project) })}
            className="site-hero__btn site-hero__btn--danger"
          />
        </div>
      </div>
      <div className="site-hero__kpis">
        <ProgressCell progress={site.progress_pct} />
        <WorkerCell worker={site.worker_count} />
        <PaymentCell payment={site.total_progress_payment} contractAmount={site.contract_amount} />
        <RemainingDaysCell site={site} />
        <SectionCountCell site={site} />
      </div>
    </div>
  );
}
