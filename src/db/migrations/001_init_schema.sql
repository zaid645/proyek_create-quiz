-- 001_init_schema.sql — crate-quiz
-- Sumber kebenaran skema database (dieksekusi worker saat init via wa-sqlite/OPFS).
-- Mirror dengan src/db/schema.ts. Seed opsi_model_ai HARUS sinkron dengan src/config/models.ts.

-- 0. Master model AI (seed dari DAFTAR_MODEL di src/config/models.ts)
CREATE TABLE IF NOT EXISTS `opsi_model_ai` (
  `id` text PRIMARY KEY NOT NULL,
  `nama` text NOT NULL,
  `string_model` text NOT NULL
);

INSERT OR IGNORE INTO `opsi_model_ai` (`id`, `nama`, `string_model`) VALUES
  ('gemini-3.1-flash-lite', 'Gemini 3.1 Flash Lite', 'gemini-3.1-flash-lite'),
  ('gemini-3-flash', 'Gemini 3 Flash', 'gemini-3-flash'),
  ('gemini-3.5-flash', 'Gemini 3.5 Flash', 'gemini-3.5-flash'),
  ('gemini-3.5-flash-lite', 'Gemini 3.5 Flash Lite', 'gemini-3.5-flash-lite'),
  ('gemini-3.6-flash', 'Gemini 3.6 Flash', 'gemini-3.6-flash'),
  ('gemini-3.7-flash', 'Gemini 3.7 Flash', 'gemini-3.7-flash'),
  ('gemini-3.8-flash', 'Gemini 3.8 Flash', 'gemini-3.8-flash');

-- 1. Proyek milik user (buat banyak, hapus per proyek -> cascade soal + file)
CREATE TABLE IF NOT EXISTS `proyek` (
  `id` text PRIMARY KEY NOT NULL,
  `nama_proyek` text NOT NULL,
  `deskripsi` text,
  `custom_prompt` text,
  `default_poin_pg` integer NOT NULL DEFAULT 2,
  `default_poin_uraian` integer NOT NULL DEFAULT 5,
  `default_poin_penalaran` integer NOT NULL DEFAULT 15,
  `default_poin_proyek` integer NOT NULL DEFAULT 25,
  `target_pg` integer NOT NULL DEFAULT 0,
  `target_uraian` integer NOT NULL DEFAULT 0,
  `target_penalaran` integer NOT NULL DEFAULT 0,
  `target_proyek` integer NOT NULL DEFAULT 0,
  `dibuat_pada` text,
  `diubah_pada` text
);

-- 2. Soal: satu tabel semua tipe, payload per-tipe di data_json
-- (persis format_output Instruction*.json program lama).
CREATE TABLE IF NOT EXISTS `soal` (
  `id` text PRIMARY KEY NOT NULL,
  `id_proyek` text NOT NULL,
  `tipe` text NOT NULL CHECK(`tipe` IN ('pilihan_ganda','uraian','penalaran','proyek')),
  `data_json` text NOT NULL,
  `poin` integer NOT NULL,
  `is_hidden` integer NOT NULL DEFAULT 0,
  `urutan` integer,
  `dibuat_pada` text,
  `diubah_pada` text
);
CREATE INDEX IF NOT EXISTS `idx_soal_proyek` ON `soal`(`id_proyek`);
CREATE INDEX IF NOT EXISTS `idx_soal_proyek_tipe` ON `soal`(`id_proyek`, `tipe`);

-- 3. File materi per proyek — HANYA .txt/.md (teks polos).
CREATE TABLE IF NOT EXISTS `proyek_file` (
  `id` text PRIMARY KEY NOT NULL,
  `id_proyek` text NOT NULL,
  `nama_asli` text NOT NULL,
  `mime_type` text NOT NULL,
  `ukuran_byte` integer NOT NULL,
  `konten_teks` text,
  `dibuat_pada` text
);
CREATE INDEX IF NOT EXISTS `idx_file_proyek` ON `proyek_file`(`id_proyek`);
