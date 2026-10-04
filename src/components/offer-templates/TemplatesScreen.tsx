"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { OfferTabs } from "@/components/offers/OfferTabs";
import { readOnlyMessage } from "@/components/offers/OffersScreen";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button } from "@/components/ui";
import { LockIcon } from "@/components/ui/icons";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useCatalogItems } from "@/lib/api/hooks/useCatalogItems";
import { useOfferSettings } from "@/lib/api/hooks/useOffers";
import { useDeleteOfferTemplate } from "@/lib/api/hooks/useOfferTemplateMutations";
import { useOfferTemplates, type OfferTemplateDetail } from "@/lib/api/hooks/useOfferTemplates";
import { isForbidden } from "@/lib/api/unwrap";
import type { WorkItemRead } from "@/lib/api/models";
import { hasAtLeast, type AccessLevel } from "@/lib/auth/permissions";
import { useDisciplineScope } from "@/lib/auth/useDisciplineScope";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { routes } from "@/lib/routes";

import { TemplateCardList } from "./TemplateCardList";
import { TemplateCreateModal } from "./TemplateCreateModal";
import { TemplateDeleteModal } from "./TemplateDeleteModal";
import { TemplateEmptyState } from "./TemplateEmptyState";
import { TemplateWorkspace } from "./TemplateWorkspace";
import type { FlowResult } from "./template-create-flow";
import type { SourceKind } from "./template-create-form";
import { resolveSelectedId, searchTemplates } from "./template-model";
import "@/components/offers/offers.css";
import "./offer-templates.css";

/** T25: şablon YAZMA = `contracts:full` + disiplin kısıtsız; okuma `contracts:view`. */
const WRITE_LEVEL = "full";
/** Başarı bildiriminin ekranda kalma süresi (TS:271, F3 emsali). */
const TOAST_MS = 2800;

interface TemplatesScreenProps {
  /** Ham `?sablon=` değeri (sayfa `useSearchParams` ile okur). */
  templateParam: string | null;
}

/**
 * TKL-F4.5 · `/teklif-hazirlama/sablonlar?sablon=…` — Teklif Şablonları (kapsayıcı). ÇEKİRDEK ekran.
 * Kapı: `contracts:none` → AccessDenied; 403 (R5/T40 kısıtlı kullanıcı) da AccessDenied.
 */
export function TemplatesScreen(props: TemplatesScreenProps) {
  const { level } = useModulePermission("contracts");
  if (level === "none") return <AccessDenied />;
  return <TemplatesContent level={level} templateParam={props.templateParam} />;
}

function TemplatesContent({ level, templateParam }: { level: AccessLevel | undefined; templateParam: string | null }) {
  const router = useRouter();
  const scope = useDisciplineScope();
  const canWrite = hasAtLeast(level, WRITE_LEVEL) && !scope.isRestricted;
  const list = useOfferTemplates();
  const catalog = useCatalogItems();
  const settings = useOfferSettings();
  const deleteTemplate = useDeleteOfferTemplate();

  const [searchText, setSearchText] = useState("");
  const [toast, setToast] = useState<{ text: string } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [createSource, setCreateSource] = useState<SourceKind | null>(null);
  const [pendingDelete, setPendingDelete] = useState<OfferTemplateDetail | null>(null);
  // Silinmekte olan şablon: liste tazelenene kadar seçim adayı DEĞİL (yoksa silineni yeniden seçip 404 GET atardı).
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const catalogById = useMemo(
    () => new Map<string, WorkItemRead>((catalog.data ?? []).map((item) => [item.id, item])),
    [catalog.data],
  );

  const items = useMemo(
    () => (list.data?.items ?? []).filter((item) => item.id !== removingId),
    [list.data, removingId],
  );

  if (isForbidden(list.error)) return <AccessDenied />;

  const selectedId = resolveSelectedId(items, templateParam);
  const selectedItem = items.find((item) => item.id === selectedId);
  const defaults = settings.data
    ? { default_overhead_pct: settings.data.default_overhead_pct, default_profit_pct: settings.data.default_profit_pct }
    : null;

  const select = (templateId: string | undefined) =>
    router.replace(routes.offers.templates(templateId === undefined ? {} : { templateId }));
  const flash = (text: string) => setToast({ text });

  function handleCreated(result: FlowResult, successToast: string) {
    setCreateSource(null);
    if (result.template !== null) select(result.template.id);
    if (result.failure === null) {
      setBanner(null);
      flash(successToast);
    } else {
      setBanner(result.failure.message);
    }
  }

  async function confirmDelete() {
    if (pendingDelete === null) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setBanner(null);
    // Silinen kimlik seçim adayı olmaktan ÇIKAR (liste tazelenene kadar bayat satır olarak durur); URL ilk kalan
    // şablona (ya da çıplak adrese) döner: silinen kimliğin gözlemcisi 404 refetch atmasın.
    setRemovingId(target.id);
    select(items.find((item) => item.id !== target.id)?.id);
    try {
      await deleteTemplate.mutateAsync(target.id);
      flash(`${target.name} silindi`);
    } catch (failure) {
      select(target.id);
      setBanner(backendErrorMessage(failure));
    } finally {
      setRemovingId(null);
    }
  }

  const readOnlyText = readOnlyMessage(level, scope.isRestricted);
  return (
    <div className="offers">
      <OfferTabs offerCount={null} listHref={routes.offers.list()} isActive={false} />
      <header className="offers__head">
        <div className="offers__titles">
          <h1 className="offers__title">Teklif Şablonları</h1>
          <p className="offers__lead">Tekrarlayan iş tipleri için hazır kalem setleri · yeni teklif şablondan başlatılabilir</p>
        </div>
        {canWrite && (
          <div className="otpl-detail__actions">
            <Button variant="secondary" onClick={() => setCreateSource("offer")}>
              Tekliften şablon oluştur
            </Button>
            <Button onClick={() => setCreateSource("blank")}>+ Yeni Şablon</Button>
          </div>
        )}
      </header>

      {readOnlyText && (
        <div role="note" className="offers-readonly">
          <LockIcon className="offers-readonly__icon" />
          <span>{readOnlyText}</span>
        </div>
      )}
      {toast && (
        <div className="offers-toast" role="status">
          {toast.text}
        </div>
      )}
      {banner !== null && (
        <p className="offers-error" role="status">
          {banner}
        </p>
      )}

      {list.data === undefined ? (
        <p className="offers-state">{list.isError ? "Şablonlar yüklenemedi" : "Şablonlar yükleniyor"}</p>
      ) : items.length === 0 ? (
        <TemplateEmptyState canWrite={canWrite} onFromOffer={() => setCreateSource("offer")} onNew={() => setCreateSource("blank")} />
      ) : (
        <>
          <TemplateCardList
            items={searchTemplates(items, searchText)}
            total={list.data.total}
            searchText={searchText}
            onSearchTextChange={setSearchText}
            selectedId={selectedId}
            onSelect={select}
          />
          {selectedId !== null && selectedItem !== undefined && (
            <TemplateWorkspace
              key={selectedId}
              templateId={selectedId}
              listItem={selectedItem}
              catalog={catalogById}
              defaults={defaults}
              canWrite={canWrite}
              onCopied={(copy) => {
                select(copy.id);
                flash("Şablon kopyalandı");
              }}
              onDefaultSet={(name) => flash(`${name} varsayılan şablon yapıldı`)}
              onDeleteRequest={setPendingDelete}
            />
          )}
        </>
      )}

      {createSource !== null && (
        <TemplateCreateModal initialSource={createSource} templates={items} onClose={() => setCreateSource(null)} onCreated={handleCreated} />
      )}
      {pendingDelete !== null && (
        <TemplateDeleteModal
          name={pendingDelete.name}
          usageCount={items.find((item) => item.id === pendingDelete.id)?.usage_count ?? pendingDelete.usage_count}
          isPending={deleteTemplate.isPending}
          onConfirm={() => void confirmDelete()}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
