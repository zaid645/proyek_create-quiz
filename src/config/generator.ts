// src/config/generator.ts — Satu file konfigurasi generator soal (mudah diatur).
//
// 1. KONTEKS_EKSISTING: berapa banyak soal lama yang dikirim ke AI sebagai
//    referensi anti-duplikasi + field apa saja yang ikut (tanpa opsi/kunci
//    jawaban agar ringan). Diambil N soal TERBARU per tipe.
// 2. BATCH_GENERATOR: berapa soal diminta dalam SEKALI panggilan API
//    (loop berlanjut memanggil AI per batch, bukan satu per satu).
import type { DataSoal, TipeSoal } from '../db/types';

// ── 1. Batas soal sebelumnya yang dikirim ke AI (ringkas, tanpa opsi) ──
export interface AturanKonteks {
  /** Jumlah maks soal lama per tipe yang dikirim ke AI. */
  maks: number;
}

export const KONTEKS_EKSISTING: Record<TipeSoal, AturanKonteks> = {
  pilihan_ganda: { maks: 20 },
  uraian: { maks: 20 },
  penalaran: { maks: 10 },
  proyek: { maks: 3 },
};

// ── 2. Batas batch: soal per SEKALI panggilan API ──
export interface AturanBatch {
  maksPerPanggilan: number;
}

export const BATCH_GENERATOR: Record<TipeSoal, AturanBatch> = {
  pilihan_ganda: { maksPerPanggilan: 3 },
  uraian: { maksPerPanggilan: 10 },
  penalaran: { maksPerPanggilan: 5 },
  proyek: { maksPerPanggilan: 2 },
};

/** Ambil ukuran batch untuk tipe + sisa target (min 1). */
export function ukuranBatch(tipe: TipeSoal, sisa: number): number {
  const maks = BATCH_GENERATOR[tipe]?.maksPerPanggilan ?? 1;
  if (!Number.isFinite(sisa) || sisa <= 0) return Math.max(1, maks);
  return Math.max(1, Math.min(maks, Math.floor(sisa)));
}

/** Ringkas satu soal lama menjadi konteks anti-duplikasi (tanpa opsi/kunci). */
export function ringkasSatu(tipe: TipeSoal, data: Record<string, unknown>): Record<string, unknown> {
  if (tipe === 'proyek') {
    return typeof data['judul'] === 'string' ? { judul: data['judul'] } : {};
  }
  return typeof data['soal'] === 'string' ? { soal: data['soal'] } : {};
}

/**
 * Potong + ringkas daftar soal lama untuk dikirim ke AI:
 * ambil N TERBARU (ekor array) lalu buang opsi/kunci jawaban.
 */
export function potongKonteksEksisting(
  tipe: TipeSoal,
  daftar: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const maks = KONTEKS_EKSISTING[tipe]?.maks ?? 10;
  const ekor = daftar.length > maks ? daftar.slice(daftar.length - maks) : daftar;
  return ekor.map((d) => ringkasSatu(tipe, d));
}

// ── 3. Normalisasi + kunci deduplikasi sisi klien ──

/** Samakan teks untuk perbandingan: lowercase, rapikan spasi & baris. */
export function normalisasiKalimat(v: unknown): string {
  return String(v ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Kunci unik satu soal untuk cek duplikat (PG/uraian/nalar = batang soal). */
export function kunciDedup(tipe: TipeSoal, data: DataSoal): string {
  if (tipe === 'proyek') {
    const d = data as { judul?: unknown };
    return `proyek::${normalisasiKalimat(d.judul)}`;
  }
  const d = data as { soal?: unknown };
  return `${tipe}::${normalisasiKalimat(d.soal)}`;
}
