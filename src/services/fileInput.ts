// src/services/fileInput.ts
// Input file HANYA .txt/.md (keputusan user). Sesuai hierarki InstructionMain,
// isi teks dipakai sebagai MaterialFile. Untuk .md, markdown dikirim apa adanya
// (model memahami markdown); tidak ada konversi biner/base64.
export const MIME_TXT = 'text/plain';
export const MIME_MD = 'text/markdown';
const MAKS_UKURAN_BYTE = 2 * 1024 * 1024; // 2MB — cukup untuk materi guru

export interface FileMateriSiap {
  namaAsli: string;
  mimeType: string;
  ukuranByte: number;
  kontenTeks: string;
}

function tentukanMime(file: File): string {
  const nama = file.name.toLowerCase();
  if (nama.endsWith('.md') || nama.endsWith('.markdown')) return MIME_MD;
  if (file.type === 'text/markdown') return MIME_MD;
  return MIME_TXT;
}

export function validasiFileMateri(file: File): string | null {
  const nama = file.name.toLowerCase();
  const ekstensiOk = nama.endsWith('.txt') || nama.endsWith('.md') || nama.endsWith('.markdown');
  if (!ekstensiOk) return 'Hanya file .txt dan .md yang didukung.';
  if (file.size > MAKS_UKURAN_BYTE) return 'Ukuran file maksimal 2MB.';
  if (file.size === 0) return 'File kosong.';
  return null;
}

export async function bacaFileMateri(file: File): Promise<FileMateriSiap> {
  const galat = validasiFileMateri(file);
  if (galat) throw new Error(galat);
  const kontenTeks = await file.text();
  if (!kontenTeks.trim()) throw new Error('File tidak berisi teks yang bisa dibaca.');
  return { namaAsli: file.name, mimeType: tentukanMime(file), ukuranByte: file.size, kontenTeks };
}
