// src/services/exportImport.ts — impor/ekspor JSON (kompatibel lama).
import type { BankSoalJSON, DataSoal, Proyek, SoalRecord, TipeSoal } from '../db/types';

export function slug(teks: string): string {
  return (teks || 'ujian').toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

export function unduhBlob(blob: Blob, namaFile: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = namaFile;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface BankSoalAktif {
  proyek: Proyek;
  soal: SoalRecord[];
}

export function susunBankJSON(bank: BankSoalAktif): BankSoalJSON {
  const daftar_soal: BankSoalJSON['daftar_soal'] = {
    pilihan_ganda: [],
    uraian: [],
    penalaran: [],
    proyek: [],
  };
  for (const s of bank.soal) {
    const data = JSON.parse(s.data_json) as Record<string, unknown>;
    const baris = { ...data, poin: s.poin, is_hidden: s.is_hidden === 1, id: s.id };
    if (s.tipe === 'pilihan_ganda') daftar_soal.pilihan_ganda.push(baris);
    else if (s.tipe === 'uraian') daftar_soal.uraian.push(baris);
    else if (s.tipe === 'penalaran') daftar_soal.penalaran.push(baris);
    else daftar_soal.proyek.push(baris);
  }
  return {
    metadata: {
      judul_soal: bank.proyek.nama_proyek,
      deskripsi_soal: bank.proyek.deskripsi ?? '',
      custom_prompt: bank.proyek.custom_prompt ?? '',
    },
    daftar_soal,
  };
}

export function eksporJSON(bank: BankSoalAktif): void {
  const blob = new Blob([JSON.stringify(susunBankJSON(bank), null, 2)], { type: 'application/json' });
  unduhBlob(blob, `BankSoal_${slug(bank.proyek.nama_proyek)}.json`);
}

export async function bacaFileJSON(file: File): Promise<BankSoalJSON> {
  const teks = await file.text();
  const data = JSON.parse(teks) as Partial<BankSoalJSON>;
  if (!data || typeof data !== 'object' || !data.daftar_soal) {
    throw new Error("Properti 'daftar_soal' tidak ditemukan.");
  }
  const ds = data.daftar_soal;
  return {
    metadata: {
      judul_soal: data.metadata?.judul_soal ?? 'Ujian',
      deskripsi_soal: data.metadata?.deskripsi_soal ?? '',
      custom_prompt: data.metadata?.custom_prompt ?? '',
    },
    daftar_soal: {
      pilihan_ganda: Array.isArray(ds.pilihan_ganda) ? ds.pilihan_ganda : [],
      uraian: Array.isArray(ds.uraian) ? ds.uraian : [],
      penalaran: Array.isArray(ds.penalaran) ? ds.penalaran : [],
      proyek: Array.isArray(ds.proyek) ? ds.proyek : [],
    },
  };
}

export interface ItemImpor {
  tipe: TipeSoal;
  data: DataSoal;
  poin: number;
  isHidden: boolean;
}

function ambilPoin(o: Record<string, unknown>, def: number): number {
  return typeof o['poin'] === 'number' ? (o['poin'] as number) : def;
}

function tanpaMeta(o: Record<string, unknown>): Record<string, unknown> {
  const salin = { ...o };
  delete salin['id'];
  delete salin['poin'];
  delete salin['is_hidden'];
  return salin;
}

export function petakanImpor(bank: BankSoalJSON): ItemImpor[] {
  const hasil: ItemImpor[] = [];
  for (const o of bank.daftar_soal.pilihan_ganda) {
    hasil.push({ tipe: 'pilihan_ganda', data: tanpaMeta(o) as unknown as DataSoal, poin: ambilPoin(o, 2), isHidden: o['is_hidden'] === true });
  }
  for (const o of bank.daftar_soal.uraian) {
    hasil.push({ tipe: 'uraian', data: tanpaMeta(o) as unknown as DataSoal, poin: ambilPoin(o, 5), isHidden: o['is_hidden'] === true });
  }
  for (const o of bank.daftar_soal.penalaran) {
    hasil.push({ tipe: 'penalaran', data: tanpaMeta(o) as unknown as DataSoal, poin: ambilPoin(o, 15), isHidden: o['is_hidden'] === true });
  }
  for (const o of bank.daftar_soal.proyek) {
    hasil.push({ tipe: 'proyek', data: tanpaMeta(o) as unknown as DataSoal, poin: ambilPoin(o, 25), isHidden: o['is_hidden'] === true });
  }
  return hasil;
}
