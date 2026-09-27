"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { routes } from "@/lib/routes";
import { clearAllWorkspaceTabs } from "@/lib/workspace-tabs/persistence";
import { workspaceTabsStore } from "@/lib/workspace-tabs/tabs-store";

export const LOGOUT_ERROR_MESSAGE = "Çıkış yapılamadı, tekrar deneyin.";

export interface UseLogoutResult {
  logout: () => Promise<void>;
  error: string | null;
}

/**
 * Oturumu kapatır: BFF çıkış ucunu çağırır ve /login'e yönlendirir. Sunucu-taraflı
 * iptali (token_version) BFF kendi içinde backend'e ileterek yapar; bkz.
 * src/app/api/auth/logout/route.ts.
 * Sidebar/Ayarlar sidebar/breadcrumb gibi birden fazla yerde tekrarlanan çıkış
 * mantığını tek noktadan sağlar.
 *
 * 🔴 Ne `response.ok` kontrolsüz ne `try/catch`siz bırakılmaz:
 * (a) BFF 403/500 dönse bile koşulsuz /login'e atılırsa sunucu oturumu
 *     GERÇEKTEN kapatmamış olsa bile kullanıcı "çıkış yaptım" sanır.
 * (b) `fetch` ağ hatasıyla REDDEDERSE (offline) yakalanmamış bir promise
 *     reddi kullanıcıya sessizce kalır. Yalnız BAŞARILI yanıtta yönlendirilir;
 *     diğerlerinde çağırana görünür bir hata döner, sessiz yutma YOKTUR.
 *
 * SEKME-F1.4a · KARARLAR §1.10 (5): Çıkış'ta açık çalışma sekmeleri
 * TEMİZLENİR — yalnız BAŞARILI yanıtta ve yönlendirmeden ÖNCE: önce mağaza
 * ayrılır (bellek panele döner, sonraki eylemler hiçbir anahtara yazılmaz),
 * sonra önekli TÜM anahtarlar silinir. Başarısız çıkışta oturum sürüyor
 * demektir, hiçbir şey silinmez. Oturumun süresi dolup yeniden girişte
 * (middleware `?next=`) bu yol koşmaz, sekmeler geri gelir.
 */
export function useLogout(): UseLogoutResult {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const logout = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) {
        setError(LOGOUT_ERROR_MESSAGE);
        return;
      }
      workspaceTabsStore.detachUser();
      clearAllWorkspaceTabs();
      router.push(routes.login());
    } catch {
      setError(LOGOUT_ERROR_MESSAGE);
    }
  }, [router]);

  return { logout, error };
}
