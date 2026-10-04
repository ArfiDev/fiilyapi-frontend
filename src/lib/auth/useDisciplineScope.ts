"use client";

import { QueryClientContext } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useCallback, useContext, useEffect, useSyncExternalStore } from "react";

import { useSession } from "@/components/shell/SessionProvider";
import { backendClient } from "@/lib/api/client";
import { EV_DISCIPLINES_QUERY_KEY } from "@/lib/api/hooks/catalog-query-keys";
import type { DisciplineRef } from "@/lib/api/models";
import { unwrap } from "@/lib/api/unwrap";
import { decideDisciplineScope } from "./disciplineScope";
import { useProjectScopeId } from "./useProjectScopeId";

export interface DisciplineScope {
  /** Kullanıcıya (bağlamdaki projede ya da herhangi bir projede) en az bir disiplin atanmışsa true. */
  isRestricted: boolean;
  /** Görünür disiplin adları (boş/whitespace adlar atılır → bildirim adsız metne düşer). */
  names: string[];
  /** Ad + renk çözülmüş disiplinler (avatar menüsü nokta rengi için). */
  disciplines: DisciplineRef[];
}

const NO_UNSUBSCRIBE = () => {};
const EV_DISCIPLINES_KEY = [EV_DISCIPLINES_QUERY_KEY] as const;

/**
 * Kimlik → ad/renk çözümü: şirket disiplin kataloğu (`GET /earned-value/disciplines`, `useEvDisciplines`
 * ile AYNI önbellek anahtarı). Yalnız `enabled` iken (kısıtlı kullanıcı) çekilir; 403/hata/yükleniyor →
 * `[]` (FAIL-QUIET, hata ekranı yok). `QueryClientProvider` yoksa (yalın bileşen testi) sessizce atlanır.
 * Katalog `/catalog/disciplines` DEĞİL EV ucundan okunur: o uç `contracts:view` ister; EV ucu Planlama/
 * Kullanıcı Yönetimi okuyucularına da açıktır (daha geniş erişim) ve katalog kullanıcı kapsamına göre süzülmez.
 */
function useCatalogLookup(enabled: boolean): readonly DisciplineRef[] {
  const client = useContext(QueryClientContext);
  const active = enabled && client !== undefined;

  useEffect(() => {
    if (!active) return;
    void client
      .ensureQueryData({
        queryKey: EV_DISCIPLINES_KEY,
        queryFn: async () => unwrap(await backendClient.GET("/earned-value/disciplines", {})),
      })
      .catch(() => {});
  }, [active, client]);

  const subscribe = useCallback(
    (notify: () => void) => (active ? client.getQueryCache().subscribe(notify) : NO_UNSUBSCRIBE),
    [active, client],
  );
  const getSnapshot = useCallback(
    () => (active ? client.getQueryData<readonly DisciplineRef[]>(EV_DISCIPLINES_KEY) : undefined),
    [active, client],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => undefined) ?? [];
}

/**
 * Kaynak `SessionProvider`'ın `/auth/me` yanıtıdır: `me.projects[].discipline_ids` + `me.all_projects`
 * (karar saf `decideDisciplineScope`'ta). Kimlik → AD çözümü için, YALNIZ kısıtlıyken, disiplin kataloğu
 * sorgusu önbelleğe alınır (yukarı bkz.) — kısıtsız kullanıcı için ağ isteği YOK. Oturum yokken ya da alan
 * yokken kısıtsız sayılır (fail-open).
 *
 * `projectKey`: proje bağlamı. Verilmezse adres parametresi `projectId` okunur (proje rotası dışında yok →
 * bağlamsız); `null` = bilerek BAĞLAMSIZ (avatar menüsü: tüm projelerin birleşimi). Anahtar slug olabilir,
 * UUID'ye `useProjectScopeId` ile çözülür.
 */
export function useDisciplineScope(projectKey?: string | null): DisciplineScope {
  const { me } = useSession();
  // Rota dışında (ya da yalın testte) `useParams()` `null` dönebilir → bağlamsız.
  const params = useParams<{ projectId?: string }>();
  const routeProjectId = typeof params?.projectId === "string" ? params.projectId : undefined;
  const key = projectKey === null ? undefined : (projectKey ?? routeProjectId);
  const projectId = useProjectScopeId(key);
  const { isRestricted, disciplineIds } = decideDisciplineScope(me, projectId);
  const catalog = useCatalogLookup(isRestricted);

  const disciplines = disciplineIds.flatMap((id) => {
    const found = catalog.find((discipline) => discipline.id === id);
    return found && found.name.trim() !== "" ? [{ id: found.id, code: found.code, name: found.name, color: found.color }] : [];
  });
  return { isRestricted, names: disciplines.map((discipline) => discipline.name), disciplines };
}
