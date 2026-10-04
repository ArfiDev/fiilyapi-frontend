import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RolesScreen } from "./RolesScreen";

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RolesScreen />
    </QueryClientProvider>,
  );
}

const roles = [
  { id: "r1", key: "system_admin", name: "Sistem Yöneticisi", emoji: "🛡️", description: "Tam yetki", is_system: true },
  { id: "r2", key: "saha", name: "Saha", emoji: "👷", description: "Saha ekibi", is_system: false },
];

const modules = [
  { id: "m1", key: "dashboard", name: "Gösterge Paneli", group: "GENEL", sort_order: 1 },
  { id: "m2", key: "settings", name: "Ayarlar", group: "SISTEM", sort_order: 2 },
];

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/roles/") && url.includes("/permissions")) {
        return new Response(JSON.stringify([{ module_key: "dashboard", access_level: "full", scope: "all" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/roles")) {
        return new Response(JSON.stringify(roles), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/modules")) {
        return new Response(JSON.stringify(modules), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/users")) {
        return new Response(JSON.stringify({ items: [], total: 0, limit: 200, offset: 0 }), {
          // NOT: gerçek UserResponse alanı `role_id`'dir; bu test rol-sayımı boş bırakır.
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(null), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

// Kayıt 293 — `MODULE_EMOJI` yalnız 13 anahtar taşıyordu; backend 22 modül
// tohumluyor (`seed_data.py`), eksik dokuzu (ör. `projects`) sessizce
// ikonsuz ("") basılıyordu — satır ikonsuz kalıyordu.
function stubFetchWithMissingIconModule() {
  const modulesWithMissingIcon = [...modules, { id: "m3", key: "projects", name: "Projeler", group: "GENEL", sort_order: 3 }];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/roles/") && url.includes("/permissions")) {
        return new Response(JSON.stringify([{ module_key: "dashboard", access_level: "full", scope: "all" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/roles")) {
        return new Response(JSON.stringify(roles), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/modules")) {
        return new Response(JSON.stringify(modulesWithMissingIcon), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ items: [], total: 0, limit: 200, offset: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

describe("RolesScreen", () => {
  it("MODULE_EMOJI'de olmayan modül (projects) İKONSUZ değil, yer tutucu ikonla basılır", async () => {
    stubFetchWithMissingIconModule();
    renderScreen();
    await screen.findByText("Modül Erişimleri");
    const row = document.querySelector(".role-module-row__name");
    const projectsRow = [...document.querySelectorAll(".role-module-row__name")].find((el) =>
      el.textContent?.includes("Projeler"),
    );
    expect(row).not.toBeNull();
    expect(projectsRow?.textContent?.trim()).not.toBe("Projeler");
    expect(projectsRow?.textContent?.trim().length).toBeGreaterThan("Projeler".length);
  });

  it("rol listesini gösterir ve seçili rolün detayında Modül Erişimleri listelenir", async () => {
    stubFetch();
    renderScreen();
    expect((await screen.findAllByText("Sistem Yöneticisi")).length).toBeGreaterThan(0);
    expect(screen.getByText("Saha")).toBeInTheDocument();
    expect(await screen.findByText("Modül Erişimleri")).toBeInTheDocument();
  });

  it("farklı bir rol kartına tıklayınca detay panelinde o rolün adı görünür", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Modül Erişimleri");

    await user.click(screen.getByText("Saha"));

    const head = document.querySelector(".role-detail__head");
    expect(head).not.toBeNull();
    expect(within(head as HTMLElement).getByText("Saha")).toBeInTheDocument();
  });

  it("sistem rolünde Sil kontrolü yokken özel rolde etkin Sil kontrolü vardır", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Modül Erişimleri");

    // Varsayılan seçili rol sistem rolüdür (Sistem Yöneticisi) → Sil butonu olmamalı.
    expect(screen.queryByRole("button", { name: "Sil" })).not.toBeInTheDocument();

    await user.click(screen.getByText("Saha"));

    const deleteButton = await screen.findByRole("button", { name: "Sil" });
    expect(deleteButton).toBeEnabled();
  });

  it("rol silme reddedilince modal acik kalir ve hata metni gorunur", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        const url = input.url ?? String(input);
        if (input.method === "DELETE" && url.includes("/roles/r2")) {
          return new Response(JSON.stringify({ detail: "Bu role atanmış kullanıcılar var" }), {
            status: 409,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("/roles/") && url.includes("/permissions")) {
          return new Response(JSON.stringify([{ module_key: "dashboard", access_level: "full", scope: "all" }]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("/roles")) {
          return new Response(JSON.stringify(roles), { status: 200, headers: { "content-type": "application/json" } });
        }
        if (url.includes("/modules")) {
          return new Response(JSON.stringify(modules), { status: 200, headers: { "content-type": "application/json" } });
        }
        if (url.includes("/users")) {
          return new Response(JSON.stringify({ items: [], total: 0, limit: 200, offset: 0 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify(null), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    renderScreen();
    await screen.findByText("Modül Erişimleri");

    await user.click(screen.getByText("Saha"));
    await user.click(await screen.findByRole("button", { name: "Sil" }));
    const silButtons = await screen.findAllByRole("button", { name: "Sil" });
    await user.click(silButtons[silButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText(/atanmış kullanıcılar var|hata/i)).toBeInTheDocument();
    });
    // Modal acik kalmali: onay butonu hala DOM'da.
    expect(screen.getByText(/rolünü silmek istediğinize emin misiniz/i)).toBeInTheDocument();
  });
});

// IZN-F1.3 — atanamaz roller (`is_assignable: false`) rol kartı olarak gösterilmez.
describe("RolesScreen — atanamaz roller", () => {
  it("is_assignable=false rolün kartı YOK ve izinleri istenmez; atanabilir roller görünür", async () => {
    const mixedRoles = [
      { ...roles[0], is_assignable: true },
      { ...roles[1], is_assignable: true },
      { id: "r3", key: "sayfa_rolu", name: "Sayfa Rolü", emoji: "📄", description: "", is_system: true, is_assignable: false },
    ];
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/roles/") && url.includes("/permissions")) {
        return json([{ module_key: "dashboard", access_level: "full", scope: "all" }]);
      }
      if (url.includes("/roles")) return json(mixedRoles);
      if (url.includes("/modules")) return json(modules);
      if (url.includes("/users")) return json({ items: [], total: 0, limit: 200, offset: 0 });
      return json(null);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderScreen();

    expect(await screen.findByRole("button", { name: /Saha ekibi|Saha/ })).toBeInTheDocument();
    expect(screen.queryByText("Sayfa Rolü")).not.toBeInTheDocument();
    const requested = fetchMock.mock.calls.map(([input]) => String(input));
    expect(requested.some((url) => url.includes("/roles/r3/permissions"))).toBe(false);
  });
});
