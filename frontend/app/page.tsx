"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Logo } from "@/components/Logo";
import { apiFetch } from "@/lib/api";
import { countPdfPages } from "@/lib/pdfPages";
import { type ColorMode, estimateTotalRub, pricePerSheet } from "@/lib/pricing";
import { getExtension, isAllowedFile } from "@/lib/validation";

type LocalFile = {
  id: string;
  file: File;
  previewUrl?: string;
  pagesEstimate: number | null;
  pagesNote?: string;
};

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function HomePage() {
  const [items, setItems] = useState<LocalFile[]>([]);
  const [color, setColor] = useState<ColorMode>("bw");
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<string | null>(null);

  const totalPages = useMemo(() => {
    const known = items.every((i) => i.pagesEstimate !== null);
    const sum = items.reduce((s, i) => s + (i.pagesEstimate ?? 0), 0);
    return { known, sum };
  }, [items]);

  const estimateRub = estimateTotalRub(totalPages.sum, color, "a4");

  const addFiles = useCallback((list: FileList | File[]) => {
    const next: LocalFile[] = [];
    for (const file of Array.from(list)) {
      if (!isAllowedFile(file.name)) {
        setError(`Файл не подходит для печати: ${file.name}`);
        continue;
      }
      const ext = getExtension(file.name);
      const img = ["png", "jpg", "jpeg", "gif", "bmp", "webp", "tif", "tiff"].includes(ext);
      next.push({
        id: makeId(),
        file,
        previewUrl: img ? URL.createObjectURL(file) : undefined,
        pagesEstimate: null,
        pagesNote: undefined,
      });
    }
    if (next.length) setError(null);
    setItems((prev) => [...prev, ...next]);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function resolvePages() {
      const updates = await Promise.all(
        items.map(async (item) => {
          const ext = getExtension(item.file.name);
          if (ext === "pdf") {
            try {
              const n = await countPdfPages(item.file);
              return { ...item, pagesEstimate: n, pagesNote: undefined };
            } catch {
              return { ...item, pagesEstimate: 1, pagesNote: "Не удалось прочитать PDF, учтена 1 стр." };
            }
          }
          if (["png", "jpg", "jpeg", "gif", "bmp", "webp", "tif", "tiff"].includes(ext)) {
            return { ...item, pagesEstimate: 1 };
          }
          return { ...item, pagesEstimate: 1, pagesNote: "≈1 стр., точное число после загрузки" };
        }),
      );

      if (!cancelled) {
        setItems((prev) => prev.map((p) => updates.find((x) => x.id === p.id) ?? p));
      }
    }

    if (items.some((i) => i.pagesEstimate === null)) {
      void resolvePages();
    }

    return () => {
      cancelled = true;
    };
  }, [items]);

  useEffect(() => {
    return () => {
      items.forEach((i) => {
        if (i.previewUrl) URL.revokeObjectURL(i.previewUrl);
      });
    };
  }, [items]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const t = prev.find((x) => x.id === id);
      if (t?.previewUrl) URL.revokeObjectURL(t.previewUrl);
      return prev.filter((x) => x.id !== id);
    });
  };

  const submit = async () => {
    if (!items.length) {
      setError("Добавьте хотя бы один файл.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.append("color", color);
      fd.append("paper", "a4");
      for (const it of items) fd.append("files", it.file);

      const res = await apiFetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail || res.statusText);
      }

      const data = (await res.json()) as { job_id: string; total_pages: number; total_rub: number };
      setModal(`Заказ принят.\nСтраниц: ${data.total_pages}\nСумма: ${data.total_rub} ₽`);
      setItems([]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка отправки");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-7 px-4 py-8 sm:px-6 lg:py-10">
      <header className="rounded-3xl border border-white/80 bg-white/80 p-6 shadow-[0_12px_35px_rgba(30,42,78,0.08)] backdrop-blur">
        <Logo />
        <p className="mt-2 text-sm text-neutral-600 sm:text-base">
          Загрузите файлы для печати — мы подготовим их к печати в формате A4.
        </p>
      </header>

      <section className="rounded-3xl border border-white/80 bg-white p-5 shadow-[0_12px_35px_rgba(30,42,78,0.08)] sm:p-6">
        <h2 className="text-lg font-semibold sm:text-xl">Параметры печати</h2>
        <div className="mt-4 max-w-md">
          <label className="flex flex-col gap-2 text-sm">
            <span className="font-medium text-neutral-500">Цветность</span>
            <div className="relative">
              <select
                className="h-12 w-full appearance-none rounded-xl border border-neutral-200 bg-gradient-to-b from-white to-neutral-50 px-4 pr-11 text-[15px] font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_6px_18px_rgba(18,19,26,0.06)] transition hover:border-neutral-300"
                value={color}
                onChange={(e) => setColor(e.target.value as ColorMode)}
              >
                <option value="bw">Ч/б</option>
                <option value="color">Цвет</option>
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-neutral-400">
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M5.6 7.6a1 1 0 0 1 1.4 0L10 10.6l3-3a1 1 0 1 1 1.4 1.4l-3.7 3.7a1 1 0 0 1-1.4 0L5.6 9a1 1 0 0 1 0-1.4Z" />
                </svg>
              </span>
            </div>
          </label>
        </div>

        <div className="mt-5 rounded-2xl border border-neutral-100 bg-gradient-to-br from-neutral-50 to-pink-50/40 p-4 sm:p-5">
          <p className="text-sm font-semibold text-neutral-700">Ориентировочная стоимость</p>
          <ul className="mt-3 space-y-1 text-sm text-neutral-600">
            <li>Ч/б A4 — 20 ₽ / лист</li>
            <li>Цвет A4 — 50 ₽ / лист</li>
          </ul>
          <div className="mt-4 space-y-2 rounded-xl bg-white/80 p-3 text-sm sm:text-base">
            <p><span className="font-semibold">Тариф:</span> {pricePerSheet(color, "a4")} ₽ за лист</p>
            <p><span className="font-semibold">Страниц (оценка):</span> {totalPages.known ? totalPages.sum : "…"}</p>
            <p><span className="font-semibold">Итого:</span> ≈ {estimateRub} ₽</p>
          </div>
          {!totalPages.known && items.length > 0 && (
            <p className="mt-3 text-xs text-neutral-500">Подсчёт страниц для PDF…</p>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-white/80 bg-white p-5 shadow-[0_12px_35px_rgba(30,42,78,0.08)] sm:p-6">
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              document.getElementById("file-input")?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => document.getElementById("file-input")?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed px-4 py-10 text-center transition sm:px-6 ${
            dragOver ? "border-brand bg-pink-50" : "border-neutral-300"
          }`}
        >
          <p className="text-base font-semibold sm:text-lg">Перетащите файлы сюда или нажмите</p>
          <p className="mt-2 text-sm text-neutral-500">
            Изображения, PDF, Word, Excel, PowerPoint и другие безопасные форматы
          </p>
          <input
            id="file-input"
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <ul className="mt-5 space-y-3">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-2xl border border-neutral-100 bg-neutral-50/80 p-3">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                {item.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-neutral-400">файл</div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold sm:text-base">{item.file.name}</p>
                <p className="text-xs text-neutral-500 sm:text-sm">
                  {item.pagesEstimate !== null ? `${item.pagesEstimate} стр.` : "подсчёт…"}
                  {item.pagesNote ? ` · ${item.pagesNote}` : ""}
                </p>
              </div>

              <button
                type="button"
                aria-label="Удалить файл"
                className="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 transition hover:border-brand hover:text-brand"
                onClick={(e) => {
                  e.stopPropagation();
                  removeItem(item.id);
                }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          disabled={submitting || !items.length}
          onClick={() => void submit()}
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-neutral-900 to-neutral-700 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 sm:text-base"
        >
          {submitting ? "Отправка…" : "Отправить файлы"}
        </button>
      </section>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold">Готово</h3>
            <pre className="mt-4 whitespace-pre-wrap text-sm text-neutral-700">{modal}</pre>
            <button
              type="button"
              className="mt-6 w-full rounded-xl bg-brand py-3 font-semibold text-white"
              onClick={() => setModal(null)}
            >
              ОК
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
