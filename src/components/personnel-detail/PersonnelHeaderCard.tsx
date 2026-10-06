import Link from "next/link";

import { Badge } from "@/components/ui";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { PAYROLL_HIDDEN_CATEGORIES, PERSONNEL_PII_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { initials } from "@/lib/shell/initials";
import type { PersonnelDetailResponse } from "@/lib/api/hooks/usePersonnelDetail";

import {
  formatHireDate,
  formatWageCell,
  maskIban,
  PAYROLL_PENDING_REASON,
  PENDING_VALUE,
  PROJECT_NAME_PENDING_REASON,
  resolveSourceAvatarGradient,
  resolveSourceBadgeVariant,
  resolveWorkerSourceLabel,
  STATUS_BADGE_VARIANT,
  STATUS_LABEL,
  TAX_NO_PENDING_REASON,
} from "./personnel-detail-labels";

export interface PersonnelHeaderCardProps {
  personnel: PersonnelDetailResponse;
  editHref: string;
  /**
   * `assigned_project_id` → proje ADI (İK-1 yalnız kimlik döner). `undefined`
   * ⇒ proje listesi yüklenemedi (alt başlık pending gerekçesine düşer); boş
   * harita ⇒ liste geldi ama eşleşme yok — `PersonnelTable` ile AYNI desen.
   */
  projectNames?: Record<string, string>;
}

/** Pending şerit hücresi — yalnız Vergi No (60) bu deseni kullanır. */
function PendingStrip({ label, reason }: { label: string; reason: string }) {
  return (
    <div>
      <div className="pd-hero__strip-label">{label}</div>
      <div className="pd-hero__strip-value pd-hero__strip-value--pending" title={reason}>
        {PENDING_VALUE}
      </div>
    </div>
  );
}

/** Gerçek şerit hücresi — SGK No/İşe Giriş/Meslek/IBAN (57-61). */
function StripField({
  label,
  value,
  mark,
}: {
  label: string;
  value: string;
  /** IZN-F4c.2 — değer maskeliyse (`null`) yanına kilit. */
  mark?: React.ReactNode;
}) {
  return (
    <div>
      <div className="pd-hero__strip-label">{label}</div>
      <div className="pd-hero__strip-value">
        {value}
        {mark}
      </div>
    </div>
  );
}

/**
 * PD 29-63 · Başlık kartı.
 *
 * F-İK T3: GERÇEK alanlar — ad (`full_name`) · Aktif/Pasif rozeti
 * (`is_active`) · Tür rozeti (`source`, dayanıklı çözümleyicilerle) · meslek
 * (`trade`) · telefon (`phone`) · e-posta (`email`) · "şehir" yuvası
 * (`address` — ŞEF KARARI: sunucuda ayrı `city` alanı YOK, şehir UYDURULMAZ)
 * · Günlük Ücret (`wage_amount`+`wage_type`) · SGK No (`sgk_no`) · İşe Giriş
 * (`hire_date`) · IBAN (`iban`, MASKELİ — spec K5) · alt başlık proje adı
 * (`assigned_project_id` → `projectNames`).
 *
 * PENDING kalanlar (gerekçeli, satır SİLİNMEZ): Vergi No (sunucuda alan YOK)
 * · "Bu Ay Net" + "Bordroyu Gör" (bordro ucu YOK, İK-3).
 */
export function PersonnelHeaderCard({
  personnel,
  editHref,
  projectNames,
}: PersonnelHeaderCardProps) {
  const statusKey = personnel.is_active ? "active" : "inactive";
  // 🔴 IZN-F4c.2 — maas_kisisel gizliyken sunucu kimlik/iletişim/ücret alanlarını `null` döner ("—" + kilit).
  const isPiiHidden = useCategoryHidden(PERSONNEL_PII_HIDDEN_CATEGORIES);
  const isWageHidden = useCategoryHidden(PAYROLL_HIDDEN_CATEGORIES);

  // 38 — mockup "Meslek · Şantiye"; ŞEF KARARI: "Şantiye" yuvası proje adına
  // eşlenir (bölüm adı için ayrı bir ad ucu YOK, o alan bu kartta HİÇ
  // basılmaz). `assigned_project_id` null ⇒ personel projeye atanmamış
  // (gerçek boşluk, alt başlıkta yalnız meslek kalır).
  const projectId = personnel.assigned_project_id;
  const projectName = projectId === null ? null : projectNames?.[projectId];
  const isProjectPending = projectId !== null && projectName === undefined;

  return (
    <section className="pd-hero" data-testid="personnel-header-card">
      <div className="pd-hero__top">
        <span
          className="pd-hero__avatar"
          aria-hidden="true"
          style={{ backgroundImage: resolveSourceAvatarGradient(personnel.source) }}
        >
          {initials(personnel.full_name)}
        </span>

        <div className="pd-hero__identity">
          <div className="pd-hero__badges">
            <h1 className="pd-hero__name">{personnel.full_name}</h1>
            <Badge variant={STATUS_BADGE_VARIANT[statusKey]}>{STATUS_LABEL[statusKey]}</Badge>
            {/* spec K2 · bilinmeyen `source` ekranı ÇÖKERTMEZ (T2 çözümleyicileri) */}
            <Badge variant={resolveSourceBadgeVariant(personnel.source)}>
              {resolveWorkerSourceLabel(personnel.source)}
            </Badge>
          </div>
          <div className="pd-hero__subtitle">
            {personnel.trade ?? "—"}
            {projectId !== null && (
              <>
                {" · "}
                <span
                  className={isProjectPending ? "pd-hero__subtitle-project--pending" : undefined}
                  title={isProjectPending ? PROJECT_NAME_PENDING_REASON : undefined}
                >
                  {projectName ?? PENDING_VALUE}
                </span>
              </>
            )}
          </div>
          {/* 39-43 — telefon/e-posta/"şehir" GERÇEK; boş değer sade "—". */}
          <div className="pd-hero__contact" data-testid="personnel-header-contact">
            <span className="pd-hero__contact-item">📞 {personnel.phone ?? PENDING_VALUE}
              <MaskedMark isHidden={isPiiHidden} values={[personnel.phone]} />
            </span>
            <span className="pd-hero__contact-item">✉️ {personnel.email ?? PENDING_VALUE}
              <MaskedMark isHidden={isPiiHidden} values={[personnel.email]} />
            </span>
            <span className="pd-hero__contact-item">📍 {personnel.address ?? PENDING_VALUE}
              <MaskedMark isHidden={isPiiHidden} values={[personnel.address]} />
            </span>
          </div>
        </div>

        <div className="pd-hero__stats">
          {/* 45-49 — Günlük Ücret GERÇEK: `wage_amount` + `wage_type` birim eki
              (T2'nin `formatWageCell` deseniyle AYNI). */}
          <div className="pd-hero__stat pd-hero__stat--blue">
            <div className="pd-hero__stat-label">Günlük Ücret</div>
            <div className="pd-hero__stat-value">
              {formatWageCell(personnel)}
              <MaskedMark isHidden={isWageHidden} values={[personnel.wage_amount]} />
            </div>
          </div>
          {/* 50-54 — "Bu Ay Net" pending: bordro/net maaş ucu YOK (İK-3). */}
          <div className="pd-hero__stat pd-hero__stat--green">
            <div className="pd-hero__stat-label">Bu Ay Net</div>
            <div
              className="pd-hero__stat-value pd-hero__stat-value--pending"
              title={PAYROLL_PENDING_REASON}
            >
              {PENDING_VALUE}
            </div>
          </div>
        </div>
      </div>

      {/* 56-62 — alt şerit: SGK/İşe Giriş/Meslek GERÇEK · Vergi No pending · IBAN maskeli-GERÇEK */}
      <div className="pd-hero__strip">
        <StripField
          label="SGK No"
          value={personnel.sgk_no ?? PENDING_VALUE}
          mark={<MaskedMark isHidden={isPiiHidden} values={[personnel.sgk_no]} />}
        />
        <StripField label="İşe Giriş" value={formatHireDate(personnel.hire_date)} />
        <StripField label="Meslek" value={personnel.trade ?? "—"} />
        <PendingStrip label="Vergi No" reason={TAX_NO_PENDING_REASON} />
        <StripField
          label="IBAN"
          value={maskIban(personnel.iban)}
          mark={<MaskedMark isHidden={isPiiHidden} values={[personnel.iban]} />}
        />
      </div>

      {/* 21-24 — mockup'ın fixed üst şeridindeki aksiyonlar; PD kendi üst
          barını basmaz (kabuk canon), bu yüzden aksiyonlar hero kartına
          taşındı (`SectionHeroCard` deseni). */}
      <div className="pd-hero__actions">
        <Link href={editHref} className="pd-hero__btn pd-hero__btn--ghost">
          Düzenle
        </Link>
        <button
          type="button"
          className="pd-hero__btn pd-hero__btn--solid"
          disabled
          title={PAYROLL_PENDING_REASON}
        >
          Bordroyu Gör
        </button>
      </div>
    </section>
  );
}
