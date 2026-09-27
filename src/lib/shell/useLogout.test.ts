import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLogout } from "./useLogout";
import { saveWorkspaceTabs, workspaceTabsStorageKey } from "@/lib/workspace-tabs/persistence";
import { openTab } from "@/lib/workspace-tabs/tabs-reducer";
import { workspaceTabsStore } from "@/lib/workspace-tabs/tabs-store";
import { initialTabsState } from "@/lib/workspace-tabs/types";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  pushMock.mockReset();
});

describe("useLogout", () => {
  it("logout endpoint'ini POST ile çağırır ve başarılı yanıtta /login'e yönlendirir", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const { result } = renderHook(() => useLogout());

    await act(async () => {
      await result.current.logout();
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
    expect(pushMock).toHaveBeenCalledWith("/login");
    expect(result.current.error).toBeNull();
  });

  it("BFF başarısız yanıt döndürdüğünde yönlendirmez ve görünür hata basar", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    const { result } = renderHook(() => useLogout());

    await act(async () => {
      await result.current.logout();
    });

    expect(pushMock).not.toHaveBeenCalled();
    expect(result.current.error).toBe("Çıkış yapılamadı, tekrar deneyin.");
  });

  it("ağ hatasında (fetch reddi) sessizce yutmaz, görünür hata basar ve yönlendirmez", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useLogout());

    await act(async () => {
      await result.current.logout();
    });

    expect(pushMock).not.toHaveBeenCalled();
    expect(result.current.error).toBe("Çıkış yapılamadı, tekrar deneyin.");
  });
});

/**
 * SEKME-F1.4a — KARARLAR §1.10 (5): kullanıcı Çıkış'a basarsa açık sekmeler
 * TEMİZLENİR; oturum süresi dolup yeniden girişte ise geri gelir (bu yüzden
 * temizlik YALNIZ başarılı çıkış yanıtında yapılır).
 */
describe("useLogout · çalışma sekmeleri temizliği", () => {
  const KEY = workspaceTabsStorageKey("u-1");

  function seedTabs(): void {
    const saved = openTab(initialTabsState(1), { newTabId: "a", url: "/projeler", now: 2 });
    saveWorkspaceTabs("u-1", saved, window.localStorage);
    workspaceTabsStore.detachUser();
    workspaceTabsStore.attachUser("u-1");
  }

  afterEach(() => {
    workspaceTabsStore.detachUser();
    window.localStorage.clear();
  });

  it("başarılı çıkış: kayıt silinir, mağaza ayrılır (bellek panele döner) — push'tan ÖNCE", async () => {
    seedTabs();
    expect(workspaceTabsStore.getSnapshot().tabs).toHaveLength(2);
    let storageAtPush: string | null = "henüz-çağrılmadı";
    pushMock.mockImplementation(() => {
      storageAtPush = window.localStorage.getItem(KEY);
    });
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const { result } = renderHook(() => useLogout());

    await act(async () => {
      await result.current.logout();
    });

    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(storageAtPush).toBeNull();
    expect(workspaceTabsStore.getSnapshot().tabs).toHaveLength(1);
    // Ayrıldıktan sonraki eylem hiçbir anahtara YAZILMAZ.
    workspaceTabsStore.dispatch(openTab, { url: "/hazine" });
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("başarısız çıkış (500): kayıt ve mağaza DOKUNULMADAN kalır", async () => {
    seedTabs();
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    const { result } = renderHook(() => useLogout());

    await act(async () => {
      await result.current.logout();
    });

    expect(window.localStorage.getItem(KEY)).not.toBeNull();
    expect(workspaceTabsStore.getSnapshot().tabs).toHaveLength(2);
  });

  it("ağ hatası: kayıt ve mağaza DOKUNULMADAN kalır", async () => {
    seedTabs();
    vi.spyOn(global, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useLogout());

    await act(async () => {
      await result.current.logout();
    });

    expect(window.localStorage.getItem(KEY)).not.toBeNull();
    expect(workspaceTabsStore.getSnapshot().tabs).toHaveLength(2);
  });
});
