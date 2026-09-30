import Link from "next/link";

import { cx } from "@/lib/cx";
import { formatCompactCurrency, formatMonthYear, formatPercent } from "@/lib/format";
import {
  pendingModuleHint,
  pendingModuleLabel,
  type PendingModuleKey,
} from "@/lib/pending-modules";
import { SECTION_STATUS_CLASS_SUFFIX, SECTION_STATUS_LABELS } from "@/lib/section-labels";
import type { SectionDetailResponse } from "@/lib/api/hooks/useSection";
import { remainingDays } from "./remainingDays";
import { routes } from "@/lib/routes";
import { useDisciplineScope } from "@/lib/auth/useDisciplineScope";
import { physicalLabel } from "@/lib/auth/physicalLabel";

const NO_END_DATE_TITLE = "Bitiş tarihi girilmemiş";
// D88: mockup "3 gecikme riski" basıyor ama backend bu veriyi BİLİNÇLİ
// üretmiyor (P6 backend spec §6) — sahte sayı YAZILMAZ, yer tutucu basılır.
// En yakın modül anahtarı "boq" (iş kalemi gecikme riski bu modülden gelir).
const DELAY_RISK_PENDING_MODULE = "boq";
// D78: "Gerçekleşen" tutarı — hakediş modülünden türer, backend bu alanı bu
// dilimde üretmiyor (yalnız `budget_amount` gerçektir, bkz. task-2-brief §KPI).
const REALIZED_AMOUNT_PENDING_MODULE = "progress_payments";

export interface SectionHeroCardProps {
  section: SectionDetailResponse;
  siteName: string;
  /**
   * ADRESTEKI anahtarlar — "Duzenle" bolumun KENDI alt agacinda bir YOL
   * baglantisidir, dolayisiyla KAYDIN slug'ini degil ADRESI izler (URL-3
   * kurali: disaridan GIRIS baglantisi `routeKeyOf`, alt agac ici baglanti
   * ADRES). Aksi halde eski UUID linkiyle gelen kullanici "Duzenle"ye basinca
   * adres bicimi bir anda slug'a atlar — yonlendirme YOK karariyla celisir.
   */
  projectKey: string;
  siteKey: string;
  sectionKey: string;
  /** Kanonik proje UUID'si — "Hakedis Olustur" SORGU parametresi kurar. */
  projectId: string;
  canEdit: boolean;
}

// "Kat 6–10 Kaba İnşaat A-Blok Şantiyesi · Sorumlu: Sercan Öztürk · Oca 2026 –
// Eyl 2026" — boş parçalar atlanır, ayraçlar bozulmaz (SiteHeroBar.metaParts
// deseni, D62).
function metaParts(section: SectionDetailResponse, siteName: string): string[] {
  const parts: string[] = [];
  if (siteName) parts.push(siteName);
  parts.push(section.manager_name ? `Sorumlu: ${section.manager_name}` : "Atanmadı");
  if (section.start_date && section.end_date) {
    parts.push(`${formatMonthYear(section.start_date)} – ${formatMonthYear(section.end_date)}`);
  }
  return parts;
}

// Yer tutucu KPI değeri — SiteHeroBar/SectionCard ile aynı desen: düzeni
// korur, "—" basar, title'da açıklama verir (spec §7.1).
function PlaceholderValue({ pendingModule }: { pendingModule: PendingModuleKey }) {
  return (
    <div className="section-hero__kpi-value section-hero__kpi-value--pending" title={pendingModuleHint(pendingModule)}>
      —
    </div>
  );
}

// D71-73 · 1. hücre: Fiziksel İlerleme (yer tutucu — SiteHeroBar.ProgressCell
// deseniyle aynı; yer tutucuyken sahte %0 dolgusu çizilmez).
function ProgressCell({ progress }: { progress: SectionDetailResponse["progress_pct"] }) {
  const { isRestricted } = useDisciplineScope();
  const isReal = progress.available && progress.value !== null && progress.value !== undefined;
  return (
    <div className="section-hero__kpi" data-testid="section-hero-kpi-progress">
      <div className="section-hero__kpi-label">{physicalLabel("Fiziksel İlerleme", isRestricted)}</div>
      {isReal ? (
        // FAZ 2d: `.value` artık Percent marka'lı (bkz. SiteHeroBar
        // ProgressCell yorumu) — kaçış YOK.
        <div className="section-hero__kpi-value">{formatPercent(progress.value ?? "0")}</div>
      ) : (
        <PlaceholderValue pendingModule={progress.pending_module} />
      )}
      <div className="section-hero__kpi-track">
        {isReal && (
          <div
            className="section-hero__kpi-track-fill"
            data-testid="section-hero-progress-fill"
            style={{ width: `${Math.min(Number(progress.value), 100)}%` }}
          />
        )}
      </div>
    </div>
  );
}

// D76-78 · 2. hücre: Bölüm Bedeli — GERÇEK veri (`budget_amount`, elle girilen
// kolon). ⚠️ BOQ türevi `budget` (MetricPlaceholder) İLE AYNI DEĞİL, burada
// KULLANILMAZ (task-2-brief §KPI uyarısı). Alt satır "Gerçekleşen" yer tutucu.
function BudgetCell({ budgetAmount }: { budgetAmount: string | null }) {
  const isReal = budgetAmount !== null;
  return (
    <div className="section-hero__kpi" data-testid="section-hero-kpi-budget">
      <div className="section-hero__kpi-label">Bölüm Bedeli</div>
      {isReal ? (
        <div className="section-hero__kpi-value section-hero__kpi-value--money">
          {formatCompactCurrency(budgetAmount)}
        </div>
      ) : (
        // 🔴 GEREKÇE YAZILMAZ — ikizi `site-detail/SectionCard.tsx`te
        // gerekçesiyle yazılı: maskeli `null` ile girilmemiş `null` istemcide
        // ayırt edilemez, o yüzden "—" basılır ve susulur.
        <div className="section-hero__kpi-value section-hero__kpi-value--pending">—</div>
      )}
      <div
        className="section-hero__kpi-note section-hero__kpi-note--pending"
        title={pendingModuleLabel(REALIZED_AMOUNT_PENDING_MODULE)}
      >
        Gerçekleşen: —
      </div>
    </div>
  );
}

// D81-83 · 3. hücre: Aktif İşçi (yer tutucu — timesheet). Alt satır "Bu
// bölümde" sabit metin, veri değil.
function WorkerCell({ worker }: { worker: SectionDetailResponse["worker_count"] }) {
  const isReal = worker.available && worker.count !== null && worker.count !== undefined;
  return (
    <div className="section-hero__kpi" data-testid="section-hero-kpi-worker">
      <div className="section-hero__kpi-label">Aktif İşçi</div>
      {isReal ? (
        <div className="section-hero__kpi-value">{worker.count}</div>
      ) : (
        <PlaceholderValue pendingModule={worker.pending_module} />
      )}
      <div className="section-hero__kpi-note">Bu bölümde</div>
    </div>
  );
}

// D86-88 · 4. hücre: İş Kalemleri (yer tutucu — boq). Alt satır "3 gecikme
// riski" DE yer tutucudur — backend hiç üretmiyor (spec §6), sahte sayı yok.
function BoqCountCell({ boqItemCount }: { boqItemCount: SectionDetailResponse["boq_item_count"] }) {
  const isReal =
    boqItemCount.available && boqItemCount.count !== null && boqItemCount.count !== undefined;
  return (
    <div className="section-hero__kpi" data-testid="section-hero-kpi-boq">
      <div className="section-hero__kpi-label">İş Kalemleri</div>
      {isReal ? (
        <div className="section-hero__kpi-value">{boqItemCount.count}</div>
      ) : (
        <PlaceholderValue pendingModule={boqItemCount.pending_module} />
      )}
      <div
        className="section-hero__kpi-note section-hero__kpi-note--pending"
        title={pendingModuleLabel(DELAY_RISK_PENDING_MODULE)}
      >
        —
      </div>
    </div>
  );
}

// D91-93 · 5. hücre: Kalan Gün — GERÇEK, `end_date`ten türev
// (`remainingDays.ts`). `end_date` null ise dürüst "—" (yer tutucu DEĞİL).
function RemainingDaysCell({ endDate }: { endDate: string | null }) {
  const days = remainingDays(endDate);

  if (days === null) {
    return (
      <div className="section-hero__kpi" data-testid="section-hero-kpi-days">
        <div className="section-hero__kpi-label">Kalan Gün</div>
        <div className="section-hero__kpi-value section-hero__kpi-value--pending" title={NO_END_DATE_TITLE}>
          —
        </div>
      </div>
    );
  }

  const isDelayed = days < 0;
  return (
    <div className="section-hero__kpi" data-testid="section-hero-kpi-days">
      <div className="section-hero__kpi-label">Kalan Gün</div>
      <div className={cx("section-hero__kpi-value", isDelayed && "section-hero__kpi-value--delay")}>
        {isDelayed ? `${Math.abs(days)} gün gecikme` : days}
      </div>
      {endDate && <div className="section-hero__kpi-note">{`${formatMonthYear(endDate)}'ya kadar`}</div>}
    </div>
  );
}

// Bölüm Detay hero kartı (mockup D54-96). Beş KPI hücresinden yalnız Bölüm
// Bedeli (`budget_amount`) ve Kalan Gün (`end_date` türevi) gerçek değerdir;
// kalan üçü ilgili modülle birlikte gelir (task-2-brief §KPI şeridi).
export function SectionHeroCard({
  section,
  siteName,
  projectKey,
  siteKey,
  sectionKey,
  projectId,
  canEdit,
}: SectionHeroCardProps) {
  const meta = metaParts(section, siteName);
  // YOL, TAMAMEN ADRESTEN: uc segment de kullanicinin geldigi bicimi korur.
  const editHref = routes.projects.sites.sections.edit({
    projectId: projectKey,
    siteId: siteKey,
    sectionId: sectionKey,
  });
  const statusSuffix = SECTION_STATUS_CLASS_SUFFIX[section.status];

  return (
    <div className="section-hero">
      <div className="section-hero__top">
        <div>
          <div className="section-hero__badges">
            {/* D58: "BÖLÜM {sort_order}" rozeti */}
            <span className="section-hero__order-badge">BÖLÜM {section.sort_order}</span>
            {/* D59: durum rozeti — dört durumun tümü tek kaynaktan (section-labels.ts) */}
            <span className={cx("section-hero__status-badge", `section-hero__status-badge--${statusSuffix}`)}>
              {SECTION_STATUS_LABELS[section.status]}
            </span>
          </div>
          <h1 className="section-hero__title">{section.name}</h1>
          {meta.length > 0 && (
            <div className="section-hero__meta">
              {meta.map((part, i) => (
                <span key={part}>
                  {i > 0 && <span aria-hidden="true"> · </span>}
                  {part}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="section-hero__actions">
          {/* D65: "Düzenle" — `sites:full` ile görünür. Rota T3'te açılıyor
              (kabul edilmiş, bkz. task-2-brief §Düzenle butonu). */}
          {canEdit && (
            <Link href={editHref} className="section-hero__btn section-hero__btn--ghost">
              Düzenle
            </Link>
          )}
          {/* D66: "Hakediş Oluştur" — kalıcı karar, proje ön seçimiyle P7 ekranına gider. */}
          <Link
            href={routes.progressPayments.new({ projectId })}
            className="section-hero__btn section-hero__btn--solid"
          >
            Hakediş Oluştur
          </Link>
        </div>
      </div>
      <div className="section-hero__kpis">
        <ProgressCell progress={section.progress_pct} />
        <BudgetCell budgetAmount={section.budget_amount} />
        <WorkerCell worker={section.worker_count} />
        <BoqCountCell boqItemCount={section.boq_item_count} />
        <RemainingDaysCell endDate={section.end_date} />
      </div>
    </div>
  );
}
