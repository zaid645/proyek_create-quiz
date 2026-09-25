// src/db/repositories/proyekRepo.ts
import { barisHasil, query, withTransaction, type TxQueryFn } from '../client';
import type { Proyek } from '../types';
import { buatId } from '../../services/id';
import { BAHASA_DEFAULT, GAYA_TEKS_DEFAULT } from '../../services/bahasa';

function sekarang(): string {
  return new Date().toISOString();
}

export async function listProyek(): Promise<Proyek[]> {
  return barisHasil<Proyek>(`SELECT * FROM proyek ORDER BY diubah_pada DESC, dibuat_pada DESC`);
}

export async function ambilProyek(id: string): Promise<Proyek | null> {
  const rows = await barisHasil<Proyek>(`SELECT * FROM proyek WHERE id = ?`, [id]);
  return rows[0] ?? null;
}

export async function buatProyek(
  nama: string,
  deskripsi = '',
  customPrompt = '',
  bahasa = BAHASA_DEFAULT,
  gayaTeks = GAYA_TEKS_DEFAULT,
): Promise<Proyek> {
  const id = buatId('proyek');
  const waktu = sekarang();
  await query(
    `INSERT INTO proyek (id, nama_proyek, deskripsi, custom_prompt, bahasa, gaya_teks, default_poin_pg, default_poin_uraian, default_poin_penalaran, default_poin_proyek, target_pg, target_uraian, target_penalaran, target_proyek, dibuat_pada, diubah_pada)
     VALUES (?, ?, ?, ?, ?, ?, 2, 5, 15, 25, 0, 0, 0, 0, ?, ?)`,
    [id, nama, deskripsi, customPrompt, bahasa, gayaTeks, waktu, waktu],
  );
  const hasil = await ambilProyek(id);
  if (!hasil) throw new Error('Gagal membuat proyek.');
  return hasil;
}

export async function ubahProyek(id: string, patch: Partial<Proyek>): Promise<void> {
  const petaKolom: Array<[keyof Proyek, string]> = [
    ['nama_proyek', 'nama_proyek'],
    ['deskripsi', 'deskripsi'],
    ['custom_prompt', 'custom_prompt'],
    ['bahasa', 'bahasa'],
    ['gaya_teks', 'gaya_teks'],
    ['default_poin_pg', 'default_poin_pg'],
    ['default_poin_uraian', 'default_poin_uraian'],
    ['default_poin_penalaran', 'default_poin_penalaran'],
    ['default_poin_proyek', 'default_poin_proyek'],
    ['target_pg', 'target_pg'],
    ['target_uraian', 'target_uraian'],
    ['target_penalaran', 'target_penalaran'],
    ['target_proyek', 'target_proyek'],
  ];
  const kolom: string[] = [];
  const params: unknown[] = [];
  for (const [kunci, namaKolom] of petaKolom) {
    const nilai = patch[kunci];
    if (nilai === undefined) continue;
    kolom.push(`${namaKolom} = ?`);
    params.push(nilai);
  }
  kolom.push('diubah_pada = ?');
  params.push(sekarang());
  params.push(id);
  await query(`UPDATE proyek SET ${kolom.join(', ')} WHERE id = ?`, params);
}

// Hapus proyek + SELURUH soal & file di dalamnya, atomik via transaksi.
export async function hapusProyek(id: string): Promise<void> {
  await withTransaction(async (tx: TxQueryFn) => {
    await tx(`DELETE FROM proyek_file WHERE id_proyek = ?`, [id]);
    await tx(`DELETE FROM soal WHERE id_proyek = ?`, [id]);
    await tx(`DELETE FROM proyek WHERE id = ?`, [id]);
  });
}
