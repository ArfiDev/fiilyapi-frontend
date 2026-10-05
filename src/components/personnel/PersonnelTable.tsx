import Link from "next/link";

import { Badge } from "@/components/ui";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { PAYROLL_HIDDEN_CATEGORIES, PERSONNEL_PII_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { initials } from "@/lib/shell/initials";
import type { PersonnelDeriveItem } from "./personnel-derive";
import {
  formatWageCell,
  PENDING_VALUE,
  PROJECT_NAME_PENDING_REASON,
  resolveSourceAvatarGradient,
  resolveSourceBadgeVariant,
  resolveWorkerSourceLabel,
  STATUS_BADGE_VARIANT,
  STATUS_LABEL,
} from "./personnel-list-labels";
import "./personnel-list.css";
import { routes } from "@/lib/routes";

export interface PersonnelTableProps {
  /** `undefined` ⇒ yükleniyor/hata; satır BASILMAZ. */
  rows: PersonnelDeriveItem[] | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  /** Süzgeç uygulanmış mı — boş listenin metnini ayırır. */
  hasFilter: boolean;
  /**
   * `assigned_project_id` → proje ADI. `undefined` ⇒ proje listesi yüklenemedi
   * (hücre pending gerekçesine düşer); boş harita ⇒ liste geldi ama eşleşme yok.
   */
  projectNames?: Record<string, string>;
  /** 235-243 · sayfalama şeridi — mockup'ta AYNI kart kabuğunun içindedir. */
  pagination?: React.ReactNode;
}

function emptyMessage(options: {
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  hasFilter: boolean;
}): { title: string; hint?: string } {
  if (options.isLoading) return { title: "Personel listesi yükleniyor…" };
  if (options.isError) return { title: options.errorMessage ?? "Personel listesi yüklenemedi." };
  if (options.hasFilter) {
    return {
      title: "Bu arama/filtreyle eşleşen personel yok.",
      hint: "Arama metnini ya da süzgeç seçimlerini genişletin.",
    };
  }
  return {
    title: "Henüz personel kaydı yok.",
    hint: "“+ Personel Ekle” ile ilk kaydı oluşturun.",
  };
}

/**
 * P 132-232 · personel tablosu: Ad Soyad (132/144-149) · Tür (133/150) ·
 * Meslek (134/151) · Proje (135/152) · SGK (136/153) · Ücret/Gün (137/154) ·
 * Durum (138/155) · aksiyon (139/156).
 *
 * F-İK T2: Proje/SGK/Ücret-Gün sütunları ARTIK GERÇEKTİR — İK-1 backend'i
 * `assigned_project_id`/`sgk_no`/`wage_amount`+`wage_type` alanlarını taşıyor.
 * Değer yoksa sade "—" basılır (gerekçe DEĞİL: "atanmamış"/"girilmemiş" gerçek
 * bir boşluktur). Tek pending kalıntısı: proje ADI listesi yüklenemediğinde
 * proje hücresi (`PROJECT_NAME_PENDING_REASON`).
 *
 * ⚠️ K6: mockup'ın "İşe giriş: …" alt satırı (147) BASILMAZ — sunucuda
 * `hire_date` artık var ama liste satırı mockup'ın iki-satırlı ad hücresine
 * dönmez; bu karar T2 kapsamı dışıdır (kapsam: üç sütun + süzgeç + bant).
 */
export function PersonnelTable({
  rows,
  isLoading,
  isError,
  errorMessage,
  hasFilter,
  projectNames,
  pagination,
}: PersonnelTableProps) {
  const visibleRows = rows ?? [];
  // 🔴 IZN-F4c.2 — maskeli (`null`) SGK/ücret sütununun başlığında TEK kilit; hücrelerde "—".
  const isPiiHidden = useCategoryHidden(PERSONNEL_PII_HIDDEN_CATEGORIES);
  const isWageHidden = useCategoryHidden(PAYROLL_HIDDEN_CATEGORIES);
  const message =
    visibleRows.length === 0
      ? emptyMessage({ isLoading, isError, errorMessage, hasFilter })
      : undefined;

  return (
    <div className="personel-card">
      <table className="personel-table">
        <thead>
          {/* 131-139 */}
          <tr>
            <th scope="col" className="personel-table__th personel-table__th--left">
              Ad Soyad
            </th>
            <th scope="col" className="personel-table__th personel-table__th--center">
              Tür
            </th>
            <th scope="col" className="personel-table__th personel-table__th--left">
              Meslek
            </th>
            <th scope="col" className="personel-table__th personel-table__th--left">
              Proje
            </th>
            <th scope="col" className="personel-table__th personel-table__th--left">
              SGK
              <MaskedMark isHidden={isPiiHidden} values={visibleRows.map((row) => row.sgk_no)} />
            </th>
            <th scope="col" className="personel-table__th personel-table__th--right">
              Ücret/Gün
              <MaskedMark isHidden={isWageHidden} values={visibleRows.map((row) => row.wage_amount)} />
            </th>
            <th scope="col" className="personel-table__th personel-table__th--center">
              Durum
            </th>
            <th scope="col" className="personel-table__th personel-table__th--center">
              Detay
            </th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => {
            const statusKey = row.is_active ? "active" : "inactive";
            // Proje hücresi ÜÇ hâllidir: atanmamış (gerçek boşluk) · ad
            // (eşleşti) · pending (proje listesi yok ⇒ kimlik ad değildir).
            const projectId = row.assigned_project_id;
            // (Listede olmayan bir kimlik de pending sayılır: erişim dışı/
            // arşiv proje olabilir — ham UUID basmak veri değil gürültüdür.)
            const projectName = projectId === null ? null : projectNames?.[projectId];
            const isProjectPending = projectId !== null && projectName === undefined;
            return (
              <tr className="personel-row" key={row.id} data-testid={`personel-row-${row.id}`}>
                {/* 144-149 — "İşe giriş" alt satırı YOK (K6) */}
                <td className="personel-table__td">
                  <div className="personel-name-cell">
                    <span
                      className="personel-avatar"
                      aria-hidden="true"
                      style={{ backgroundImage: resolveSourceAvatarGradient(row.source) }}
                    >
                      {initials(row.full_name)}
                    </span>
                    <span className="personel-name">{row.full_name}</span>
                  </div>
                </td>
                {/* 150 */}
                <td className="personel-table__td personel-table__td--center">
                  {/* spec K2 · bilinmeyen enum değeri ekranı ÇÖKERTMEZ */}
                  <Badge variant={resolveSourceBadgeVariant(row.source)}>
                    {resolveWorkerSourceLabel(row.source)}
                  </Badge>
                </td>
                {/* 151 */}
                <td className="personel-table__td">{row.trade ?? "—"}</td>
                {/* 152 — GERÇEK: `assigned_project_id` → proje adı */}
                <td
                  className={
                    "personel-table__td" + (isProjectPending ? " personel-pending-cell" : "")
                  }
                  title={isProjectPending ? PROJECT_NAME_PENDING_REASON : undefined}
                  data-testid={`personel-project-${row.id}`}
                >
                  {projectName ?? PENDING_VALUE}
                </td>
                {/* 153 — GERÇEK: `sgk_no` */}
                <td className="personel-table__td" data-testid={`personel-sgk-${row.id}`}>
                  {row.sgk_no ?? PENDING_VALUE}
                </td>
                {/* 154 — GERÇEK: `wage_amount` (+ `wage_type` birim eki) */}
                <td
                  className="personel-table__td personel-table__td--right personel-table__td--mono"
                  data-testid={`personel-wage-${row.id}`}
                >
                  {formatWageCell(row)}
                </td>
                {/* 155 */}
                <td className="personel-table__td personel-table__td--center">
                  <Badge variant={STATUS_BADGE_VARIANT[statusKey]}>
                    {STATUS_LABEL[statusKey]}
                  </Badge>
                </td>
                {/* 156 */}
                <td className="personel-table__td personel-table__td--center">
                  <Link className="personel-detail-link" href={routes.personnel.detail({ personnelId: row.id })}>
                    Detay
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {message && (
        <div className="personel-empty">
          <p className="personel-empty__title">{message.title}</p>
          {message.hint && <p className="personel-empty__hint">{message.hint}</p>}
        </div>
      )}

      {pagination}
    </div>
  );
}
