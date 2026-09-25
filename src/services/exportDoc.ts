// src/services/exportDoc.ts — ekspor .doc (port exportToDoc lama).
import type { SoalRecord, TipeSoal } from '../db/types';
import type { BankSoalAktif } from './exportImport';
import { slug, unduhBlob } from './exportImport';

// Escape HTML lalu ubah baris baru jadi <br />.
// Urutan penting: "&" harus di-escape lebih dulu, kalau tidak "&lt;" ikut berubah.
// Tags <br /> sengaja ditambahkan SETELAH escaping, jadi tidak ikut ter-escape.
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '<br />');
}

export function eksporDoc(bank: BankSoalAktif): void {
  const judul = bank.proyek.nama_proyek || 'Ujian Akhir';
  const aktif = bank.soal.filter((s) => s.is_hidden !== 1);
  const per = (t: TipeSoal): Array<{ s: SoalRecord; d: Record<string, unknown> }> =>
    aktif.filter((s) => s.tipe === t).map((s) => ({ s, d: JSON.parse(s.data_json) as Record<string, unknown> }));
  const pg = per('pilihan_ganda');
  const uraian = per('uraian');
  const nalar = per('penalaran');
  const proyek = per('proyek');

  let html =
    `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>` +
    `<head><title>${esc(judul)}</title><style>` +
    `body { font-family: 'Times New Roman', 'Noto Naskh Arabic', 'Arabic Typesetting', Times, serif; line-height: 1.5; color: #000; }` +
    `h1 { text-align: center; font-size: 16pt; margin-bottom: 20px; font-weight: bold; text-transform: uppercase; }` +
    `h2 { font-size: 14pt; margin-top: 30px; margin-bottom: 15px; font-weight: bold; text-transform: uppercase; }` +
    `ol { padding-left: 24px; margin-top: 5px; margin-bottom: 15px; }` +
    `li { font-size: 12pt; margin-bottom: 10px; page-break-inside: avoid; }` +
    `</style></head><body dir="auto">` +
    `<h1>${esc(judul)}</h1>`;
  html += `<h1 style="font-size: 14pt; margin-top: -10px;">LEMBAR SOAL</h1>`;

  if (pg.length > 0) {
    html += `<h2>I. Pilihan Ganda</h2><ol>`;
    for (const { d } of pg) {
      html += `<li><div>${esc(d['soal'])}</div><ol type="A">`;
      const opsi = (d['opsi'] as Array<{ teks?: string }>) ?? [];
      for (const o of opsi) html += `<li>${esc(o.teks)}</li>`;
      html += `</ol></li>`;
    }
    html += `</ol>`;
  }
  if (uraian.length > 0) {
    html += `<h2>II. Soal Uraian</h2><ol>`;
    for (const { d } of uraian) html += `<li><div>${esc(d['soal'])}</div></li>`;
    html += `</ol>`;
  }
  if (nalar.length > 0) {
    html += `<h2>III. Soal Analisis / Penalaran Kritis</h2><ol>`;
    for (const { d } of nalar) html += `<li><div>${esc(d['soal'])}</div></li>`;
    html += `</ol>`;
  }
  if (proyek.length > 0) {
    html += `<h2>IV. Penugasan Proyek Pembelajaran</h2><ol>`;
    for (const { d } of proyek) {
      html += `<li><div>Proyek: ${esc(d['judul'])}</div>`;
      html += `<p style="font-size: 12pt; margin: 4px 0;">${esc(d['deskripsi_proyek'])}</p>`;
      html += `<div><strong>Panduan Langkah:</strong><ol>`;
      const langkah = (d['langkah_langkah'] as unknown[]) ?? [];
      for (const st of langkah) html += `<li>${esc(st)}</li>`;
      html += `</ol></div></li>`;
    }
    html += `</ol>`;
  }

  html += `<br clear="all" style="page-break-before:always" /><h1>KUNCI JAWABAN</h1>`;
  if (pg.length > 0) {
    html += `<h2>I. Pilihan Ganda</h2><ol>`;
    for (const { d } of pg) html += `<li><div>${esc(d['id_opsi_benar'])}</div></li>`;
    html += `</ol>`;
  }
  if (uraian.length > 0) {
    html += `<h2>II. Soal Uraian</h2><ol>`;
    for (const { d } of uraian) html += `<li><div>${esc(d['jawaban_singkat'])}</div></li>`;
    html += `</ol>`;
  }
  if (nalar.length > 0) {
    html += `<h2>III. Soal Analisis / Penalaran Kritis</h2><ol>`;
    for (const { d } of nalar) html += `<li><div>${esc(d['paragraf_jawaban'])}</div></li>`;
    html += `</ol>`;
  }
  html += `</body></html>`;

  unduhBlob(new Blob(['﻿' + html], { type: 'application/msword' }), `LembarSoal_${slug(judul)}.doc`);
}
