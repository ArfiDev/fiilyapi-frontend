"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import { invalidateAllTemplateDetails, storeDetail } from "@/lib/api/hooks/useOfferTemplateMutations";
import { offerTemplatesKey } from "@/lib/api/hooks/offer-query-keys";
import type { OfferTemplateDetail } from "@/lib/api/hooks/useOfferTemplates";
import { unwrap } from "@/lib/api/unwrap";

import { runTemplateCreate, type CreateInput, type FlowDeps, type FlowResult } from "./template-create-flow";

/**
 * `runTemplateCreate` bağımlılıkları: şablon kimliği ÇAĞRI ANINDA belli olduğundan (POST'tan sonra) kimliğe bağlı
 * `use*` mutasyon kancaları kullanılamaz; aynı uçlar + AYNI önbellek kuralı (`storeDetail`) burada.
 */
function buildDeps(queryClient: QueryClient): FlowDeps {
  const keep = async (detail: OfferTemplateDetail) => {
    await storeDetail(queryClient, detail);
    return detail;
  };
  const pathOf = (templateId: string) => ({ params: { path: { template_id: templateId } } });
  return {
    createBlank: async (body) => keep(unwrap(await backendClient.POST("/offers/templates", { body }))),
    fromOffer: async (body) => keep(unwrap(await backendClient.POST("/offers/templates/from-offer", { body }))),
    copy: async (templateId, body) =>
      keep(unwrap(await backendClient.POST("/offers/templates/{template_id}/copy", { ...pathOf(templateId), body }))),
    patch: async (templateId, body) =>
      keep(unwrap(await backendClient.PATCH("/offers/templates/{template_id}", { ...pathOf(templateId), body }))),
    putContent: async (templateId, body) =>
      keep(unwrap(await backendClient.PUT("/offers/templates/{template_id}/content", { ...pathOf(templateId), body }))),
    setDefault: async (templateId) => {
      const detail = unwrap(await backendClient.POST("/offers/templates/{template_id}/default", pathOf(templateId)));
      // Eski varsayılan AYNI işlemde düştü: liste + TÜM detaylar bayat.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: offerTemplatesKey() }),
        invalidateAllTemplateDetails(queryClient),
      ]);
      return detail;
    },
  };
}

export function useTemplateCreateFlow(): { run: (input: CreateInput) => Promise<FlowResult>; isPending: boolean } {
  const queryClient = useQueryClient();
  const deps = useMemo(() => buildDeps(queryClient), [queryClient]);
  const [isPending, setIsPending] = useState(false);
  const run = useCallback(
    async (input: CreateInput) => {
      setIsPending(true);
      try {
        return await runTemplateCreate(deps, input);
      } finally {
        setIsPending(false);
      }
    },
    [deps],
  );
  return { run, isPending };
}
