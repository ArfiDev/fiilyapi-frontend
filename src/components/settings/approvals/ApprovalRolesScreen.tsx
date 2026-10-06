"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Button, Field, Input } from "@/components/ui";
import { LockIcon, inlineSymbolProps } from "@/components/ui/icons";
import { ApprovalFlowArrow } from "@/components/approvals/ApprovalFlowStrip";
import { APPROVAL_ROLE_LABELS } from "@/components/approvals/approval-labels";
import { AccessDenied } from "@/components/settings/AccessDenied";
import {
  useApprovalSettings,
  useUpdateApprovalSettings,
  type ApprovalRole,
} from "@/lib/api/hooks/useApprovals";
import { checkApprovalThreshold } from "@/lib/api/approval-threshold";
import { backendErrorMessage } from "@/lib/api/error-message";
import { isForbidden } from "@/lib/api/unwrap";
import { APPROVAL_ROLES_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { cx } from "@/lib/cx";
import { formatCurrencyTight } from "@/lib/format";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import {
  APPROVAL_THRESHOLD_ADMIN_BADGE,
  APPROVAL_THRESHOLD_CARD_TITLE,
  APPROVAL_THRESHOLD_FIELD_LABEL,
  APPROVAL_THRESHOLD_FLOW_TITLE,
  APPROVAL_THRESHOLD_HINT,
  APPROVAL_THRESHOLD_LOCKED_NOTE,
  APPROVAL_THRESHOLD_SAVE_ERROR,
  APPROVAL_THRESHOLD_SAVE_LABEL,
  approvalThresholdAboveLabel,
  approvalThresholdBelowLabel,
} from "./approval-role-admin";
import "@/components/settings/settings.css";
import "./approval-roles.css";
import { routes } from "@/lib/routes";

/** Zincirin eşik ALTINDAKİ hâli (`:159-163`) — Patron adımı YOK. */
const CHAIN_BELOW: readonly ApprovalRole[] = ["site_chief", "project_manager", "accounting"];
/** Eşik ve üstü (`:168-174`) — zincir Patron'a kadar çıkar. */
const CHAIN_ABOVE: readonly ApprovalRole[] = [...CHAIN_BELOW, "patron"];

export function ApprovalRolesScreen() {
  const settingsQuery = useApprovalSettings();

  // 🔴 Kapı `hasAtLeast(…, "admin")` ile kurulur, `canWrite` ile DEĞİL: eşiği
  // `approvals: admin` yazar, `full` seviyeli kullanıcı 403 alır. Bilinmezlik
  // kuralı (seviye yoksa `true`) kasıtlı korunur — yükü gelmemiş oturumda
  // gizleme, tam yetkili kullanıcıya sessiz yetenek kaybı olurdu.
  // IZN-F2.x · eşik kaydet = ayarlar.onay_rolleri Düzenler.
  const canEditThreshold = useButtonGate({
    pages: APPROVAL_ROLES_EDIT,
    need: "edit",
  });

  const [thresholdDraft, setThresholdDraft] = useState<string | null>(null);
  const [thresholdError, setThresholdError] = useState<string | null>(null);

  const savedThreshold = settingsQuery.data?.approval_threshold_try;
  // Sunucudan gelen değer kutunun TABANIDIR; kullanıcı yazmaya başlayınca
  // (`thresholdDraft !== null`) yazdığı kazanır (`touched` deseni, F-İK).
  useEffect(() => {
    setThresholdDraft(null);
    setThresholdError(null);
  }, [savedThreshold]);

  // SEKME-F1.3b (B1, kullanıcı kararı) · eşik alt-formu bağlanır.
  // dirty: `thresholdDraft !== null` zaten "dokunuldu" sinyali (tercih 1).
  // 🔴 ASYNC TABAN: taban `settingsQuery.data.approval_threshold_try`;
  // yukarıdaki efekt kayıttan SONRA da (savedThreshold değişince) taslağı
  // KENDİLİĞİNDEN `null`a döndürüp dirty'yi sıfırlıyor (İYİ ÖRNEK, envanter).
  useUnsavedChanges(thresholdDraft !== null, "Onay eşiği");

  const updateSettings = useUpdateApprovalSettings();

  if (settingsQuery.isLoading) return <p className="settings-note">Yükleniyor…</p>;
  if (isForbidden(settingsQuery.error)) return <AccessDenied />;
  if (!settingsQuery.data) {
    return <p className="settings-note settings-note--error">Onay eşiği yüklenemedi.</p>;
  }

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

  return (
    <div className="okr-wrap">
      {/* IZN-B3b — onay yetkisi artık projedeki kullanıcı erişiminden gelir. */}
      <aside className="okr-intro">
        <p className="okr-intro__text" data-testid="okr-intro-note">
          Onayı, belgenin projesinde ilgili role atanmış kişi verir (Ayarlar &gt; Kullanıcılar)
        </p>
        <Link className="okr-intro__link" href={routes.settings.users()}>
          Kullanıcılar
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
