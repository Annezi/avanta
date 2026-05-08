/** Client-side PDF page count using pdf.js */
export async function countPdfPages(file: File): Promise<number> {
  const pdfjs = await import("pdfjs-dist");
  const version = pdfjs.version;
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

  const data = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  return pdf.numPages;
}
