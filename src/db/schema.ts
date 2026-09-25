import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Master model AI — di-seed dari src/config/models.ts (lihat 001_init_schema.sql).
// Single source of truth tetap DAFTAR_MODEL; tabel ini cache agar query offline.
export const opsiModelAi = sqliteTable('opsi_model_ai', {
  id: text('id').primaryKey(),
  nama: text('nama').notNull(),
  stringModel: text('string_model').notNull(),
});

// Proyek milik user. Hapus proyek = cascade hapus soal + file (via transaksi repo).
export const proyek = sqliteTable('proyek', {
  id: text('id').primaryKey(),
  namaProyek: text('nama_proyek').notNull(),
  deskripsi: text('deskripsi'),
  customPrompt: text('custom_prompt'),
  defaultPoinPg: integer('default_poin_pg').notNull().default(2),
  defaultPoinUraian: integer('default_poin_uraian').notNull().default(5),
  defaultPoinPenalaran: integer('default_poin_penalaran').notNull().default(15),
  defaultPoinProyek: integer('default_poin_proyek').notNull().default(25),
  targetPg: integer('target_pg').notNull().default(0),
  targetUraian: integer('target_uraian').notNull().default(0),
  targetPenalaran: integer('target_penalaran').notNull().default(0),
  targetProyek: integer('target_proyek').notNull().default(0),
  dibuatPada: text('dibuat_pada'),
  diubahPada: text('diubah_pada'),
});

// Satu tabel untuk semua tipe soal; payload per-tipe di data_json
// (persis format_output Instruction*.json lama). Validasi skema di lapisan TS.
export const soal = sqliteTable('soal', {
  id: text('id').primaryKey(),
  idProyek: text('id_proyek').notNull(),
  tipe: text('tipe').notNull(),
  dataJson: text('data_json').notNull(),
  poin: integer('poin').notNull(),
  isHidden: integer('is_hidden').notNull().default(0),
  urutan: integer('urutan'),
  dibuatPada: text('dibuat_pada'),
  diubahPada: text('diubah_pada'),
});

// File materi per proyek — HANYA .txt/.md (teks polos, sesuai keputusan user).
// Disimpan sebagai teks agar InstructionMain.hierarki tetap kompatibel;
// inlineData base64 dibangun saat generate (lihat services/fileInput.ts).
export const proyekFile = sqliteTable('proyek_file', {
  id: text('id').primaryKey(),
  idProyek: text('id_proyek').notNull(),
  namaAsli: text('nama_asli').notNull(),
  mimeType: text('mime_type').notNull(),
  ukuranByte: integer('ukuran_byte').notNull(),
  kontenTeks: text('konten_teks'),
  dibuatPada: text('dibuat_pada'),
});
