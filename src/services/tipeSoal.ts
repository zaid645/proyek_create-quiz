// src/services/tipeSoal.ts — label + helper target/poin per tipe soal (satu sumber).
import type { Proyek, SoalRecord, TipeSoal } from '../db/types';

export const TIPE_LABEL: Record<TipeSoal, string> = {
  pilihan_ganda: 'Pilihan Ganda',
  uraian: 'Uraian',
  penalaran: 'Penalaran',
  proyek: 'Proyek Praktis',
};

export const TIPE_SINGKAT: Record<TipeSoal, string> = {
  pilihan_ganda: 'Pilgan',
  uraian: 'Uraian',
  penalaran: 'Nalar',
  proyek: 'Proyek',
};

export const DAFTAR_TIPE: TipeSoal[] = ['pilihan_ganda', 'uraian', 'penalaran', 'proyek'];

// Batas aman loop otomatis supaya tidak menembak API tanpa henti.
export const MAKS_TARGET_SOAL = 300;

const KUNCI_TARGET: Record<TipeSoal, keyof Proyek> = {
  pilihan_ganda: 'target_pg',
  uraian: 'target_uraian',
  penalaran: 'target_penalaran',
  proyek: 'target_proyek',
};

export function kunciTarget(t: TipeSoal): keyof Proyek {
  return KUNCI_TARGET[t];
}

export function targetSoal(p: Proyek, t: TipeSoal): number {
  const nilai = p[KUNCI_TARGET[t]];
  return typeof nilai === 'number' ? nilai : 0;
}

export function poinDefault(p: Proyek, t: TipeSoal): number {
  const kunci: keyof Proyek =
    t === 'pilihan_ganda' ? 'default_poin_pg'
    : t === 'uraian' ? 'default_poin_uraian'
    : t === 'penalaran' ? 'default_poin_penalaran'
    : 'default_poin_proyek';
  const nilai = p[kunci];
  return typeof nilai === 'number' ? nilai : 0;
}

export function hitungTipe(list: SoalRecord[], t: TipeSoal): number {
  let n = 0;
  for (const s of list) if (s.tipe === t) n += 1;
  return n;
}

export function batasiTarget(nilai: number): number {
  if (!Number.isFinite(nilai)) return 0;
  return Math.max(0, Math.min(MAKS_TARGET_SOAL, Math.floor(nilai)));
}
