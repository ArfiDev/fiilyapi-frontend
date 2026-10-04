import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

import { EmployerItemFormModal } from "./EmployerItemFormModal";
import {
  EMPLOYER_ITEM_TEXT as TEXT,
  ESCALATION_OPTIONS,
  ESCALATION_READONLY_REASON,
  INDEX_TYPE_LABELS,
  NEW_GROUP_OPTION,
} from "./constants";
import { BackendError } from "@/lib/api/unwrap";
import {
  useCreateEmployerContractGroup,
  useCreateEmployerContractItem,
} from "@/lib/api/hooks/useContractMutations";
import type {
  EmployerContractDetail,
  EmployerContractItemsResponse,
} from "@/lib/api/hooks/useContract";

vi.mock("@/lib/api/hooks/useContractMutations", () => ({
  useCreateEmployerContractItem: vi.fn(),
  useCreateEmployerContractGroup: vi.fn(),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const PROJECT_ID = "pppppppp-0000-0000-0000-000000000001";
const GROUP_ID = "gggggggg-0000-0000-0000-000000000002";
// 🔴 AYIRT EDİCİ: bu id hiçbir yerde SABİT olarak yazılı değildir — yalnız
// grup ucunun YANITINDAN gelebilir. `group_id` başka bir kaynaktan alınırsa
// (sentinel, mevcut grup, boş metin) iddia KIRMIZI olur.
const NEW_GROUP_ID = "cg-new-1";
const NEW_GROUP_NAME = "C — Kaba İşler";
const ITEM_422_DETAIL = "Bu poz numarası bu sözleşmede zaten var.";

const GROUPS: EmployerContractItemsResponse["groups"] = [
  {
    id: GROUP_ID,
    name: "B — Betonarme İşleri",
    sort_order: 20,
    items: [
      {
        id: "iiiiiiii-0000-0000-0000-000000000001",
        group_id: GROUP_ID,
        code: "03.011",
        source_code: null,
        description: "Grobeton",
        unit: "m³",
        quantity: "100.000",
        unit_price: "1200.00",
        sort_order: 10,
        catalog_item_id: null,
        distributed_quantity: "100.000",
        remaining_quantity: "0.000",
      },
    ],
  },
];

// Ekranın kullandığı alanlar dışındaki şema alanları testte gerekmez;
// `as unknown as` yerine tam nesne kurmak yerine kısmi nesne + tip daraltma
// yapılmaz — gerekli alanlar tek tek verilir.
const DETAIL = {
  project_id: PROJECT_ID,
  amount: "22400000.00",
  has_price_escalation: true,
  index_type: "ufe",
} as EmployerContractDetail;

const createItem = vi.fn();
const createGroup = vi.fn();
const onClose = vi.fn();

function renderModal(
  detail: EmployerContractDetail = DETAIL,
  groups: EmployerContractItemsResponse["groups"] = GROUPS,
) {
  return render(
    <EmployerItemFormModal
      projectId={PROJECT_ID}
      groups={groups}
      detail={detail}
      onClose={onClose}
    />,
  );
}

/** Grup DIŞINDAKİ tüm zorunlu alanlar (yeni grup akışında grup ayrı doldurulur). */
function fillItemFields() {
  fireEvent.change(screen.getByLabelText(TEXT.code), { target: { value: "03.012" } });
  fireEvent.change(screen.getByLabelText(TEXT.description), {
    target: { value: "Perde betonu C30/37" },
  });
  fireEvent.change(screen.getByLabelText(TEXT.unit), { target: { value: "m³" } });
  fireEvent.change(screen.getByLabelText(TEXT.quantity), { target: { value: "1.240,5" } });
  fireEvent.change(screen.getByLabelText(TEXT.unitPrice), { target: { value: "2.850,75" } });
}

/** Mevcut bir grup seçili tam form. */
function fillAll() {
  fireEvent.change(screen.getByLabelText(TEXT.group), { target: { value: GROUP_ID } });
  fillItemFields();
}

beforeEach(() => {
  vi.clearAllMocks();
  createItem.mockResolvedValue({});
  vi.mocked(useCreateEmployerContractItem).mockReturnValue({
    mutateAsync: createItem,
    isPending: false,
  } as never);
  createGroup.mockResolvedValue({ id: NEW_GROUP_ID, name: NEW_GROUP_NAME, sort_order: 30 });
  vi.mocked(useCreateEmployerContractGroup).mockReturnValue({
    mutateAsync: createGroup,
    isPending: false,
  } as never);
});

describe("EmployerItemFormModal (İŞV · Form - Poz Ekle Isveren)", () => {
  it("🔴 fiyat farkı alanları SALT-OKUNURdur ve sözleşmenin değerini gösterir", () => {
    renderModal();
    const escalation = screen.getByTestId("eci-escalation");
    const indexType = screen.getByTestId("eci-index-type");
    expect(escalation).toBeDisabled();
    expect(indexType).toBeDisabled();
    expect(escalation).toHaveValue("yes");
    expect(indexType).toHaveValue("ufe");
    // Gerekçe `title`da saklı kalmaz.
    expect(screen.getByTestId("eci-escalation-reason")).toHaveTextContent(
      ESCALATION_READONLY_REASON,
    );
    // Mockup'ın dört endeks seçeneği de basılır (192-196).
    for (const label of Object.values(INDEX_TYPE_LABELS)) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText(ESCALATION_OPTIONS.no)).toBeInTheDocument();
  });

  it("sözleşmede fiyat farkı kapalıysa `Hayır` gösterir (uydurulmaz)", () => {
    renderModal({ ...DETAIL, has_price_escalation: false, index_type: null });
    expect(screen.getByTestId("eci-escalation")).toHaveValue("no");
    expect(screen.getByTestId("eci-index-type")).toHaveValue("");
  });

  it("🔴 gövde YALNIZ şema alanlarını taşır — fiyat farkı alanları GİRMEZ", async () => {
    renderModal();
    fillAll();
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    const body = createItem.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toEqual({
      group_id: GROUP_ID,
      code: "03.012",
      description: "Perde betonu C30/37",
      unit: "m³",
      // 🔴 K6: ham Türkçe girdi ("1.240,5" / "2.850,75") → kayıpsız nokta-ondalık metin.
      quantity: "1240.5",
      unit_price: "2850.75",
      // Grup içi en büyük sıra (10) + 1; mockup'ın "11"i göstermeliktir.
      sort_order: 11,
    });
    expect(Object.keys(body)).not.toContain("has_price_escalation");
    expect(Object.keys(body)).not.toContain("index_type");
  });

  it("🔴 K6: miktar ve birim fiyat METİN girişidir (type=number Türkçe virgülü yutar) + ondalık klavye", () => {
    renderModal();
    for (const label of [TEXT.quantity, TEXT.unitPrice]) {
      const input = screen.getByLabelText(label);
      expect(input).not.toHaveAttribute("type", "number");
      expect(input).toHaveAttribute("inputmode", "decimal");
    }
  });

  it("🔴 K6: sözleşme bedeli önizlemesi T30 değerinden hesaplanır ('1.500' × '2,5' = 3.750), belirsizde 0", () => {
    renderModal();
    fillAll();
    fireEvent.change(screen.getByLabelText(TEXT.quantity), { target: { value: "1.500" } });
    fireEvent.change(screen.getByLabelText(TEXT.unitPrice), { target: { value: "2,5" } });
    expect(screen.getByTestId("eci-summary-amount")).toHaveTextContent("₺ 3.750");
    fireEvent.change(screen.getByLabelText(TEXT.quantity), { target: { value: "1.5" } });
    expect(screen.getByTestId("eci-summary-amount")).toHaveTextContent("₺ 0");
  });

  it("🔴 K6: belirsiz miktar ('1.5') AĞA ÇIKMAZ ve onaylı metni basar", async () => {
    renderModal();
    fillAll();
    fireEvent.change(screen.getByLabelText(TEXT.quantity), { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    await waitFor(() =>
      expect(screen.getByTestId("eci-error")).toHaveTextContent(
        "Ondalık için virgül kullanın (ör. 28,50)",
      ),
    );
    expect(createItem).not.toHaveBeenCalled();
  });

  it("🔴 K6: belirsiz birim fiyat ('28.5') AĞA ÇIKMAZ", async () => {
    renderModal();
    fillAll();
    fireEvent.change(screen.getByLabelText(TEXT.unitPrice), { target: { value: "28.5" } });
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    await waitFor(() =>
      expect(screen.getByTestId("eci-error")).toHaveTextContent(
        "Ondalık için virgül kullanın (ör. 28,50)",
      ),
    );
    expect(createItem).not.toHaveBeenCalled();
  });

  it("🔴 K6: '1.500' miktar 1500 olarak gider (bugüne dek 1,5 okunurdu)", async () => {
    renderModal();
    fillAll();
    fireEvent.change(screen.getByLabelText(TEXT.quantity), { target: { value: "1.500" } });
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect(createItem.mock.calls[0][0]).toMatchObject({ quantity: "1500" });
  });

  it("🔴 birim fiyat boşken AĞA ÇIKMAZ (TAŞ formunun tersi)", async () => {
    renderModal();
    fillAll();
    fireEvent.change(screen.getByLabelText(TEXT.unitPrice), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    await waitFor(() =>
      expect(screen.getByTestId("eci-error")).toHaveTextContent("Birim Fiyat zorunludur."),
    );
    expect(createItem).not.toHaveBeenCalled();
  });

  it("grup seçilmeden ağa çıkmaz", async () => {
    renderModal();
    fillAll();
    fireEvent.change(screen.getByLabelText(TEXT.group), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    await waitFor(() =>
      expect(screen.getByTestId("eci-error")).toHaveTextContent("Poz Grubu zorunludur."),
    );
    expect(createItem).not.toHaveBeenCalled();
  });

  it("işaretliyken kaydetme sonrası poz dağılımı ekranına gider", async () => {
    renderModal();
    fillAll();
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith(`/sozlesmeler/isveren/${PROJECT_ID}/poz-dagilimi`);
  });

  it("onay kutusu kaldırılınca yönlendirme YAPILMAZ", async () => {
    renderModal();
    fireEvent.click(screen.getByTestId("eci-go-distribution"));
    fillAll();
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(push).not.toHaveBeenCalled();
  });

  it("sözleşme bedeli boşken sessiz `0` yazmaz", () => {
    renderModal({ ...DETAIL, amount: null });
    expect(screen.getByTestId("eci-contract-total")).toHaveTextContent("—");
  });
});

/**
 * 🔴 F-POZGRUP T3 · REGRESYON BEKÇİLERİ.
 *
 * Kusur: yeni bir işveren sözleşmesine İLK poz hiçbir şekilde eklenemiyordu
 * (grup yok → `group_id` zorunlu → grup yaratmanın girişi yok). Aşağıdaki
 * iddialar kusurun geri gelmesini engeller; her biri T3'te tek tek MUTASYONLA
 * ölçüldü (mutasyon uygulandığında KIRMIZI olduğu görüldü).
 */
describe("EmployerItemFormModal · ilk poz regresyonu (F-POZGRUP)", () => {
  // (a) — grupsuz sözleşmede form KİLİTLİ DEĞİL, doğrudan yeni grup kipinde.
  it("🔴 (a) grup YOKKEN form '+ Yeni Grup' kipinde açılır (grup adı alanı görünür)", () => {
    renderModal(DETAIL, []);

    // Açılır sentinel'de: kullanıcı boş bir listeyle baş başa BIRAKILMAZ.
    expect(screen.getByLabelText(TEXT.group)).toHaveValue(NEW_GROUP_OPTION);
    // Sentinel seçeneği ayrıca BASILMIŞ olmalı (yoksa değer eşleşmez).
    expect(
      screen.getByRole("option", { name: TEXT.newGroupOption }),
    ).toBeInTheDocument();
    // Grup adı alanı sentinel'i İZLER — görünmezse grup yaratılamaz.
    expect(screen.getByLabelText(TEXT.groupName)).toBeInTheDocument();
  });

  it("grup VARKEN form eskisi gibi boş seçimle açılır (sentinel dayatılmaz)", () => {
    renderModal(DETAIL, GROUPS);

    expect(screen.getByLabelText(TEXT.group)).toHaveValue("");
    expect(screen.queryByLabelText(TEXT.groupName)).not.toBeInTheDocument();
  });

  it("grup adı boşken AĞA ÇIKMAZ — ne grup ne kalem isteği gider", async () => {
    renderModal(DETAIL, []);
    fillItemFields();
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    await waitFor(() =>
      expect(screen.getByTestId("eci-error")).toHaveTextContent("Grup adı zorunludur."),
    );
    expect(createGroup).not.toHaveBeenCalled();
    expect(createItem).not.toHaveBeenCalled();
  });

  // (b) — iki adımlı yazmanın SIRASI ve `group_id`nin KAYNAĞI.
  it("🔴 (b) grup ÖNCE yaratılır, kalem SONRA — `group_id` GRUP YANITINDAN gelir", async () => {
    renderModal(DETAIL, []);
    fireEvent.change(screen.getByLabelText(TEXT.groupName), {
      target: { value: "C — Kaba İşler" },
    });
    fillItemFields();
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect(createGroup).toHaveBeenCalledTimes(1);

    // SIRA: grup çağrısı kalem çağrısından ÖNCE gerçekleşmiş olmalı.
    // ("iki çağrı yapıldı" YETMEZ — ters sıra da iki çağrıdır.)
    expect(createGroup.mock.invocationCallOrder[0]).toBeLessThan(
      createItem.mock.invocationCallOrder[0],
    );

    // Grup gövdesi: ad kırpılır, sıra mevcut gruplardan türetilir (boş → 0).
    expect(createGroup.mock.calls[0][0]).toEqual({ name: "C — Kaba İşler", sort_order: 0 });

    // KAYNAK: kalemin `group_id`si grup YANITINDAN dönen gerçek id'dir.
    const body = createItem.mock.calls[0][0] as Record<string, unknown>;
    expect(body.group_id).toBe(NEW_GROUP_ID);
    // Sentinel ya da uydurma bir değer gitmiş OLAMAZ.
    expect(body.group_id).not.toBe(NEW_GROUP_OPTION);
    expect(body.group_id).not.toBe("");
  });

  it("🔴 (b) mevcut gruplar VARKEN de `group_id` yanıttan gelir — var olan gruba KAYMAZ", async () => {
    renderModal(DETAIL, GROUPS);
    fireEvent.change(screen.getByLabelText(TEXT.group), {
      target: { value: NEW_GROUP_OPTION },
    });
    fireEvent.change(screen.getByLabelText(TEXT.groupName), {
      target: { value: "C — Kaba İşler" },
    });
    fillItemFields();
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect(createGroup.mock.invocationCallOrder[0]).toBeLessThan(
      createItem.mock.invocationCallOrder[0],
    );
    const body = createItem.mock.calls[0][0] as Record<string, unknown>;
    expect(body.group_id).toBe(NEW_GROUP_ID);
    expect(body.group_id).not.toBe(GROUP_ID);
    // Mevcut grubun sırası (20) baz alınır — yeni grup sona düşer.
    expect(createGroup.mock.calls[0][0]).toEqual({ name: "C — Kaba İşler", sort_order: 21 });
  });

  // (c) — K3 YARIM KALMA: grup yaratıldı, kalem isteği 422 döndü.
  describe("🔴 (c) K3 · grup yaratıldı ama kalem 422 döndü", () => {
    async function submitHalfFailure() {
      createItem.mockRejectedValue(new BackendError(422, { detail: ITEM_422_DETAIL }));
      renderModal(DETAIL, []);
      fireEvent.change(screen.getByLabelText(TEXT.groupName), {
        target: { value: "C — Kaba İşler" },
      });
      fillItemFields();
      fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));
      await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    }

    it("(c1) yarım kalma GİZLENMEZ — 'Grup oluşturuldu, kalem eklenemedi: …' basılır", async () => {
      await submitHalfFailure();

      expect(screen.getByTestId("eci-error")).toHaveTextContent(
        `Grup oluşturuldu, kalem eklenemedi: ${ITEM_422_DETAIL}`,
      );
    });

    it("(c2) modal AÇIK kalır ve kullanıcının girdiği alanlar KAYBOLMAZ", async () => {
      await submitHalfFailure();

      // Diyalog kapanmadı, yönlendirme de olmadı.
      expect(onClose).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: TEXT.submit })).toBeInTheDocument();

      // Yazılan her alan yerinde.
      expect(screen.getByLabelText(TEXT.code)).toHaveValue("03.012");
      expect(screen.getByLabelText(TEXT.description)).toHaveValue("Perde betonu C30/37");
      expect(screen.getByLabelText(TEXT.unit)).toHaveValue("m³");
      expect(screen.getByLabelText(TEXT.quantity)).toHaveValue("1.240,5");
      expect(screen.getByLabelText(TEXT.unitPrice)).toHaveValue("2.850,75");
    });

    it("(c3) grup açılırı YENİ GRUBA çekilir — 'tekrar dene' İKİNCİ grup yaratmaz", async () => {
      await submitHalfFailure();

      // Seçim sentinel'e geri DÜŞMEZ; yaratılmış grup seçili + açılırda görünür.
      const group = screen.getByLabelText(TEXT.group);
      expect(group).toHaveValue(NEW_GROUP_ID);
      expect(group).not.toHaveValue(NEW_GROUP_OPTION);
      expect(screen.getByRole("option", { name: NEW_GROUP_NAME })).toBeInTheDocument();

      // Tekrar dene: kalem isteği yenilenir, grup ucu BİR KEZ çağrılmış kalır.
      createItem.mockResolvedValue({});
      fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

      await waitFor(() => expect(createItem).toHaveBeenCalledTimes(2));
      expect(createGroup).toHaveBeenCalledTimes(1);
      const retryBody = createItem.mock.calls[1][0] as Record<string, unknown>;
      expect(retryBody.group_id).toBe(NEW_GROUP_ID);
    });

    /**
     * no 46 · `selectedGroup` yalnız PROP'taki `groups` içinde aranıyordu;
     * yaratılmış grup kalem sorgusu tazelenene kadar o listede YOK. Özet
     * satırı boş kalıyor ve kullanıcı hangi grubu yarattığını göremiyordu.
     */
    it("46 · özet satırı yarım kalma sırasında YARATILMIŞ GRUBUN adını gösterir", async () => {
      await submitHalfFailure();
      const groupRow = screen.getByText(TEXT.summaryGroup).closest(".pif-summary__row");
      expect(groupRow).toHaveTextContent(NEW_GROUP_NAME);
    });
  });
});

/** SEKME-F1.3b · merkezi kayda bağlanma bekçisi. */
describe("EmployerItemFormModal — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı, dokunulmadı → temiz", () => {
    renderModal();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("bir alan değiştirildi → kirli", () => {
    renderModal();
    fillAll();
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt sonrası (onClose çağrılır, unmount) → temiz", async () => {
    const { unmount } = renderModal();
    fillAll();
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
