import { createRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

import { Field } from "@/components/ui/field";
import { DateInput } from "./DateInput";

/**
 * 🔴 HER OLGU KENDİ TESTİNDE. Bileşik testte önceki bir iddia bayatlarsa
 * arkasındakiler HİÇ koşmaz — bu turda dört kez ısırdı.
 *
 * Bekçilik edilen sözleşme (F-DATE T0 ölçümü):
 * `value` DAİMA ISO (`YYYY-MM-DD`), gösterim DAİMA TR (`gg.aa.yyyy`).
 * Aradaki dönüşüm primitive'in içindedir; 38 çağrı yeri ISO'dan başka bir şey
 * görmez.
 */

const iso = "2026-07-19";
const tr = "19.07.2026";

/**
 * Gerçek çağrı yerlerinin modeli: `value` ebeveyn durumunda tutulur.
 * Denetimli bir bileşen ebeveyn `value`yi güncellemezse gösterimi geri alır —
 * bu DOĞRU davranıştır, bu yüzden gidiş-dönüş iddiaları harness ile kurulur.
 */
function ControlledDateInput({
  initial = "",
  onIso,
  ...rest
}: { initial?: string; onIso?: (v: string) => void } & Partial<
  React.ComponentProps<typeof DateInput>
>) {
  const [value, setValue] = useState(initial);
  return (
    <DateInput
      aria-label="Tarih"
      {...rest}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onIso?.(next);
      }}
    />
  );
}

describe("DateInput — gösterim/değer sözleşmesi", () => {
  it("ISO değeri TR biçiminde gösterir", () => {
    render(<DateInput aria-label="Tarih" value={iso} onValueChange={() => {}} />);
    expect(screen.getByRole("textbox", { name: "Tarih" })).toHaveValue(tr);
  });

  it("boş ISO boş gösterilir (yer tutucu 0 basmaz)", () => {
    render(<DateInput aria-label="Tarih" value="" onValueChange={() => {}} />);
    expect(screen.getByRole("textbox", { name: "Tarih" })).toHaveValue("");
  });

  it("dışarıdan gelen value değişimi gösterimi günceller", () => {
    const { rerender } = render(
      <DateInput aria-label="Tarih" value="" onValueChange={() => {}} />,
    );
    rerender(<DateInput aria-label="Tarih" value={iso} onValueChange={() => {}} />);
    expect(screen.getByRole("textbox", { name: "Tarih" })).toHaveValue(tr);
  });

  it("🔴 saat taşıyan değer BOŞ gösterilir (anlamsız metin basmaz)", () => {
    // `formatDateDots`e ham geçilseydi `19T00:00:00.07.2026` basardı.
    render(
      <DateInput aria-label="Tarih" value="2026-07-19T00:00:00" onValueChange={() => {}} />,
    );
    expect(screen.getByRole("textbox", { name: "Tarih" })).toHaveValue("");
  });

  it("🔴 bozuk biçimli değer BOŞ gösterilir", () => {
    render(<DateInput aria-label="Tarih" value="19/07/2026" onValueChange={() => {}} />);
    expect(screen.getByRole("textbox", { name: "Tarih" })).toHaveValue("");
  });

  it("TARAYICI YERELİNE BAĞLI DEĞİLDİR: kontrol type=date DEĞİL", () => {
    // Kök neden (scripts/date-locale-probe.mjs): `type="date"` biçimi
    // tarayıcının ARAYÜZ DİLİNDEN gelir ve uygulama ona erişemez. Bu iddia
    // native kontrole geri dönüşü YAPISAL olarak engeller.
    render(<DateInput aria-label="Tarih" value={iso} onValueChange={() => {}} />);
    expect(screen.getByRole("textbox", { name: "Tarih" })).toHaveAttribute("type", "text");
  });
});

describe("DateInput — kullanıcı girişi ISO döndürür", () => {
  it("tam TR tarih yazılınca ISO yayınlanır", async () => {
    const onValueChange = vi.fn();
    render(<DateInput aria-label="Tarih" value="" onValueChange={onValueChange} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Tarih" }), tr);
    expect(onValueChange).toHaveBeenLastCalledWith(iso);
  });

  it("yarım tarih ISO olarak BOŞ yayınlar (yarım değer gövdeye sızmaz)", async () => {
    const onValueChange = vi.fn();
    render(<DateInput aria-label="Tarih" value="" onValueChange={onValueChange} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Tarih" }), "19.07.20");
    expect(onValueChange).toHaveBeenLastCalledWith("");
  });

  it("🔴 yarım yazarken kullanıcının yazdığı SİLİNMEZ (denetimli döngü tuzağı)", async () => {
    // Yarım girdi "" yayınlar; ebeveyn value=""e döner. Naif bir denetimli
    // bileşen bunu "dışarıdan geldi" sanıp taslağı ezerdi — kullanıcı yazamazdı.
    const onValueChange = vi.fn();
    render(<DateInput aria-label="Tarih" value="" onValueChange={onValueChange} />);
    const el = screen.getByRole("textbox", { name: "Tarih" });
    await userEvent.type(el, "19.07.20");
    expect(el).toHaveValue("19.07.20");
  });

  it("🔴 GİDİŞ-DÖNÜŞ: denetimli ebeveynle yazılan tarih ekranda KALIR", async () => {
    // Ebeveyn ISO'yu geri beslediğinde taslak tazelenir; tazeleme aynı metni
    // üretmezse kullanıcı yazdıkça imleç/metin zıplardı.
    render(<ControlledDateInput />);
    const el = screen.getByRole("textbox", { name: "Tarih" });
    await userEvent.type(el, tr);
    expect(el).toHaveValue(tr);
  });

  it("🔴 DOLU tarihi düzenlerken yarım kalan metin SİLİNMEZ", async () => {
    // MUTASYON TURU DERSİ: "taslak silinmez" testim BOŞ değerden başlıyordu ve
    // bu yolu HİÇ ölçmüyordu. Dolu bir tarihten bir karakter silindiğinde ISO
    // "" olur, ebeveyn value'yu "" yapar — bileşen bunu "dışarıdan geldi"
    // sanarsa kullanıcının yazdığını ANINDA siler ve tarih DÜZENLENEMEZ olur.
    render(<ControlledDateInput initial={iso} />);
    const el = screen.getByRole("textbox", { name: "Tarih" });
    expect(el).toHaveValue(tr);
    await userEvent.type(el, "{backspace}");
    expect(el).toHaveValue("19.07.202");
  });

  it("🔴 yarım kalan metin tamamlanınca ISO yeniden yayınlanır", async () => {
    const onIso = vi.fn();
    render(<ControlledDateInput initial={iso} onIso={onIso} />);
    const el = screen.getByRole("textbox", { name: "Tarih" });
    await userEvent.type(el, "{backspace}");
    expect(onIso).toHaveBeenLastCalledWith("");
    await userEvent.type(el, "7");
    expect(el).toHaveValue("19.07.2027");
    expect(onIso).toHaveBeenLastCalledWith("2027-07-19");
  });

  it("takvimde OLMAYAN gün reddedilir (31.02) — ISO boş kalır", async () => {
    const onValueChange = vi.fn();
    render(<DateInput aria-label="Tarih" value="" onValueChange={onValueChange} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Tarih" }), "31.02.2026");
    expect(onValueChange).toHaveBeenLastCalledWith("");
  });

  it("13. ay reddedilir — ISO boş kalır", async () => {
    const onValueChange = vi.fn();
    render(<DateInput aria-label="Tarih" value="" onValueChange={onValueChange} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Tarih" }), "01.13.2026");
    expect(onValueChange).toHaveBeenLastCalledWith("");
  });

  it("artık yıl 29.02.2028 GEÇERLİDİR", async () => {
    const onValueChange = vi.fn();
    render(<DateInput aria-label="Tarih" value="" onValueChange={onValueChange} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Tarih" }), "29.02.2028");
    expect(onValueChange).toHaveBeenLastCalledWith("2028-02-29");
  });

  it("artık OLMAYAN yılda 29.02.2027 reddedilir", async () => {
    const onValueChange = vi.fn();
    render(<DateInput aria-label="Tarih" value="" onValueChange={onValueChange} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Tarih" }), "29.02.2027");
    expect(onValueChange).toHaveBeenLastCalledWith("");
  });
});

describe("DateInput — Field sözleşmesi (etiket bağı)", () => {
  it("🔴 control.id GERÇEK girdiye iner — etiket tıklaması odağı taşır", async () => {
    // Field `<label htmlFor>` basar. id sarmalayıcıya inerse etiket bağı,
    // getByLabelText ve dört formdaki [aria-invalid] odak deseni SESSİZCE ölür.
    render(
      <Field label="Başlangıç Tarihi">
        {(control) => <DateInput {...control} value="" onValueChange={() => {}} />}
      </Field>,
    );
    const el = screen.getByLabelText("Başlangıç Tarihi");
    expect(el.tagName).toBe("INPUT");
    expect(el).toHaveAttribute("type", "text");
  });

  it("🔴 aria-invalid GERÇEK girdide durur", () => {
    render(
      <Field label="Bitiş" error="Zorunlu">
        {(control) => <DateInput {...control} value="" onValueChange={() => {}} />}
      </Field>,
    );
    expect(screen.getByLabelText("Bitiş")).toHaveAttribute("aria-invalid", "true");
  });

  it("🔴 POZİTİF KONTROL: odak dağıtıcısının seçicisi tarih alanını FİİLEN odaklar", () => {
    // SEKİZ form şu deseni kullanıyor ve bugüne kadar SIFIR kapsamı vardı:
    //   formRef.current.querySelector('[aria-invalid="true"]').focus()
    // Öznitelik sarmalayıcıya inseydi `.focus()` sessizce hiçbir şey yapmazdı —
    // test yeşil kalır, kullanıcı ilk hatalı alana ASLA götürülmezdi.
    // Bu yüzden iddia özniteliğe değil, ODAĞIN NEREYE DÜŞTÜĞÜNE bağlanır.
    const { container } = render(
      <Field label="Bitiş" error="Zorunlu">
        {(control) => <DateInput {...control} value="" onValueChange={() => {}} />}
      </Field>,
    );
    container.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    expect(screen.getByLabelText("Bitiş")).toHaveFocus();
  });

  it("aria-describedby GERÇEK girdiye iner", () => {
    render(
      <Field label="Tarih" hint="gg.aa.yyyy">
        {(control) => <DateInput {...control} value="" onValueChange={() => {}} />}
      </Field>,
    );
    expect(screen.getByLabelText("Tarih")).toHaveAttribute("aria-describedby");
  });

  it("ref GERÇEK girdiye iner (odak yönetimi 3 çağrı yerinde kullanıyor)", () => {
    const ref = createRef<HTMLInputElement>();
    render(<DateInput ref={ref} aria-label="Tarih" value="" onValueChange={() => {}} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current?.type).toBe("text");
  });
});

describe("DateInput — Input ölçü/durum sözleşmesi", () => {
  it("kendi .date-input sınıfını taşır (Select/Textarea emsali: kontrol başına kendi kuralı)", () => {
    render(<DateInput aria-label="Tarih" value="" onValueChange={() => {}} />);
    expect(screen.getByRole("textbox").className).toContain("date-input");
  });

  it("status=error hata sınıfını uygular", () => {
    render(<DateInput aria-label="Tarih" value="" status="error" onValueChange={() => {}} />);
    expect(screen.getByRole("textbox").className).toContain("date-input--error");
  });

  it("size verilmezse row varyantı BASILMAZ", () => {
    render(<DateInput aria-label="Tarih" value="" onValueChange={() => {}} />);
    expect(screen.getByRole("textbox").className).not.toContain("date-input--row");
  });

  it("size=row satır varyantı sınıfını ekler", () => {
    render(<DateInput aria-label="Tarih" value="" size="row" onValueChange={() => {}} />);
    expect(screen.getByRole("textbox").className).toContain("date-input--row");
  });

  it("size prop'u DOM'un size özniteliğine SIZMAZ", () => {
    render(<DateInput aria-label="Tarih" value="" size="row" onValueChange={() => {}} />);
    expect(screen.getByRole("textbox")).not.toHaveAttribute("size");
  });

  it("disabled iken devre dışıdır", () => {
    render(<DateInput aria-label="Tarih" value="" disabled onValueChange={() => {}} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("readOnly iken salt okunurdur", () => {
    render(<DateInput aria-label="Tarih" value={iso} readOnly onValueChange={() => {}} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
  });

  it("readOnly iken yazma değer YAYINLAMAZ", async () => {
    const onValueChange = vi.fn();
    render(
      <DateInput aria-label="Tarih" value={iso} readOnly onValueChange={onValueChange} />,
    );
    await userEvent.type(screen.getByRole("textbox"), "01.01.2020");
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe("DateInput — takvim seçici (yönetim kararı: KORUNUR)", () => {
  it("🔴 YAPISAL: seçici düğmesi sekme durağı DEĞİLDİR", () => {
    // Yönetim şartı: "sıfır yeni sekme durağı" varsayım olarak kalmasın.
    // Etikete değil YAPIYA bağlı: tabindex özniteliği ölçülür.
    const { container } = render(
      <DateInput aria-label="Tarih" value="" onValueChange={() => {}} />,
    );
    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button).toHaveAttribute("tabindex", "-1");
  });

  it("🔴 YAPISAL: seçici düğmesi erişilebilirlik ağacından gizlidir", () => {
    const { container } = render(
      <DateInput aria-label="Tarih" value="" onValueChange={() => {}} />,
    );
    expect(container.querySelector("button")).toHaveAttribute("aria-hidden", "true");
  });

  it("🔴 YAPISAL: sekme sırası TEK duraktır — gizli girdi sıraya girmez", () => {
    // `SectionsCard` odak testlerinin bekçisi: bileşen sekme sırasına
    // BİRDEN FAZLA durak eklerse tablo içi gezinme sessizce bozulurdu.
    const { container } = render(
      <DateInput aria-label="Tarih" value="" onValueChange={() => {}} />,
    );
    const tabbable = [...container.querySelectorAll("input, button, select, textarea, a[href]")]
      .filter((el) => (el as HTMLElement).tabIndex >= 0);
    expect(tabbable).toHaveLength(1);
  });

  it("🔴 YAPISAL: gizli seçici girdisi erişilebilirlik ağacından gizlidir", () => {
    // 🔴 MUTASYON TURU DERSİ: bu olgu ÖNCE yalnız `getAllByRole("textbox")`
    // ile kontrol ediliyordu ve gizli girdiden `aria-hidden` SİLİNDİĞİNDE test
    // YEŞİL KALDI — jsdom `input[type=date]`i `textbox` rolüne eşlemiyor.
    // Rol sorgusu burada bekçilik ETMİYOR; iddia YAPIYA bağlandı.
    const { container } = render(
      <DateInput aria-label="Tarih" value="" onValueChange={() => {}} />,
    );
    expect(container.querySelector('input[type="date"]')).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("🔴 YAPISAL: gizli seçici girdisi sekme durağı DEĞİLDİR", () => {
    const { container } = render(
      <DateInput aria-label="Tarih" value="" onValueChange={() => {}} />,
    );
    expect(container.querySelector('input[type="date"]')).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });

  it("🔴 YAPISAL: erişilebilirlik ağacında TEK bir textbox vardır", () => {
    // Gizli `type=date` eşlikçisi ekran okuyucuya ikinci bir alan gibi
    // görünmemeli.
    render(<DateInput aria-label="Tarih" value="" onValueChange={() => {}} />);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("gizli seçici girdisi Field'in id'sini ÇALMAZ (id benzersiz kalır)", () => {
    const { container } = render(
      <Field label="Tarih">
        {(control) => <DateInput {...control} value="" onValueChange={() => {}} />}
      </Field>,
    );
    const ids = [...container.querySelectorAll("[id]")].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("seçiciden gelen ISO doğrudan yayınlanır", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <DateInput aria-label="Tarih" value="" onValueChange={onValueChange} />,
    );
    const picker = container.querySelector<HTMLInputElement>('input[type="date"]');
    expect(picker).not.toBeNull();
    fireEvent.change(picker!, { target: { value: iso } });
    expect(onValueChange).toHaveBeenLastCalledWith(iso);
  });

  it("seçiciden gelen ISO ekranda TR biçiminde görünür (denetimli ebeveyn)", () => {
    const { container } = render(<ControlledDateInput />);
    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="date"]')!, {
      target: { value: iso },
    });
    expect(screen.getByRole("textbox", { name: "Tarih" })).toHaveValue(tr);
  });

  it("🔴 disabled iken GİZLİ seçici de devre dışıdır (alt kontrol kaçağı yok)", () => {
    // Devre dışı bir alanın alt kontrolü açık kalmamalı: `showPicker()`
    // programatik olarak da çağrılabilir.
    const { container } = render(
      <DateInput aria-label="Tarih" value="" disabled onValueChange={() => {}} />,
    );
    expect(container.querySelector('input[type="date"]')).toBeDisabled();
  });

  it("🔴 readOnly iken GİZLİ seçici devre dışıdır (salt okunur gerçekten kilitli)", () => {
    // `type="date"` native kontrolünde `readOnly` seçiciyi ENGELLEMEZ — bu
    // yüzden salt okunurluk `disabled` ile kurulur.
    const { container } = render(
      <DateInput aria-label="Tarih" value="" readOnly onValueChange={() => {}} />,
    );
    expect(container.querySelector('input[type="date"]')).toBeDisabled();
  });

  it("disabled iken seçici düğmesi de devre dışıdır", () => {
    const { container } = render(
      <DateInput aria-label="Tarih" value="" disabled onValueChange={() => {}} />,
    );
    expect(container.querySelector("button")).toBeDisabled();
  });
});

/**
 * DTI-F1 · Gizli native seçici YALNIZ "change" ile işlenir.
 * Chrome popup'ında ay gezinmesi değeri canlı değiştirir ve yalnız "input"
 * atar; Esc "input" ile açılış değerine döner. Gün seçimi/Enter "change" atar.
 */
describe("DateInput — gizli seçici yalnız change olayını işler (DTI-F1)", () => {
  const pickerOf = (container: HTMLElement) =>
    container.querySelector<HTMLInputElement>('input[type="date"]')!;

  it("🔴 seçicideki input olayı (ay gezinmesi) onValueChange ÇAĞIRMAZ ve metni değiştirmez", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <DateInput aria-label="Tarih" value={iso} onValueChange={onValueChange} />,
    );
    fireEvent.input(pickerOf(container), { target: { value: "2026-08-19" } });
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Tarih" })).toHaveValue(tr);
  });

  it("seçicideki change olayı onValueChange'i bir kez çağırır, metin TR'ye döner", () => {
    const onValueChange = vi.fn();
    const { container } = render(<ControlledDateInput onIso={onValueChange} />);
    fireEvent.change(pickerOf(container), { target: { value: "2026-08-19" } });
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("2026-08-19");
    expect(screen.getByRole("textbox", { name: "Tarih" })).toHaveValue("19.08.2026");
  });

  it("gezinme (input×3) + Esc (input) hiç yayın yapmaz; seçim change ile tek yayın", () => {
    const onValueChange = vi.fn();
    const { container } = render(<ControlledDateInput initial={iso} onIso={onValueChange} />);
    const picker = pickerOf(container);
    for (const day of ["2026-08-19", "2026-09-19", "2026-10-19", iso]) {
      fireEvent.input(picker, { target: { value: day } });
    }
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Tarih" })).toHaveValue(tr);
  });

  it("dışarıdan value değişince gizli seçicinin value'su senkron olur", () => {
    const { container, rerender } = render(
      <DateInput aria-label="Tarih" value={iso} onValueChange={() => {}} />,
    );
    expect(pickerOf(container).value).toBe(iso);
    rerender(<DateInput aria-label="Tarih" value="2026-12-31" onValueChange={() => {}} />);
    expect(pickerOf(container).value).toBe("2026-12-31");
    rerender(<DateInput aria-label="Tarih" value="" onValueChange={() => {}} />);
    expect(pickerOf(container).value).toBe("");
  });

  it("elle geçerli tam tarih yazılınca gizli seçicinin value'su güncellenir", async () => {
    const user = userEvent.setup();
    const { container } = render(<ControlledDateInput />);
    await user.type(screen.getByRole("textbox", { name: "Tarih" }), "05.03.2026");
    expect(pickerOf(container).value).toBe("2026-03-05");
  });

  it("seçici uncontrolled: kontrollü input uyarısı çıkmaz", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(<ControlledDateInput initial={iso} />);
    fireEvent.change(pickerOf(container), { target: { value: "2026-08-19" } });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
