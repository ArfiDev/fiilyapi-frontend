"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Button, Field, Input } from "@/components/ui";
import { CheckIcon, LockIcon, inlineSymbolProps } from "@/components/ui/icons";
import { ApprovalFlowArrow } from "@/components/approvals/ApprovalFlowStrip";
import {
  APPROVAL_ROLE_LABELS,
  UNKNOWN_VALUE,
} from "@/components/approvals/approval-labels";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { SettingsCard } from "@/components/settings/primitives/SettingsCard";
import { RolePill } from "@/components/settings/primitives/RolePill";
import { roleVisual } from "@/components/settings/primitives/role-visuals";
import { UserAvatar } from "@/components/settings/primitives/UserAvatar";
import {
  useApprovalRoleAssignments,
  useApprovalSettings,
  useSetApprovalRoles,
  useUpdateApprovalSettings,
  type ApprovalRole,
} from "@/lib/api/hooks/useApprovals";
import { useRoles } from "@/lib/api/hooks/useRoles";
import { useUsers } from "@/lib/api/hooks/useUsers";
import { checkApprovalThreshold } from "@/lib/api/approval-threshold";
import { backendErrorMessage } from "@/lib/api/error-message";
import { isForbidden } from "@/lib/api/unwrap";
import { hasAtLeast } from "@/lib/auth/permissions";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { cx } from "@/lib/cx";
import { formatCurrencyTight } from "@/lib/format";
import { buildListTruncation, listTruncationMessage } from "@/lib/list-truncation";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import {
  APPROVAL_PENDING_COLUMN_LABEL,
  APPROVAL_PENDING_COLUMN_REASON,
  APPROVAL_ROLE_ORDER,
  APPROVAL_ROLES_SAVE_ERROR,
  APPROVAL_THRESHOLD_ADMIN_BADGE,
  APPROVAL_THRESHOLD_CARD_TITLE,
  APPROVAL_THRESHOLD_FIELD_LABEL,
  APPROVAL_THRESHOLD_FLOW_TITLE,
  APPROVAL_THRESHOLD_HINT,
  APPROVAL_THRESHOLD_LOCKED_NOTE,
  APPROVAL_THRESHOLD_SAVE_ERROR,
  APPROVAL_THRESHOLD_SAVE_LABEL,
  approvalRoleCountLabel,
  approvalThresholdAboveLabel,
  approvalThresholdBelowLabel,
  mergeApprovalRoleRows,
  toggleApprovalRole,
  type ApprovalRoleRow,
} from "./approval-role-admin";
import "@/components/settings/settings.css";
import "./approval-roles.css";
import { routes } from "@/lib/routes";

/**
 * `GET /users` ve `GET /approvals/roles` `limit` tavanı (openapi.json `le=200`).
 * AÇIKÇA gönderilir; aşan kayıt `buildListTruncation` ile GÖRÜNÜR kılınır —
 * sessiz kırpma, bir kullanıcının imza yetkisinin kaybolması demektir.
 */
const APPROVAL_ROLE_PAGE_LIMIT = 200;

/** Zincirin eşik ALTINDAKİ hâli (`:159-163`) — Patron adımı YOK. */
const CHAIN_BELOW: readonly ApprovalRole[] = ["site_chief", "project_manager", "accounting"];
/** Eşik ve üstü (`:168-174`) — zincir Patron'a kadar çıkar. */
const CHAIN_ABOVE: readonly ApprovalRole[] = [...CHAIN_BELOW, "patron"];

export function ApprovalRolesScreen() {
  const usersQuery = useUsers({ limit: APPROVAL_ROLE_PAGE_LIMIT, offset: 0 });
  const rolesQuery = useRoles();
  const assignmentsQuery = useApprovalRoleAssignments();
  const settingsQuery = useApprovalSettings();

  const { level } = useModulePermission("approvals");
  // 🔴 Kapı `hasAtLeast(…, "admin")` ile kurulur, `canWrite` ile DEĞİL: eşiği
  // `approvals: admin` yazar, `full` seviyeli kullanıcı 403 alır. Bilinmezlik
  // kuralı (seviye yoksa `true`) kasıtlı korunur — yükü gelmemiş oturumda
  // gizleme, tam yetkili kullanıcıya sessiz yetenek kaybı olurdu.
  const canEditThreshold = hasAtLeast(level, "admin");

  const [thresholdDraft, setThresholdDraft] = useState<string | null>(null);
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const [rolesError, setRolesError] = useState<string | null>(null);

  const savedThreshold = settingsQuery.data?.approval_threshold_try;
  // Sunucudan gelen değer kutunun TABANIDIR; kullanıcı yazmaya başlayınca
  // (`thresholdDraft !== null`) yazdığı kazanır (`touched` deseni, F-İK).
  useEffect(() => {
    setThresholdDraft(null);
    setThresholdError(null);
  }, [savedThreshold]);

  // SEKME-F1.3b (B1, kullanıcı kararı) · YALNIZ eşik alt-formu bağlanır.
  // Kullanıcı×rol rozet ızgarası her tıklamada ANINDA kaydolur (`toggleRow`),
  // ayrı taslak YOK — o kısım bağlanmaz (çift kayıt/anlamsız dirty olurdu).
  // dirty: `thresholdDraft !== null` zaten "dokunuldu" sinyali (tercih 1).
  // 🔴 ASYNC TABAN: taban `settingsQuery.data.approval_threshold_try`;
  // yukarıdaki efekt kayıttan SONRA da (savedThreshold değişince) taslağı
  // KENDİLİĞİNDEN `null`a döndürüp dirty'yi sıfırlıyor (İYİ ÖRNEK, envanter).
  useUnsavedChanges(thresholdDraft !== null, "Onay eşiği");

  const updateSettings = useUpdateApprovalSettings();
  const setRoles = useSetApprovalRoles();

  const queries = [usersQuery, rolesQuery, assignmentsQuery, settingsQuery];
  if (queries.some((q) => q.isLoading)) return <p className="settings-note">Yükleniyor…</p>;
  if (queries.some((q) => isForbidden(q.error))) return <AccessDenied />;
  if (!usersQuery.data || !rolesQuery.data || !assignmentsQuery.data || !settingsQuery.data) {
    return <p className="settings-note settings-note--error">Onay rolleri yüklenemedi.</p>;
  }

  const rows = mergeApprovalRoleRows(
    usersQuery.data.items,
    rolesQuery.data,
    assignmentsQuery.data.items,
  );
  const truncation = buildListTruncation(usersQuery.data.items.length, usersQuery.data.total);
  const thresholdValue = thresholdDraft ?? settingsQuery.data.approval_threshold_try;
  const formattedThreshold = formatCurrencyTight(settingsQuery.data.approval_threshold_try);

  function saveThreshold() {
    const checked = checkApprovalThreshold(thresholdValue);
    if (!checked.ok) {
      setThresholdError(checked.reason);
      return;
    }
    setThresholdError(null);
    updateSettings.mutate(checked.value, {
      onError: (error) => setThresholdError(backendErrorMessage(error) || APPROVAL_THRESHOLD_SAVE_ERROR),
    });
  }

  function toggleRow(row: ApprovalRoleRow, role: ApprovalRole) {
    setRolesError(null);
    setRoles.mutate(
      { userId: row.userId, roles: toggleApprovalRole(row.approvalRoles, role) },
      { onError: (error) => setRolesError(backendErrorMessage(error) || APPROVAL_ROLES_SAVE_ERROR) },
    );
  }

  return (
    <div className="okr-wrap">
      {/* `:126-133` — bu ekranın Rol Yönetimi'nden farkını anlatan şerit. */}
      <aside className="okr-intro">
        <p className="okr-intro__text">
          <strong>Rol Yönetimi</strong> rolün <em>neyi görebileceğini</em> tanımlar (modül
          izinleri). Bu ekran ise <strong>kimin onaylayacağını</strong> belirler — bir kullanıcı
          birden çok onay rolü taşıyabilir.
        </p>
        <Link className="okr-intro__link" href={routes.settings.permissionMatrix()}>
          İzin Matrisi
          <ApprovalFlowArrow />
        </Link>
      </aside>

      {/* --- EŞİK KARTI (`:136-176`) --- */}
      <section className="okr-card okr-card--threshold" aria-labelledby="okr-threshold-title">
        <header className="okr-card__head okr-card__head--threshold">
          <LockIcon {...inlineSymbolProps} />
          <h2 className="okr-card__title" id="okr-threshold-title">
            {APPROVAL_THRESHOLD_CARD_TITLE}
          </h2>
          <span className="okr-badge-admin">{APPROVAL_THRESHOLD_ADMIN_BADGE}</span>
          {/* 🔴 Gerekçe ŞERİDİN KENDİ DURUMUNDAN türetilir (F-KIRA kanonu):
              kullanıcı `admin` olduğu anda cümle KENDİLİĞİNDEN düşer. */}
          {!canEditThreshold && (
            <span className="okr-card__note">{APPROVAL_THRESHOLD_LOCKED_NOTE}</span>
          )}
        </header>
        <div className="okr-threshold">
          <div className="okr-threshold__field">
            <Field
              label={`${APPROVAL_THRESHOLD_FIELD_LABEL} (₺)`}
              hint={APPROVAL_THRESHOLD_HINT}
              error={thresholdError ?? undefined}
            >
              {(control) => (
                <Input
                  {...control}
                  numeric
                  inputMode="decimal"
                  value={thresholdValue}
                  readOnly={!canEditThreshold}
                  status={thresholdError ? "error" : "default"}
                  rightIcon={canEditThreshold ? undefined : <LockIcon {...inlineSymbolProps} />}
                  onChange={(e) => setThresholdDraft(e.target.value)}
                />
              )}
            </Field>
            {canEditThreshold && (
              <Button
                onClick={saveThreshold}
                disabled={updateSettings.isPending}
                data-testid="okr-threshold-save"
              >
                {APPROVAL_THRESHOLD_SAVE_LABEL}
              </Button>
            )}
          </div>

          <div className="okr-flow">
            <p className="okr-flow__title">{APPROVAL_THRESHOLD_FLOW_TITLE}</p>
            <ChainRow
              tone="below"
              label={approvalThresholdBelowLabel(formattedThreshold)}
              chain={CHAIN_BELOW}
              note="Yeterli"
            />
            <ChainRow
              tone="above"
              label={approvalThresholdAboveLabel(formattedThreshold)}
              chain={CHAIN_ABOVE}
            />
            <Link className="okr-flow__link" href={routes.approvalInbox()}>
              Onay Kutusu&apos;nda gör
              <ApprovalFlowArrow />
            </Link>
          </div>
        </div>
      </section>

      {/* --- KULLANICI × ROL (`:179-224`) --- */}
      <SettingsCard
        title="Kullanıcı Onay Rolleri"
        count={approvalRoleCountLabel(rows.length)}
        actions={
          <span className="okr-card__hint">
            Rozete tıklayarak rol ekle/çıkar · Bir kullanıcı birden çok rol taşıyabilir
          </span>
        }
        bodyPad="flush"
      >
        {rolesError && (
          <p className="settings-note settings-note--error" role="alert">
            {rolesError}
          </p>
        )}
        {truncation.isTruncated && (
          <p className="settings-note settings-note--error">{listTruncationMessage(truncation)}</p>
        )}
        <div className="okr-table-scroll">
          <table className="okr-table">
            <thead>
              <tr>
                <th scope="col">Kullanıcı</th>
                <th scope="col" className="okr-th--role">
                  Sistem Rolü
                </th>
                <th scope="col">Onay Rolleri</th>
                {/* 🔴 KOLON SİLİNMEZ, DEVRE-DIŞI BASILIR (F-TH kanonu): sayı
                    hiçbir uçtan gelmiyor, uydurulmuyor. */}
                <th
                  scope="col"
                  className="okr-th--pending"
                  aria-disabled="true"
                  title={APPROVAL_PENDING_COLUMN_REASON}
                >
                  {APPROVAL_PENDING_COLUMN_LABEL}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.userId}>
                  <td>
                    <span className="okr-user">
                      <UserAvatar roleKey={row.systemRole?.key ?? ""} name={row.fullName} />
                      <span className="okr-user__text">
                        <span className="okr-user__name">{row.fullName}</span>
                        <span className="okr-user__mail">{row.email}</span>
                      </span>
                    </span>
                  </td>
                  <td>
                    {row.systemRole ? (
                      <RolePill roleKey={row.systemRole.key} name={row.systemRole.name} />
                    ) : (
                      <span className="okr-muted">{UNKNOWN_VALUE}</span>
                    )}
                  </td>
                  <td>
                    <span className="okr-chips">
                      {APPROVAL_ROLE_ORDER.map((role) => {
                        const on = row.approvalRoles.includes(role);
                        // 🔴 Rol renkleri BURADA YENİDEN TANIMLANMAZ:
                        // `roleVisual` sözlüğü beş onay rolünün de anahtarını
                        // (`site_chief` … `procurement`) zaten taşıyor —
                        // `ApprovalRole` değerleri `roles/seed_data.py`
                        // anahtarlarıyla BİREBİR aynıdır (şema R1).
                        const visual = roleVisual(role);
                        return (
                          <button
                            key={role}
                            type="button"
                            className={cx("okr-chip", !on && "okr-chip--off")}
                            style={
                              on ? { background: visual.badgeBg, color: visual.badgeText } : undefined
                            }
                            aria-pressed={on}
                            disabled={setRoles.isPending}
                            onClick={() => toggleRow(row, role)}
                          >
                            {APPROVAL_ROLE_LABELS[role]}
                            {/* `✓` glif değil ikondur (F-SEM); anlam
                                `aria-pressed`te zaten taşınıyor. */}
                            {on && <CheckIcon {...inlineSymbolProps} />}
                          </button>
                        );
                      })}
                    </span>
                  </td>
                  <td className="okr-td--pending">
                    <span className="okr-muted">{UNKNOWN_VALUE}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="okr-foot">
          <strong>Not:</strong> Onay rolü olmayan kullanıcı ilgili kalemi görebilir ama
          onaylayamaz. Sistem rolü ile onay rolü ayrıdır — bir Proje Müdürü aynı zamanda Şantiye
          Şefi onayı da verebilir.
        </p>
        <p className="okr-foot okr-foot--pending">{APPROVAL_PENDING_COLUMN_REASON}</p>
      </SettingsCard>
    </div>
  );
}

function ChainRow({
  tone,
  label,
  chain,
  note,
}: {
  tone: "below" | "above";
  label: string;
  chain: readonly ApprovalRole[];
  note?: string;
}) {
  return (
    <div className={cx("okr-chain", `okr-chain--${tone}`)}>
      <span className="okr-chain__label">{label}</span>
      <span className="okr-chain__steps">
        {chain.map((role, index) => (
          <span key={role} className="okr-chain__step-wrap">
            {index > 0 && <ApprovalFlowArrow />}
            <span
              className={cx(
                "okr-chain__step",
                role === "patron" && tone === "above" && "okr-chain__step--patron",
              )}
            >
              {APPROVAL_ROLE_LABELS[role]}
            </span>
          </span>
        ))}
        {note && <span className="okr-chain__note">{note}</span>}
      </span>
    </div>
  );
}
