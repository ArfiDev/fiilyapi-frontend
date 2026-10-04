import { Button } from "@/components/ui";
import { CheckIcon, FileTextIcon, WarningTriangleIcon, XIcon } from "@/components/ui/icons";
import { initials } from "@/lib/shell/initials";
import type { LeaveBalanceResponse, LeaveRequestResponse } from "@/lib/api/hooks/useLeaves";

import {
  buildBalanceIndex,
  deriveRemainingCell,
  formatDateDots,
  formatDays,
  isApprovalBlocked,
  overrunDays,
  pendingTableHeading,
} from "./leaves-derive";
import {
  APPROVE_ACTION_LABEL,
  APPROVE_BLOCKED_REASON,
  ATTACHMENT_LABEL,
  DECISION_PENDING_REASON,
  OVERRUN_NOTE_PREFIX,
  PENDING_EMPTY_TEXT,
  PENDING_LOADING_TEXT,
  PENDING_TABLE_HINT,
  REJECT_ACTION_LABEL,
  UNIT_DAYS,
  UNKNOWN_VALUE,
} from "./leaves-labels";
import "./leaves.css";

/** Sunucunun verdiği tip rengi — CSS'e değişkenle geçer (çıplak hex kodda durmaz). */
type TypeBadgeStyle = React.CSSProperties & { "--iz-type-color"?: string };

/**
 * 🔴 T4 DEVRİ — karar geri çağrıları. T3 düğmeleri BASAR ve erişilebilir kılar;
 * onay/red DİYALOGLARI T4'ün işidir. Geri çağrı bağlanmadığında düğmeler
 * devre-dışı kalır ve gerekçe ekranda okunur.
 */
export interface LeaveDecisionHandlers {
  /** IZN-F2.x: false → Onayla/Reddet pasif (ik.izin_yonetimi Onaylar yok). Varsayılan true. */
  canDecide?: boolean;
  onApproveRequest?: (request: LeaveRequestResponse) => void;
  onRejectRequest?: (request: LeaveRequestResponse) => void;
}

export interface PendingLeaveRequestsTableProps extends LeaveDecisionHandlers {
  rows: readonly LeaveRequestResponse[] | undefined;
  /** 🔴 K5 · başlıktaki sayı: liste zarfının `total`ı (satır sayısı DEĞİL). */
  total: number | undefined;
  balances: readonly LeaveBalanceResponse[] | undefined;
  isLoading: boolean;
  errorMessage?: string;
  /** 🔴 Onay isteği uçarken TÜM onay düğmeleri kilitlenir (çift gönderim yok). */
  isApprovePending?: boolean;
}

const COLUMN_COUNT = 8;

/**
 * İZ 54-113 · "Onay Bekleyen İzin Talepleri" — SEKİZ sütun.
 *
 * 🔴 K3: YALNIZ `pending` listelenir; durum sekmesi/süzgeci İCAT EDİLMEZ.
 * 🔴 K3 İSTİSNASI: boş durum BASILIR (mockup çizmez) — bekleyen talep
 *    olmaması NORMAL işletme hâlidir, boş kart hata gibi görünürdü.
 * 🔴 K7: `✓ ✗ ⚠ 📎 →` glifleri yazı tipi alt kümesinin DIŞINDAdır — hepsi
 *    `ui/icons` inline SVG'sine ya da sözcüğe çevrildi.
 */
export function PendingLeaveRequestsTable({
  rows,
  total,
  balances,
  isLoading,
  errorMessage,
  isApprovePending = false,
  canDecide = true,
  onApproveRequest,
  onRejectRequest,
}: PendingLeaveRequestsTableProps) {
  // 🔴 K4 · "Kalan Hak" sütununun tek kaynağı özet ucunun bakiye dizisidir.
  const balanceIndex = buildBalanceIndex(balances);
  const isDecisionWired = onApproveRequest !== undefined || onRejectRequest !== undefined;

  return (
    <section className="iz-card" data-testid="iz-pending-card">
      {/* 55-58 */}
      <header className="iz-card__head iz-card__head--warning">
        <h2 className="iz-card__title iz-card__title--warning" data-testid="iz-pending-title">
          {pendingTableHeading(total)}
        </h2>
        <p className="iz-card__hint iz-card__hint--warning">{PENDING_TABLE_HINT}</p>
      </header>

      {!isDecisionWired && (
        <p className="iz-card__pending-reason" data-testid="iz-decision-reason">
          {DECISION_PENDING_REASON}
        </p>
      )}

      <div className="iz-table-scroll">
        <table className="iz-table">
          {/* 60-69 */}
          <thead>
            <tr>
              <th scope="col" className="iz-table__th">
                Personel
              </th>
              <th scope="col" className="iz-table__th iz-table__th--center">
                İzin Tipi
              </th>
              <th scope="col" className="iz-table__th iz-table__th--center">
                Başlangıç
              </th>
              <th scope="col" className="iz-table__th iz-table__th--center">
                Bitiş
              </th>
              <th scope="col" className="iz-table__th iz-table__th--center">
                Gün
              </th>
              <th scope="col" className="iz-table__th iz-table__th--center">
                Kalan Hak
              </th>
              <th scope="col" className="iz-table__th">
                Açıklama
              </th>
              <th scope="col" className="iz-table__th iz-table__th--center">
                Eylemler
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={COLUMN_COUNT} className="iz-table__state">
                  {PENDING_LOADING_TEXT}
                </td>
              </tr>
            )}

            {!isLoading && errorMessage && (
              <tr>
                <td
                  colSpan={COLUMN_COUNT}
                  className="iz-table__state iz-table__state--error"
                  data-testid="iz-pending-error"
                >
                  {errorMessage}
                </td>
              </tr>
            )}

            {!isLoading && !errorMessage && rows?.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMN_COUNT}
                  className="iz-table__state"
                  data-testid="iz-pending-empty"
                >
                  {PENDING_EMPTY_TEXT}
                </td>
              </tr>
            )}

            {!isLoading &&
              !errorMessage &&
              rows?.map((row) => {
                const remaining = deriveRemainingCell(row, balanceIndex);
                const isBlocked = isApprovalBlocked(row, balanceIndex);
                const overrun = overrunDays(row, balanceIndex);
                const typeStyle: TypeBadgeStyle = row.leave_type_color
                  ? { "--iz-type-color": row.leave_type_color }
                  : {};

                return (
                  <tr
                    key={row.id}
                    data-testid={`iz-pending-row-${row.id}`}
                    // 91 — hak aşan satırın zemini farklıdır
                    className={isBlocked ? "iz-table__row iz-table__row--overrun" : "iz-table__row"}
                  >
                    {/* 72 — baş harf rozeti + ad + meslek */}
                    <td className="iz-table__td">
                      <div className="iz-person">
                        <span className="iz-person__avatar" aria-hidden="true">
                          {initials(row.personnel_name)}
                        </span>
                        <span>
                          <span className="iz-person__name">{row.personnel_name}</span>
                          <span className="iz-person__trade">
                            {row.personnel_trade ?? UNKNOWN_VALUE}
                          </span>
                        </span>
                      </div>
                    </td>

                    {/* 73 — tip rozeti; rengi sunucudan gelir (kodda hex durmaz) */}
                    <td className="iz-table__td iz-table__td--center">
                      <span className="iz-type-badge" style={typeStyle}>
                        {row.leave_type_name}
                      </span>
                    </td>

                    {/* 74-75 */}
                    <td className="iz-table__td iz-table__td--center iz-table__td--date">
                      {formatDateDots(row.start_date)}
                    </td>
                    <td className="iz-table__td iz-table__td--center iz-table__td--date">
                      {formatDateDots(row.end_date)}
                    </td>

                    {/* 76/96 — hak aşımında kırmızı */}
                    <td
                      className={
                        "iz-table__td iz-table__td--center iz-table__td--days" +
                        (isBlocked ? " iz-table__td--danger" : "")
                      }
                    >
                      {formatDays(row.days)}
                    </td>

                    {/* 77/87/97 — K4 + K9 */}
                    <td
                      className={`iz-table__td iz-table__td--center iz-remaining iz-remaining--${remaining.tone}`}
                      data-testid={`iz-remaining-${row.id}`}
                    >
                      {remaining.label}
                      {/* 97 — `⚠` yerine SVG üçgen (K7) */}
                      {remaining.tone === "exceeded" && (
                        <WarningTriangleIcon className="iz-remaining__icon" />
                      )}
                    </td>

                    {/* 78/88/98 */}
                    <td
                      className={
                        "iz-table__td iz-table__td--note" + (isBlocked ? " iz-table__td--danger" : "")
                      }
                    >
                      {isBlocked && overrun !== null
                        ? `${OVERRUN_NOTE_PREFIX} — ${formatDays(overrun)} ${UNIT_DAYS} fazla`
                        : (row.note ?? UNKNOWN_VALUE)}
                      {/* 88 — `📎` yerine SVG + erişilebilir ad (K7) */}
                      {row.document_id !== null && (
                        <span
                          className="iz-attachment"
                          data-testid={`iz-attachment-${row.id}`}
                          title={ATTACHMENT_LABEL}
                        >
                          <FileTextIcon className="iz-attachment__icon" />
                          <span className="iz-visually-hidden">{ATTACHMENT_LABEL}</span>
                        </span>
                      )}
                    </td>

                    {/* 79/99 — `✓`/`✗` yerine SVG; erişilebilir ad ZORUNLU */}
                    <td className="iz-table__td iz-table__td--center">
                      <div className="iz-actions">
                        <Button
                          variant="success"
                          size="sm"
                          className="iz-action"
                          // 99 — hak aşımında onay PASİF
                          disabled={isBlocked || !canDecide || onApproveRequest === undefined || isApprovePending}
                          title={isBlocked ? APPROVE_BLOCKED_REASON : undefined}
                          // Aynı personelin BİRDEN ÇOK bekleyen talebi olabilir;
                          // erişilebilir ad tarihi de taşır ki iki düğme
                          // ekran okuyucuda aynı adı almasın.
                          aria-label={`${APPROVE_ACTION_LABEL}: ${row.personnel_name}, ${formatDateDots(row.start_date)}`}
                          data-testid={`iz-approve-${row.id}`}
                          onClick={() => onApproveRequest?.(row)}
                        >
                          <CheckIcon />
                        </Button>
                        {/* 🔴 Red HER ZAMAN aktiftir — hak aşımı reddi ENGELLEMEZ */}
                        <Button
                          variant="secondary"
                          size="sm"
                          className="iz-action iz-action--reject"
                          disabled={!canDecide || onRejectRequest === undefined}
                          aria-label={`${REJECT_ACTION_LABEL}: ${row.personnel_name}, ${formatDateDots(row.start_date)}`}
                          data-testid={`iz-reject-${row.id}`}
                          onClick={() => onRejectRequest?.(row)}
                        >
                          <XIcon />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
