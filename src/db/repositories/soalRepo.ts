// src/db/repositories/soalRepo.ts
import { barisHasil, query } from '../client';
import type { DataSoal, SoalDenganData, SoalRecord, StatistikSoal, TipeSoal } from '../types';
import { buatId } from '../../services/id';

function sekarang(): string {
  return new Date().toISOString();
}

function keRecord(row: Record<string, unknown>): SoalRecord {
  return {
    id: String(row['id']),
    id_proyek: String(row['id_proyek']),
    tipe: row['tipe'] as TipeSoal,
    data_json: String(row['data_json']),
    poin: Number(row['poin']),
    is_hidden: Number(row['is_hidden']),
    urutan: row['urutan'] === null || row['urutan'] === undefined ? null : Number(row['urutan']),
    dibuat_pada: (row['dibuat_pada'] as string | null) ?? null,
    diubah_pada: (row['diubah_pada'] as string | null) ?? null,
  };
}

export function parseData<T extends DataSoal>(record: SoalRecord): SoalDenganData<T> {
  return { record, data: JSON.parse(record.data_json) as T };
}

export async function listSoal(idProyek: string, tipe?: TipeSoal): Promise<SoalRecord[]> {
  const rows = tipe
    ? await barisHasil<Record<string, unknown>>(
        `SELECT * FROM soal WHERE id_proyek = ? AND tipe = ? ORDER BY urutan ASC, dibuat_pada ASC`,
        [idProyek, tipe],
      )
    : await barisHasil<Record<string, unknown>>(
        `SELECT * FROM soal WHERE id_proyek = ? ORDER BY urutan ASC, dibuat_pada ASC`,
        [idProyek],
      );
  return rows.map(keRecord);
}

export async function statistikSoal(idProyek: string): Promise<StatistikSoal> {
  const rows = await barisHasil<{ tipe: string; jumlah: number }>(
    `SELECT tipe, COUNT(*) AS jumlah FROM soal WHERE id_proyek = ? GROUP BY tipe`,
    [idProyek],
  );
  const stats: StatistikSoal = { total: 0, pilihan_ganda: 0, uraian: 0, penalaran: 0, proyek: 0 };
  for (const r of rows) {
    const n = Number(r.jumlah);
    stats.total += n;
    if (r.tipe === 'pilihan_ganda') stats.pilihan_ganda = n;
    else if (r.tipe === 'uraian') stats.uraian = n;
    else if (r.tipe === 'penalaran') stats.penalaran = n;
    else if (r.tipe === 'proyek') stats.proyek = n;
  }
  return stats;
}

export async function urutanBerikutnya(idProyek: string): Promise<number> {
  const rows = await barisHasil<{ maks: number | null }>(
    `SELECT MAX(urutan) AS maks FROM soal WHERE id_proyek = ?`,
    [idProyek],
  );
  return (rows[0]?.maks ?? 0) + 1;
}

export async function tambahSoal(
  idProyek: string,
  tipe: TipeSoal,
  data: DataSoal,
  poin: number,
): Promise<SoalRecord> {
  const id = buatId(tipe);
  const waktu = sekarang();
  const urutan = await urutanBerikutnya(idProyek);
  await query(
    `INSERT INTO soal (id, id_proyek, tipe, data_json, poin, is_hidden, urutan, dibuat_pada, diubah_pada)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [id, idProyek, tipe, JSON.stringify(data), poin, urutan, waktu, waktu],
  );
  return { id, id_proyek: idProyek, tipe, data_json: JSON.stringify(data), poin, is_hidden: 0, urutan, dibuat_pada: waktu, diubah_pada: waktu };
}

export async function ubahIsiSoal(id: string, data: DataSoal): Promise<void> {
  await query(`UPDATE soal SET data_json = ?, diubah_pada = ? WHERE id = ?`, [
    JSON.stringify(data),
    sekarang(),
    id,
  ]);
}

export async function ubahPoin(id: string, poin: number): Promise<void> {
  await query(`UPDATE soal SET poin = ?, diubah_pada = ? WHERE id = ?`, [poin, sekarang(), id]);
}

export async function ubahVisibilitas(id: string, isHidden: boolean): Promise<void> {
  await query(`UPDATE soal SET is_hidden = ?, diubah_pada = ? WHERE id = ?`, [
    isHidden ? 1 : 0,
    sekarang(),
    id,
  ]);
}

export async function hapusSoal(id: string): Promise<void> {
  await query(`DELETE FROM soal WHERE id = ?`, [id]);
}

export async function kosongkanSoal(idProyek: string, tipe?: TipeSoal): Promise<void> {
  if (tipe) await query(`DELETE FROM soal WHERE id_proyek = ? AND tipe = ?`, [idProyek, tipe]);
  else await query(`DELETE FROM soal WHERE id_proyek = ?`, [idProyek]);
}
