"use client";

import { useEffect, useMemo, useState } from "react";

import { CatalogPickerModal, type PickerSubmission } from "@/components/work-item-picker/CatalogPickerModal";
import type { PickerGroup } from "@/components/work-item-picker/picker-model";
import { TEMPLATE_PICKER_TARGET, type TemplateAddBody } from "@/components/work-item-picker/picker-target";
import type { OfferTemplateDetail } from "@/lib/api/hooks/useOfferTemplates";

import { MSG_GROUP_MISSING, editAddItems, groupKeysOf, parseGroupKey, type Edit } from "./template-content";
import type { TemplateContentEditor } from "./useTemplateContentEditor";

interface TemplateCatalogPickerHostProps {
  detail: OfferTemplateDetail;
  editor: TemplateContentEditor;
  onClose: () => void;
}

/**
 * Şablon grubunu seçicinin yapısal grup görünümüne çevirir (`code` = poz no; şablonda çakışma kuralı yok).
 * 🔴 `id` = KALICI anahtar (`ad#sıra`), backend grup kimliği DEĞİL: her PUT kimlikleri yeniden üretir; seçici açıkken
 * gelen bir tazeleme seçilen grubu kaybettirip son gruba düşürürdü (TKL-F4.6b Y1).
 */
function toPickerGroups(groups: OfferTemplateDetail["groups"]): PickerGroup[] {
  const keys = groupKeysOf(groups);
  return groups.map((group, index) => ({
    id: keys[index] ?? group.id,
    name: group.name,
    sort_order: group.sort_order,
    items: group.items.map((item) => ({ code: item.poz_no, catalog_item_id: item.catalog_item_id, sort_order: item.sort_order })),
  }));
}

/**
 * TKL-F4.6 · "+ Katalogdan Ekle" → F2/F3 çoklu seçicisi (ÜÇÜNCÜ hedef, `selectOnly`). Onay = editörün TEK
 * `PUT …/content` işlemi (`editAddItems`): yeni grup için ayrı istek YOK. Hata/409 editörün mevcut yolundan
 * (bant + tazeleme) geçer ve metin seçici bandında AYNEN görünür; seçici yalnız BAŞARIDA kapanır.
 */
export function TemplateCatalogPickerHost({ detail, editor, onClose }: TemplateCatalogPickerHostProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const groups = useMemo(() => toPickerGroups(detail.groups), [detail.groups]);
  const { clearError, tryEdit } = editor;

  // Önceki bir işlemin bant metni yeni seçiciye taşınmasın.
  useEffect(() => clearError(), [clearError]);

  function editOf(submission: PickerSubmission<TemplateAddBody>): Edit {
    if (submission.newGroup !== null) {
      // Yerel yeni grup: kimlik yok; yalnız kalem kimlikleri gerekir.
      return editAddItems({ newGroupName: submission.newGroup.name }, submission.buildBody("").catalogIds);
    }
    const body = submission.body as TemplateAddBody;
    const ref = parseGroupKey(body.groupId);
    if (ref === null) return () => ({ ok: false, error: MSG_GROUP_MISSING });
    return editAddItems({ groupName: ref.name, nth: ref.nth }, body.catalogIds);
  }

  async function handleSubmit(submission: PickerSubmission<TemplateAddBody>) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const isApplied = await tryEdit(editOf(submission));
    setIsSubmitting(false);
    if (isApplied) onClose();
  }

  return (
    <CatalogPickerModal<TemplateAddBody>
      target={TEMPLATE_PICKER_TARGET}
      groups={groups}
      onSubmit={(submission) => void handleSubmit(submission)}
      onClose={onClose}
      isSubmitting={isSubmitting}
      submitError={editor.error}
    />
  );
}
