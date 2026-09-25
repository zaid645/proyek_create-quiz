// src/services/exportImport.ts — impor/ekspor JSON (kompatibel lama).
import type { BankSoalJSON, DataSoal, Proyek, SoalRecord, TipeSoal } from '../db/types';

// Slug untuk nama file. Huruf non-Latin (Arab, Ibrani, dst) TIDAK punya padanan
// a-z, jadi regex lama akan mengubah seluruh nama proyek Arab menjadi "_" yang
// tidak berguna. Fallback: transliterate sederhana ke huruf Latin, lalu pakai
// "ujian" kalau memang tidak ada karakter yang bisa dipakai sama sekali.
const PETA_TRANSLITERASI: Record<string, string> = {
  ا: 'a', أ: 'a', إ: 'i', آ: 'a', ب: 'b', ت: 't', ث: 'ts', ج: 'j', ح: 'h', خ: 'kh',
  د: 'd', ذ: 'dz', ر: 'r', ز: 'z', س: 's', ش: 'sy', ص: 'sh', ض: 'dh', ط: 'th', ظ: 'zh',
  ع: 'a', غ: 'gh', ف: 'f', ق: 'q', ك: 'k', ل: 'l', م: 'm', ن: 'n', ه: 'h', و: 'w',
  ي: 'y', ى: 'a', ة: 'h', ء: '', ؤ: 'u', ئ: 'i',
};

function transliterasi(teks: string): string {
  return teks
    .split('')
    .map((c) => (c in PETA_TRANSLITERASI ? PETA_TRANSLITERASI[c] : c))
    .join('');
}

export function slug(teks: string): string {
  const dasar = (teks || '').trim();
  if (!dasar) return 'ujian';
  const bersih = String(dasar)
    // Buang harakat (fathah/dammah/kasrah) dan tatweel lebih dulu: kalau tidak,
    // "مُحَمَّد" jadi "m_h_m_d" yang tidak pernah diketik pengguna.
    .replace(/[ً-ْـ]/g, '')
    // Angka Arab-Indic (٠١٢٣) dan Extended (۰۱۲۳) dipetakan ke digit ASCII dulu.
    // Tanpa ini seluruh angka ikut hilang, karena regex slug hanya menerima a-z0-9
    // dan nama file jadi kehilangan bagian penting seperti tahun atau nomor soal.
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  // Transliterasi SELALU dijalankan lebih dulu, bukan sebagai fallback. Huruf Arab
  // tidak punya padanan a-z, jadi kalau slug biasa yang dipakai lebih dulu, teks
  // "اختبار ١٢٣" akan menjadi "123" — huruf aslinya hilang. Dengan transliterasi
  // lebih dulu, huruf Latin yang sudah ada ikut dipertahankan sehingga teks
  // campuran ("Ujian Arabic ٢") tetap utuh.
  const hasil = transliterasi(bersih)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return hasil || 'ujian';
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
