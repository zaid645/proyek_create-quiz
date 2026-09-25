// src/db/worker.ts
// Worker SQLite (wa-sqlite WASM + OPFS) — disederhanakan untuk crate-quiz.
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
import * as SQLite from 'wa-sqlite';
import { AccessHandlePoolVFS } from 'wa-sqlite/src/examples/AccessHandlePoolVFS.js';
import initSchemaSql from './migrations/001_init_schema.sql?raw';

type SQLiteAPI = ReturnType<typeof SQLite.Factory>;
type SesiDB = { sqlite3: SQLiteAPI; db: number; vfs: AccessHandlePoolVFS };
type BarisHasil = { columns: string[]; rows: unknown[][] };

let dbReady: Promise<SesiDB> | null = null;
let sesiAktif: SesiDB | null = null;
let errInisialisasi: Error | null = null;
let inTx = false;
let txGroupId: string | null = null;

function buatPesanErrorInisialisasi(err: unknown): Error {
  const pesan = err instanceof Error ? err.message : String(err);
  if (/NoModificationAllowed|modification access|locked|in use/i.test(pesan)) {
    return new Error(
      'Database terkunci tab lain. Tutup SEMUA tab, tunggu, lalu muat ulang satu tab.',
    );
  }
  return err instanceof Error ? err : new Error(pesan);
}

// Migrasi ringan untuk DB lama: tambah kolom yang belum ada tanpa hapus data.
// (CREATE TABLE IF NOT EXISTS tidak menyentuh tabel yang sudah terlanjur dibuat.)
async function pastikanKolom(
  sqlite3: SQLiteAPI,
  db: number,
  tabel: string,
  definisi: Record<string, string>,
): Promise<void> {
  const kolomAda = new Set<string>();
  let bacaKolom = false;
  await sqlite3.exec(db, `PRAGMA table_info(${tabel});`, (row: unknown[]) => {
    const nama = row[1];
    if (typeof nama === 'string') {
      kolomAda.add(nama);
      bacaKolom = true;
    }
  });
  if (!bacaKolom && kolomAda.size === 0) {
    // Tabel belum ada atau PRAGMA tak mengembalikan apa pun; biarkan skema utama menanganinya.
    return;
  }
  for (const [nama, tipe] of Object.entries(definisi)) {
    if (kolomAda.has(nama)) continue;
    await sqlite3.exec(db, `ALTER TABLE ${tabel} ADD COLUMN ${nama} ${tipe};`);
  }
}

async function initDbSekali(): Promise<SesiDB> {
  const module = await SQLiteESMFactory();
  const sqlite3 = SQLite.Factory(module);
  const vfs = new AccessHandlePoolVFS('/crate-quiz');
  let db: number | null = null;
  try {
    await vfs.isReady;
    sqlite3.vfs_register(vfs as unknown as Parameters<SQLiteAPI['vfs_register']>[0], true);
    db = await sqlite3.open_v2('crate-quiz.db');
    await sqlite3.exec(db, 'PRAGMA journal_mode=WAL;');
    await sqlite3.exec(db, initSchemaSql);
    await pastikanKolom(sqlite3, db, 'proyek', {
      target_pg: 'integer NOT NULL DEFAULT 0',
      target_uraian: 'integer NOT NULL DEFAULT 0',
      target_penalaran: 'integer NOT NULL DEFAULT 0',
      target_proyek: 'integer NOT NULL DEFAULT 0',
    });
    const sesi: SesiDB = { sqlite3, db, vfs };
    sesiAktif = sesi;
    return sesi;
  } catch (err) {
    if (db !== null) {
      try {
        await sqlite3.close(db);
      } catch {
        /* abaikan */
      }
    }
    throw buatPesanErrorInisialisasi(err);
  }
}

function getDb(): Promise<SesiDB> {
  if (dbReady) return dbReady;
  if (errInisialisasi) return Promise.reject(errInisialisasi);
  dbReady = initDbSekali().catch((err) => {
    const e = err instanceof Error ? err : new Error(String(err));
    dbReady = null;
    errInisialisasi = e;
    throw e;
  });
  return dbReady;
}

async function jalankanSql(
  sqlite3: SQLiteAPI,
  db: number,
  sql: string,
  params?: unknown[],
): Promise<BarisHasil[]> {
  const results: BarisHasil[] = [];
  if (Array.isArray(params) && params.length > 0) {
    const satu = await (
      sqlite3 as unknown as {
        execWithParams: (d: number, s: string, p: unknown[]) => Promise<BarisHasil>;
      }
    ).execWithParams(db, sql, params);
    results.push(satu);
  } else {
    await sqlite3.exec(db, sql, (row: unknown[], columns: string[]) => {
      const last = results[results.length - 1];
      if (!last || last.columns !== columns) results.push({ columns, rows: [] });
      results[results.length - 1].rows.push(row);
    });
  }
  return results;
}

let queryQueue = Promise.resolve();


self.onmessage = (msg: MessageEvent) => {
  const data = msg.data as { id: string | number; sql?: string; type?: string; params?: unknown[]; txGroupId?: string };
  const { id, sql, type, params } = data;

  if (type === 'reset') {
    queryQueue = queryQueue.then(async () => {
      try {
        if (sesiAktif) {
          try {
            await sesiAktif.sqlite3.close(sesiAktif.db);
          } catch {
            /* abaikan */
          }
          sesiAktif = null;
        }
        dbReady = null;
        errInisialisasi = null;
        inTx = false;
        txGroupId = null;
        (self as unknown as Worker).postMessage({ id, ok: true, results: [] });
      } catch (err) {
        (self as unknown as Worker).postMessage({ id, ok: false, error: String(err) });
      }
    });
    return;
  }

  if (type === 'transaction') {
    const msgTxGroupId = data.txGroupId ?? null;
    queryQueue = queryQueue.then(async () => {
      try {
        const { sqlite3, db } = await getDb();
        const cmd = (sql ?? '').trim().split(/\s+/)[0].toUpperCase();
        if (cmd === 'BEGIN') {
          if (inTx) throw new Error('TX_ACTIVE.');
          if (!msgTxGroupId) throw new Error('BEGIN tanpa txGroupId.');
          await sqlite3.exec(db, 'BEGIN');
          inTx = true;
          txGroupId = msgTxGroupId;
        } else if (cmd === 'COMMIT') {
          if (!inTx) throw new Error('Tidak ada transaksi aktif.');
          if (msgTxGroupId && msgTxGroupId !== txGroupId) throw new Error('txGroupId COMMIT tidak cocok.');
          await sqlite3.exec(db, 'COMMIT');
          inTx = false;
          txGroupId = null;
        } else if (cmd === 'ROLLBACK') {
          if (!inTx) throw new Error('Tidak ada transaksi aktif.');
          if (msgTxGroupId && msgTxGroupId !== txGroupId) throw new Error('txGroupId ROLLBACK tidak cocok.');
          await sqlite3.exec(db, 'ROLLBACK');
          inTx = false;
          txGroupId = null;
        } else {
          throw new Error(`Perintah transaksi tidak dikenal: ${cmd}`);
        }
        (self as unknown as Worker).postMessage({ id, ok: true, results: [] });
      } catch (err) {
        (self as unknown as Worker).postMessage({ id, ok: false, error: String(err) });
      }
    }).catch((err) => console.error('[worker] Queue TX error:', err));
    return;
  }

  if (type === 'tx_query') {
    const expectedGroup = data.txGroupId ?? null;
    queryQueue = queryQueue.then(async () => {
      try {
        if (!inTx) throw new Error('Tidak ada transaksi aktif.');
        if (expectedGroup !== txGroupId) throw new Error('txGroupId tidak cocok.');
        const { sqlite3, db } = await getDb();
        const results = await jalankanSql(sqlite3, db, sql ?? '', params);
        (self as unknown as Worker).postMessage({ id, ok: true, results });
      } catch (err) {
        (self as unknown as Worker).postMessage({ id, ok: false, error: String(err) });
      }
    }).catch((err) => console.error('[worker] Queue TX query error:', err));
    return;
  }

  if (inTx) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: 'TX_ACTIVE.' });
    return;
  }

  queryQueue = queryQueue.then(async () => {
    try {
      const { sqlite3, db } = await getDb();
      const results = await jalankanSql(sqlite3, db, sql ?? '', params);
      (self as unknown as Worker).postMessage({ id, ok: true, results });
    } catch (err) {
      (self as unknown as Worker).postMessage({ id, ok: false, error: String(err) });
    }
  }).catch((err) => console.error('[worker] Queue error:', err));
};
