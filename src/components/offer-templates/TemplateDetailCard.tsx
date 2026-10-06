"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button, Input } from "@/components/ui";
import { CheckIcon } from "@/components/ui/icons";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import type { OfferTemplateDetail } from "@/lib/api/hooks/useOfferTemplates";
import { routes } from "@/lib/routes";

import { TemplateRatesStat } from "./TemplateRatesStat";
import type { RateDefaults } from "./template-rates";
import type { TemplatePatch } from "./useTemplateContentEditor";
import "./offer-templates.css";
import { OFFER_TEMPLATES_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";

export const NAME_MAX_LENGTH = 80;
export const MSG_TEMPLATE_NAME_REQUIRED = "Şablon adı zorunlu";
/** TS:127 AYNEN. */
export const TEMPLATE_NOTE =
  "Şablonda miktar tutulmaz. Birim fiyatlar teklif anında İş Kalemi Kataloğu'ndaki son fiyattan çekilir; yalnız kalem seti, gruplar ve varsayılan oranlar saklanır.";
/** GECE KURALI: açıklaması olmayan şablonda yazarın tıklayacağı yer (mockup `newTplOld` metni). */
const DESCRIPTION_PLACEHOLDER = "Açıklama ekleyin";

interface TemplateDetailCardProps {
  detail: OfferTemplateDetail;
  /** "Kullanıldığı teklif" LİSTE öğesinden gelir (detay önbelleği teklif oluşturunca bayat kalır). */
  usageCount: number;
  defaults: RateDefaults | null;
  canWrite: boolean;
  isBusy: boolean;
  onPatch: (fields: TemplatePatch) => void;
  onMakeDefault: () => void;
  onCopy: () => void;
  onDelete: () => void;
}

/** TS:109-128 — ad · açıklama · düğmeler · 4 istatistik · mavi not. */
export function TemplateDetailCard(props: TemplateDetailCardProps) {
  const { detail, usageCount, defaults, canWrite, isBusy } = props;
  // IZN-F2.x · şablon silme = yalnız sistem yöneticisi (SIL-B1; blok zaten canWrite içinde; grant yoksa görünür).
  const canDeleteTemplate = useButtonGate({ pages: OFFER_TEMPLATES_EDIT, need: "sa", fallback: true });
  return (
    <section className="otpl-detail" aria-label="Şablon ayrıntısı">
      <div className="otpl-detail__head">
        <div className="otpl-detail__titles">
          <InlineName name={detail.name} canEdit={canWrite} onSave={(name) => props.onPatch({ name })} />
          <InlineDescription description={detail.description} canEdit={canWrite} onSave={(description) => props.onPatch({ description })} />
        </div>
        {canWrite && (
          <div className="otpl-detail__actions">
            <Button variant="secondary" size="sm" disabled={detail.is_default || isBusy} onClick={props.onMakeDefault}>
              {detail.is_default ? (
                <>
                  <CheckIcon width={12} height={12} /> Varsayılan şablon
                </>
              ) : (
                "Varsayılan yap"
              )}
            </Button>
            <Button variant="secondary" size="sm" disabled={isBusy} onClick={props.onCopy}>
              Kopyala
            </Button>
            {canDeleteTemplate && (
              <Button variant="secondary" size="sm" className="otpl-delete-btn" disabled={isBusy} onClick={props.onDelete}>
                Sil
              </Button>
            )}
            <Link href={routes.offers.new({ templateId: detail.id })} className="btn btn--primary btn--sm">
              Bu şablonla teklif başlat →
            </Link>
          </div>
        )}
      </div>
      <div className="otpl-stats">
        <Stat label="Kalem" value={String(detail.item_count)} />
        <Stat label="Grup" value={String(detail.group_count)} />
        <TemplateRatesStat
          overhead={detail.overhead_pct}
          profit={detail.profit_pct}
          defaults={defaults}
          canEdit={canWrite}
          onSave={props.onPatch}
        />
        <Stat label="Kullanıldığı teklif" value={String(usageCount)} />
      </div>
      <p className="otpl-note">{TEMPLATE_NOTE}</p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="otpl-stat">
      <span className="otpl-stat__label">{label}</span>
      <span className="otpl-stat__value">{value}</span>
    </div>
  );
}

/** Ad tıkla-düzenle (≤80): blur/Enter → kaydet; boşsa eski ada döner + "Şablon adı zorunlu"; Escape iptal. */
function InlineName({ name, canEdit, onSave }: { name: string; canEdit: boolean; onSave: (name: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isCancelledRef = useRef(false);
  const isEditing = draft !== null;
  // Düzenleme açıkken (blur'da kaydedilir) sekme/çıkış onayı: yazılan ad kaybolmasın.
  useUnsavedChanges(isEditing && draft !== name, "Şablon adı");

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  function finish() {
    const next = draft?.trim() ?? "";
    setDraft(null);
    if (isCancelledRef.current) return;
    if (next === "") {
      setError(MSG_TEMPLATE_NAME_REQUIRED);
      return;
    }
    setError(null);
    if (next !== name) onSave(next);
  }

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        value={draft}
        maxLength={NAME_MAX_LENGTH}
        aria-label="Şablon adı"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={finish}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            isCancelledRef.current = true;
            setDraft(null);
          }
        }}
      />
    );
  }
  return (
    <>
      {canEdit ? (
        <button
          type="button"
          className="otpl-detail__name"
          title="Şablon adını düzenle"
          onClick={() => {
            isCancelledRef.current = false;
            setError(null);
            setDraft(name);
          }}
        >
          {name}
        </button>
      ) : (
        <h2 className="otpl-detail__name">{name}</h2>
      )}
      {error && <span className="otpl-detail__field-error">{error}</span>}
    </>
  );
}

function InlineDescription({
  description,
  canEdit,
  onSave,
}: {
  description: string | null;
  canEdit: boolean;
  onSave: (description: string | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isCancelledRef = useRef(false);
  const isEditing = draft !== null;
  useUnsavedChanges(isEditing && draft !== (description ?? ""), "Şablon açıklaması");

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  function finish() {
    const next = draft?.trim() ?? "";
    setDraft(null);
    if (isCancelledRef.current) return;
    const value = next === "" ? null : next;
    if (value !== description) onSave(value);
  }

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        size="row"
        value={draft}
        aria-label="Şablon açıklaması"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={finish}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            isCancelledRef.current = true;
            setDraft(null);
          }
        }}
      />
    );
  }
  if (!canEdit) return description === null ? null : <p className="otpl-detail__desc">{description}</p>;
  return (
    <button
      type="button"
      className={description === null ? "otpl-detail__desc otpl-detail__desc--empty" : "otpl-detail__desc"}
      title="Açıklamayı düzenle"
      onClick={() => {
        isCancelledRef.current = false;
        setDraft(description ?? "");
      }}
    >
      {description ?? DESCRIPTION_PLACEHOLDER}
    </button>
  );
}
