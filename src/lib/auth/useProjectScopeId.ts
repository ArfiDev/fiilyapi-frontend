"use client";

import { QueryClientContext, type QueryClient } from "@tanstack/react-query";
import { useCallback, useContext, useSyncExternalStore } from "react";

import { useSession } from "@/components/shell/SessionProvider";
import { PROJECT_QUERY_KEY, SITE_QUERY_KEY } from "@/lib/api/hooks/project-scope-query-keys";

const NO_UNSUBSCRIBE = () => {};

/**
 * Önbellekteki kimlik: önce proje detayı (`["project", anahtar]`), yoksa o projeye ait şantiye yanıtı
 * (`["site", şantiye, anahtar]` → `data.project.id`; şantiye ekranlarında proje sorgusu hiç çağrılmaz).
 */
function cachedProjectId(client: QueryClient, key: string): string | undefined {
  const project = client.getQueryData<{ id?: string }>([PROJECT_QUERY_KEY, key]);
  if (project?.id) return project.id;
  for (const query of client.getQueryCache().findAll({ queryKey: [SITE_QUERY_KEY] })) {
    const site = query.state.data as { project?: { id?: string } } | undefined;
    if (query.queryKey[2] === key && site?.project?.id) return site.project.id;
  }
  return undefined;
}

/**
 * IZN-F3.2 — adres anahtarından (UUID ya da okunur slug) proje KİMLİĞİNİ (UUID) çözer; `me.projects`
 * UUID ile anahtarlıdır. YENİ VERİ ÇEKMEZ:
 *
 * 1. Anahtar zaten `me.projects`te bir `project_id` ise olduğu gibi döner (UUID adresler).
 * 2. Değilse, ekranın/kırıntının zaten doldurduğu `["project", anahtar]` ya da şantiye yanıtı
 *    (`["site", …, anahtar]` → `project.id`) önbelleğine BAKAR (abone olur, yeniden çekmez); `QueryClientProvider` yoksa (yalın bileşen testi) sessizce atlanır.
 * 3. Çözülemezse anahtarı döndürür — `pagesForProject` eşleşme bulamaz ve ANA ROLE düşer (güvenli düşüş).
 */
export function useProjectScopeId(projectKey?: string | null): string | undefined {
  const { me } = useSession();
  const client = useContext(QueryClientContext);
  const key = projectKey ? projectKey : undefined;
  const isMemberKey = key !== undefined && (me?.projects?.some((project) => project.project_id === key) ?? false);
  const shouldLookup = client !== undefined && key !== undefined && !isMemberKey;

  const subscribe = useCallback(
    (notify: () => void) => (shouldLookup ? client.getQueryCache().subscribe(notify) : NO_UNSUBSCRIBE),
    [client, shouldLookup],
  );
  const getSnapshot = useCallback(
    () => (shouldLookup ? cachedProjectId(client, key) : undefined),
    [client, key, shouldLookup],
  );
  const cachedId = useSyncExternalStore(subscribe, getSnapshot, () => undefined);

  if (isMemberKey) return key;
  return cachedId ?? key;
}
