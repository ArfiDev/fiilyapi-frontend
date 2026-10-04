import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PermissionMatrix } from "./PermissionMatrix";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn() }),
}));

function renderMatrix() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PermissionMatrix />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PermissionMatrix", () => {
  it("grup basligi + modul satiri + rol sutunu render eder", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/backend/modules")) {
          return new Response(
            JSON.stringify([{ id: "m1", key: "raporlar", name: "Raporlar", group: "GENEL", sort_order: 1 }]),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        // /roles/r1/permissions — spesifik yol kontrolu, genel "/roles"
        // kontrolunden ONCE gelmeli (aksi halde substring eslesmesi bu istegi
        // yanlislikla rol listesi dalina dusurur ve hucreler hep bos kalir).
        if (url.includes("/permissions")) {
          return new Response(JSON.stringify([{ module_key: "raporlar", access_level: "view", scope: "all" }]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("/api/backend/roles")) {
          return new Response(
            JSON.stringify([{ id: "r1", key: "saha", name: "Saha", emoji: "", description: "", is_system: false }]),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );

    renderMatrix();
    expect(await screen.findByText("Genel")).toBeInTheDocument();
    expect(screen.getByText("Raporlar")).toBeInTheDocument();
    expect(screen.getByText("Saha")).toBeInTheDocument();
    // hucre secimi mevcut preset'i ("Görüntüle") gosterir
    expect(await screen.findByDisplayValue("Görüntüle")).toBeInTheDocument();
    // lejant erisim duzeyi acikamalarini gosterir
    expect(screen.getByText("Erişim düzeyleri")).toBeInTheDocument();
    expect(screen.getByText("Modülde her şey: oluştur, düzenle ve sil. En üst yetki.")).toBeInTheDocument();
  });

  it("mali grubunda modulleri sort_order ile siralar (fatura yonetimi dahil)", async () => {
    // Matris veri-guduml: modul sayisi/sirasi tamamen /modules yanitindan gelir.
    const modules = [
      { id: "m-treasury", key: "treasury", name: "Hazine", group: "MALI", sort_order: 12 },
      { id: "m-accounting", key: "accounting", name: "Muhasebe", group: "MALI", sort_order: 10 },
      { id: "m-invoicing", key: "invoicing", name: "Fatura Yönetimi", group: "MALI", sort_order: 11 },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const json = (body: unknown) =>
          new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
        if (url.includes("/api/backend/modules")) return json(modules);
        if (url.includes("/permissions")) {
          return json(modules.map((m) => ({ module_key: m.key, access_level: "view", scope: "all" })));
        }
        if (url.includes("/api/backend/roles")) {
          return json([{ id: "r1", key: "accounting", name: "Muhasebe", emoji: "", description: "", is_system: false }]);
        }
        return json([]);
      }),
    );

    renderMatrix();
    expect(await screen.findByText("Fatura Yönetimi")).toBeInTheDocument();
    const rowHeaders = screen.getAllByRole("rowheader").map((el) => el.textContent);
    expect(rowHeaders).toEqual(["Muhasebe", "Fatura Yönetimi", "Hazine"]);
  });

  // Kayıt 281 — `permQueries` (rol başına izin hücreleri) bekleyişe dahil
  // DEĞİLDİ: modüller+roller gelir gelmez matris etkileşime açılıyor, henüz
  // yüklenmemiş roller için hücreler `[]`e (→ "— (Yok)" preset'i) düşüyor ve
  // kullanıcı GERÇEK değeri görmeden yazabiliyordu.
  it("/permissions henuz gelmemisken matris hala 'Yukleniyor…' basar, sahte '— (Yok)' GOSTERMEZ", async () => {
    let resolvePermissions: (value: Response) => void = () => undefined;
    const permissionsPromise = new Promise<Response>((resolve) => {
      resolvePermissions = resolve;
    });
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/backend/modules")) {
        return json([{ id: "m1", key: "raporlar", name: "Raporlar", group: "GENEL", sort_order: 1 }]);
      }
      if (url.includes("/permissions")) {
        return permissionsPromise;
      }
      if (url.includes("/api/backend/roles")) {
        return json([{ id: "r1", key: "saha", name: "Saha", emoji: "", description: "", is_system: false }]);
      }
      return json([]);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderMatrix();

    // Modüller+roller ÇÖZÜLDÜ (kanıt: `/permissions` isteği atıldı — bu
    // istek roller gelmeden ATILAMAZ, `roleIds` rollerin kendisinden gelir)
    // ama izin hücreleri HÂLÂ uçuşta — matris hücreleri GERÇEK değer
    // olmadan interaktif basılmamalı.
    await waitFor(() => {
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/permissions"))).toBe(true);
    });
    expect(screen.getByText("Yükleniyor…")).toBeInTheDocument();
    expect(screen.queryByText("Raporlar")).not.toBeInTheDocument();

    resolvePermissions(json([{ module_key: "raporlar", access_level: "view", scope: "all" }]));

    expect(await screen.findByText("Raporlar")).toBeInTheDocument();
  });

  it("hucre guncellemesi reddedilince hata mesaji gosterir", async () => {
    const user = userEvent.setup();
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        const url = input.url ?? String(input);
        if (input.method === "PUT" && url.includes("/permissions/")) {
          return json({ detail: "Bu değişiklik reddedildi" }, 409);
        }
        if (url.includes("/api/backend/modules")) {
          return json([{ id: "m1", key: "raporlar", name: "Raporlar", group: "GENEL", sort_order: 1 }]);
        }
        if (url.includes("/permissions")) {
          return json([{ module_key: "raporlar", access_level: "view", scope: "all" }]);
        }
        if (url.includes("/api/backend/roles")) {
          return json([{ id: "r1", key: "saha", name: "Saha", emoji: "", description: "", is_system: false }]);
        }
        return json([]);
      }),
    );

    renderMatrix();
    const select = await screen.findByDisplayValue("Görüntüle");
    await user.selectOptions(select, "full");

    await waitFor(() => {
      expect(screen.getByText(/reddedildi|hata/i)).toBeInTheDocument();
    });
  });
});

// IZN-F1.2 — atanamaz roller (`is_assignable: false`) eski matriste sütun olmaz.
describe("PermissionMatrix — atanamaz roller", () => {
  it("is_assignable=false rolün sütunu YOK ve izinleri istenmez; atanabilir rol sütunu var", async () => {
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/backend/modules")) {
        return json([{ id: "m1", key: "raporlar", name: "Raporlar", group: "GENEL", sort_order: 1 }]);
      }
      if (url.includes("/permissions")) return json([{ module_key: "raporlar", access_level: "view", scope: "all" }]);
      if (url.includes("/api/backend/roles")) {
        return json([
          { id: "r1", key: "saha", name: "Saha", emoji: "", description: "", is_system: false, is_assignable: true },
          { id: "r2", key: "sayfa_rolu", name: "Sayfa Rolü", emoji: "", description: "", is_system: true, is_assignable: false },
        ]);
      }
      return json([]);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderMatrix();

    expect(await screen.findByRole("columnheader", { name: /Saha/ })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /Sayfa Rolü/ })).not.toBeInTheDocument();
    const requested = fetchMock.mock.calls.map(([input]) => String(input));
    expect(requested.some((url) => url.includes("/roles/r1/permissions"))).toBe(true);
    expect(requested.some((url) => url.includes("/roles/r2/permissions"))).toBe(false);
  });
});
