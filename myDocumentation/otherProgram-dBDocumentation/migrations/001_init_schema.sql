-- final_schema.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- SKEMA FINAL KONSOLIDASI — NovelWorldBuilderV2
--
-- File ini adalah SATU-SATUNYA sumber kebenaran untuk skema database baru.
-- Dibuat dengan mengonsolidasi 57 migrasi (001-057), tidak termasuk:
--   - 055_chat_ai_skill_tabel.sql (tabel skill di-drop, skill di-hardcode)
--   - 056_dapatkan_list_skill.sql (spec skill untuk DB)
--
-- CARA PAKAI:
--   - Database BARU: jalankan file ini langsung (lebih cepat dari 57 migrasi)
--   - Database LAMA: jalankan migrasi 001-057 seperti biasa (termasuk 058)
--
-- CATATAN:
--   - Semua ALTER TABLE dari migrasi lama sudah di-incorporate ke CREATE TABLE
--   - Tabel `chat_ai_skill` dan `chat_ai_skill_tombstone` TIDAK ada lagi
--   - Skill sekarang di-hardcode di features/chat-ai/skill/*.md

-- ═════════════════════════════════════════════════════════════════════════════
-- 0. MASTER DATA (tidak bergantung pada tabel lain)
-- ═════════════════════════════════════════════════════════════════════════════

-- Master: Opsi Keamanan AI
CREATE TABLE IF NOT EXISTS `opsi_keamanan_ai` (
  `id` text PRIMARY KEY NOT NULL,
  `deskripsi` text
);

INSERT OR IGNORE INTO `opsi_keamanan_ai` (id, deskripsi) VALUES
  ('BLOCK_LOW_AND_ABOVE', 'Memblokir konten berisiko rendah ke atas'),
  ('BLOCK_MEDIUM_AND_ABOVE', 'Memblokir konten berisiko sedang ke atas'),
  ('BLOCK_ONLY_HIGH', 'Hanya memblokir konten berisiko tinggi'),
  ('BLOCK_NONE', 'Tidak memblokir konten berisiko');

-- Master: Model AI
CREATE TABLE IF NOT EXISTS `opsi_model_ai` (
  `id` text PRIMARY KEY NOT NULL,
  `nama` text NOT NULL,
  `string_model` text NOT NULL
);

INSERT OR IGNORE INTO `opsi_model_ai` (id, nama, string_model) VALUES
  ('gemini-3.5-flash', 'Gemini 3.5 Flash', 'gemini-3.5-flash'),
  ('gemini-3.5-flash-lite', 'Gemini 3.5 Flash Lite', 'gemini-3.5-flash-lite'),
  ('gemini-3.6-flash', 'Gemini 3.6 Flash', 'gemini-3.6-flash'),
  ('gemini-3.7-flash', 'Gemini 3.7 Flash', 'gemini-3.7-flash'),
  ('gemini-3.8-flash', 'Gemini 3.8 Flash', 'gemini-3.8-flash');

-- Master: Kelamin
CREATE TABLE IF NOT EXISTS `kelamin` (
  `id` text PRIMARY KEY NOT NULL,
  `jenis` text
);

INSERT OR IGNORE INTO `kelamin` (id, jenis) VALUES
  ('lk', 'Laki-laki'),
  ('pr', 'Perempuan'),
  ('n', 'Tidak berlaku');

-- Master: Watak Global
CREATE TABLE IF NOT EXISTS `watak` (
  `id` text PRIMARY KEY NOT NULL,
  `nama_watak` text NOT NULL
);

-- Master: Waktu Scene
CREATE TABLE IF NOT EXISTS `waktu_scene` (
  `id` text PRIMARY KEY NOT NULL,
  `nama_waktu` text
);

INSERT OR IGNORE INTO `waktu_scene` (`id`, `nama_waktu`) VALUES
  ('waktu-pagi',          'Pagi'),
  ('waktu-agak-siang',    'Agak Siang'),
  ('waktu-siang',         'Siang'),
  ('waktu-sore',          'Sore'),
  ('waktu-malam',         'Malam'),
  ('waktu-tengah-malam',  'Tengah Malam'),
  ('waktu-dini-hari',     'Dini Hari');

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. PROYEK & PENGATURAN
-- ═════════════════════════════════════════════════════════════════════════════

-- Tabel Proyek (konsolidasi 001 + ALTER dari 011, 017, 019, 025, 040, 044)
CREATE TABLE IF NOT EXISTS `proyek` (
  `id` text PRIMARY KEY NOT NULL,
  `nama_proyek` text NOT NULL,
  `deskripsi` text,
  `dibuat_pada` text,
  `diubah_pada` text,
  `tampilkan_objek_global` integer DEFAULT true,
  `tampilkan_ras` integer DEFAULT true,
  `tampilkan_kelas` integer DEFAULT true,
  `tampilkan_gelar` integer DEFAULT true,
  `tampilkan_item` integer DEFAULT true,
  `tampilkan_skill` integer DEFAULT true,
  `tampilkan_familiar` integer DEFAULT true,
  `judul_novel` text,
  `sinopsis` text,
  `penataan_dunia` text,
  -- Migrasi 011: kolom tambahan
  `sesi_chat_terakhir` text,
  -- Migrasi 017: toggle setujui otomatis
  `setujui_otomatis_chat_ai` integer NOT NULL DEFAULT 0,
  -- Migrasi 019: nomor awal normalisasi BAB
  `nomor_bab_awal_normalisasi` integer NOT NULL DEFAULT 1,
  `potongan_judul_import_outline` integer NOT NULL DEFAULT 0,
  -- Migrasi 025: scope opsi fantasi AI (0=lokal, 1=global)
  `opsi_fantasi_ai_global` integer NOT NULL DEFAULT 0,
  -- Migrasi 040: kalender terakhir dibuka
  `kalender_bulan_terakhir` integer,
  `kalender_tahun_terakhir` integer,
  -- Pulihkan arc terakhir dibuka (fitur Arc). FK logis ke arc.id — tidak
  -- dipaksakan; pointer kosong (NULL) ATAU arc yang sudah dihapus → UI
  -- fallback ke arc pertama. Validasi kepemilikan proyek dilakukan di
  -- repository (getArcTerakhirDibuka).
  `last_visited_arc` text,
  -- Pulihkan arc + sub-arc terakhir dipilih (halaman Outline). Pola sama
  -- dengan last_visited_arc: NULL = belum pernah; id mati → fallback
  -- bertingkat di getOutlineTerakhirDibuka (arc valid tapi sub-arc mati →
  -- hanya arc yang dipulihkan).
  `outline_last_visited_arc` text,
  `outline_last_visited_subarc` text,
  -- Migrasi 044: sembunyikan proyek
  `disembunyikan` integer DEFAULT 0
);

-- Pengaturan Global (single-row, konsolidasi 002 + 004 + ALTER dari 011, 057)
CREATE TABLE IF NOT EXISTS `pengaturan_global` (
  `proyek_terakhir` text,
  -- Akal Imitasi — Panggilan Sederhana (004)
  `api_key` text,
  `temperatur` real DEFAULT 0.7,
  `unduh_prompt` integer DEFAULT 0,
  `id_keamanan_hate_speech` text NOT NULL,
  `id_keamanan_harassment` text NOT NULL,
  `id_keamanan_sexually_explicit` text NOT NULL,
  `id_keamanan_dangerous_content` text NOT NULL,
  -- Identitas Virtual (004)
  `chat_ai_virtual_name` text DEFAULT 'Knowledge Crow',
  `chat_ai_languange_style` text DEFAULT 'Menjelaskan dengan sehari-hari santai yang mempertimbangkan gaya bahasa pengguna',
  -- Migrasi 011: kolom tambahan
  `chat_ai_preferensi` text,
  -- Migrasi 057: model text-out
  `chat_ai_model_id` text DEFAULT 'gemini-3.5-flash-lite',

  -- ═══════════════════════════════════════════════════════════════════════════
  -- GEMINI THINKING CONFIGURATION
  -- ═══════════════════════════════════════════════════════════════════════════
  -- Thinking level: kontrol seberapa banyak AI berpikir sebelum menjawab
  --   - low: ringan, cocok untuk tugas moderat (perbandingan, kreatif)
  --   - medium: default, cocok untuk kebanyakan tugas
  --   - high: maksimal, cocok untuk tugas kompleks (coding, math, planning)
  -- CATATAN: opsi `minimal` DIHAPUS — hanya didukung model 3.5-flash-lite /
  -- 3.6-flash; model lain menolak level itu (400). Lihat gemini-thinking.md
  -- §thinking-levels.
  `thinking_level` text DEFAULT 'medium' CHECK(thinking_level IN ('low', 'medium', 'high')),

  -- Thinking summaries: tampilkan ringkasan proses berpikir AI di UI
  --   0 = nonaktif (hemat token, tampilan bersih)
  --   1 = aktif (transparansi proses reasoning AI)
  `thinking_summaries` integer DEFAULT 1,

  -- Max output tokens: batas token output (termasuk thinking tokens)
  -- Default 32000 = cukup untuk response panjang + thinking
  -- Minimum 256, maksimum 128000 (batas API Gemini)
  `max_output_tokens` integer DEFAULT 32000
);

-- Seed: pastikan SELALU ada tepat satu baris pengaturan global
INSERT INTO pengaturan_global (
  proyek_terakhir,
  api_key, temperatur, unduh_prompt,
  id_keamanan_hate_speech, id_keamanan_harassment,
  id_keamanan_sexually_explicit, id_keamanan_dangerous_content,
  chat_ai_virtual_name, chat_ai_languange_style,
  chat_ai_preferensi,
  chat_ai_model_id,
  thinking_level,
  thinking_summaries,
  max_output_tokens
)
SELECT
  NULL,
  NULL, 0.7, 0,
  'BLOCK_MEDIUM_AND_ABOVE', 'BLOCK_MEDIUM_AND_ABOVE',
  'BLOCK_MEDIUM_AND_ABOVE', 'BLOCK_MEDIUM_AND_ABOVE',
  'Knowledge Crow', 'Menjelaskan dengan sehari-hari santai yang mempertimbangkan gaya bahasa pengguna',
  NULL,
  'gemini-3.5-flash-lite',
  'medium',
  1,
  32000
WHERE NOT EXISTS (SELECT 1 FROM pengaturan_global);

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. AI PROMPT & SISTEM DETAIL
-- ═════════════════════════════════════════════════════════════════════════════

-- Tabel Prompt AI (005)
CREATE TABLE IF NOT EXISTS `ai_kepala_prompt` (
  `id` text PRIMARY KEY NOT NULL,
  `nama_perintah` text NOT NULL,
  `model` text NOT NULL,
  `prompt` text
);

-- Seed: perintah 'tes koneksi'
INSERT OR IGNORE INTO `ai_kepala_prompt` (id, nama_perintah, model, prompt) VALUES
  ('tes-koneksi', 'tes koneksi', 'gemini-3.5-flash-lite', 'Berikan sapa singkat');

-- CATATAN (pulihan regresi konsolidasi): indeks unik `lower(nama_perintah)`
-- (warisan migrasi 042 — mencegah baris perintah duplikat dan membuat klausa
-- ON CONFLICT di shared/ai/panggil-ai.ts sah) SENGAJA TIDAK ditempatkan di
-- file ini, karena eksekusi 001 pada DB LAMA harus selalu idempoten tanpa
-- syarat (CREATE UNIQUE INDEX bisa gagal bila DB lama berisi duplikat →
-- seluruh inisialisasi gagal). Pemulihannya lewat guard idempoten
-- `pastikanIndeksUnikKepalaPrompt` di src/db/worker.ts yang berjalan setiap
-- startup: bersihkan duplikat (MIN rowid dipertahankan) → buat indeks bila
-- belum ada. DB baru otomatis mendapat indeks dari guard pada startup pertama.

-- Tabel Sistem Detail (spesifikasi fungsi AI) — 008 + 009 + 010 + 013 + 018 + 021
CREATE TABLE IF NOT EXISTS `chat_ai_sistem_detail` (
  `id` text PRIMARY KEY NOT NULL,
  `nama_fungsi` text NOT NULL,
  `deskripsi` text,
  `parameter_json` text,
  `format_luaran` text,
  `catatan_eksekusi` text,
  `butuh_persetujuan` integer DEFAULT 0,
  `aktif` integer DEFAULT 1,
  `lingkup` varchar NOT NULL DEFAULT 'chat'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. OPSI FANTASI (RAS, KELAS, GELAR, ITEM, SKILL)
-- ═════════════════════════════════════════════════════════════════════════════

-- 3.1 RAS
CREATE TABLE IF NOT EXISTS `ras` (
  `id` text PRIMARY KEY NOT NULL,
  `id_proyek` text,
  `nama` text,
  `deskripsi` text
);
CREATE TABLE IF NOT EXISTS `tag_ras` (
  `id` text PRIMARY KEY NOT NULL,
  `id_proyek` text,
  `konten` text
);
CREATE TABLE IF NOT EXISTS `ras_tag` (
  `id` text PRIMARY KEY NOT NULL,
  `id_ras` text NOT NULL,
  `id_tag_ras` text NOT NULL
);
CREATE TABLE IF NOT EXISTS `ras_skill` (
  `id` text PRIMARY KEY NOT NULL,
  `id_ras` text NOT NULL,
  `id_skill` text NOT NULL
);

-- 3.2 KELAS
CREATE TABLE IF NOT EXISTS `kelas` (
  `id` text PRIMARY KEY NOT NULL,
  `id_proyek` text,
  `nama` text,
  `deskripsi` text
);
CREATE TABLE IF NOT EXISTS `tag_kelas` (
  `id` text PRIMARY KEY NOT NULL,
  `id_proyek` text,
  `konten` text
);
CREATE TABLE IF NOT EXISTS `kelas_tag` (
  `id` text PRIMARY KEY NOT NULL,
  `id_kelas` text NOT NULL,
  `id_tag_kelas` text NOT NULL
);
CREATE TABLE IF NOT EXISTS `kelas_skill` (
  `id` text PRIMARY KEY NOT NULL,
  `id_kelas` text NOT NULL,
  `id_skill` text NOT NULL
);

-- 3.3 GELAR
CREATE TABLE IF NOT EXISTS `gelar` (
  `id` text PRIMARY KEY NOT NULL,
  `id_proyek` text,
  `nama` text,
  `deskripsi` text
);
CREATE TABLE IF NOT EXISTS `tag_gelar` (
  `id` text PRIMARY KEY NOT NULL,
  `id_proyek` text,
  `konten` text
);
CREATE TABLE IF NOT EXISTS `gelar_tag` (
  `id` text PRIMARY KEY NOT NULL,
  `id_gelar` text NOT NULL,
  `id_tag_gelar` text NOT NULL
);
CREATE TABLE IF NOT EXISTS `gelar_skill` (
  `id` text PRIMARY KEY NOT NULL,
  `id_gelar` text NOT NULL,
  `id_skill` text NOT NULL
);

-- 3.4 ITEM
CREATE TABLE IF NOT EXISTS `item` (
  `id` text PRIMARY KEY NOT NULL,
  `id_proyek` text,
  `nama` text,
  `latar_belakang` text,
  `efek` text,
  `visual` text
);
CREATE TABLE IF NOT EXISTS `tag_item` (
  `id` text PRIMARY KEY NOT NULL,
  `id_proyek` text,
  `konten` text
);
CREATE TABLE IF NOT EXISTS `item_tag` (
  `id` text PRIMARY KEY NOT NULL,
  `id_item` text NOT NULL,
  `id_tag_item` text NOT NULL
);
CREATE TABLE IF NOT EXISTS `item_skill` (
  `id` text PRIMARY KEY NOT NULL,
  `id_item` text NOT NULL,
  `id_skill` text NOT NULL
);

-- 3.5 SKILL
CREATE TABLE IF NOT EXISTS `skill` (
  `id` text PRIMARY KEY NOT NULL,
  `id_proyek` text,
  `nama` text,
  `latar_belakang` text,
  `efek` text,
  `visual` text
);
CREATE TABLE IF NOT EXISTS `tag_skill` (
  `id` text PRIMARY KEY NOT NULL,
  `id_proyek` text,
  `konten` text
);
CREATE TABLE IF NOT EXISTS `skill_tag` (
  `id` text PRIMARY KEY NOT NULL,
  `id_skill` text NOT NULL,
  `id_tag_skill` text NOT NULL
);

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. SEMESTA & INDIVIDU
-- ═════════════════════════════════════════════════════════════════════════════

-- 4.1 Semesta
CREATE TABLE IF NOT EXISTS `semesta` (
  `id` text PRIMARY KEY NOT NULL,
  `nama` text,
  `deskripsi` text,
  -- Migrasi 032: state
  `state_aktif_id` text
);

CREATE TABLE IF NOT EXISTS `semesta_proyek` (
  `id` text PRIMARY KEY NOT NULL,
  `id_semesta` text NOT NULL,
  `id_proyek` text NOT NULL,
  -- Migrasi 032: state semesta per proyek
  `id_state_semesta` text,
  -- Urutan tampil semesta per proyek (sidebar Proyek Kerja). Nullable agar
  -- baris lama (sebelum kolom ini ada) tetap valid; NULL diperlakukan paling
  -- bawah lalu dirapatkan otomatis oleh guard worker saat startup.
  `urutan` integer
);

-- Migrasi 032: State Semesta
CREATE TABLE IF NOT EXISTS `semesta_state` (
  `id` text PRIMARY KEY NOT NULL,
  `id_semesta` text NOT NULL,
  `nama` text,
  `deskripsi` text,
  `urutan` integer
);

-- 4.2 Lore (006 + 033)
CREATE TABLE IF NOT EXISTS `lore` (
  `id` text PRIMARY KEY NOT NULL,
  `id_semesta` text NOT NULL,
  `nama` text,
  `deskripsi_lore` text,
  `urutan` integer,
  -- Migrasi 033: state
  `id_semesta_state` text
);

-- 4.3 Kategori Individu (006 + 034)
CREATE TABLE IF NOT EXISTS `kategori_individu` (
  `id` text PRIMARY KEY NOT NULL,
  `id_semesta` text NOT NULL,
  `nama` text,
  `deskripsi` text,
  `kode_warna` text,
  `urutan` integer,
  -- Migrasi 034: state
  `id_semesta_state` text
);

-- 4.4 Individu (006 + 007)
CREATE TABLE IF NOT EXISTS `individu` (
  `id` text PRIMARY KEY NOT NULL,
  `id_kategori_individu` text NOT NULL,
  `state_aktif_id` text,
  `nama` text NOT NULL,
  `id_kelamin` text NOT NULL,
  `urutan` integer
);

-- 4.5 State Individu (007 + 036)
CREATE TABLE IF NOT EXISTS `state_individu` (
  `id` text PRIMARY KEY NOT NULL,
  `id_individu` text NOT NULL,
  `nama` text,
  `id_ras` text,
  `usia` text,
  `latar_belakang` text,
  `penampilan` text,
  `gaya_bertarung` text,
  `urutan` integer,
  -- Migrasi 036: spesifikasi chat
  `contoh_dialog` text,
  `catatan_tambahan` text,
  `catatan_relasi` text
);

-- Sub-tabel State Individu
CREATE TABLE IF NOT EXISTS `state_individu_catatan` (
  `id` text PRIMARY KEY NOT NULL,
  `id_state_individu` text NOT NULL,
  `konten` text,
  `urutan` integer
);
CREATE TABLE IF NOT EXISTS `state_individu_gaya_dialog` (
  `id` text PRIMARY KEY NOT NULL,
  `id_state_individu` text NOT NULL,
  `konten` text,
  `urutan` integer
);
CREATE TABLE IF NOT EXISTS `state_individu_relasi` (
  `id` text PRIMARY KEY NOT NULL,
  `id_state_individu` text NOT NULL,
  `konten` text,
  `urutan` integer
);

-- Junction Many-to-Many State Individu
CREATE TABLE IF NOT EXISTS `state_watak` (
  `id` text PRIMARY KEY NOT NULL,
  `id_state` text NOT NULL,
  `id_watak` text NOT NULL
);
CREATE TABLE IF NOT EXISTS `state_kelas` (
  `id` text PRIMARY KEY NOT NULL,
  `id_state` text NOT NULL,
  `id_kelas` text NOT NULL
);
CREATE TABLE IF NOT EXISTS `state_gelar` (
  `id` text PRIMARY KEY NOT NULL,
  `id_state` text NOT NULL,
  `id_gelar` text NOT NULL
);
CREATE TABLE IF NOT EXISTS `state_item` (
  `id` text PRIMARY KEY NOT NULL,
  `id_state` text NOT NULL,
  `id_item` text NOT NULL
);
CREATE TABLE IF NOT EXISTS `state_skill` (
  `id` text PRIMARY KEY NOT NULL,
  `id_state` text NOT NULL,
  `id_skill` text NOT NULL
);
CREATE TABLE IF NOT EXISTS `state_familiar` (
  `id` text PRIMARY KEY NOT NULL,
  `id_state` text NOT NULL,
  `id_familiar_individu` text NOT NULL
);

-- 4.6 Lokasi (006 + 035)
CREATE TABLE IF NOT EXISTS `lokasi` (
  `id` text PRIMARY KEY NOT NULL,
  `id_semesta` text NOT NULL,
  `parent_id` text,
  `nama` text NOT NULL,
  `latar_belakang` text,
  `visual` text,
  `urutan` integer,
  `state_aktif_id` text,
  -- Migrasi 035: state
  `id_semesta_state` text
);

-- 4.7 State Lokasi (016 + 035)
CREATE TABLE IF NOT EXISTS `state_lokasi` (
  `id` text PRIMARY KEY NOT NULL,
  `id_lokasi` text NOT NULL,
  `nama` text,
  `latar_belakang` text,
  `visual` text,
  `urutan` integer
);

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. CHAT AI (SESI & PESAN)
-- ═════════════════════════════════════════════════════════════════════════════

-- 5.1 Sesi Chat (008 + 009 + 013; kolom `catatan_ringkasan` DIHAPUS —
--     tidak pernah ditulis kode/tool mana pun, selalu NULL. DB lama
--     menyimpan kolom dorman ini — kode berhenti membacanya saja).
CREATE TABLE IF NOT EXISTS `chat_ai_sesi` (
  `id` text PRIMARY KEY NOT NULL,
  `id_proyek` text NOT NULL,
  `judul_sesi` text,
  `interaction_id_terakhir` text,
  `environment_id` text,
  -- Migrasi 009: mode planner (arc)
  `arc_id` text,
  -- Migrasi 013: mode penulis (sub-arc)
  `sub_arc_id` text,
  -- Sidik model yang menyimpan interaction saat ini. Dipakai deteksi ganti
  -- model di tengah sesi (transparansi + logging). NULL = belum pernah
  -- berinteraksi (sesi baru / pernah di-reset).
  `model_terakhir` text
);
CREATE INDEX IF NOT EXISTS `idx_ag_sesi_proyek` ON `chat_ai_sesi`(`id_proyek`);

-- 5.2 Pesan Chat (008)
CREATE TABLE IF NOT EXISTS `chat_ai_pesan` (
  `id` text PRIMARY KEY NOT NULL,
  `id_sesi` text NOT NULL,
  `pembicara` text,
  `konten` text,
  `metadata` text,
  `dibuat_pada` text
);
CREATE INDEX IF NOT EXISTS `idx_ag_pesan_sesi` ON `chat_ai_pesan`(`id_sesi`);

CREATE TABLE IF NOT EXISTS `chat_ai_file` (
  `id` text PRIMARY KEY NOT NULL,
  `id_pesan` text NOT NULL,
  `nama_asli` text NOT NULL,
  `ekstensi` text NOT NULL,
  `mime_type` text NOT NULL,
  `ukuran_byte` integer NOT NULL,
  `konten_base64` text NOT NULL,
  `dibuat_pada` text
);
CREATE INDEX IF NOT EXISTS `idx_chat_ai_file_pesan` ON `chat_ai_file`(`id_pesan`);

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. ARC & SUB-ARC
-- ═════════════════════════════════════════════════════════════════════════════

-- 6.1 Arc (009 + 022 - target_sub_arc dihapus + rencana arc-record-pesan-ai)
CREATE TABLE IF NOT EXISTS `arc` (
  `id` text PRIMARY KEY NOT NULL,
  `id_proyek` text NOT NULL,
  `judul` text NOT NULL,
  `deskripsi` text,
  `sinopsis` text,
  `rencana` text,
  `urutan` integer,
  `disembunyikan` integer DEFAULT 0,
  -- Sesi AI per arc (rencana arc-record-pesan-ai):
  -- previous_interaction_id = pointer interaksi terakhir (Gemini API)
  -- model_terakhir = sidik model yang menyimpan interaction (deteksi ganti model)
  `previous_interaction_id` text,
  `model_terakhir` text
);
CREATE INDEX IF NOT EXISTS `idx_arc_proyek` ON `arc`(`id_proyek`);

-- 6.1.1 Record Pesan AI Arc (rencana arc-record-pesan-ai)
-- Riwayat percakapan user + AI per arc. Window 5 record terbaru;
-- tool-return tidak dicatat. Hanya teks user (saat kirim) dan
-- teks final AI (saat selesai).
CREATE TABLE IF NOT EXISTS `arc_pesan_ai` (
  `id` text PRIMARY KEY NOT NULL,        -- UUID v7 (terurut waktu)
  `id_arc` text NOT NULL,                -- FK logis → arc.id
  `role` text NOT NULL,                  -- 'Pengguna' | 'Chat AI'
  `konten` text,
  `dibuat_pada` text                     -- ISO string
);
CREATE INDEX IF NOT EXISTS `idx_arc_pesan_arc` ON `arc_pesan_ai`(`id_arc`);

-- 6.2 Sub-Arc (009 + 010 + 013)
CREATE TABLE IF NOT EXISTS `sub_arc` (
  `id` text PRIMARY KEY NOT NULL,
  `id_arc` text NOT NULL,
  `deskripsi` text,
  `urutan` integer,
  `disembunyikan` integer DEFAULT 0,
  -- Migrasi 010: judul sub-arc
  `judul` text,
  `previous_interaction_id` text,
  `model_terakhir` text
);
CREATE INDEX IF NOT EXISTS `idx_sub_arc_arc` ON `sub_arc`(`id_arc`);

CREATE TABLE IF NOT EXISTS `outline_pesan_ai` (
  `id` text PRIMARY KEY NOT NULL,
  `id_sub_arc` text NOT NULL,
  `role` text NOT NULL,
  `konten` text,
  `dibuat_pada` text
);
CREATE INDEX IF NOT EXISTS `idx_outline_pesan_subarc` ON `outline_pesan_ai`(`id_sub_arc`);

-- 6.3 Arc-Semesta (009 + 038 - migrasi ke state)
CREATE TABLE IF NOT EXISTS `arc_semesta` (
  `id` text PRIMARY KEY NOT NULL,
  `id_arc` text NOT NULL,
  `id_semesta` text,
  `id_semesta_state` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `idx_arc_semesta_arc` ON `arc_semesta`(`id_arc`);

-- 6.4 Junction Sub-Arc (010)
CREATE TABLE IF NOT EXISTS `sub_arc_individu` (
  `id` text PRIMARY KEY NOT NULL,
  `id_sub_arc` text NOT NULL,
  `id_individu` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `idx_sub_arc_individu_sub` ON `sub_arc_individu`(`id_sub_arc`);
CREATE INDEX IF NOT EXISTS `idx_sub_arc_individu_ind` ON `sub_arc_individu`(`id_individu`);

CREATE TABLE IF NOT EXISTS `sub_arc_lokasi` (
  `id` text PRIMARY KEY NOT NULL,
  `id_sub_arc` text NOT NULL,
  `id_lokasi` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `idx_sub_arc_lokasi_sub` ON `sub_arc_lokasi`(`id_sub_arc`);
CREATE INDEX IF NOT EXISTS `idx_sub_arc_lokasi_lok` ON `sub_arc_lokasi`(`id_lokasi`);

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. OUTLINE
-- ═════════════════════════════════════════════════════════════════════════════

-- 7.1 Segmen Outline (012; kolom `status` DIHAPUS — flag "selesai/AI mati"
--     tidak pernah dipakai UI maupun tool AI; keputusan "selesai" diturunkan
--     AI dari data outline saat dibaca. DB lama menyimpan kolom dorman ini
--     — guard worker hanya ADD COLUMN, jadi kode berhenti membacanya saja).
CREATE TABLE IF NOT EXISTS `segmen_outline` (
  `id` text PRIMARY KEY NOT NULL,
  `id_sub_arc` text NOT NULL UNIQUE,
  `catatan_ai` text,
  `min_scene` integer NOT NULL DEFAULT 2,
  `max_scene` integer NOT NULL DEFAULT 4
);
CREATE INDEX IF NOT EXISTS `idx_segmen_outline_sub` ON `segmen_outline`(`id_sub_arc`);

-- 7.2 BAB Outline (012)
CREATE TABLE IF NOT EXISTS `bab_outline` (
  `id` text PRIMARY KEY NOT NULL,
  `id_segmen_outline` text NOT NULL,
  `nomor_bab` integer,
  `judul` text
);
CREATE INDEX IF NOT EXISTS `idx_bab_outline_seg` ON `bab_outline`(`id_segmen_outline`);

-- 7.3 Scene Outline (012 + 020 - disembunyikan dihapus)
CREATE TABLE IF NOT EXISTS `scene_outline` (
  `id` text PRIMARY KEY NOT NULL,
  `id_bab_outline` text NOT NULL,
  `waktu_scene` text DEFAULT 'Lanjut/sama dengan sebelumnya',
  `lokasi_scene` text DEFAULT 'Lanjut/tidak ada dalam daftar',
  `konten` text
);
CREATE INDEX IF NOT EXISTS `idx_scene_outline_bab` ON `scene_outline`(`id_bab_outline`);

-- 7.4 Individu Terlibat Scene (012)
CREATE TABLE IF NOT EXISTS `individu_terlibat_scene` (
  `id` text PRIMARY KEY NOT NULL,
  `id_scene_outline` text NOT NULL,
  `id_individu` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `idx_ind_terlibat_scene` ON `individu_terlibat_scene`(`id_scene_outline`);
CREATE INDEX IF NOT EXISTS `idx_ind_terlibat_ind` ON `individu_terlibat_scene`(`id_individu`);

-- 7.5 Referensi BAB Scene (012 - M-M)
CREATE TABLE IF NOT EXISTS `referensi_bab_scene` (
  `id` text PRIMARY KEY NOT NULL,
  `id_scene_outline` text NOT NULL,
  `id_bab_outline` text NOT NULL,
  `jenis` text NOT NULL DEFAULT 'lainnya',
  `catatan` text
);
CREATE INDEX IF NOT EXISTS `idx_ref_bab_scene` ON `referensi_bab_scene`(`id_scene_outline`);
CREATE INDEX IF NOT EXISTS `idx_ref_bab_bab` ON `referensi_bab_scene`(`id_bab_outline`);
CREATE UNIQUE INDEX IF NOT EXISTS `uq_ref_bab_scene_triplet` ON `referensi_bab_scene`(`id_scene_outline`, `id_bab_outline`, `jenis`);

-- 7.6 Referensi Scene Opsi Fantasi (014 - M-M)
CREATE TABLE IF NOT EXISTS `referensi_scene_opsi_fantasi` (
  `id` text PRIMARY KEY NOT NULL,
  `id_scene_outline` text NOT NULL,
  `id_opsi_fantasi` text NOT NULL,
  `tipe_opsi_fantasi` text NOT NULL,
  UNIQUE(`id_scene_outline`, `id_opsi_fantasi`, `tipe_opsi_fantasi`)
);
CREATE INDEX IF NOT EXISTS `idx_ref_scene_opsi_scene` ON `referensi_scene_opsi_fantasi`(`id_scene_outline`);
CREATE INDEX IF NOT EXISTS `idx_ref_scene_opsi_obj` ON `referensi_scene_opsi_fantasi`(`id_opsi_fantasi`, `tipe_opsi_fantasi`);

-- ═════════════════════════════════════════════════════════════════════════════
-- 8. MENULIS (NASKAH)
-- ═════════════════════════════════════════════════════════════════════════════

-- 8.1 Pengaturan Menulis Novel (015)
CREATE TABLE IF NOT EXISTS `pengaturan_menulis_novel` (
  `id` text PRIMARY KEY NOT NULL,
  `id_proyek` text NOT NULL UNIQUE,
  `tab_aktif` text DEFAULT 'menulis',
  `id_bab_aktif` text,
  `id_scene_aktif` text,
  `prompt_gaya_bahasa` text NOT NULL DEFAULT '',
  `gunakan_interaksi` integer DEFAULT 0,
  `interaksi_previous_id` text,
  `interaksi_model_terakhir` text,
  `model_gemini` text NOT NULL,
  `luaran_token_maksimal` integer DEFAULT 40000,
  `masukan_tulisan_ai` text,
  `luaran_tulisan_ai` text,
  `prompt_perintah_revisi` text,
  `masukan_tulisan_ai_revisi` text,
  `luaran_tulisan_ai_revisi` text,
  `jumlah_konteks_bab_sebelumnya` integer DEFAULT 3,
  `luaran_konteks_bab_sebelumnya` text,
  `thinking_level` text DEFAULT 'medium' CHECK(thinking_level IN ('low', 'medium', 'high')),
  `thinking_summaries` integer DEFAULT 1
);
CREATE INDEX IF NOT EXISTS `idx_pengaturan_menulis_proyek` ON `pengaturan_menulis_novel`(`id_proyek`);

-- 8.2 File Referensi Luar (015)
CREATE TABLE IF NOT EXISTS `menulis_file_referensi_luar` (
  `id` text PRIMARY KEY NOT NULL,
  `id_pengaturan_menulis_novel` text NOT NULL,
  `nama_file` text,
  `konten_file` text
);
CREATE INDEX IF NOT EXISTS `idx_menulis_file_referensi_pengaturan` ON `menulis_file_referensi_luar`(`id_pengaturan_menulis_novel`);

-- 8.3 BAB Novel (015)
CREATE TABLE IF NOT EXISTS `bab_novel` (
  `id` text PRIMARY KEY NOT NULL,
  `id_bab_outline` text NOT NULL UNIQUE,
  `konten_novel` text
);
CREATE INDEX IF NOT EXISTS `idx_bab_novel_outline` ON `bab_novel`(`id_bab_outline`);

-- ═════════════════════════════════════════════════════════════════════════════
-- 9. LAINNYA (Kalender, Nuansa, Catatan, Gambar, Video, BGM)
-- ═════════════════════════════════════════════════════════════════════════════

-- 9.1 Kalender (040)
CREATE TABLE IF NOT EXISTS `rencana_kalender` (
  `id`             text PRIMARY KEY NOT NULL,
  `id_proyek`      text NOT NULL,
  `tanggal`        text NOT NULL,
  `judul_catatan`  text,
  `konten_catatan` text
);
CREATE INDEX IF NOT EXISTS `idx_rencana_kalender_proyek_tanggal`
  ON `rencana_kalender`(`id_proyek`, `tanggal`);

-- 9.2 Nuansa Global (041)
CREATE TABLE IF NOT EXISTS `nuansa` (
  `id` text PRIMARY KEY NOT NULL,
  `nama` text,
  `deskripsi` text,
  `warna` text
);

-- 9.3 Catatan Proyek (043)
CREATE TABLE IF NOT EXISTS `catatan_proyek` (
  `id` text PRIMARY KEY NOT NULL,
  `id_proyek` text NOT NULL,
  `judul` text NOT NULL,
  `konten` text,
  `dibuat_pada` text NOT NULL,
  `diubah_pada` text
);
CREATE INDEX IF NOT EXISTS `ix_catatan_proyek` ON `catatan_proyek`(`id_proyek`);
CREATE INDEX IF NOT EXISTS `ix_catatan_proyek_judul` ON `catatan_proyek`(`id_proyek`, `judul`);
CREATE INDEX IF NOT EXISTS `ix_catatan_proyek_tanggal` ON `catatan_proyek`(`id_proyek`, `dibuat_pada`);

-- 9.4 Gambar (029 + 030 + 031)
CREATE TABLE IF NOT EXISTS `gambar` (
  `id` text PRIMARY KEY NOT NULL,
  `id_proyek` text NOT NULL,
  `id_nuansa` text NOT NULL,
  `nama` text,
  `url` text,
  `deskripsi` text
);

-- 9.5 Narasi Video (029 + 049 - disederhanakan)
CREATE TABLE IF NOT EXISTS `narasi_video` (
  `id` text PRIMARY KEY NOT NULL,
  `id_proyek` text NOT NULL,
  `judul` text,
  `deskripsi` text,
  `durasi` integer
);

-- 9.6 BGM (030)
CREATE TABLE IF NOT EXISTS `bgm` (
  `id` text PRIMARY KEY NOT NULL,
  `id_proyek` text NOT NULL,
  `nama` text,
  `url` text,
  `deskripsi` text
);
