// src/db/worker.ts
// ─────────────────────────────────────────────────────────────────────────────
// WORKER SQLite — VERSI SEDERHANA (fresh start, tanpa backward-compat)
//
// Versi ini HANYA untuk database baru yang diinisialisasi dengan
// final_schema.sql. Tidak ada logika migrasi bertahap — semua tabel
// dibuat langsung dari skema final.

import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs'
import initSchemaSql from './migrations/001_init_schema.sql?raw'
import * as SQLite from 'wa-sqlite'
import { AccessHandlePoolVFS } from 'wa-sqlite/src/examples/AccessHandlePoolVFS.js'

type SQLiteAPI = ReturnType<typeof SQLite.Factory>

type SesiDB = { sqlite3: SQLiteAPI; db: number; vfs: AccessHandlePoolVFS }

// ── Ketahanan inisialisasi (penyembuhan diri) ────────────────────────────────
const MAKS_PERC_INI = 4
const JEDA_BACKOFF_INI_MS = 250
const MAKS_RANGKAIAN_GAGAL = 2
const JEDA_ANTAR_RANGKAIAN_MS = 3000

// ── Guard migrasi inkremental (idempoten) ────────────────────────────────────
// `001_init_schema.sql` memakai CREATE TABLE IF NOT EXISTS → tabel lama tidak
// berubah saat kolom baru ditambahkan ke skema. Kolom di bawah ini adalah
// kolom "terkini" yang WAJIB ada; bila DB dibuat sebelum kolom itu eksis,
// di-guard lewat ALTER TABLE. Aman: hanya MENAMBAH kolom, tidak mengubah/
// menghapus yang sudah ada. ADD COLUMN dengan DEFAULT otomatis mengisi baris
// existing (karena belum ada nilai di kolom itu saat ditambahkan).

/** Kolom wajib `pengaturan_global` yang mungkin belum ada di DB lama. */
const KOLOM_PENGATURAN_GLOBAL: Record<string, string> = {
  thinking_level: `text DEFAULT 'medium' CHECK(thinking_level IN ('low', 'medium', 'high'))`,
  thinking_summaries: 'integer DEFAULT 1',
  max_output_tokens: 'integer DEFAULT 32000',
  chat_ai_model_id: `text DEFAULT 'gemini-3.5-flash-lite'`,
}

/** Kolom wajib `chat_ai_sesi` yang mungkin belum ada di DB lama. */
const KOLOM_SESI_CHAT: Record<string, string> = {
  model_terakhir: 'text',
}

/** Kolom wajib `pengaturan_menulis_novel` yang mungkin belum ada di DB lama. */
const KOLOM_PENGATURAN_MENULIS: Record<string, string> = {
  thinking_level: `text DEFAULT 'medium' CHECK(thinking_level IN ('low', 'medium', 'high'))`,
  thinking_summaries: 'integer DEFAULT 1',
  // Sesi Interaksi Menulis (stateful per-proyek, 1 rantai per baris pengaturan).
  // Nullable → baris existing aman (NULL = sesi baru). TIDAK ada DROP kolom:
  // `gunakan_interaksi` di-reuse untuk mode baru (bukan Antigravity lagi).
  interaksi_previous_id: 'text',
  interaksi_model_terakhir: 'text',
}

/** Kolom wajib `rencana_kalender` (migrasi 040). DB fresh hasil konsolidasi
 *  001 yang salah salin tidak membawa kolom ini → guard menambahkannya.
 *  ADD COLUMN nullable → baris existing aman (terisi NULL). */
const KOLOM_RENCANA_KALENDER: Record<string, string> = {
  judul_catatan: 'text',
  konten_catatan: 'text',
}

/** Kolom wajib `arc` (rencana arc-record-pesan-ai) yang mungkin belum ada di DB lama. */
const KOLOM_ARC: Record<string, string> = {
  previous_interaction_id: 'text',
  model_terakhir: 'text',
}

const KOLOM_SUB_ARC: Record<string, string> = {
  previous_interaction_id: 'text',
  model_terakhir: 'text',
}

const KOLOM_PROYEK: Record<string, string> = {
  potongan_judul_import_outline: 'integer NOT NULL DEFAULT 0',
  // Pulihkan arc / outline terakhir dibuka (semua nullable — ADD COLUMN
  // mengisi baris existing dengan NULL, artinya "belum pernah dibuka").
  last_visited_arc: 'text',
  outline_last_visited_arc: 'text',
  outline_last_visited_subarc: 'text',
}

/** Kolom wajib `semesta_proyek` (fitur sortir semesta per proyek). DB baru
 *  mendapatkannya dari 001_init_schema.sql; DB lama ditambah di sini.
 *  ADD COLUMN nullable → baris existing terisi NULL, lalu dirapatkan oleh
 *  `rapatkanUrutanSemestaProyek` di bawah (NULL = paling bawah, tampil lama
 *  dipertahankan karena tie-breaker memakai id UUIDv7 = waktu penautan). */
const KOLOM_SEMESTA_PROYEK: Record<string, string> = {
  urutan: 'integer',
}

/** Pastikan kolom yang diminta ada pada sebuah tabel (idempoten per kolom). */
async function pastikanKolom(
  sqlite3: SQLiteAPI,
  db: number,
  namaTabel: string,
  kolom: Record<string, string>,
): Promise<void> {
  const namaKolomAda = new Set<string>()
  try {
    await sqlite3.exec(db, `PRAGMA table_info('${namaTabel}')`, (row) => {
      if (row && row.length > 1 && typeof row[1] === 'string') namaKolomAda.add(row[1])
    })
  } catch (err) {
    console.warn(`[worker] Gagal membaca table_info('${namaTabel}'):`, err)
    return
  }
  for (const [nama, ddl] of Object.entries(kolom)) {
    if (namaKolomAda.has(nama)) continue
    try {
      await sqlite3.exec(db, `ALTER TABLE \`${namaTabel}\` ADD COLUMN \`${nama}\` ${ddl}`)
      console.log(`[worker] Kolom ${namaTabel}.${nama} ditambahkan (guard migrasi inkremental).`)
    } catch (err) {
      // Jangan menggagalkan inisialisasi — satu kolom gagal ≠ DB rusak.
      console.error(`[worker] Gagal menambah kolom ${namaTabel}.${nama}:`, err)
    }
  }
}

/** Pastikan tabel ada (idempotent). DB lama mungkin belum punya tabel baru. */
async function pastikanTabel(
  sqlite3: SQLiteAPI,
  db: number,
  ddl: string,
): Promise<void> {
  try {
    await sqlite3.exec(db, ddl)
  } catch (err) {
    console.error(`[worker] Gagal membuat tabel:`, err)
  }
}

/** Rapatkan `semesta_proyek.urutan` per proyek menjadi 1..N (idempoten).
 *  Dipakai sekali saat startup untuk menyembuhkan data lama / tidak valid:
 *  NULL, duplikat, atau lubang (mis. sisa hapus/lepas sebelum fitur rapat
 *  otomatis ada). Urutan logis saat ini dipertahankan:
 *  `urutan IS NULL ASC, urutan ASC, id ASC` (id UUIDv7 = waktu penautan,
 *  sehingga tampilan lama tidak berubah). Gagal di sini TIDAK menggagalkan
 *  inisialisasi — loader tetap toleran terhadap NULL/duplikat. */
async function rapatkanUrutanSemestaProyek(
  sqlite3: SQLiteAPI,
  db: number,
): Promise<void> {
  try {
    let punyaKolom = false
    try {
      await sqlite3.exec(db, `PRAGMA table_info('semesta_proyek')`, (row) => {
        if (row && row.length > 1 && row[1] === 'urutan') punyaKolom = true
      })
    } catch {
      return
    }
    if (!punyaKolom) return

    const escId = (v: string): string => v.replace(/'/g, "''")
    // Kumpulkan semua grup id_proyek: dari tabel proyek + baris yatim yang
    // masih tertinggal di semesta_proyek (proyeknya sudah dihapus).
    const grup = new Set<string>()
    try {
      await sqlite3.exec(db, `SELECT id FROM proyek`, (row) => {
        if (row && typeof row[0] === 'string' && row[0] !== '') grup.add(row[0] as string)
      })
    } catch {
      /* abaikan — lanjut dengan grup dari semesta_proyek */
    }
    try {
      await sqlite3.exec(db, `SELECT DISTINCT id_proyek FROM semesta_proyek`, (row) => {
        if (row && typeof row[0] === 'string' && row[0] !== '') grup.add(row[0] as string)
      })
    } catch {
      return
    }
    for (const idProyek of grup) {
      const baris: Array<{ id: string; urutan: number | null }> = []
      await sqlite3.exec(
        db,
        `SELECT id, urutan FROM semesta_proyek
         WHERE id_proyek = '${escId(idProyek)}'
         ORDER BY urutan IS NULL ASC, urutan ASC, id ASC`,
        (row) => {
          if (row && typeof row[0] === 'string') {
            const u = row[1]
            baris.push({
              id: row[0] as string,
              urutan: u === null || u === undefined ? null : Number(u),
            })
          }
        },
      )
      for (let i = 0; i < baris.length; i++) {
        const harus = i + 1
        if (baris[i].urutan === harus) continue
        await sqlite3.exec(
          db,
          `UPDATE \`semesta_proyek\` SET \`urutan\` = ${harus} WHERE \`id\` = '${escId(baris[i].id)}'`,
        )
      }
    }
  } catch (err) {
    console.error('[worker] Gagal merapatkan urutan semesta_proyek:', err)
  }
}

/**
 * Nama indeks unik `ai_kepala_prompt` pada `lower(nama_perintah)` — warisan
 * migrasi 042 yang tidak ikut terkonsolidasi ke `001_init_schema.sql`.
 * Tanpa indeks ini, baris perintah AI bisa duplikat (race) dan proteksi
 * `ON CONFLICT` di shared/ai/panggil-ai.ts tidak sah.
 */
const NAMA_INDEKS_UNIK_PERINTAH = 'idx_ai_kepala_prompt_nama_unique'

/** Pastikan indeks unik `lower(nama_perintah)` pada `ai_kepala_prompt` ada
 *  (idempoten). DB lama hasil konsolidasi tidak membawanya → guard ini
 *  memulihkannya: duplikat dibersihkan dulu (baris MIN(rowid) dipertahankan,
 *  pola sama dengan dokumentasi migrasi 042) agar CREATE UNIQUE INDEX tidak
 *  pernah gagal. Gagal di sini TIDAK menggagalkan inisialisasi — lazy-seed
 *  prompt (pastikanBarisPrompt) kini kebal skema, hanya tanpa proteksi race. */
async function pastikanIndeksUnikKepalaPrompt(
  sqlite3: SQLiteAPI,
  db: number,
): Promise<void> {
  let indeksAda = false
  try {
    await sqlite3.exec(
      db,
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name = '${NAMA_INDEKS_UNIK_PERINTAH}'`,
      (row) => {
        if (row && row[0]) indeksAda = true
      },
    )
  } catch (err) {
    console.warn('[worker] Gagal membaca sqlite_master (indeks perintah AI):', err)
    return
  }
  if (indeksAda) return
  try {
    // Jaga-jaga: buang duplikat nama_perintah sebelum membuat indeks unik.
    await sqlite3.exec(
      db,
      `DELETE FROM \`ai_kepala_prompt\`
       WHERE rowid NOT IN (
         SELECT MIN(rowid) FROM \`ai_kepala_prompt\` GROUP BY lower(nama_perintah)
       )`,
    )
    await sqlite3.exec(
      db,
      `CREATE UNIQUE INDEX \`${NAMA_INDEKS_UNIK_PERINTAH}\`
         ON \`ai_kepala_prompt\`(lower(\`nama_perintah\`))`,
    )
    console.log(
      '[worker] Indeks unik ai_kepala_prompt(nama_perintah) dibuat (guard migrasi inkremental).',
    )
  } catch (err) {
    console.error('[worker] Gagal membuat indeks unik ai_kepala_prompt:', err)
  }
}

let dbReady: Promise<SesiDB> | null = null
let sesiAktif: SesiDB | null = null
let errInisialisasi: Error | null = null
let jumlahGagalBerturut = 0
let gagalTerakhirPada = 0

// Status transaksi
let inTx = false
let txGroupId: string | null = null
let txMulaiPada: number | null = null
const MAKS_DURASI_TX_MS = 10_000

function tunda(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function tutupVFS(vfs: AccessHandlePoolVFS): Promise<void> {
  return (vfs as unknown as { close(): Promise<void> }).close()
}

function buatPesanErrorInisialisasi(err: unknown): Error {
  const pesan = err instanceof Error ? err.message : String(err)
  if (/NoModificationAllowed|modification access|locked|in use/i.test(pesan)) {
    return new Error(
      'Database masih terkunci oleh tab lain / proses lama ' +
        '(NoModificationAllowedError). Tutup SEMUA tab aplikasi ini, tunggu ' +
        'beberapa detik, lalu muat ulang satu tab.'
    )
  }
  return err instanceof Error ? err : new Error(pesan)
}

// Inisialisasi database — versi sederhana (tanpa migrasi bertahap)
async function initDbSekali(): Promise<SesiDB> {
  console.log('[worker] Inisialisasi dimulai: memuat WASM SQLite…')
  const module = await SQLiteESMFactory()
  const sqlite3 = SQLite.Factory(module)
  console.log('[worker] WASM SQLite dimuat. Menyiapkan VFS OPFS /novel-outliner…')

  const vfs = new AccessHandlePoolVFS('/novel-outliner')
  let db: number | null = null

  try {
    await vfs.isReady
    console.log('[worker] VFS OPFS siap.')
    sqlite3.vfs_register(vfs as unknown as Parameters<SQLiteAPI['vfs_register']>[0], true)

    db = await sqlite3.open_v2('novel.db')
    console.log('[worker] Database dibuka (novel.db).')

    // WAL mode untuk performa
    await sqlite3.exec(db, 'PRAGMA journal_mode=WAL;')

    // Jalankan skema final (semua tabel + index + seed)
    console.log('[worker] Menjalankan final_schema.sql…')
    await sqlite3.exec(db, initSchemaSql)
    console.log('[worker] Final schema berhasil dijalankan.')

    // Guard migrasi inkremental: pastikan kolom wajib terbaru ada di DB lama.
    await pastikanKolom(sqlite3, db, 'pengaturan_global', KOLOM_PENGATURAN_GLOBAL)
    await pastikanKolom(sqlite3, db, 'chat_ai_sesi', KOLOM_SESI_CHAT)
    await pastikanKolom(sqlite3, db, 'pengaturan_menulis_novel', KOLOM_PENGATURAN_MENULIS)
    await pastikanKolom(sqlite3, db, 'rencana_kalender', KOLOM_RENCANA_KALENDER)
    await pastikanKolom(sqlite3, db, 'arc', KOLOM_ARC)
    await pastikanKolom(sqlite3, db, 'sub_arc', KOLOM_SUB_ARC)
    await pastikanKolom(sqlite3, db, 'proyek', KOLOM_PROYEK)
    await pastikanKolom(sqlite3, db, 'semesta_proyek', KOLOM_SEMESTA_PROYEK)
    // Sembuhkan urutan lama/tidak valid (NULL/duplikat/lubang) menjadi 1..N
    // per proyek. Idempoten — aman dijalankan setiap startup.
    await rapatkanUrutanSemestaProyek(sqlite3, db)
    await pastikanTabel(sqlite3, db, `CREATE TABLE IF NOT EXISTS \`outline_pesan_ai\` (
      \`id\` text PRIMARY KEY NOT NULL,
      \`id_sub_arc\` text NOT NULL,
      \`role\` text NOT NULL,
      \`konten\` text,
      \`dibuat_pada\` text
    )`)
    await pastikanTabel(sqlite3, db, `CREATE TABLE IF NOT EXISTS \`chat_ai_file\` (
      \`id\` text PRIMARY KEY NOT NULL,
      \`id_pesan\` text NOT NULL,
      \`nama_asli\` text NOT NULL,
      \`ekstensi\` text NOT NULL,
      \`mime_type\` text NOT NULL,
      \`ukuran_byte\` integer NOT NULL,
      \`konten_base64\` text NOT NULL,
      \`dibuat_pada\` text
    )`)
    await pastikanTabel(sqlite3, db, `CREATE INDEX IF NOT EXISTS \`idx_chat_ai_file_pesan\` ON \`chat_ai_file\`(\`id_pesan\`)`)
    await pastikanTabel(sqlite3, db, `CREATE INDEX IF NOT EXISTS \`idx_outline_pesan_subarc\` ON \`outline_pesan_ai\`(\`id_sub_arc\`)`)
    await sqlite3.exec(db, `
      UPDATE sub_arc
      SET previous_interaction_id = (
        SELECT interaction_id_terakhir FROM chat_ai_sesi
        WHERE chat_ai_sesi.sub_arc_id = sub_arc.id
        ORDER BY chat_ai_sesi.id DESC LIMIT 1
      ), model_terakhir = (
        SELECT model_terakhir FROM chat_ai_sesi
        WHERE chat_ai_sesi.sub_arc_id = sub_arc.id
        ORDER BY chat_ai_sesi.id DESC LIMIT 1
      )
      WHERE EXISTS (SELECT 1 FROM chat_ai_sesi WHERE chat_ai_sesi.sub_arc_id = sub_arc.id)
        AND previous_interaction_id IS NULL
        AND model_terakhir IS NULL
    `)
    // Guard tabel baru: arc_pesan_ai (rencana arc-record-pesan-ai)
    await pastikanTabel(sqlite3, db, `CREATE TABLE IF NOT EXISTS \`arc_pesan_ai\` (
      \`id\` text PRIMARY KEY NOT NULL,
      \`id_arc\` text NOT NULL,
      \`role\` text NOT NULL,
      \`konten\` text,
      \`dibuat_pada\` text
    )`)
    await pastikanTabel(sqlite3, db, `CREATE INDEX IF NOT EXISTS \`idx_arc_pesan_arc\` ON \`arc_pesan_ai\`(\`id_arc\`)`)
    // Guard indeks unik ai_kepala_prompt (warisan migrasi 042 — hilang saat
    // konsolidasi; lihat komentar fungsi). Berjalan setelah skema final agar
    // tabelnya pasti sudah ada (DB baru maupun lama).
    await pastikanIndeksUnikKepalaPrompt(sqlite3, db)

    const sesi: SesiDB = { sqlite3, db, vfs }
    sesiAktif = sesi
    console.log('[worker] Inisialisasi database SELESAI.')
    return sesi
  } catch (err) {
    if (db !== null) {
      try {
        await sqlite3.close(db)
      } catch {
        /* abaikan */
      }
    }
    try {
      await tutupVFS(vfs)
    } catch {
      /* abaikan */
    }
    console.error('[worker] Inisialisasi GAGAL (handle OPFS sudah dilepas):', err)
    throw buatPesanErrorInisialisasi(err)
  }
}

function getDb(): Promise<SesiDB> {
  if (dbReady) return dbReady

  if (errInisialisasi) {
    const bolehCobaLagi =
      jumlahGagalBerturut < MAKS_RANGKAIAN_GAGAL &&
      Date.now() - gagalTerakhirPada >= JEDA_ANTAR_RANGKAIAN_MS
    if (!bolehCobaLagi) {
      console.warn('[worker] Query dibatalkan cepat karena inisialisasi masih gagal:', errInisialisasi.message)
      return Promise.reject(errInisialisasi)
    }
    console.log('[worker] Jeda antar-rangkaian selesai → mencoba rangkaian inisialisasi baru (self-heal).')
  }

  dbReady = (async () => {
    let errTerakhir: unknown = null
    for (let percobaan = 1; percobaan <= MAKS_PERC_INI; percobaan++) {
      try {
        return await initDbSekali()
      } catch (err) {
        errTerakhir = err
        if (percobaan < MAKS_PERC_INI) {
          const jeda = JEDA_BACKOFF_INI_MS * percobaan
          console.warn(
            `[worker] Percobaan ke-${percobaan}/${MAKS_PERC_INI} gagal:`,
            err instanceof Error ? err.message : err,
            `— retry dalam ${jeda}ms`
          )
          await tunda(jeda)
        }
      }
    }
    console.error(`[worker] Semua ${MAKS_PERC_INI} percobaan pada rangkaian ini gagal.`)
    throw buatPesanErrorInisialisasi(errTerakhir)
  })()
    .then((hasil) => {
      errInisialisasi = null
      jumlahGagalBerturut = 0
      return hasil
    })
    .catch((err) => {
      const e = err instanceof Error ? err : new Error(String(err))
      dbReady = null
      errInisialisasi = e
      gagalTerakhirPada = Date.now()
      jumlahGagalBerturut += 1
      throw e
    })

  return dbReady
}

let queryQueue = Promise.resolve()

self.onmessage = (msg: MessageEvent) => {
  const { id, sql, type, params } = msg.data

  // Reset koneksi
  if (type === 'reset') {
    queryQueue = queryQueue.then(async () => {
      try {
        if (sesiAktif) {
          try {
            await sesiAktif.sqlite3.close(sesiAktif.db)
          } catch { /* abaikan */ }
          try {
            await tutupVFS(sesiAktif.vfs)
          } catch { /* abaikan */ }
          sesiAktif = null
        }
        dbReady = null
        errInisialisasi = null
        jumlahGagalBerturut = 0
        gagalTerakhirPada = 0
        inTx = false
        txGroupId = null
        txMulaiPada = null
        console.log('[worker] Reset koneksi selesai.')
        ;(self as unknown as Worker).postMessage({ id, ok: true, results: [] })
      } catch (err) {
        console.error('[worker] Reset koneksi GAGAL:', err)
        ;(self as unknown as Worker).postMessage({ id, ok: false, error: String(err) })
      }
    })
    return
  }

  if (sql) {
    console.debug(`[worker] Query masuk antrean: ${sql.trim().slice(0, 120)}`)
  }

  // ── TRANSAKSI ──────────────────────────────────────────────────────────────
  if (type === 'transaction') {
    const msgTxGroupId = (msg.data as { txGroupId?: string }).txGroupId ?? null
    queryQueue = queryQueue.then(async () => {
      try {
        // Watchdog TX
        if (inTx && txMulaiPada !== null && Date.now() - txMulaiPada > MAKS_DURASI_TX_MS) {
          console.warn(`[worker] TX watchdog: transaksi (group=${txGroupId}) berjalan > ${MAKS_DURASI_TX_MS}ms — auto-ROLLBACK.`)
          try {
            const { sqlite3, db } = await getDb()
            await sqlite3.exec(db, 'ROLLBACK')
          } catch (e) {
            console.error('[worker] TX watchdog ROLLBACK gagal:', e)
          }
          inTx = false
          txGroupId = null
          txMulaiPada = null
        }

        const { sqlite3, db } = await getDb()
        const cmd = sql.trim().split(/s+/)[0].toUpperCase()
        if (cmd === 'BEGIN') {
          if (inTx) throw new Error('TX_ACTIVE: transaksi lain sedang berjalan.')
          if (!msgTxGroupId) throw new Error('BEGIN tanpa txGroupId.')
          await sqlite3.exec(db, 'BEGIN')
          inTx = true
          txGroupId = msgTxGroupId
          txMulaiPada = Date.now()
          console.log(`[worker] TX BEGIN (group=${txGroupId})`)
        } else if (cmd === 'COMMIT') {
          if (!inTx) throw new Error('Tidak ada transaksi aktif.')
          if (msgTxGroupId && msgTxGroupId !== txGroupId) throw new Error('txGroupId COMMIT tidak cocok.')
          await sqlite3.exec(db, 'COMMIT')
          inTx = false
          txGroupId = null
          txMulaiPada = null
          console.log('[worker] TX COMMIT')
        } else if (cmd === 'ROLLBACK') {
          if (!inTx) throw new Error('Tidak ada transaksi aktif.')
          if (msgTxGroupId && msgTxGroupId !== txGroupId) throw new Error('txGroupId ROLLBACK tidak cocok.')
          await sqlite3.exec(db, 'ROLLBACK')
          inTx = false
          txGroupId = null
          txMulaiPada = null
          console.log('[worker] TX ROLLBACK')
        } else {
          throw new Error(`Perintah transaksi tidak dikenal: ${cmd}`)
        }
        ;(self as unknown as Worker).postMessage({ id, ok: true, results: [] })
      } catch (err) {
        ;(self as unknown as Worker).postMessage({ id, ok: false, error: String(err) })
      }
    }).catch((err) => console.error('Queue TX error:', err))
    return
  }

  // ── TX_QUERY ──────────────────────────────────────────────────────────────
  if (type === 'tx_query') {
    const expectedGroup = (msg.data as { txGroupId?: string }).txGroupId ?? null
    const params = (msg.data as { params?: unknown[] }).params
    queryQueue = queryQueue.then(async () => {
      try {
        if (!inTx) throw new Error('Tidak ada transaksi aktif.')
        if (expectedGroup !== txGroupId) throw new Error('txGroupId tidak cocok.')
        const { sqlite3, db } = await getDb()
        const results: { columns: string[]; rows: unknown[][] }[] = []
        if (Array.isArray(params) && params.length > 0) {
          const hasil = await (
            sqlite3 as unknown as {
              execWithParams: (db: number, sql: string, params: unknown[]) => Promise<{ columns: string[]; rows: unknown[][] }>
            }
          ).execWithParams(db, sql, params)
          results.push(hasil)
        } else {
          await sqlite3.exec(db, sql, (row: unknown[], columns: string[]) => {
            const last = results[results.length - 1]
            if (!last || last.columns !== columns) results.push({ columns, rows: [] })
            results[results.length - 1].rows.push(row)
          })
        }
        console.log(`[worker] TX QUERY: ${sql.trim().slice(0, 120)}`)
        ;(self as unknown as Worker).postMessage({ id, ok: true, results })
      } catch (err) {
        ;(self as unknown as Worker).postMessage({ id, ok: false, error: String(err) })
      }
    }).catch((err) => console.error('Queue TX query error:', err))
    return
  }

  // ── QUERY biasa ───────────────────────────────────────────────────────────
  if (inTx && type !== 'reset') {
    ;(self as unknown as Worker).postMessage({
      id, ok: false, error: 'TX_ACTIVE: transaksi sedang berlangsung.',
    })
    return
  }

  queryQueue = queryQueue.then(async () => {
    try {
      const { sqlite3, db } = await getDb()
      const results: { columns: string[]; rows: unknown[][] }[] = []

      const sqlType = sql.trim().split(/s+/)[0].toUpperCase()
      console.log('Menjalankan SQL:', sql)
      if (Array.isArray(params) && params.length > 0) {
        const satu = await (
          sqlite3 as unknown as {
            execWithParams: (db: number, sql: string, params: unknown[]) => Promise<{ columns: string[]; rows: unknown[][] }>
          }
        ).execWithParams(db, sql, params)
        results.push(satu)
      } else {
        await sqlite3.exec(db, sql, (row: unknown[], columns: string[]) => {
          const last = results[results.length - 1]
          if (!last || last.columns !== columns) {
            results.push({ columns, rows: [] })
          }
          results[results.length - 1].rows.push(row)
        })
      }

      const totalRows = results.reduce((sum, r) => sum + r.rows.length, 0)
      if (sqlType === 'SELECT') {
        console.log(`SQL selesai [${sqlType}] → ${totalRows} baris dikembalikan`)
      } else {
        const changes = sqlite3.changes(db)
        console.log(`SQL selesai [${sqlType}] → ${changes} baris terpengaruh`)
      }

      ;(self as unknown as Worker).postMessage({ id, ok: true, results })
    } catch (err) {
      ;(self as unknown as Worker).postMessage({ id, ok: false, error: String(err) })
    }
  }).catch((err) => {
    console.error('Queue error:', err)
  })
}
