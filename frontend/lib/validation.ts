const ALLOWED = new Set([
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "tif",
  "tiff",
  "webp",
  "heic",
  "heif",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "odt",
  "ods",
  "odp",
  "rtf",
  "txt",
]);

const BLOCKED = new Set([
  "exe",
  "bat",
  "cmd",
  "ps1",
  "sh",
  "vbs",
  "msi",
  "dll",
  "scr",
  "js",
  "jar",
  "lnk",
  "com",
  "reg",
]);

export function getExtension(filename: string): string {
  const i = filename.lastIndexOf(".");
  if (i < 0) return "";
  return filename.slice(i + 1).toLowerCase();
}

export function isAllowedFile(filename: string): boolean {
  const ext = getExtension(filename);
  if (!ext || BLOCKED.has(ext)) return false;
  return ALLOWED.has(ext);
}
