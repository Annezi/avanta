"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { jsPDF } from "jspdf";

import { Logo } from "@/components/Logo";
import { apiFetch, clearStoredToken, getApiBase, getStoredToken } from "@/lib/api";

type FolderSummary = {
  id: string;
  created_at: string;
  total_pages: number;
  total_rub: number;
  color: string;
  paper: string;
  tg_status: string;
};

type FolderDetail = {
  id: string;
  created_at: string;
  files: { name: string; pages: number }[];
  print_pdfs: string[];
  raw_files: string[];
  total_pages: number;
  total_rub: number;
};

const STATUS_LABELS: Record<string, string> = {
  awaiting_payment: "Ожидание оплаты",
  printing: "Печать",
  delivering: "Вручение",
  done: "Реализовано",
};

const COLOR_LABELS: Record<string, string> = {
  bw: "ч/б",
  color: "цвет",
};

const PAPER_LABELS: Record<string, string> = {
  a4: "A4",
  a3: "A3",
};

function formatMoscowDate(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(dt);
}

function ManagerInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeJob = searchParams.get("job");

  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<FolderDetail | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>("");
  const [previewKind, setPreviewKind] = useState<"pdf" | "image" | null>(null);
  const [fitMode, setFitMode] = useState<"contain" | "cover" | "fillHeight" | "fillWidth">("cover");
  const [alignX, setAlignX] = useState<"left" | "center" | "right">("center");
  const [alignY, setAlignY] = useState<"top" | "center" | "bottom">("center");
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);

  const foldersFingerprint = useCallback((list: FolderSummary[]) => {
    return list
      .map((f) => `${f.id}|${f.total_pages}|${f.total_rub}|${f.tg_status}|${f.color}|${f.paper}`)
      .join(";");
  }, []);

  const detailFingerprint = useCallback((d: FolderDetail | null) => {
    if (!d) return "";
    const files = d.files.map((f) => `${f.name}:${f.pages}`).join(",");
    const pdfs = d.print_pdfs.join(",");
    return `${d.id}|${d.total_pages}|${d.total_rub}|${files}|${pdfs}`;
  }, []);

  const loadFolders = useCallback(async (silent = false) => {
    const res = await apiFetch("/api/folders", {}, true);
    if (res.status === 401) {
      clearStoredToken();
      router.replace("/administrator");
      return;
    }
    if (!res.ok) throw new Error(await res.text());
    const incoming = (await res.json()) as FolderSummary[];
    setFolders((prev) => {
      if (silent && foldersFingerprint(prev) === foldersFingerprint(incoming)) {
        return prev;
      }
      return incoming;
    });
    setSelected((prev) => {
      if (!prev.size) return prev;
      const ids = new Set(incoming.map((f) => f.id));
      const filtered = new Set<string>();
      prev.forEach((id) => {
        if (ids.has(id)) filtered.add(id);
      });
      return filtered;
    });
  }, [foldersFingerprint, router]);

  useEffect(() => {
    if (!getStoredToken()) {
      router.replace("/administrator");
      return;
    }
    void (async () => {
      try {
        setLoading(true);
        await loadFolders();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadFolders, router]);

  const loadDetail = useCallback(
    async (jobId: string, silent = false) => {
      try {
        const res = await apiFetch(`/api/folders/${encodeURIComponent(jobId)}`, {}, true);
        if (res.status === 401) {
          clearStoredToken();
          router.replace("/administrator");
          return;
        }
        if (!res.ok) {
          setDetail(null);
          return;
        }
        const incoming = (await res.json()) as FolderDetail;
        setDetail((prev) => {
          if (silent && detailFingerprint(prev) === detailFingerprint(incoming)) {
            return prev;
          }
          return incoming;
        });
      } catch {
        setDetail(null);
      }
    },
    [detailFingerprint, router],
  );

  useEffect(() => {
    if (!activeJob) {
      setDetail(null);
      return;
    }
    void loadDetail(activeJob);
  }, [activeJob, loadDetail]);

  useEffect(() => {
    if (!getStoredToken()) return;
    const timer = window.setInterval(() => {
      void loadFolders(true);
      if (activeJob) void loadDetail(activeJob, true);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [activeJob, loadDetail, loadFolders]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === folders.length) setSelected(new Set());
    else setSelected(new Set(folders.map((f) => f.id)));
  };

  const deleteSelected = async () => {
    if (!selected.size) return;
    if (!confirm(`Удалить выбранные папки (${selected.size})?`)) return;

    const res = await apiFetch(
      "/api/folders",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      },
      true,
    );

    if (res.status === 401) {
      router.replace("/administrator");
      return;
    }

    setSelected(new Set());
    if (activeJob && selected.has(activeJob)) router.push("/administrator/manager");
    await loadFolders();
  };

  const downloadZip = async (jobId: string) => {
    const res = await apiFetch(`/api/folders/${encodeURIComponent(jobId)}/zip`, {}, true);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${jobId}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = async (jobId: string, filename: string) => {
    const res = await apiFetch(`/api/folders/${encodeURIComponent(jobId)}/files/${encodeURIComponent(filename)}`, {}, true);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadRawFile = async (jobId: string, filename: string) => {
    const res = await apiFetch(`/api/folders/${encodeURIComponent(jobId)}/raw/${encodeURIComponent(filename)}`, {}, true);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadRawZip = async (jobId: string) => {
    const res = await apiFetch(`/api/folders/${encodeURIComponent(jobId)}/raw-zip`, {}, true);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${jobId}-raw.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openPreview = async (
    endpoint: string,
    title: string,
    isPdf = true,
  ) => {
    const res = await apiFetch(endpoint, {}, true);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(url);
    setPreviewTitle(isPdf ? `${title} (PDF)` : title);
    setPreviewKind(isPdf ? "pdf" : "image");
    setFitMode("cover");
    setAlignX("center");
    setAlignY("center");
    setZoom(1);
    setRotation(0);
  };

  const renderEditedCanvas = async (): Promise<HTMLCanvasElement | null> => {
    if (!previewUrl || previewKind !== "image") return null;
    const img = new Image();
    img.src = previewUrl;
    await img.decode();

    const dpi = 300;
    const mmToPx = (mm: number) => Math.round((mm / 25.4) * dpi);
    const pageW = Math.round((210 / 25.4) * dpi);
    const pageH = Math.round((297 / 25.4) * dpi);
    const margin = mmToPx(5);
    const targetW = pageW - margin * 2;
    const targetH = pageH - margin * 2;

    const canvas = document.createElement("canvas");
    canvas.width = pageW;
    canvas.height = pageH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageW, pageH);

    const rotated = rotation === 90 || rotation === 270;
    const srcW = rotated ? img.height : img.width;
    const srcH = rotated ? img.width : img.height;

    let baseScale = 1;
    if (fitMode === "contain") baseScale = Math.min(targetW / srcW, targetH / srcH);
    if (fitMode === "cover") baseScale = Math.max(targetW / srcW, targetH / srcH);
    if (fitMode === "fillHeight") baseScale = targetH / srcH;
    if (fitMode === "fillWidth") baseScale = targetW / srcW;
    const scale = baseScale * zoom;

    const drawW = srcW * scale;
    const drawH = srcH * scale;

    const xMap = {
      left: margin,
      center: margin + (targetW - drawW) / 2,
      right: margin + targetW - drawW,
    };
    const yMap = {
      top: margin,
      center: margin + (targetH - drawH) / 2,
      bottom: margin + targetH - drawH,
    };
    const drawX = xMap[alignX];
    const drawY = yMap[alignY];

    ctx.save();
    ctx.beginPath();
    ctx.rect(margin, margin, targetW, targetH);
    ctx.clip();
    ctx.translate(drawX + drawW / 2, drawY + drawH / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    return canvas;
  };

  const downloadEditedPdf = async () => {
    const canvas = await renderEditedCanvas();
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    pdf.addImage(dataUrl, "PNG", 0, 0, 210, 297, undefined, "FAST");
    const safe = previewTitle.replace(/\s+/g, "_").replace(/[()]/g, "");
    pdf.save(`edited-${safe || "file"}.pdf`);
  };

  const filteredFolders = folders.filter((f) =>
    f.id.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const base = getApiBase();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/80 bg-white/85 p-5 shadow-[0_12px_35px_rgba(30,42,78,0.08)]">
        <Logo />
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/" className="rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50">
            Страница клиента
          </Link>
          <button
            type="button"
            className="rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
            onClick={() => {
              clearStoredToken();
              router.replace("/administrator");
            }}
          >
            Выход
          </button>
        </div>
      </header>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <section className="rounded-3xl border border-white/80 bg-white p-5 shadow-[0_12px_35px_rgba(30,42,78,0.08)] sm:p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">
            <h2 className="mr-auto text-lg font-semibold">Заявки на печать</h2>
            <button
              type="button"
              className="rounded-xl border border-neutral-200 px-3 py-2 text-sm transition hover:bg-neutral-50"
              onClick={() => void loadFolders()}
            >
              Обновить
            </button>
            <button
              type="button"
              disabled={!selected.size}
              className="rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => void deleteSelected()}
            >
              Удалить
            </button>
          </div>

          <div className="mb-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск папки по имени (из сообщения бота)"
              className="h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm"
            />
          </div>

          <label className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-600">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#ff0478]"
              checked={folders.length > 0 && selected.size === folders.length}
              onChange={toggleAll}
            />
            Выбрать все
          </label>

          {loading ? (
            <p className="text-neutral-500">Загрузка...</p>
          ) : filteredFolders.length === 0 ? (
            <p className="text-neutral-500">Пока нет заявок на печать.</p>
          ) : (
            <ul className="space-y-2">
              {filteredFolders.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
                      activeJob === f.id ? "border-brand bg-pink-50" : "border-neutral-100 bg-neutral-50/70 hover:bg-neutral-50"
                    }`}
                    onClick={() => router.push(`/administrator/manager?job=${encodeURIComponent(f.id)}`)}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#ff0478]"
                      checked={selected.has(f.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggle(f.id)}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs font-semibold sm:text-sm">{f.id}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {f.total_pages} стр. · {f.total_rub} ₽ · {COLOR_LABELS[f.color] ?? f.color}/
                        {PAPER_LABELS[f.paper] ?? f.paper} · {STATUS_LABELS[f.tg_status] ?? f.tg_status}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-3xl border border-white/80 bg-white p-5 shadow-[0_12px_35px_rgba(30,42,78,0.08)] sm:p-6">
          {!activeJob && <p className="text-neutral-500">Выберите папку слева, чтобы скачать PDF.</p>}
          {activeJob && !detail && <p className="text-neutral-500">Загрузка...</p>}

          {detail && (
            <div className="space-y-4">
              <h3 className="break-all font-mono text-base font-semibold sm:text-lg">{detail.id}</h3>
              <p className="text-sm text-neutral-500">Создано (МСК): {formatMoscowDate(detail.created_at)}</p>
              <p className="rounded-xl bg-neutral-50 p-3 text-sm font-bold sm:text-base">
                Итого: {detail.total_pages} стр., {detail.total_rub} ₽
              </p>

              <ul className="space-y-2 text-sm">
                {detail.files.map((file) => (
                  <li key={file.name} className="rounded-lg border border-neutral-100 bg-neutral-50/70 px-3 py-2">
                    {file.name} — {file.pages} стр.
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap gap-2 border-t border-neutral-100 pt-4">
                <button
                  type="button"
                  className="rounded-xl border border-neutral-200 px-4 py-2 font-medium text-neutral-700 transition hover:bg-neutral-50"
                  onClick={() => void downloadRawZip(detail.id)}
                >
                  Скачать Исходные файлы ZIP
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-brand px-4 py-2 font-medium text-white transition hover:opacity-95"
                  onClick={() => void downloadZip(detail.id)}
                >
                  Скачать PDF ZIP
                </button>
              </div>

              <details className="rounded-xl border border-neutral-100 bg-neutral-50/40 p-3">
                <summary className="cursor-pointer select-none text-sm font-semibold">PDF файлы</summary>
                <ul className="space-y-2">
                  {detail.print_pdfs.map((name) => (
                    <li key={name}>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 transition hover:border-brand hover:text-brand"
                          onClick={() => void downloadPdf(detail.id, name)}
                        >
                          {name}
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 transition hover:border-brand hover:text-brand"
                          onClick={() =>
                            void openPreview(
                              `/api/folders/${encodeURIComponent(detail.id)}/files/${encodeURIComponent(name)}`,
                              name,
                              true,
                            )
                          }
                        >
                          Предпросмотр
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>

              <details className="rounded-xl border border-neutral-100 bg-neutral-50/40 p-3">
                <summary className="cursor-pointer select-none text-sm font-semibold">Исходные файлы</summary>
                <ul className="space-y-2">
                  {detail.raw_files.map((name) => (
                    <li key={name}>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 transition hover:border-brand hover:text-brand"
                          onClick={() => void downloadRawFile(detail.id, name)}
                        >
                          {name}
                        </button>
                        {/\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(name) && (
                          <button
                            type="button"
                            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 transition hover:border-brand hover:text-brand"
                            onClick={() =>
                              void openPreview(
                                `/api/folders/${encodeURIComponent(detail.id)}/raw/${encodeURIComponent(name)}`,
                                name,
                                false,
                              )
                            }
                          >
                            Предпросмотр
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </details>

              {previewUrl && (
                <div className="rounded-xl border border-neutral-200 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{previewTitle}</p>
                    <button
                      type="button"
                      className="rounded-lg border border-neutral-200 px-2 py-1 text-xs text-neutral-600"
                      onClick={() => {
                        if (previewUrl) URL.revokeObjectURL(previewUrl);
                        setPreviewUrl(null);
                        setPreviewTitle("");
                        setPreviewKind(null);
                      }}
                    >
                      Закрыть
                    </button>
                  </div>
                  {previewKind === "image" && (
                    <div className="mb-3 grid gap-2 rounded-lg border border-neutral-200 p-3 text-sm md:grid-cols-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-neutral-500">Режим</span>
                        <select
                          className="h-9 rounded-lg border border-neutral-200 px-2"
                          value={fitMode}
                          onChange={(e) => setFitMode(e.target.value as "contain" | "cover" | "fillHeight" | "fillWidth")}
                        >
                          <option value="contain">Вписать</option>
                          <option value="cover">Заполнить</option>
                          <option value="fillHeight">По высоте</option>
                          <option value="fillWidth">По ширине</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-neutral-500">Поворот</span>
                        <select
                          className="h-9 rounded-lg border border-neutral-200 px-2"
                          value={rotation}
                          onChange={(e) => setRotation(Number(e.target.value) as 0 | 90 | 180 | 270)}
                        >
                          <option value={0}>0°</option>
                          <option value={90}>90°</option>
                          <option value={180}>180°</option>
                          <option value={270}>270°</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-neutral-500">По горизонтали</span>
                        <select
                          className="h-9 rounded-lg border border-neutral-200 px-2"
                          value={alignX}
                          onChange={(e) => setAlignX(e.target.value as "left" | "center" | "right")}
                        >
                          <option value="left">Слева</option>
                          <option value="center">По центру</option>
                          <option value="right">Справа</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-neutral-500">По вертикали</span>
                        <select
                          className="h-9 rounded-lg border border-neutral-200 px-2"
                          value={alignY}
                          onChange={(e) => setAlignY(e.target.value as "top" | "center" | "bottom")}
                        >
                          <option value="top">Сверху</option>
                          <option value="center">По центру</option>
                          <option value="bottom">Снизу</option>
                        </select>
                      </label>
                      <label className="md:col-span-2 flex flex-col gap-1">
                        <span className="text-neutral-500">Масштаб: {zoom.toFixed(2)}x</span>
                        <input
                          type="range"
                          min={0.5}
                          max={1.4}
                          step={0.05}
                          value={zoom}
                          onChange={(e) => setZoom(Number(e.target.value))}
                        />
                      </label>
                      <button
                        type="button"
                        className="md:col-span-2 rounded-lg bg-brand px-3 py-2 font-medium text-white"
                        onClick={() => void downloadEditedPdf()}
                      >
                        Скачать отредактированный PDF
                      </button>
                    </div>
                  )}
                  {previewKind === "pdf" ? (
                    <iframe
                      src={previewUrl}
                      title="preview-pdf"
                      className="h-[420px] w-full rounded-lg border border-neutral-200"
                    />
                  ) : (
                    <div className="mx-auto w-full max-w-[420px]">
                      <div
                        className="relative w-full overflow-hidden rounded-lg border border-neutral-200 bg-white p-[3.57%]"
                        style={{ aspectRatio: "210 / 297" }}
                      >
                        <div className="pointer-events-none absolute inset-[3.57%] rounded-md border border-neutral-200/70" />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={previewUrl}
                          alt=""
                          className="absolute inset-[3.57%] h-[calc(100%-7.14%)] w-[calc(100%-7.14%)]"
                          style={{
                            objectFit:
                              fitMode === "contain"
                                ? "contain"
                                : fitMode === "cover"
                                  ? "cover"
                                  : fitMode === "fillWidth"
                                    ? "fill"
                                    : "fill",
                            objectPosition: `${alignX} ${alignY}`,
                            transform: `scale(${zoom}) rotate(${rotation}deg)`,
                            transformOrigin: "center",
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-neutral-400">
                API: <code className="rounded bg-neutral-100 px-1">{base}/api/folders/...</code>
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function ManagerPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center p-8">Загрузка...</div>}>
      <ManagerInner />
    </Suspense>
  );
}
