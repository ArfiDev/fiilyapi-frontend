import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsersScreen } from "./UsersScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push }),
  usePathname: () => "/ayarlar/kullanicilar",
}));

const ROLE = { id: "r1", key: "patron", name: "Patron", emoji: "👑", description: "Üst yönetim", is_system: true };
const MODULES = [{ id: "m1", key: "gosterge", name: "Gösterge Paneli", group: "GENEL", sort_order: 1 }];

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UsersScreen />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("UsersScreen", () => {
  it("kullanıcıları avatar, rol ve durum ile zengin tabloda listeler", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/backend/roles/") && url.includes("/permissions")) {
          return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
        }
        if (url.includes("/api/backend/roles")) {
          return new Response(JSON.stringify([ROLE]), { status: 200, headers: { "content-type": "application/json" } });
        }
        if (url.includes("/api/backend/modules")) {
          return new Response(JSON.stringify(MODULES), { status: 200, headers: { "content-type": "application/json" } });
        }
        if (url.includes("/api/backend/projects")) {
          return new Response(
            JSON.stringify({
              counts: { all: 1, taahhut: 1, kendi_yatirim: 0, kat_karsiligi: 0, completed: 0 },
              items: [{ id: "p1", code: "PRJ-1", name: "Kule A", status: "active", budget: "0", progress_pct: "0" }],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.includes("/earned-value/disciplines")) {
          return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
        }
        if (url.includes("/disciplines")) {
          return new Response(JSON.stringify({ discipline_ids: [], disciplines: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("/project-access")) {
          return new Response(JSON.stringify({ all_projects: true, project_ids: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            items: [{ id: "u1", email: "a@b.com", full_name: "Ali Veli", title: "Mühendis", role_id: "r1", status: "active" }],
            total: 8,
            limit: 20,
            offset: 0,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    renderScreen();

    expect(await screen.findByRole("cell", { name: /Ali Veli/ })).toBeInTheDocument();
    expect(screen.getByText("8 kullanıcı")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Kullanıcı Ekle" })).toBeInTheDocument();
    expect(screen.getAllByText("Patron").length).toBeGreaterThan(0);
    expect(screen.getByText("Aktif")).toBeInTheDocument();
    expect(await screen.findByText("Tüm Projeler")).toBeInTheDocument();
  });

  // 🔴 KAYIT 68/138: arama kutusu DOM'da vardı ama `value`/`onChange` YOKTU —
  // yazılan hiçbir şey listeyi süzmüyordu (tamamen dekoratif). Backend `GET
  // /users`da arama parametresi olmadığı için en küçük onarım İSTEMCİ
  // TARAFI süzgeçtir (mevcut sayfa üzerinde ad/e-posta ile filtre).
  it("arama kutusuna yazınca liste ada/e-postaya göre İSTEMCİDE süzülür", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/backend/roles/") && url.includes("/permissions")) {
          return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
        }
        if (url.includes("/api/backend/roles")) {
          return new Response(JSON.stringify([ROLE]), { status: 200, headers: { "content-type": "application/json" } });
        }
        if (url.includes("/api/backend/modules")) {
          return new Response(JSON.stringify(MODULES), { status: 200, headers: { "content-type": "application/json" } });
        }
        if (url.includes("/api/backend/projects")) {
          return new Response(
            JSON.stringify({
              counts: { all: 1, taahhut: 1, kendi_yatirim: 0, kat_karsiligi: 0, completed: 0 },
              items: [{ id: "p1", code: "PRJ-1", name: "Kule A", status: "active", budget: "0", progress_pct: "0" }],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.includes("/earned-value/disciplines")) {
          return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
        }
        if (url.includes("/disciplines")) {
          return new Response(JSON.stringify({ discipline_ids: [], disciplines: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("/project-access")) {
          return new Response(JSON.stringify({ all_projects: true, project_ids: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            items: [
              { id: "u1", email: "ali@b.com", full_name: "Ali Veli", title: "Mühendis", role_id: "r1", status: "active" },
              { id: "u2", email: "zeynep@b.com", full_name: "Zeynep Kaya", title: "Muhasebe", role_id: "r1", status: "active" },
            ],
            total: 2,
            limit: 20,
            offset: 0,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    renderScreen();

    expect(await screen.findByRole("cell", { name: /Ali Veli/ })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: /Zeynep Kaya/ })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Kullanıcı ara"), { target: { value: "zeynep" } });

    expect(screen.queryByText("Ali Veli")).not.toBeInTheDocument();
    expect(screen.getByText("Zeynep Kaya")).toBeInTheDocument();
  });
});
