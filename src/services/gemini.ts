// src/services/gemini.ts — rakit prompt, panggil API, validasi output.
import { API_ENDPOINT_PREFIX } from '../config/models';
import type { DataSoal, TipeSoal } from '../db/types';
import InstructionMain from '../data/instructions/InstructionMain.json';
import InstructionPilihan from '../data/instructions/InstructionPilihan.json';
import InstructionUraian from '../data/instructions/InstructionUraian.json';
import InstructionNalar from '../data/instructions/InstructionNalar.json';
import InstructionProject from '../data/instructions/InstructionProject.json';
import { GAYA_TEKS_DEFAULT, ATURAN_AKSARA, cariBahasa, cariGayaTeks } from './bahasa';

const SYSTEM_PROMPT =
  'Anda adalah program generator soal otomatis terstruktur dalam format JSON mentah. ' +
  'Output Anda wajib mengikuti properti format_output yang diberikan di parameter. ' +
  'Dilarang memberikan teks pengantar atau penutup markdown block.';

const JEDA_BACKOFF_MS = [1000, 2000, 4000, 8000, 16000];

export interface KonteksGenerate {
  judul: string;
  deskripsi: string;
  customPrompt: string;
  tipe: TipeSoal;
  jumlahOpsiPG: number;
  soalEksisting: Array<Record<string, unknown>>;
  materiTeks: string;
  /** Jumlah soal diminta dalam SEKALI panggilan API (batch). Default: 1. */
  jumlahMinta?: number;
  /** Kode bahasa proyek (lihat services/bahasa.ts). Default: Bahasa Indonesia. */
  bahasa?: string;
  /** Kode gaya teks proyek. Default: 'ringkas'. */
  gayaTeks?: string;
}

/** Samakan jumlah minta: minimal 1, bilangan bulat. */
export function normalisasiJumlahMinta(v: unknown): number {
  const n = typeof v === 'number' ? v : 1;
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.floor(n));
}

// Salin InstructionMain lalu ganti placeholder {BAHASA} dengan nama bahasa nyata.
// Deep copy dipakai supaya JSON module yang di-import tidak ikut termodifikasi
// (kalau termodifikasi, prompt berikutnya akan memakai bahasa proyek sebelumnya).
function instruksiMainDenganBahasa(namaBahasa: string, gayaTeks: string, jumlah: number): Record<string, unknown> {
  const salin = JSON.parse(JSON.stringify(InstructionMain)) as Record<string, unknown>;
  if (typeof salin['bahasa'] === 'string') {
    salin['bahasa'] = (salin['bahasa'] as string).replaceAll('{BAHASA}', namaBahasa);
  }
  // Samakan "tepat 1 (satu) soal ... setiap permintaan" dengan ukuran batch.
  const daftarUtama = salin['instruksi_utama'];
  if (Array.isArray(daftarUtama) && jumlah > 1) {
    daftarUtama[0] =
      `Hasilkan tepat ${jumlah} soal baru yang SALING BERBEDA untuk setiap permintaan ` +
      `berdasarkan spesifikasi tipe soal yang dikirimkan pada 'QuestionInstruction'. ` +
      `Output wajib berupa objek JSON dengan properti 'daftar_soal' berisi array tepat ${jumlah} soal.`;
  }
  // Aturan gaya teks disisipkan ke dalam daftar instruksi utama supaya punya
  // bobot yang sama dengan aturan lain, bukan sekadar catatan di akhir.
  // ATURAN_AKSARA ikut disisipkan di sini (bukan hanya di gaya 'struktur')
  // karena kekeliruan penempatan aksara asing —尤其是 ayat Arab yang menempel
  // di tengah kalimat Indonesia — adalah kesalahan tipografi, bukan gaya bahasa.
  const aturanGaya = cariGayaTeks(gayaTeks).aturanPrompt;
  const utama = salin['instruksi_utama'];
  if (Array.isArray(utama)) utama.splice(6, 0, aturanGaya, ATURAN_AKSARA);
  else salin['instruksi_utama'] = [aturanGaya, ATURAN_AKSARA];
  return salin;
}

export function rakitPrompt(ctx: KonteksGenerate): Record<string, unknown> {
  const jumlah = normalisasiJumlahMinta(ctx.jumlahMinta);
  const mentah = {
    pilihan_ganda: InstructionPilihan,
    uraian: InstructionUraian,
    penalaran: InstructionNalar,
    proyek: InstructionProject,
  }[ctx.tipe] as Record<string, unknown>;
  const instruksi: Record<string, unknown> = JSON.parse(JSON.stringify(mentah));

  // Samakan template "tepat 1 (satu) soal" menjadi dinamis agar AI tahu
  // berapa soal yang diminta per panggilan (batch). Format output N>1
  // diubah menjadi array berisi N objek mengikuti skema semula.
  const labelJumlah = jumlah > 1 ? `tepat ${jumlah} soal baru yang berbeda satu sama lain` : 'tepat 1 (satu) soal baru';
  if (typeof instruksi['deskripsi_tugas'] === 'string') {
    instruksi['deskripsi_tugas'] = (instruksi['deskripsi_tugas'] as string).replace(
      /tepat 1 \(satu\) soal [a-z]+ baru/,
      labelJumlah,
    );
  }
  if (jumlah > 1) {
    instruksi['jumlah_diminta'] = jumlah;
    instruksi['format_output'] = {
      daftar_soal: Array.from(
        { length: jumlah },
        () => instruksi['format_output'] as Record<string, unknown>,
      ),
    };
    const spesifik = instruksi['instruksi_spesifik'];
    if (Array.isArray(spesifik)) {
      spesifik.unshift(
        `Wajib menghasilkan tepat ${jumlah} soal yang SALING BERBEDA (tidak boleh ada duplikat atau parafrasa antar soal dalam batch ini) dan semuanya berbeda dari 'ExistedQuestion'.`,
      );
    }
  }

  if (ctx.tipe === 'pilihan_ganda') {
    const n = Math.min(5, Math.max(2, ctx.jumlahOpsiPG));
    const huruf = ['A', 'B', 'C', 'D', 'E'].slice(0, n).join(', ');
    const dinamis = instruksi['konfigurasi_dinamis'] as Record<string, string>;
    dinamis['jumlah_opsi'] = String(n);
    dinamis['susunan_id_opsi'] = huruf;
    instruksi['instruksi_spesifik'] = (instruksi['instruksi_spesifik'] as string[]).map((s) =>
      s.replaceAll('{JUMLAH_OPSI}', String(n)).replaceAll('{DAFTAR_ID_OPSI}', huruf),
    );
  }

  return {
    InstructionMain: instruksiMainDenganBahasa(
      cariBahasa(ctx.bahasa).namaPrompt,
      ctx.gayaTeks ?? GAYA_TEKS_DEFAULT,
      jumlah,
    ),
    JudulSoalProyek: ctx.judul || 'Ujian Baru',
    DeskripsiSoal: ctx.deskripsi,
    CustomPrompt: ctx.customPrompt,
    QuestionInstruction: instruksi,
    ExistedQuestion: ctx.soalEksisting,
    MaterialFile: ctx.materiTeks,
  };
}


async function panggilDenganBackoff(url: string, payload: unknown, onRetry?: (detik: number) => void): Promise<string> {
  let terakhir: unknown = null;
  for (let percobaan = 0; percobaan <= JEDA_BACKOFF_MS.length; percobaan++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(`HTTP ${res.status}: ${data.error?.message ?? 'Kesalahan Tidak Dikenal'}`);
      }
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const teks = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!teks) throw new Error('Respon kosong dari API Gemini.');
      return teks;
    } catch (err) {
      terakhir = err;
      if (percobaan === JEDA_BACKOFF_MS.length) break;
      onRetry?.(JEDA_BACKOFF_MS[percobaan] / 1000);
      await new Promise((r) => setTimeout(r, JEDA_BACKOFF_MS[percobaan]));
    }
  }
  throw terakhir instanceof Error ? terakhir : new Error(String(terakhir));
}

function bersihkanMarkdown(teks: string): string {
  let bersih = teks.trim();
  if (bersih.startsWith('```')) {
    bersih = bersih.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '').trim();
  }
  return bersih;
}

// Model kadang memancarkan urutan backslash-n LITERAL di dalam string JSON
// alih-alih escape newline yang sesungguhnya. Setelah JSON.parse, itu berubah
// jadi karakter "\" + "n" yang tidak terlihat sebagai baris baru di UI. Ubah
// jadi newline asli supaya tampil benar. Line ending juga dinormalisasi ke \n
// supaya tidak ada carriage return yang bikin baris kosong ganda di Windows.
function normalisasiBaris(v: string): string {
  return v.replace(/\r\n?/g, '\n').replace(/\\n/g, '\n');
}

export function validasiHasil(tipe: TipeSoal, mentah: unknown): DataSoal {
  const d = mentah as Record<string, unknown>;
  if (!d || typeof d !== 'object') throw new Error('Skema tidak sesuai: bukan objek.');
  if (d['error'] === true || d['error'] === 'true') {
    throw new Error(`Gagal membuat soal. Alasan AI: ${String(d['pesan'] ?? 'Materi tidak mendukung.')}`);
  }
  if (tipe === 'pilihan_ganda') {
    const opsi = d['opsi'] as Array<{ id?: string; teks?: string }> | undefined;
    if (typeof d['soal'] !== 'string' || !Array.isArray(opsi) || typeof d['id_opsi_benar'] !== 'string') {
      throw new Error('Skema Pilihan Ganda tidak sesuai.');
    }
    return {
      soal: normalisasiBaris(d['soal'] as string),
      opsi: opsi.map((o) => ({ id: String(o.id), teks: normalisasiBaris(String(o.teks)) })),
      id_opsi_benar: d['id_opsi_benar'] as string,
    };
  }
  if (tipe === 'uraian') {
    if (typeof d['soal'] !== 'string' || typeof d['jawaban_singkat'] !== 'string') throw new Error('Skema Uraian tidak sesuai.');
    return { soal: normalisasiBaris(d['soal']), jawaban_singkat: normalisasiBaris(d['jawaban_singkat']) };
  }
  if (tipe === 'penalaran') {
    if (typeof d['soal'] !== 'string' || typeof d['paragraf_jawaban'] !== 'string') throw new Error('Skema Penalaran tidak sesuai.');
    return { soal: normalisasiBaris(d['soal']), paragraf_jawaban: normalisasiBaris(d['paragraf_jawaban']) };
  }
  if (typeof d['judul'] !== 'string' || typeof d['deskripsi_proyek'] !== 'string' || !Array.isArray(d['langkah_langkah'])) {
    throw new Error('Skema Proyek tidak sesuai.');
  }
  return {
    judul: normalisasiBaris(d['judul'] as string),
    deskripsi_proyek: normalisasiBaris(d['deskripsi_proyek'] as string),
    langkah_langkah: (d['langkah_langkah'] as unknown[]).map((x) => normalisasiBaris(String(x))),
  };
}

export async function generateSoal(apiKey: string, model: string, ctx: KonteksGenerate, onRetry?: (detik: number) => void): Promise<DataSoal> {
  const daftar = await generateSoalBatch(apiKey, model, { ...ctx, jumlahMinta: 1 }, onRetry);
  if (daftar.length === 0) throw new Error('Respon kosong dari API Gemini.');
  return daftar[0]!;
}

/**
 * Minta N soal sekaligus dalam SATU panggilan API (batch).
 * Toleran parsial: entri yang gagal skema dibuang, yang valid dikembalikan.
 * Kompatibel mundur: AI lama yang tetap mengembalikan 1 objek (bukan array)
 * tetap diterima bila jumlahMinta = 1.
 */
export async function generateSoalBatch(
  apiKey: string,
  model: string,
  ctx: KonteksGenerate,
  onRetry?: (detik: number) => void,
): Promise<DataSoal[]> {
  if (!apiKey) throw new Error('API Key belum dipasang. Buka Konfigurasi AI terlebih dahulu.');
  const jumlah = normalisasiJumlahMinta(ctx.jumlahMinta);
  const payload = {
    contents: [{ parts: [{ text: JSON.stringify(rakitPrompt({ ...ctx, jumlahMinta: jumlah }), null, 2) }] }],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
  };
  const url = `${API_ENDPOINT_PREFIX}/models/${model}:generateContent?key=${apiKey}`;
  const teks = await panggilDenganBackoff(url, payload, onRetry);
  let parsed: unknown;
  try {
    parsed = JSON.parse(bersihkanMarkdown(teks));
  } catch (err) {
    throw new Error(`Parsing output AI gagal: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
  const d = parsed as Record<string, unknown>;
  if (d && typeof d === 'object' && (d['error'] === true || d['error'] === 'true')) {
    throw new Error(`Gagal membuat soal. Alasan AI: ${String(d['pesan'] ?? 'Materi tidak mendukung.')}`);
  }
  // Bentuk batch: { daftar_soal: [...] }. Bentuk lama (1 objek) tetap didukung.
  const mentahList: unknown[] = Array.isArray((d as Record<string, unknown>)['daftar_soal'])
    ? ((d as Record<string, unknown>)['daftar_soal'] as unknown[])
    : [parsed];
  const hasil: DataSoal[] = [];
  let gagalSkema = 0;
  for (const item of mentahList) {
    try {
      hasil.push(validasiHasil(ctx.tipe, item));
    } catch (err) {
      // Jangan gagalkan seluruh batch gara-gara 1 entri rusak.
      if (err instanceof Error && err.message.startsWith('Gagal membuat soal')) throw err;
      gagalSkema += 1;
    }
    if (hasil.length >= jumlah) break;
  }
  if (hasil.length === 0) {
    throw new Error(
      gagalSkema > 0
        ? `Skema ${jumlah} soal batch tidak sesuai (semua ${gagalSkema} entri gagal validasi).`
        : 'Respon kosong dari API Gemini.',
    );
  }
  return hasil;
}

export function unduhDebugPrompt(ctx: KonteksGenerate): void {
  const blob = new Blob([JSON.stringify(rakitPrompt(ctx), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DebugPrompt_${ctx.tipe}_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
