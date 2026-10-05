import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { PurchaseRequestForm } from "./PurchaseRequestForm";
import { PURCHASE_REQUEST_NO_PLACEHOLDER } from "./purchase-request-form-constants";
import { useSession } from "@/components/shell/SessionProvider";
import { BackendError } from "@/lib/api/unwrap";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { useSites } from "@/lib/api/hooks/useSites";
import { useSiteSections } from "@/lib/api/hooks/useSiteSections";
import { useStockSummary } from "@/lib/api/hooks/useStockSummary";
import { useSuppliers } from "@/lib/api/hooks/useSuppliers";
import {
  useCreatePurchaseRequest,
  useSubmitPurchaseRequest,
  useUpdatePurchaseRequest,
} from "@/lib/api/hooks/usePurchaseRequestMutations";
import { useApprovalSettings } from "@/lib/api/hooks/useApprovals";
import type { MeResponse } from "@/lib/auth/types";
import type { components } from "@/lib/api/schema";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useProjects", () => ({ useProjects: vi.fn() }));
vi.mock("@/lib/api/hooks/useSites", () => ({ useSites: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteSections", () => ({
  useSiteSections: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useStockSummary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useStockSummary")>()),
  useStockSummary: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSuppliers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSuppliers")>()),
  useSuppliers: vi.fn(),
}));
vi.mock("@/lib/api/hooks/usePurchaseRequestMutations", () => ({
  useCreatePurchaseRequest: vi.fn(),
  useUpdatePurchaseRequest: vi.fn(),
  useSubmitPurchaseRequest: vi.fn(),
}));
/* Onay eşiği artık SUNUCUDAN gelir — kutu `GET /approvals/settings` okur. */
vi.mock("@/lib/api/hooks/useApprovals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useApprovals")>()),
  useApprovalSettings: vi.fn(),
}));

/**
 * React Query sonucunun 20+ alanını fikstürde yeniden üretmemek için (E12 deseni).
 * Çağıran hangi hook'un dönüşünü taklit ettiğini TİP PARAMETRESİYLE söyler.
 */
function queryStub<T>(
  data: unknown,
  extra: Partial<{ isLoading: boolean; isError: boolean; error: unknown }> = {},
): T {
  return {
    data,
    isLoading: extra.isLoading ?? false,
    isError: extra.isError ?? false,
    error: extra.error ?? null,
  } as unknown as T;
}

/** Sunucunun döndürdüğü taslak talep — şemanın ZORUNLU alanları eksiksiz. */
const createdRequest: components["schemas"]["PurchaseRequestResponse"] = {
  id: "pr-1",
  request_no: "SAT-2026-0101",
  request_date: "2026-08-12",
  priority: "normal",
  project_id: "p-1",
  site_id: null,
  section_id: null,
  needed_by: null,
  justification: null,
  status: "draft",
  quote_deadline: null,
  approved_by_user_id: null,
  approved_at: null,
  rejected_at: null,
  rejection_reason: null,
  created_by_user_id: "u-1",
  created_at: "2026-08-12T09:00:00Z",
  estimated_total: "0.00",
  can_delete: true,
  lines: [],
};

let createMutateAsync: ReturnType<typeof vi.fn>;
let updateMutateAsync: ReturnType<typeof vi.fn>;
let submitMutateAsync: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  createMutateAsync = vi.fn().mockResolvedValue(createdRequest);
  updateMutateAsync = vi.fn().mockResolvedValue(createdRequest);
  submitMutateAsync = vi
    .fn()
    .mockResolvedValue({ ...createdRequest, status: "pending_approval" });

  vi.mocked(useSession).mockReturnValue({
    me: { permissions: { procurement: "full" } } as unknown as MeResponse,
    isLoading: false,
  } as ReturnType<typeof useSession>);
  // Sunucu eşiği (`approval_threshold_try`) — bu kümenin hükümleri onunla kurulur.
  vi.mocked(useApprovalSettings).mockReturnValue(
    queryStub<ReturnType<typeof useApprovalSettings>>({
      approval_threshold_try: "500000.00",
    }),
  );
  vi.mocked(useProjects).mockReturnValue(
    queryStub<ReturnType<typeof useProjects>>({
      items: [{ id: "p-1", name: "Güneşkent A-Blok" }],
      total: 1,
    }),
  );
  vi.mocked(useSites).mockReturnValue(
    queryStub<ReturnType<typeof useSites>>({
      items: [{ id: "st-1", name: "Kuzey Şantiye" }],
    }),
  );
  vi.mocked(useSiteSections).mockReturnValue(
    queryStub<ReturnType<typeof useSiteSections>>({ items: [] }),
  );
  vi.mocked(useStockSummary).mockReturnValue(
    queryStub<ReturnType<typeof useStockSummary>>({
      items: [
        {
          id: "s-1",
          code: "DMR-012",
          name: "Nervürlü Demir Ø12",
          category: "steel",
          unit: "Ton",
          min_stock: "5",
          balance: "2.4",
          status: "critical",
          last_unit_price: "21500",
          warehouses: [],
        },
      ],
      total: 1,
      limit: 200,
      offset: 0,
      kpis: {},
    }),
  );
  vi.mocked(useSuppliers).mockReturnValue(
    queryStub<ReturnType<typeof useSuppliers>>({
      items: [{ id: "sup-1", name: "Demirsan A.Ş." }],
      total: 1,
    }),
  );
  vi.mocked(useCreatePurchaseRequest).mockReturnValue({
    mutateAsync: createMutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof useCreatePurchaseRequest>);
  vi.mocked(useUpdatePurchaseRequest).mockReturnValue({
    mutateAsync: updateMutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof useUpdatePurchaseRequest>);
  vi.mocked(useSubmitPurchaseRequest).mockReturnValue({
    mutateAsync: submitMutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof useSubmitPurchaseRequest>);
});

/**
 * Alt eylem şeridindeki "Onaya Gönder" (FST 173). Mockup düğmeyi İKİ yerde
 * çizer (40 üst bar · 173 alt şerit) — ikisi de aynı akışı tetikler, test
 * belirsizliği önlemek için alttakini seçer.
 */
function submitButton(): HTMLElement {
  return screen.getAllByRole("button", { name: "Onaya Gönder" })[1];
}

/** Onaya gönderilebilir bir formu doldurur (proje + tarih + tam kalem). */
function fillSubmittableForm() {
  fireEvent.change(screen.getByTestId("talep-proje"), {
    target: { value: "p-1" },
  });
  fireEvent.change(screen.getByTestId("talep-ihtiyac-tarihi"), {
    target: { value: "20.08.2026" },
  });
  fireEvent.change(screen.getByTestId("talep-malzeme-0"), {
    target: { value: "s-1" },
  });
  fireEvent.change(screen.getByTestId("talep-miktar-0"), {
    target: { value: "15" },
  });
  fireEvent.change(screen.getByTestId("talep-fiyat-0"), {
    target: { value: "21500" },
  });
}

describe("FST · başlık ve talep numarası", () => {
  it("mockup başlığını ve alt cümlesini basar (47-48)", () => {
    render(<PurchaseRequestForm />);

    expect(
      screen.getByRole("heading", { name: "Satın Alma Talebi" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Talep onaylandıktan sonra tedarikçilerden teklif toplanır",
      ),
    ).toBeInTheDocument();
  });

  it("Talep No SALT-OKUNURDUR ve kayıttan önce UYDURMA numara BASILMAZ (53)", () => {
    render(<PurchaseRequestForm />);

    const field = screen.getByTestId("talep-no") as HTMLInputElement;
    expect(field).toHaveAttribute("readonly");
    expect(field.value).toBe("");
    expect(field.placeholder).toBe(PURCHASE_REQUEST_NO_PLACEHOLDER);
    // Mockup'ın örnek numarası ekrana KAÇMAZ.
    expect(screen.queryByDisplayValue("SAT-2026-0058")).not.toBeInTheDocument();
  });

  it("yazma yetkisi yoksa form hiç basılmaz", () => {
    vi.mocked(useSession).mockReturnValue({
      me: { permissions: { procurement: "view" } } as unknown as MeResponse,
      isLoading: false,
    } as ReturnType<typeof useSession>);

    render(<PurchaseRequestForm />);

    expect(screen.queryByTestId("talep-body")).not.toBeInTheDocument();
  });

  it("proje listesi 403 dönerse erişim reddedilir", () => {
    vi.mocked(useProjects).mockReturnValue(
      queryStub<ReturnType<typeof useProjects>>(undefined, {
        isError: true,
        error: new BackendError(403, {}),
      }),
    );

    render(<PurchaseRequestForm />);

    expect(screen.queryByTestId("talep-body")).not.toBeInTheDocument();
  });
});

describe("FST · kalem satırları", () => {
  it("stok kartı seçilince birim ve MEVCUT STOK sunucudan gelir (75/84/85)", () => {
    render(<PurchaseRequestForm />);

    fireEvent.change(screen.getByTestId("talep-malzeme-0"), {
      target: { value: "s-1" },
    });

    expect(screen.getByTestId("talep-mevcut-stok-0").textContent).toContain(
      "2,4",
    );
    expect(screen.getByText("Ton")).toBeInTheDocument();
    // `⚠` inline SVG'dir (F-SEM) ⇒ metinle aranamaz. İddia ZAYIFLAMAZ:
    // kritik notun VARLIĞI + tam metni + uyarı ikonunu birlikte doğrular.
    const criticalNote = screen.getByTestId("talep-kritik-stok-0");
    expect(criticalNote).toHaveTextContent("Kritik stok");
    expect(criticalNote.querySelector("svg")).not.toBeNull();
  });

  it("SERBEST kalemde “Mevcut Stok” 0 DEĞİL “—” + gerekçedir", () => {
    render(<PurchaseRequestForm />);

    fireEvent.change(screen.getByTestId("talep-kaynak-0"), {
      target: { value: "free" },
    });

    const cell = screen.getByTestId("talep-mevcut-stok-0");
    expect(cell.textContent).toContain("—");
    // Bakiye BASILMAZ: ne stok kartının sayısı ne uydurma bir "0".
    expect(cell.textContent).not.toContain("2,4");
    expect(cell.textContent).toContain("Serbest kalemin stok kartı yok");
  });

  it("fiyatsız satırın tutarı “—”dır ve toplam EKSİK olduğunu söyler", () => {
    render(<PurchaseRequestForm />);

    fireEvent.change(screen.getByTestId("talep-miktar-0"), {
      target: { value: "15" },
    });

    expect(screen.getByTestId("talep-tutar-0").textContent).toBe("—");
    expect(screen.getByTestId("talep-toplam-eksik").textContent).toContain(
      "EKSİKTİR",
    );
  });

  it("kalem eklenip silinebilir (69 / 100-107 / 89)", () => {
    render(<PurchaseRequestForm />);

    fireEvent.click(screen.getByTestId("talep-kalem-ekle"));
    expect(screen.getByTestId("talep-satir-1")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Satırı sil (satır 2)"));
    expect(screen.queryByTestId("talep-satir-1")).not.toBeInTheDocument();
  });
});

describe("🔴 Onay Akışı kutusu (156-168) — NULL-EŞİK KANONU", () => {
  it("fiyatsız kalem varken “gerekmiyor” DEĞİL “gerekebilir” yazar (fail-closed)", () => {
    render(<PurchaseRequestForm />);

    fireEvent.change(screen.getByTestId("talep-miktar-0"), {
      target: { value: "1000" },
    });

    const result = screen.getByTestId("talep-onay-sonuc").textContent ?? "";
    expect(result).toContain("Patron onayı gerekebilir");
    expect(result).not.toContain("gerekmiyor");
  });

  it("eşik altındaki TAM fiyatlı talepte patron onayı gerekmez", () => {
    render(<PurchaseRequestForm />);

    fireEvent.change(screen.getByTestId("talep-miktar-0"), {
      target: { value: "15" },
    });
    fireEvent.change(screen.getByTestId("talep-fiyat-0"), {
      target: { value: "21500" },
    });

    expect(screen.getByTestId("talep-onay-sonuc").textContent).toContain(
      "Patron onayı gerekmiyor",
    );
  });

  it("onay/red düğmesi BASILMAZ (spec K6 — ayrı dilim)", () => {
    render(<PurchaseRequestForm />);

    expect(
      screen.queryByRole("button", { name: /onayla/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /reddet/i }),
    ).not.toBeInTheDocument();
  });
});

describe("FST · pending yüzeyler yerinde ve devre dışı", () => {
  it("tedarikçi kutucukları, ödeme vadesi ve e-posta kutusu devre dışıdır", () => {
    render(<PurchaseRequestForm />);

    expect(screen.getByLabelText("Demirsan A.Ş.")).toBeDisabled();
    expect(screen.getByTestId("talep-odeme-vadesi")).toBeDisabled();
    const email = screen.getByTestId(
      "talep-eposta-bildirim",
    ) as HTMLInputElement;
    expect(email).toBeDisabled();
    // Mockup kutucuğu SEÇİLİ çizer; gönderim olmadığı için SEÇİLMEDEN basılır.
    expect(email.checked).toBe(false);
    expect(
      screen.getByText("E-posta bildirimleri henüz yok"),
    ).toBeInTheDocument();
  });

  it("Ekler bölümü silinmez, “Yakında” olarak durur (140-153)", () => {
    render(<PurchaseRequestForm />);

    expect(screen.getByText("📎 Ekler")).toBeInTheDocument();
    expect(screen.getByText("Teknik Şartname")).toBeInTheDocument();
    expect(screen.getAllByText("Yakında").length).toBeGreaterThan(0);
  });
});

describe("FST · Taslak Kaydet + Onaya Gönder GERÇEKTİR", () => {
  it("proje seçilmeden taslak kaydedilemez ve ağa ÇIKILMAZ", () => {
    render(<PurchaseRequestForm />);

    fireEvent.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    expect(createMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByTestId("talep-hata").textContent).toContain(
      "Proje seçimi zorunludur",
    );
  });

  it("Taslak Kaydet POST atar, numarayı basar ve GÖRÜNÜR sonuç verir", async () => {
    render(<PurchaseRequestForm />);

    fireEvent.change(screen.getByTestId("talep-proje"), {
      target: { value: "p-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(createMutateAsync.mock.calls[0][0]).toMatchObject({
      project_id: "p-1",
    });
    await waitFor(() =>
      expect((screen.getByTestId("talep-no") as HTMLInputElement).value).toBe(
        "SAT-2026-0101",
      ),
    );
    expect(screen.getByTestId("talep-kayit-sonuc").textContent).toContain(
      "SAT-2026-0101",
    );
  });

  it("Onaya Gönder ÖNCE oluşturur SONRA submit çağırır", async () => {
    render(<PurchaseRequestForm />);
    fillSubmittableForm();

    fireEvent.click(submitButton());

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(submitMutateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/satinalma"));
  });

  it("fiyatsız kalemle onaya gönderilemez (eşik girdisi eksik olurdu)", () => {
    render(<PurchaseRequestForm />);
    fireEvent.change(screen.getByTestId("talep-proje"), {
      target: { value: "p-1" },
    });
    fireEvent.change(screen.getByTestId("talep-ihtiyac-tarihi"), {
      target: { value: "20.08.2026" },
    });
    fireEvent.change(screen.getByTestId("talep-malzeme-0"), {
      target: { value: "s-1" },
    });
    fireEvent.change(screen.getByTestId("talep-miktar-0"), {
      target: { value: "15" },
    });

    fireEvent.click(submitButton());

    expect(createMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByTestId("talep-hata").textContent).toContain(
      "Tahmini birim fiyat zorunludur",
    );
  });

  it("🔴 submit patlarsa kullanıcı KAYBOLMAZ: talep numarasıyla taslakta olduğu söylenir", async () => {
    submitMutateAsync.mockRejectedValue(
      new BackendError(409, { detail: "Durum uygun değil." }),
    );
    render(<PurchaseRequestForm />);
    fillSubmittableForm();

    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(screen.getByTestId("talep-hata").textContent).toContain(
        "SAT-2026-0101",
      ),
    );
    expect(screen.getByTestId("talep-hata").textContent).toContain(
      "TASLAK olarak kaydedildi",
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("IZN-B3b: submit 409 detail'i (rol atanmamış) OLDUĞU GİBİ basılır", async () => {
    const detail = "Bu projede Şantiye Şefi, Muhasebe atanmamış; önce Ayarlar > Kullanıcılar'dan atayın";
    submitMutateAsync.mockRejectedValue(new BackendError(409, { detail }));
    render(<PurchaseRequestForm />);
    fillSubmittableForm();

    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(screen.getByTestId("talep-hata").textContent).toContain(detail),
    );
  });

  it("🔴 submit patladıktan sonra yeniden deneme İKİNCİ talep AÇMAZ (PATCH yolu)", async () => {
    submitMutateAsync.mockRejectedValueOnce(
      new BackendError(409, { detail: "Durum uygun değil." }),
    );
    render(<PurchaseRequestForm />);
    fillSubmittableForm();

    fireEvent.click(submitButton());
    await waitFor(() =>
      expect(screen.getByTestId("talep-hata").textContent).toContain(
        "SAT-2026-0101",
      ),
    );

    fireEvent.click(submitButton());

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledTimes(1));
    // İkinci tur YENİ talep açmaz; kalem dizisi TAM gönderilir.
    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    expect(updateMutateAsync.mock.calls[0][0].lines).toHaveLength(1);
  });

  it("oluşturma hatası görünür basılır", async () => {
    createMutateAsync.mockRejectedValue(
      new BackendError(404, { detail: "Proje bulunamadı." }),
    );
    render(<PurchaseRequestForm />);
    fireEvent.change(screen.getByTestId("talep-proje"), {
      target: { value: "p-1" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    await waitFor(() =>
      expect(screen.getByTestId("talep-hata").textContent).toContain(
        "Proje bulunamadı.",
      ),
    );
  });
});

describe("FST · SEKME-F1.3b kaydedilmemiş değişiklik kaydı (KULLANICI KARARI B3)", () => {
  it("açıldı/dokunulmadı → false; proje seçildi → true; 'Taslak Kaydet' başarılı → false (temiz)", async () => {
    render(<PurchaseRequestForm />);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    fireEvent.change(screen.getByTestId("talep-proje"), { target: { value: "p-1" } });
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Taslak Kaydet" }));
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(unsavedRegistry.hasUnsaved()).toBe(false));
  });
});
