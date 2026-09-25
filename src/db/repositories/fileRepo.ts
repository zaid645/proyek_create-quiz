// src/db/repositories/fileRepo.ts — materi .txt/.md per proyek.
import { barisHasil, query } from '../client';
import type { ProyekFile } from '../types';
import { buatId } from '../../services/id';

export async function listFile(idProyek: string): Promise<ProyekFile[]> {
  return barisHasil<ProyekFile>(`SELECT * FROM proyek_file WHERE id_proyek = ? ORDER BY dibuat_pada ASC`, [
    idProyek,
  ]);
}

export async function simpanFile(
  idProyek: string,
  namaAsli: string,
  mimeType: string,
  ukuranByte: number,
  kontenTeks: string,
): Promise<ProyekFile> {
  const id = buatId('file');
  const dibuatPada = new Date().toISOString();
  await query(
    `INSERT INTO proyek_file (id, id_proyek, nama_asli, mime_type, ukuran_byte, konten_teks, dibuat_pada)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, idProyek, namaAsli, mimeType, ukuranByte, kontenTeks, dibuatPada],
  );
  return { id, id_proyek: idProyek, nama_asli: namaAsli, mime_type: mimeType, ukuran_byte: ukuranByte, konten_teks: kontenTeks, dibuat_pada: dibuatPada };
}

export async function hapusFile(id: string): Promise<void> {
  await query(`DELETE FROM proyek_file WHERE id = ?`, [id]);
}

export async function hapusSemuaFile(idProyek: string): Promise<void> {
  await query(`DELETE FROM proyek_file WHERE id_proyek = ?`, [idProyek]);
}
