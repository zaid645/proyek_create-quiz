// src/services/gemini.ts — rakit prompt, panggil API, validasi output.
import { API_ENDPOINT_PREFIX } from '../config/models';
import type { DataSoal, TipeSoal } from '../db/types';
import InstructionMain from '../data/instructions/InstructionMain.json';
import InstructionPilihan from '../data/instructions/InstructionPilihan.json';
import InstructionUraian from '../data/instructions/InstructionUraian.json';
import InstructionNalar from '../data/instructions/InstructionNalar.json';
import InstructionProject from '../data/instructions/InstructionProject.json';

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
}

export function rakitPrompt(ctx: KonteksGenerate): Record<string, unknown> {
  const mentah = {
    pilihan_ganda: InstructionPilihan,
    uraian: InstructionUraian,
    penalaran: InstructionNalar,
    proyek: InstructionProject,
  }[ctx.tipe] as Record<string, unknown>;
  const instruksi: Record<string, unknown> = JSON.parse(JSON.stringify(mentah));

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
    InstructionMain,
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
    return { soal: d['soal'] as string, opsi: opsi.map((o) => ({ id: String(o.id), teks: String(o.teks) })), id_opsi_benar: d['id_opsi_benar'] as string };
  }
  if (tipe === 'uraian') {
    if (typeof d['soal'] !== 'string' || typeof d['jawaban_singkat'] !== 'string') throw new Error('Skema Uraian tidak sesuai.');
    return { soal: d['soal'], jawaban_singkat: d['jawaban_singkat'] };
  }
  if (tipe === 'penalaran') {
    if (typeof d['soal'] !== 'string' || typeof d['paragraf_jawaban'] !== 'string') throw new Error('Skema Penalaran tidak sesuai.');
    return { soal: d['soal'], paragraf_jawaban: d['paragraf_jawaban'] };
  }
  if (typeof d['judul'] !== 'string' || typeof d['deskripsi_proyek'] !== 'string' || !Array.isArray(d['langkah_langkah'])) {
    throw new Error('Skema Proyek tidak sesuai.');
  }
  return {
    judul: d['judul'] as string,
    deskripsi_proyek: d['deskripsi_proyek'] as string,
    langkah_langkah: (d['langkah_langkah'] as unknown[]).map(String),
  };
}

export async function generateSoal(apiKey: string, model: string, ctx: KonteksGenerate, onRetry?: (detik: number) => void): Promise<DataSoal> {
  if (!apiKey) throw new Error('API Key belum dipasang. Buka Konfigurasi AI terlebih dahulu.');
  const payload = {
    contents: [{ parts: [{ text: JSON.stringify(rakitPrompt(ctx), null, 2) }] }],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
  };
  const url = `${API_ENDPOINT_PREFIX}/models/${model}:generateContent?key=${apiKey}`;
  const teks = await panggilDenganBackoff(url, payload, onRetry);
  try {
    return validasiHasil(ctx.tipe, JSON.parse(bersihkanMarkdown(teks)));
  } catch (err) {
    if (err instanceof Error && (err.message.startsWith('Skema') || err.message.startsWith('Gagal membuat soal'))) throw err;
    throw new Error(`Parsing output AI gagal: ${err instanceof Error ? err.message : String(err)}`);
  }
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
