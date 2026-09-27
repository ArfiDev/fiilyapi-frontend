import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ProjectCreateView } from "./ProjectCreateView";
import { useCreateProject } from "@/lib/api/hooks/useProjectMutations";
import { useEmployers } from "@/lib/api/hooks/useEmployers";
import { useCreateEmployer } from "@/lib/api/hooks/useEmployerMutations";
import { useUsers } from "@/lib/api/hooks/useUsers";
import { BackendError } from "@/lib/api/unwrap";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
}));
vi.mock("@/lib/api/hooks/useProjectMutations", () => ({ useCreateProject: vi.fn() }));
vi.mock("@/lib/api/hooks/useEmployers", () => ({ useEmployers: vi.fn() }));
vi.mock("@/lib/api/hooks/useEmployerMutations", () => ({ useCreateEmployer: vi.fn() }));
vi.mock("@/lib/api/hooks/useUsers", () => ({ useUsers: vi.fn() }));

const mutate = vi.fn();

const EMPLOYERS = [
  {
    id: "emp-1",
    name: "Güneşkent Gayrimenkul A.Ş.",
    tax_number: "9876543210",
    contact_person: "Ahmet Güneş",
    is_active: true,
  },
];

function mockHooks() {
  vi.mocked(useCreateProject).mockReturnValue({ mutate, isPending: false } as never);
  vi.mocked(useEmployers).mockReturnValue({ data: { items: EMPLOYERS } } as never);
  vi.mocked(useCreateEmployer).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as never);
  vi.mocked(useUsers).mockReturnValue({
    data: { items: [{ id: "u-1", full_name: "Mehmet Yılmaz" }] },
  } as never);
}

/** Gönderilen tek gövdeyi döndürür. */
function submittedBody(): Record<string, unknown> {
  expect(mutate).toHaveBeenCalledTimes(1);
  return mutate.mock.calls[0][0] as Record<string, unknown>;
}

/** Zorunlu alanları dolu geçerli bir taahhüt formu doldurur. */
async function fillValidContracting(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Proje Adı"), "Güneşkent Konut Kompleksi");
  await user.selectOptions(screen.getByLabelText("Tür"), "Konut");
  await user.type(screen.getByLabelText("İl / İlçe"), "Çankaya / Ankara");
  await user.selectOptions(screen.getByLabelText("İşveren Firma"), "emp-1");
  await user.type(screen.getByLabelText("Sözleşme No"), "SZL-2026-005");
  await user.type(screen.getByLabelText("İmza Tarihi"), "10.01.2026");
  await user.type(screen.getByLabelText("Sözleşme Bedeli (₺)"), "22400000");
  await user.type(screen.getByLabelText("Başlangıç Tarihi"), "01.02.2026");
  await user.type(screen.getByLabelText("Bitiş Tarihi"), "01.11.2027");
  await user.type(screen.getByLabelText("Baz Endeks Değeri (D0)"), "1.000");
}

describe("ProjectCreateView — sayfa kabuğu (F5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHooks();
  });

  it("tek h1 ve kırıntı yolu render eder", () => {
    render(<ProjectCreateView />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Yeni Proje");
    expect(screen.getByText("Projeler", { selector: "a" })).toBeInTheDocument();
  });

  it("İptal /projeler'e döner", async () => {
    render(<ProjectCreateView />);
    const cancels = screen.getAllByRole("button", { name: "İptal" });
    await userEvent.click(cancels[0]);
    expect(nav.push).toHaveBeenCalledWith("/projeler");
  });

  it("Projeyi Oluştur ve Taslak Kaydet eylemleri görünür", () => {
    render(<ProjectCreateView />);
    expect(
      screen.getAllByRole("button", { name: "Projeyi Oluştur" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Taslak Kaydet" }),
    ).toBeInTheDocument();
  });
});

describe("ProjectCreateView — kart montajı (F12)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHooks();
  });

  it("taahhütte işveren + sözleşme kartları görünür, tip grupları görünmez", () => {
    render(<ProjectCreateView />);
    expect(screen.getByLabelText("İşveren Firma")).toBeInTheDocument();
    expect(screen.getByLabelText("Sözleşme No")).toBeInTheDocument();
    expect(screen.queryByLabelText("Satış Hedefi (₺)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Arsa Sahibi")).not.toBeInTheDocument();
  });

  it("her tipte temel bilgiler, şantiyeler, bütçe ve belge kartı durur", () => {
    render(<ProjectCreateView />);
    expect(screen.getByLabelText("Proje Adı")).toBeInTheDocument();
    expect(screen.getByLabelText("Şantiye Adı")).toBeInTheDocument();
    expect(screen.getByLabelText("Malzeme Bütçesi (₺)")).toBeInTheDocument();
    expect(screen.getByText("📎 Proje Belgeleri")).toBeInTheDocument();
  });

  it("Kendi Yatırım seçilince işveren/sözleşme kaybolur, yatırım alanları gelir", async () => {
    const user = userEvent.setup();
    render(<ProjectCreateView />);
    await user.click(screen.getByRole("radio", { name: /Kendi Yatırım/ }));
    expect(screen.queryByLabelText("İşveren Firma")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Sözleşme No")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Satış Hedefi (₺)")).toBeInTheDocument();
  });

  it("Kat Karşılığı seçilince kat karşılığı alanları gelir", async () => {
    const user = userEvent.setup();
    render(<ProjectCreateView />);
    await user.click(screen.getByRole("radio", { name: /Kat Karşılığı/ }));
    expect(screen.queryByLabelText("İşveren Firma")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Arsa Sahibi")).toBeInTheDocument();
    expect(screen.getByLabelText("Müteahhit Payı (%)")).toBeInTheDocument();
  });
});

describe("ProjectCreateView — gönderim (F12)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHooks();
  });

  it("Taslak Kaydet, eksik zorunlu alanlara rağmen is_draft:true ile POST atar", async () => {
    const user = userEvent.setup();
    render(<ProjectCreateView />);
    await user.type(screen.getByLabelText("Proje Adı"), "Taslak Proje");
    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    const body = submittedBody();
    expect(body.is_draft).toBe(true);
    expect(body.name).toBe("Taslak Proje");
    // Eksik zorunlu alanlar hata basmadı.
    expect(screen.queryByText("İl / ilçe zorunludur.")).not.toBeInTheDocument();
  });

  it("Taslak Kaydet, ad boşken POST atmaz", async () => {
    const user = userEvent.setup();
    render(<ProjectCreateView />);
    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Proje adı zorunludur.")).toBeInTheDocument();
  });

  it("taslakta tutarlılık hatası POST'u engeller", async () => {
    const user = userEvent.setup();
    render(<ProjectCreateView />);
    await user.type(screen.getByLabelText("Proje Adı"), "Taslak Proje");
    await user.type(screen.getByLabelText("Başlangıç Tarihi"), "01.05.2026");
    await user.type(screen.getByLabelText("Bitiş Tarihi"), "01.04.2026");
    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    expect(mutate).not.toHaveBeenCalled();
    expect(
      screen.getByText("Bitiş tarihi başlangıçtan önce olamaz."),
    ).toBeInTheDocument();
  });

  it("zorunlu alan eksikken Projeyi Oluştur POST atmaz ve ilk hatalı alana odaklanır", async () => {
    const user = userEvent.setup();
    render(<ProjectCreateView />);
    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));
    // Yukarıdaki tıklama yalnız ad hatası basar; şimdi tam doğrulama:
    await user.click(
      screen.getAllByRole("button", { name: "Projeyi Oluştur" })[0],
    );

    expect(mutate).not.toHaveBeenCalled();
    const nameInput = screen.getByLabelText("Proje Adı");
    expect(nameInput).toHaveFocus();
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
  });

  it("her doğrulama mesajı birebir metniyle basılır ve alana bağlanır", async () => {
    const user = userEvent.setup();
    render(<ProjectCreateView />);
    await user.click(
      screen.getAllByRole("button", { name: "Projeyi Oluştur" })[0],
    );

    for (const message of [
      "Proje adı zorunludur.",
      "Tür seçiniz.",
      "İl / ilçe zorunludur.",
      "İşveren firma seçiniz.",
      "Sözleşme no zorunludur.",
      "İmza tarihi zorunludur.",
      "Sözleşme bedeli sayı olmalıdır.",
      "Endeks tipi ve baz endeks değeri zorunludur.",
    ]) {
      expect(screen.getByText(message)).toBeInTheDocument();
    }
    expect(
      screen.getAllByText("Başlangıç ve bitiş tarihi zorunludur.").length,
    ).toBe(2);

    // aria-describedby ile bağlanma (Field katmanı)
    const nameInput = screen.getByLabelText("Proje Adı");
    const describedBy = nameInput.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)).toHaveTextContent(
      "Proje adı zorunludur.",
    );
  });

  it("geçerli formda is_draft:false ile POST atar ve başarıda /projeler'e döner", async () => {
    const user = userEvent.setup();
    mutate.mockImplementation((_body, opts) => opts.onSuccess?.({ id: "p-1" }));
    render(<ProjectCreateView />);
    await fillValidContracting(user);
    await user.click(
      screen.getAllByRole("button", { name: "Projeyi Oluştur" })[0],
    );

    const body = submittedBody();
    expect(body.is_draft).toBe(false);
    expect(body.employer_id).toBe("emp-1");
    expect(nav.push).toHaveBeenCalledWith("/projeler");
  });

  it("sunucu 409'unda kod çakışması mesajı basılır", async () => {
    const user = userEvent.setup();
    mutate.mockImplementation((_body, opts) =>
      opts.onError?.(new BackendError(409, { detail: "duplicate key" })),
    );
    render(<ProjectCreateView />);
    await fillValidContracting(user);
    await user.click(
      screen.getAllByRole("button", { name: "Projeyi Oluştur" })[0],
    );

    expect(
      screen.getByText("Proje kodu üretilemedi, tekrar deneyin."),
    ).toBeInTheDocument();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("diğer sunucu hataları backendErrorMessage ile gösterilir", async () => {
    const user = userEvent.setup();
    mutate.mockImplementation((_body, opts) =>
      opts.onError?.(
        new BackendError(422, { detail: "Şantiye adı zaten kullanımda." }),
      ),
    );
    render(<ProjectCreateView />);
    await fillValidContracting(user);
    await user.click(
      screen.getAllByRole("button", { name: "Projeyi Oluştur" })[0],
    );

    expect(
      screen.getByText("Şantiye adı zaten kullanımda."),
    ).toBeInTheDocument();
  });
});

describe("ProjectCreateView — SEKME-F1.3b kaydedilmemiş değişiklik kaydı", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHooks();
  });

  it("açıldı/dokunulmadı → false; proje adı yazıldı → true; başarılı kayıt → false (unmount)", async () => {
    const user = userEvent.setup();
    mutate.mockImplementation((_body, opts) => opts.onSuccess?.({ id: "prj-1" }));
    const { unmount } = render(<ProjectCreateView />);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    await user.type(screen.getByLabelText("Proje Adı"), "Güneşkent Konut Kompleksi");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
