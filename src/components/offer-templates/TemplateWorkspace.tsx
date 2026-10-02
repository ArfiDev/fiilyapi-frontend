"use client";

import { useState } from "react";

import { backendErrorMessage } from "@/lib/api/error-message";
import { useCopyOfferTemplate } from "@/lib/api/hooks/useOfferTemplateMutations";
import { useOfferTemplate, type OfferTemplateDetail, type OfferTemplateListItem } from "@/lib/api/hooks/useOfferTemplates";
import { BackendError, isForbidden } from "@/lib/api/unwrap";
import type { WorkItemRead } from "@/lib/api/models";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button } from "@/components/ui";

import { TemplateCatalogPickerHost } from "./TemplateCatalogPickerHost";
import { TemplateDetailCard } from "./TemplateDetailCard";
import { TemplateItemsTable } from "./TemplateItemsTable";
import { addGroup, editRemoveGroup, editRemoveItem, editRenameGroup } from "./template-content";
import type { RateDefaults } from "./template-rates";
import { useTemplateContentEditor } from "./useTemplateContentEditor";
import "@/components/offers/offers.css";
import "./offer-templates.css";

const NOT_FOUND_STATUS = 404;

interface TemplateWorkspaceProps {
  templateId: string;
  /** Liste öğesi: "Kullanıldığı teklif" BURADAN okunur (detay önbelleği teklif oluşturunca bayat kalır). */
  listItem: OfferTemplateListItem;
  catalog: ReadonlyMap<string, WorkItemRead>;
  defaults: RateDefaults | null;
  canWrite: boolean;
  onCopied: (copy: OfferTemplateDetail) => void;
  onDefaultSet: (name: string) => void;
  onDeleteRequest: (detail: OfferTemplateDetail) => void;
}

/**
 * Seçili şablonun detay + kalem kartları. `key={templateId}` ile kurulur: yazma yürütücüsü ve mutasyon
 * kancaları TEK şablona bağlıdır (kuyruktaki işlem başka şablonun kimliğine gitmesin).
 */
export function TemplateWorkspace(props: TemplateWorkspaceProps) {
  const { templateId, listItem, catalog, defaults, canWrite } = props;
  const query = useOfferTemplate(templateId);
  const editor = useTemplateContentEditor(templateId);
  const copy = useCopyOfferTemplate(templateId);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  if (isForbidden(query.error)) return <AccessDenied />;
  if (query.data === undefined) {
    if (!query.isError) return <p className="offers-state">Şablon yükleniyor</p>;
    if (query.error instanceof BackendError && query.error.status === NOT_FOUND_STATUS) {
      return <p className="offers-state">Şablon bulunamadı</p>;
    }
    return (
      <div className="offers-state">
        <p>Şablon yüklenemedi</p>
        <Button variant="secondary" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
          Tekrar dene
        </Button>
      </div>
    );
  }
  const detail = query.data;

  async function handleMakeDefault() {
    setActionError(null);
    // İçerik/künye yazmalarıyla AYNI sıradan geçer (hata bandı da editörün bandıdır).
    if (await editor.makeDefault()) props.onDefaultSet(detail.name);
  }

  async function handleCopy() {
    setActionError(null);
    try {
      props.onCopied(await copy.mutateAsync(undefined));
    } catch (failure) {
      setActionError(backendErrorMessage(failure));
    }
  }

  const bannerText = editor.error ?? actionError;
  return (
    <div className="otpl-stack">
      {bannerText !== null && (
        <p className="offers-error" role="status">
          {bannerText}
        </p>
      )}
      <TemplateDetailCard
        detail={detail}
        usageCount={listItem.usage_count}
        defaults={defaults}
        canWrite={canWrite}
        isBusy={editor.isMakingDefault || copy.isPending}
        onPatch={(fields) => void editor.patch(fields)}
        onMakeDefault={() => void handleMakeDefault()}
        onCopy={() => void handleCopy()}
        onDelete={() => props.onDeleteRequest(detail)}
      />
      <TemplateItemsTable
        detail={detail}
        catalog={catalog}
        canEdit={canWrite}
        onAddGroup={() => void editor.edit(addGroup())}
        onAddFromCatalog={() => setIsPickerOpen(true)}
        onRenameGroup={(group, newName) => void editor.edit(editRenameGroup(group.name, newName, group.nth))}
        onRemoveGroup={(group) => void editor.edit(editRemoveGroup(group.name, group.nth))}
        onRemoveItem={(group, catalogItemId) => void editor.edit(editRemoveItem(group.name, catalogItemId, group.nth))}
      />
      {isPickerOpen && canWrite && (
        <TemplateCatalogPickerHost detail={detail} editor={editor} onClose={() => setIsPickerOpen(false)} />
      )}
    </div>
  );
}
