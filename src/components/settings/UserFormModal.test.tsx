import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserFormModal } from "./UserFormModal";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

function renderModal(onClose: () => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UserFormModal mode="create" onClose={onClose} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("UserFormModal (create)", () => {
  it("bos ad soyad ile dogrulama hatasi gosterir", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify([{ id: "r1", key: "patron", name: "Patron", emoji: "", description: "", is_system: true }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    renderModal(() => {});
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(await screen.findByText("Ad soyad zorunludur.")).toBeInTheDocument();
  });

  it("gecerli form POST /users cagirir ve kapanir", async () => {
    // NOT: backendClient'in ozel fetch sarmalayicisi (bkz. src/lib/api/client.ts)
    // openapi-fetch'in olusturdugu Request'i globalThis.fetch'e TEK argumanla
    // iletir (init ayri gecmez); yontem bilgisi bu yuzden `init?.method` yerine
    // Request nesnesinin kendi `.method` alanindan okunmali.
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const request = input as Request;
      const url = String(request);
      if (url.includes("/api/backend/roles")) {
        return new Response(JSON.stringify([{ id: "r1", key: "patron", name: "Patron", emoji: "", description: "", is_system: true }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/backend/users") && request.method === "POST") {
        return new Response(JSON.stringify({ id: "u9", email: "a@b.com", full_name: "Ali", title: "", role_id: "r1", status: "active" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const onClose = vi.fn();
    renderModal(onClose);
    await screen.findByRole("option", { name: "Patron" });

    await userEvent.type(screen.getByLabelText("Ad Soyad"), "Ali");
    await userEvent.type(screen.getByLabelText("E-posta"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Parola"), "parola12");
    await userEvent.selectOptions(screen.getByLabelText("Rol"), "r1");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const postCall = fetchMock.mock.calls.find(([u]) => String(u).includes("/users") && (u as Request).method === "POST");
    expect(postCall).toBeTruthy();
  });
});

describe("UserFormModal — kaydedilmemiş değişiklik kaydı (create)", () => {
  it("açıldı + dokunulmadı → false", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } })));
    renderModal(() => {});
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("ad soyad yazıldı → true", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } })));
    renderModal(() => {});
    await userEvent.type(screen.getByLabelText("Ad Soyad"), "Ali");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt (onSuccess: onClose) → unmount ile false", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const request = input as Request;
      const url = String(request);
      if (url.includes("/api/backend/roles")) {
        return new Response(JSON.stringify([{ id: "r1", key: "patron", name: "Patron", emoji: "", description: "", is_system: true }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/backend/users") && request.method === "POST") {
        return new Response(JSON.stringify({ id: "u9", email: "a@b.com", full_name: "Ali", title: "", role_id: "r1", status: "active" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const onClose = vi.fn();
    const { unmount } = renderModal(onClose);
    await screen.findByRole("option", { name: "Patron" });
    await userEvent.type(screen.getByLabelText("Ad Soyad"), "Ali");
    await userEvent.type(screen.getByLabelText("E-posta"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Parola"), "parola12");
    await userEvent.selectOptions(screen.getByLabelText("Rol"), "r1");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
