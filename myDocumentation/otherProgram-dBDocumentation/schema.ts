// src/db/schema.ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const proyek = sqliteTable('proyek', {
  id: text('id').primaryKey(),
  namaProyek: text('nama_proyek').notNull(),
  deskripsi: text('deskripsi'),
  dibuatPada: text('dibuat_pada'),
  diubahPada: text('diubah_pada'),

  tampilkanObjekGlobal: integer('tampilkan_objek_global', { mode: 'boolean' }).default(true),
  tampilkanRas: integer('tampilkan_ras', { mode: 'boolean' }).default(true),
  tampilkanKelas: integer('tampilkan_kelas', { mode: 'boolean' }).default(true),
  tampilkanGelar: integer('tampilkan_gelar', { mode: 'boolean' }).default(true),
  tampilkanItem: integer('tampilkan_item', { mode: 'boolean' }).default(true),
  tampilkanSkill: integer('tampilkan_skill', { mode: 'boolean' }).default(true),

  judulNovel: text('judul_novel'),
  sinopsis: text('sinopsis'),
  penataanDunia: text('penataan_dunia'),

  // Fitur chat — id sesi percakapan Chat AI yang terakhir dibuka.
  // FK logis ke chat_ai_sesi.id (tidak dipaksakan di worker).
  sesiChatTerakhir: text('sesi_chat_terakhir'),

  // Toggle kebijakan persetujuan fungsi Chat AI (migrasi 017).
  // true = panggil fungsi mutasi langsung dieksekusi tanpa kartu persetujuan;
  // false (default) = kartu persetujuan tetap muncul (perilaku lama).
  // Berlaku untuk semua lingkup: chat, planner, penulis. Pemutusan dilakukan
  // di runtime oleh mesin-chat.ts; spec kode (SPECS_CHAT.butuhPersetujuan)
  // tetap akurat untuk AI.
  setujuiOtomatisChatAi: integer('setujui_otomatis_chat_ai', { mode: 'boolean' })
    .notNull()
    .default(false),

  // Nomor BAB awal default untuk fitur Normalisasi BAB outline
  // (migrasi 019). Disimpan per-proyek agar preferensi user
  // (mis. mulai dari BAB 100) diingat lintas sesi. Diperbarui
  // otomatis setiap kali user menyelesaikan normalisasi; bisa juga
  // diubah manual lewat dialog Pengaturan Normalisasi di
  // DaftarBabOutline. Lihat `features/outline/repository.ts` →
  // `normalisasiBabProyek(idProyek, nomorAwal)`.
  nomorBabAwalNormalisasi: integer('nomor_bab_awal_normalisasi')
    .notNull()
    .default(1),
  potonganJudulImportOutline: integer('potongan_judul_import_outline')
    .notNull()
    .default(0),

  // Scope opsi fantasi buatan AI (migrasi 025, rencana-fungsi-dunia.md).
  // false (default) = lokal proyek (id_proyek terisi); true = global
  // (id_proyek = NULL, dapat dipakai semua proyek). Hanya dibaca oleh
  // `opsi_fantasi_tambah-edit`; fungsi baca selalu menggabungkan lokal + global.
  opsiFantasiAiGlobal: integer('opsi_fantasi_ai_global', { mode: 'boolean' })
    .notNull()
    .default(false),

  // Migrasi 040: state UI kalender — bulan & tahun terakhir dibuka user.
  // NULL = belum pernah buka kalender (fallback ke bulan/tahun saat ini di UI).
  kalenderBulanTerakhir: integer('kalender_bulan_terakhir'),
  kalenderTahunTerakhir: integer('kalender_tahun_terakhir'),

  // Pulihkan arc terakhir dibuka di fitur Arc (FK logis ke arc.id, tidak
  // dipaksakan di worker). NULL = belum pernah / arc sudah dihapus —
  // validasi & fallback dilakukan di features/arc/repository.ts.
  lastVisitedArc: text('last_visited_arc'),
  // Pulihkan arc + sub-arc terakhir dipilih di halaman Outline. Validasi
  // bertingkat (arc → sub-arc) di features/outline/repository.ts.
  outlineLastVisitedArc: text('outline_last_visited_arc'),
  outlineLastVisitedSubarc: text('outline_last_visited_subarc'),

  // Migrasi 044: sembunyikan proyek dari daftar tanpa menghapusnya.
  // false (default) = terlihat; true = tersembunyi dari daftar.
  disembunyikan: integer('disembunyikan', { mode: 'boolean' }).default(false),
})

export const semestaProyek = sqliteTable('semesta_proyek', {
  id: text('id').primaryKey(),
  idSemesta: text('id_semesta').notNull(),
  idProyek: text('id_proyek').notNull(),
  idStateSemesta: text('id_state_semesta'),
  // Urutan tampil semesta per proyek (sidebar Proyek Kerja). NULL = baris
  // lama, diperlakukan paling bawah lalu dirapatkan guard worker.
  urutan: integer('urutan'),
})

export const semestaState = sqliteTable('semesta_state', {
  id: text('id').primaryKey(),
  idSemesta: text('id_semesta').notNull(),
  nama: text('nama'),
  urutan: integer('urutan'),
})

export const lore = sqliteTable('lore', {
  id: text('id').primaryKey(),
  idSemesta: text('id_semesta').notNull(),
  idSemestaState: text('id_semesta_state'),
  nama: text('nama'),
  deskripsiLore: text('deskripsi_lore'),
  urutan: integer('urutan'),
})

export const kategoriIndividu = sqliteTable('kategori_individu', {
  id: text('id').primaryKey(),
  idSemesta: text('id_semesta').notNull(),
  idSemestaState: text('id_semesta_state'),
  nama: text('nama'),
  deskripsi: text('deskripsi'),
  kodeWarna: text('kode_warna'),
  urutan: integer('urutan'),
})

export const lokasi = sqliteTable('lokasi', {
  id: text('id').primaryKey(),
  idSemesta: text('id_semesta').notNull(),
  idSemestaState: text('id_semesta_state'),
  parentId: text('parent_id'),
  nama: text('nama').notNull(),
  latarBelakang: text('latar_belakang'),
  visual: text('visual'),
  urutan: integer('urutan'),
  stateAktifId: text('state_aktif_id'),
})

// 0.1 Pengaturan Global — single-row settings (lihat DbDiagram.dbml).
// Tabel ini 'atribut': Cuma ada SATU baris. Menyimpan:
//   - Segmen Proyek: proyek terakhir yang dikerjakan (fitur auto-resume).
//   - Akal Imitasi (Panggilan Sederhana): kunci API, temperatur, dan 4 ambang
//     keamanan konten yang mengacu ke tabel opsi_keamanan_ai.
//   - Pengaturan Identitas Virtual Chat AI (untuk fitur chat).
// NOTE: nama kolom mengikuti DbDiagram.dbml apa adanya — termasuk typo
// 'chat_ai_languange_style' (languange) — agar dokumentasi & DB sinkron.
export const pengaturanGlobal = sqliteTable('pengaturan_global', {
  // Segmen Proyek
  proyekTerakhir: text('proyek_terakhir'),

  // Akal Imitasi — Panggilan Sederhana
  // api_key TIDAK pernah disimpan sebagai teks polos: repository.ts mengenkripsi
  // otomatis via shared/ai/kriptografi.ts (AES-GCM) sebelum menulis, dan
  // mendekripsi kembali saat membaca.
  apiKey: text('api_key'),
  temperatur: real('temperatur').default(0.7),
  unduhPrompt: integer('unduh_prompt', { mode: 'boolean' }).default(false),
  idKeamananHateSpeech: text('id_keamanan_hate_speech').notNull(), // 1. Ujaran Kebencian
  idKeamananHarassment: text('id_keamanan_harassment').notNull(), // 2. Pelecehan
  idKeamananSexuallyExplicit: text('id_keamanan_sexually_explicit').notNull(), // 3. Seksual Vulgar
  idKeamananDangerousContent: text('id_keamanan_dangerous_content').notNull(), // 4. Konten Berbahaya

  // Pengaturan Identitas Virtual Chat AI (untuk fitur chat)
  chatAiVirtualName: text('chat_ai_virtual_name').default('Knowledge Crow'),
  chatAiLanguangeStyle: text('chat_ai_languange_style').default(
    'Menjelaskan dengan sehari-hari santai yang mempertimbangkan gaya bahasa pengguna',
  ),
  // Migrasi 008 — preferensi pengguna untuk percakapan Chat AI
  // (hal yang disukai + catatan gaya bahasa lanjutan).
  chatAiPreferensi: text('chat_ai_preferensi'),
  // Migrasi 057 — model text-out chat AI (dropdown di PanelPengaturanChatAi).
  chatAiModelId: text('chat_ai_model_id').default('gemini-3.5-flash-lite'),
  // Gemini Thinking — level thinking, summaries, batas token output.
  thinkingLevel: text('thinking_level').default('medium'),
  thinkingSummaries: integer('thinking_summaries').default(1),
  maxOutputTokens: integer('max_output_tokens').default(32000),
})

// 2.1 Master Opsi Pemblokiran Keamanan AI (lihat DbDiagram.dbml).
// "Dibuat otomatis ketika memulai" — di-seed pada migrasi 004 dengan ID Enum:
//   BLOCK_LOW_AND_ABOVE, BLOCK_MEDIUM_AND_ABOVE, BLOCK_ONLY_HIGH, BLOCK_NONE
// Tidak punya modul fitur sendiri (sesuai RencanaDirektori.md); dipakai lewat
// repository modul yang membutuhkannya (mis. pengaturan AI di features/proyek).
export const opsiKeamananAi = sqliteTable('opsi_keamanan_ai', {
  id: text('id').primaryKey(), // ID Enum, mis. BLOCK_MEDIUM_AND_ABOVE
  deskripsi: text('deskripsi'),
})

// 2.2.a Tabel Prompt AI (lihat DbDiagram.dbml).
// "Dibuat otomatis ketika memulai - Bisa diedit dengan peringatan."
// `nama_perintah` dipakai sebagai nama untuk memanggil fungsi satu pintu
// (panggilAI) di shared/ai. `model` mengacu ke tabel opsi_model_ai.
export const aiKepalaPrompt = sqliteTable('ai_kepala_prompt', {
  id: text('id').primaryKey(),
  namaPerintah: text('nama_perintah').notNull(),
  model: text('model').notNull(), // ref: > opsi_model_ai.id
  prompt: text('prompt'),
})

// 2.2.b Master Model AI (lihat DbDiagram.dbml).
// "Dibuat otomatis ketika memulai" — di-seed bersama ai_kepala_prompt.
export const opsiModelAi = sqliteTable('opsi_model_ai', {
  id: text('id').primaryKey(), // id = string model, mis. gemini-3.5-flash-lite
  nama: text('nama').notNull(), // nama tampilan untuk UI
  stringModel: text('string_model').notNull(), // nama asli untuk memanggil API
})

// ---------------------------------------------------
// 4. OPSI FANTASI (MASTER - GLOBAL/LOKAL) — DbDiagram.dbml bagian 4
// id_proyek NULL = Global Object, NOT NULL = Local Object
// ---------------------------------------------------

// 4.1 RAS
export const ras = sqliteTable('ras', {
  id: text('id').primaryKey(),
  idProyek: text('id_proyek'),
  nama: text('nama'),
  deskripsi: text('deskripsi'),
})
export const tagRas = sqliteTable('tag_ras', {
  id: text('id').primaryKey(),
  idProyek: text('id_proyek'),
  konten: text('konten'),
})
export const rasTag = sqliteTable('ras_tag', {
  id: text('id').primaryKey(),
  idRas: text('id_ras'),
  idTagRas: text('id_tag_ras'),
})
export const rasSkill = sqliteTable('ras_skill', {
  id: text('id').primaryKey(),
  idRas: text('id_ras'),
  idSkill: text('id_skill'),
})

// 4.2 KELAS
export const kelas = sqliteTable('kelas', {
  id: text('id').primaryKey(),
  idProyek: text('id_proyek'),
  nama: text('nama'),
  deskripsi: text('deskripsi'),
})
export const tagKelas = sqliteTable('tag_kelas', {
  id: text('id').primaryKey(),
  idProyek: text('id_proyek'),
  konten: text('konten'),
})
export const kelasTag = sqliteTable('kelas_tag', {
  id: text('id').primaryKey(),
  idKelas: text('id_kelas'),
  idTagKelas: text('id_tag_kelas'),
})
export const kelasSkill = sqliteTable('kelas_skill', {
  id: text('id').primaryKey(),
  idKelas: text('id_kelas'),
  idSkill: text('id_skill'),
})

// 4.3 GELAR
export const gelar = sqliteTable('gelar', {
  id: text('id').primaryKey(),
  idProyek: text('id_proyek'),
  nama: text('nama'),
  deskripsi: text('deskripsi'),
})
export const tagGelar = sqliteTable('tag_gelar', {
  id: text('id').primaryKey(),
  idProyek: text('id_proyek'),
  konten: text('konten'),
})
export const gelarTag = sqliteTable('gelar_tag', {
  id: text('id').primaryKey(),
  idGelar: text('id_gelar'),
  idTagGelar: text('id_tag_gelar'),
})
export const gelarSkill = sqliteTable('gelar_skill', {
  id: text('id').primaryKey(),
  idGelar: text('id_gelar'),
  idSkill: text('id_skill'),
})

// 4.4 ITEM
export const item = sqliteTable('item', {
  id: text('id').primaryKey(),
  idProyek: text('id_proyek'),
  nama: text('nama'),
  latarBelakang: text('latar_belakang'),
  efek: text('efek'),
  visual: text('visual'),
})
export const tagItem = sqliteTable('tag_item', {
  id: text('id').primaryKey(),
  idProyek: text('id_proyek'),
  konten: text('konten'),
})
export const itemTag = sqliteTable('item_tag', {
  id: text('id').primaryKey(),
  idItem: text('id_item'),
  idTagItem: text('id_tag_item'),
})
export const itemSkill = sqliteTable('item_skill', {
  id: text('id').primaryKey(),
  idItem: text('id_item'),
  idSkill: text('id_skill'),
})

// 4.5 SKILL
export const skill = sqliteTable('skill', {
  id: text('id').primaryKey(),
  idProyek: text('id_proyek'),
  nama: text('nama'),
  latarBelakang: text('latar_belakang'),
  efek: text('efek'),
  visual: text('visual'),
})
export const tagSkill = sqliteTable('tag_skill', {
  id: text('id').primaryKey(),
  idProyek: text('id_proyek'),
  konten: text('konten'),
})
export const skillTag = sqliteTable('skill_tag', {
  id: text('id').primaryKey(),
  idSkill: text('id_skill'),
  idTagSkill: text('id_tag_skill'),
})

// ---------------------------------------------------
// 2.2.b PERCAKAPAN CHAT AI (fitur chat — bagian 2.2.b DbDiagram.dbml)
// Dibuat oleh migrasi 008_chat_ai_chat.sql.
// ---------------------------------------------------

// Sesi percakapan — sesi lama per proyek tersimpan; proyek.sesi_chat_terakhir
// menunjuk sesi yang terakhir dibuka. interaction_id_terakhir/environment_id
// menyimpan state stateful Interactions API agar lanjutan giliran (dan
// function-calling) tetap benar setelah halaman dimuat ulang.
export const chatAiSesi = sqliteTable('chat_ai_sesi', {
  id: text('id').primaryKey(),
  idProyek: text('id_proyek').notNull(),
  judulSesi: text('judul_sesi'),
  // Kolom `catatan_ringkasan` DIHAPUS (tidak pernah ditulis runtime, selalu NULL).
  interactionIdTerakhir: text('interaction_id_terakhir'),
  environmentId: text('environment_id'),
  // Sesi mode planner (migrasi 009): non-NULL = sesi milik satu arc.
  // listSesiChat menyaring yang NULL agar sesi planner tak muncul di dropdown chat.
  arcId: text('arc_id'),
  // Sesi mode penulis (migrasi 013): non-NULL = sesi milik satu sub-arc.
  subArcId: text('sub_arc_id'),
  // Sidik model yang menyimpan interaction saat ini (deteksi ganti model).
  modelTerakhir: text('model_terakhir'),
})

// Gelembung pesan: pembicara = 'Pengguna' | 'Chat AI' | 'Sistem'.
// metadata (JSON string) menyimpan detail eksekusi fungsi: nama_fungsi,
// call_id, args, response, disetujui, serta teks pikiran (thought) AI.
export const chatAiPesan = sqliteTable('chat_ai_pesan', {
  id: text('id').primaryKey(),
  idSesi: text('id_sesi').notNull(),
  pembicara: text('pembicara'),
  konten: text('konten'),
  metadata: text('metadata'),
  dibuatPada: text('dibuat_pada'),
})

export const chatAiFile = sqliteTable('chat_ai_file', {
  id: text('id').primaryKey(),
  idPesan: text('id_pesan').notNull(),
  namaAsli: text('nama_asli').notNull(),
  ekstensi: text('ekstensi').notNull(),
  mimeType: text('mime_type').notNull(),
  ukuranByte: integer('ukuran_byte').notNull(),
  kontenBase64: text('konten_base64').notNull(),
  dibuatPada: text('dibuat_pada'),
})

// LEGACY/DORMANT — `chat_ai_sistem_detail` TIDAK lagi dibaca runtime.
// Sumber kebenaran spec tool AI = kode (features/chat-ai/fungsi/
// specs-chat.ts, features/arc/ai/specs-arc.ts,
// features/outline/ai/specs-outline.ts). Tabel dipertahankan (tidak di-drop)
// agar migrasi lama tetap idempoten + aman downgrade. Jangan tambah migrasi
// spec baru; tambah tool = tambah entri spec di file kode lingkupnya.
export const chatAiSistemDetail = sqliteTable('chat_ai_sistem_detail', {
  id: text('id').primaryKey(),
  namaFungsi: text('nama_fungsi').notNull(),
  deskripsi: text('deskripsi'),
  parameterJson: text('parameter_json'),
  formatLuaran: text('format_luaran'),
  catatanEksekusi: text('catatan_eksekusi'),
  butuhPersetujuan: integer('butuh_persetujuan', { mode: 'boolean' }).default(false),
  aktif: integer('aktif', { mode: 'boolean' }).default(true),
  lingkup: text('lingkup').notNull().default('chat'),
})

// ---------------------------------------------------
// 3.b ARC & SUB ARC (migrasi 009) — DbDiagram.dbml §3.2
// Tabel arc/sub_arc/arc_semesta untuk fitur halaman Arc + AI Planner.
// ---------------------------------------------------

// 3.2 Arc
// Catatan: kolom `target_sub_arc` dihapus oleh migrasi 022 (sebelumnya
// dipakai sebagai hard-guard "sub-arc tidak boleh melebihi target" —
// kebijakan dihapus karena lawan semangat natural growth). Jumlah
// sub-arc pada arc berkembang natural; lihat kepala-prompt
// `features/arc/ai/kepala-prompt.md` §"JUMLAH SUB-ARC".
export const arc = sqliteTable('arc', {
  id: text('id').primaryKey(),
  idProyek: text('id_proyek').notNull(),
  judul: text('judul').notNull(),
  deskripsi: text('deskripsi'),
  sinopsis: text('sinopsis'),
  rencana: text('rencana'),
  urutan: integer('urutan'),
  disembunyikan: integer('disembunyikan', { mode: 'boolean' }).default(false),
  // Sesi AI per arc (migrasi rencana arc-record-pesan-ai):
  // previous_interaction_id = pointer interaksi terakhir (Gemini API)
  // model_terakhir = sidik model yang menyimpan interaction (deteksi ganti model)
  previousInteractionId: text('previous_interaction_id'),
  modelTerakhir: text('model_terakhir'),
})

// 3.2.1 Record Pesan AI Arc (rencana arc-record-pesan-ai)
// Riwayat percakapan user + AI per arc. Window 5 record terbaru;
// tool-return tidak dicatat. Hanya teks user (saat kirim) dan
// teks final AI (saat selesai).
export const arcPesanAi = sqliteTable('arc_pesan_ai', {
  id: text('id').primaryKey(), // UUID v7 (terurut waktu)
  idArc: text('id_arc').notNull(), // FK logis → arc.id
  role: text('role').notNull(), // 'Pengguna' | 'Chat AI'
  konten: text('konten'),
  dibuatPada: text('dibuat_pada'), // ISO string
})

// 3.2.2 Sub Arc — deskripsi unified (teks bebas dengan penanda segmen di
// awal baris: [Orientasi]/[Komplikasi]/[Klimaks]/[Resolusi]; daftar individu
// & lokasi HANYA via junction, bukan nama di markdown). `judul` (010) untuk
// label singkat di daftar.
export const subArc = sqliteTable('sub_arc', {
  id: text('id').primaryKey(),
  idArc: text('id_arc').notNull(),
  judul: text('judul'),
  deskripsi: text('deskripsi'),
  urutan: integer('urutan'),
  disembunyikan: integer('disembunyikan', { mode: 'boolean' }).default(false),
  previousInteractionId: text('previous_interaction_id'),
  modelTerakhir: text('model_terakhir'),
})

// Riwayat percakapan user + AI per sub-arc. Window 5 record terbaru;
// tool-return tidak dicatat.
export const outlinePesanAi = sqliteTable('outline_pesan_ai', {
  id: text('id').primaryKey(),
  idSubArc: text('id_sub_arc').notNull(),
  role: text('role').notNull(),
  konten: text('konten'),
  dibuatPada: text('dibuat_pada'),
})

// 3.2.1.1 Tabel Bantuan Junction (Relasi Many-to-Many Sub-Arc ↔ Individu / Lokasi)
// Tautan resmi untuk Individu Terlibat & Tempat — menggantikan section
// markdown lama. Jika individu/lokasi dihapus, junction yatim ditampilkan
// sebagai chip "(dihapus)" di UI, lalu dilepas manual oleh pengguna.
export const subArcIndividu = sqliteTable('sub_arc_individu', {
  id: text('id').primaryKey(),
  idSubArc: text('id_sub_arc').notNull(),
  idIndividu: text('id_individu').notNull(),
})

export const subArcLokasi = sqliteTable('sub_arc_lokasi', {
  id: text('id').primaryKey(),
  idSubArc: text('id_sub_arc').notNull(),
  idLokasi: text('id_lokasi').notNull(),
})

// 3.2.2 Tabel Bantuan Arc -> Semesta (hanya relasi; individu/lokasi dibaca AI
// lewat fungsi planner khusus)
export const arcSemesta = sqliteTable('arc_semesta', {
  id: text('id').primaryKey(),
  idArc: text('id_arc').notNull(),
  idSemesta: text('id_semesta').notNull(),
})

// ---------------------------------------------------
// 3.3 OUTLINE (migrasi 012) — DbDiagram.dbml §3.3
// Hierarki: segmen_outline (1-to-1 dgn sub_arc) → bab_outline → scene_outline,
// junction individu_terlibat_scene (m-1), master waktu_scene, dan junction
// referensi_bab_scene (m-m) untuk kontinuitas naratif.
// ---------------------------------------------------

// 3.3 Segmen Outline — 1-to-1 dengan sub_arc (lihat DbDiagram §3.3).
// Kolom `status` DIHAPUS (flag "AI dimatikan" tidak pernah dipakai UI/tool;
// keputusan "selesai" diturunkan AI dari data outline saat dibaca).
// `min_scene`/`max_scene` jadi batasan jumlah scene per BAB yang AI hasilkan.
export const segmenOutline = sqliteTable('segmen_outline', {
  id: text('id').primaryKey(),
  idSubArc: text('id_sub_arc').notNull().unique(),
  catatanAi: text('catatan_ai'),
  minScene: integer('min_scene').notNull().default(2),
  maxScene: integer('max_scene').notNull().default(4),
})

// 3.3.1 Bab Outline — bernomor per segmen_outline (lihat §9 Keamanan).
// `nomor_bab` nullable; UI memungkinkan NULL = "belum diberi nomor".
export const babOutline = sqliteTable('bab_outline', {
  id: text('id').primaryKey(),
  idSegmenOutline: text('id_segmen_outline').notNull(),
  nomorBab: integer('nomor_bab'),
  judul: text('judul'),
})

// 3.3.1.1 Scene Outline — `waktu_scene` & `lokasi_scene` bisa literal
// 'Lanjut/sama dengan sebelumnya' atau FK logik ke waktu_scene.id / lokasi.id.
//
// TIDAK ada kolom hide/show persisten di DB. Konsep hide/show digantikan
// oleh COLLAPSE di sisi RAM (kepala scene jadi tombol toggle buka/tutup
// body) — lihat DaftarSceneOutline + ItemSceneOutline. Migrasi 020 menghapus
// kolom `disembunyikan` yang sebelumnya ada (lihat migrasi 014 → 020).
export const sceneOutline = sqliteTable('scene_outline', {
  id: text('id').primaryKey(),
  idBabOutline: text('id_bab_outline').notNull(),
  waktuScene: text('waktu_scene').default('Lanjut/sama dengan sebelumnya'),
  lokasiScene: text('lokasi_scene').default('Lanjut/tidak ada dalam daftar'),
  konten: text('konten'),
})

// 3.3.1.1.1 Tabel Bantuan Individu Terlibat Scene (m-1; banyak individu per scene).
export const individuTerlibatScene = sqliteTable('individu_terlibat_scene', {
  id: text('id').primaryKey(),
  idSceneOutline: text('id_scene_outline').notNull(),
  idIndividu: text('id_individu').notNull(),
})

// 3.3.2 Master Waktu Scene — di-seed saat migrasi, boleh diedit.
export const waktuScene = sqliteTable('waktu_scene', {
  id: text('id').primaryKey(),
  namaWaktu: text('nama_waktu'),
})

// 3.3.3 Tabel Bantuan Referensi BAB ↔ Scene (m-m) — kontinuitas naratif.
// Satu scene bisa merujuk banyak BAB (flashback/kelanjutan/dll) dan satu
// BAB dirujuk banyak scene. UNIQUE triplet (scene, bab, jenis) agar satu
// scene bisa merujuk BAB yang sama dengan jenis berbeda tanpa duplikat.
// `jenis` disimpan TEXT (SQLite tanpa CHECK); gunakan konstanta
// JENIS_REFERENSI_BAB di features/outline/types.ts.
export const referensiBabScene = sqliteTable('referensi_bab_scene', {
  id: text('id').primaryKey(),
  idSceneOutline: text('id_scene_outline').notNull(),
  idBabOutline: text('id_bab_outline').notNull(),
  jenis: text('jenis').notNull().default('lainnya'),
  catatan: text('catatan'),
})

// 3.3.4 Tabel Bantuan Referensi Scene ↔ Opsi Fantasi (m-m) — digunaan oleh
// AI penulis untuk mengetahui opsi fantasi (ras/kelas/gelar/item/skill)
// yang muncul pada scene tertentu. id_opsi_fantasi adalah FK generik ke 5
// tabel (lihat migrasi 014); tipe_opsi_fantasi (TEXT) membedakan target.
// `tipe_opsi_fantasi` disimpan TEXT (SQLite tanpa CHECK); gunakan konstanta
// TIPE_OPSI_FANTASI di features/outline/types.ts. UNIQUE composite untuk
// anti-duplikat (1 scene tidak menautkan opsi fantasi yang sama 2x).
export const referensiSceneOpsiFantasi = sqliteTable('referensi_scene_opsi_fantasi', {
  id: text('id').primaryKey(),
  idSceneOutline: text('id_scene_outline').notNull(),
  idOpsiFantasi: text('id_opsi_fantasi').notNull(),
  tipeOpsiFantasi: text('tipe_opsi_fantasi').notNull(),
})

// ---------------------------------------------------
// 3.4-3.5 MENULIS / TULIS NASKAH (migrasi 015) — DbDiagram.dbml §3.4 & §3.5
// Fitur halaman "Menulis" (Tulis Naskah) — lihat
// goose-context/planner/DokumentasiHalamanMenulis.md &
// goose-context/planner/09-04-2026-rencana-halaman-menulis.md.
// Revisi 2026-09-04:
//   - pengaturan_menulis_novel: kolom chapter_sekarang & scene_sekarang
//     DIHAPUS. BAB & scene dipilih dari papan navigasi & panel scene
//     (komponen UI), bukan dari input manual. Kolom id_bab_aktif &
//     id_scene_aktif ditambahkan sebagai penanda state UI.
//   - bab_novel: id_bab_outline jadi NOT NULL UNIQUE (1 baris per BAB
//     outline). Konten_novel = gabungan semua scene BAB, dipisah `===`.
//   - menulis_file_referensi_luar: diaktifkan kembali (sebelumnya dormant
//     di DbDiagram) — file referensi .txt/.md disimpan di SQLite per
//     proyek, dipakai sebagai konteks AI.
//   - menulis_opsi_model TIDAK dibuat — reuse opsi_model_ai dari migrasi
//     005 (lihat pengaturan_menulis_novel.model_gemini FK).
// ---------------------------------------------------

// 3.4.a Pengaturan Menulis Novel — 1 baris per proyek (lazy-create).
// id_bab_aktif & id_scene_aktif boleh NULL — menandakan "belum memilih".
// prompt_gaya_bahasa NOT NULL DEFAULT '' — di-seed dari file template
// `src/features/menulis/data/gaya-bahasa-default.md` oleh repository.ts
// (melalui `?raw` import Vite), BUKAN oleh migrasi ini.
// model_gemini FK ke opsi_model_ai.id (reuse dari migrasi 005, bukan
// menulis_opsi_model yang tidak dibuat).
export const pengaturanMenulisNovel = sqliteTable('pengaturan_menulis_novel', {
  id: text('id').primaryKey(),
  idProyek: text('id_proyek').notNull().unique(),
  tabAktif: text('tab_aktif').default('menulis'),
  idBabAktif: text('id_bab_aktif'),
  idSceneAktif: text('id_scene_aktif'),
  promptGayaBahasa: text('prompt_gaya_bahasa').notNull().default(''),
  gunakanInteraksi: integer('gunakan_interaksi', { mode: 'boolean' }).default(false),
  interaksiPreviousId: text('interaksi_previous_id'),
  interaksiModelTerakhir: text('interaksi_model_terakhir'),
  modelGemini: text('model_gemini').notNull(),
  luaranTokenMaksimal: integer('luaran_token_maksimal').default(40000),
  masukanTulisanAi: text('masukan_tulisan_ai'),
  luaranTulisanAi: text('luaran_tulisan_ai'),
  promptPerintahRevisi: text('prompt_perintah_revisi'),
  masukanTulisanAiRevisi: text('masukan_tulisan_ai_revisi'),
  luaranTulisanAiRevisi: text('luaran_tulisan_ai_revisi'),
  jumlahKonteksBabSebelumnya: integer('jumlah_konteks_bab_sebelumnya').default(3),
  luaranKonteksBabSebelumnya: text('luaran_konteks_bab_sebelumnya'),
  thinkingLevel: text('thinking_level').default('medium'),
  thinkingSummaries: integer('thinking_summaries', { mode: 'boolean' }).default(true),
})

// 3.4.b File Referensi Luaran — diaktifkan per revisi 2026-09-04 (B2.7).
// Disimpan di SQLite (bukan IndexedDB) agar konsisten dengan data naskah.
// id_pengaturan_menulis_novel FK ke pengaturan_menulis_novel.id — file
// milik satu proyek.
export const menulisFileReferensiLuar = sqliteTable('menulis_file_referensi_luar', {
  id: text('id').primaryKey(),
  idPengaturanMenulisNovel: text('id_pengaturan_menulis_novel').notNull(),
  namaFile: text('nama_file'),
  kontenFile: text('konten_file'),
})

// 3.5 Bab Novel Final — 1 baris per BAB outline.
// Revisi 2026-09-04: id_bab_outline NOT NULL UNIQUE — menulis tanpa
// outline TIDAK didukung. Konten_novel = gabungan scene dalam BAB,
// dipisah dengan baris berisi `===` (lihat DbDiagram §3.5).
export const babNovel = sqliteTable('bab_novel', {
  id: text('id').primaryKey(),
  idBabOutline: text('id_bab_outline').notNull().unique(),
  kontenNovel: text('konten_novel'),
})

// ---------------------------------------------------
// 5. NARASI VIDEO — BGM mixing, gambar, job tracking (migrasi 029)
// Tabel pendukung pipeline narasi video per sub-arc.
// Lihat RencanaMatangNarasiVideo.md §5.
// ---------------------------------------------------

// 5.1 Nuansa — pool label emosi/nuansa (global, cross-project).
// Kolom id_proyek dihapus di migrasi 041: nuansa selalu global.
export const nuansa = sqliteTable('nuansa', {
  id: text('id').primaryKey(),
  nama: text('nama').notNull(),
})

// 5.2 BGM — metadata audio latar per nuansa (global, cross-project).
//     Blob audio disimpan di IndexedDB 'narasi-video-artefak' (store
//     'bgm-artefak'); SQLite hanya menyimpan metadata (migrasi 049).
//     id_proyek disengaja TIDAK ada: pool BGM bersifat global (cross-project).
export const bgm = sqliteTable('bgm', {
  id: text('id').primaryKey(),
  idNuansa: text('id_nuansa').notNull(),
  nama: text('nama'),
  durasi: real('durasi'),
  format: text('format'),
  dibuatPada: text('dibuat_pada'),
})


// 3.1 KALENDER FIKTIF (migrasi 040) — DbDiagram.dbml §3.1
// Catatan bebas per tanggal dalam kalender fiktif per proyek.
// ---------------------------------------------------
export const rencanaKalender = sqliteTable('rencana_kalender', {
  id: text('id').primaryKey(),
  idProyek: text('id_proyek').notNull(),
  tanggal: text('tanggal').notNull(), // format "YYYY-MM-DD"
  judulCatatan: text('judul_catatan'),
  kontenCatatan: text('konten_catatan'),
})
