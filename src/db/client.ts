// src/db/client.ts — Leader Election (Web Locks) + BroadcastChannel proxy.
// Satu tab = LEADER (pegang Dedicated Worker + OPFS /crate-quiz),
// tab lain = FOLLOWER (forward query via BroadcastChannel).
const LOCK_NAME = 'crate-quiz-opfs-lock';
const CHANNEL_NAME = 'crate-quiz-db-channel';
const TAB_ID = Math.random().toString(36).substring(2, 9);

let worker: Worker | null = null;
let localMsgId = 0;
const pendingLocal = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
let isLeader = false;
// ── Leader election ─────────────────────────────────────────────────────────
// Web Locks memberi kunci secara ASINKRON (terbukti ~200 ms setelah request).
// Query yang terkirim sebelum grant dianggap FOLLOWER dan dipancarkan lewat
// BroadcastChannel — padahal BroadcastChannel TIDAK mengirim pesan ke objek
// pengirimnya sendiri, jadi pada tab tunggal pesan itu hilang percuma dan baru
// gagal 10 detik kemudian ("Query timeout: DB Leader tidak merespons.").
// Karenanya: (1) query menunggu keputusan election dulu, dan (2) query yang
// sempat terlanjur dipancarkan dijalankan ulang saat kunci akhirnya diberikan.
const MAKS_TUNGGU_ELECTION_MS = 3000;
let resolverKunci: (() => void) | null = null;
const kunciDiberikan = new Promise<void>((resolve) => {
  resolverKunci = resolve;
});
let keputusanElection: Promise<void> | null = null;

type PendingRemote = {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  sql: string;
  params?: unknown[];
};
const pendingRemote = new Map<string, PendingRemote>();
const pendingTxInternal = new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
let txInternalId = 0;

type DataChangedListener = (info: { entitas?: string; id?: string; senderTabId: string }) => void;
const dataChangedListeners = new Set<DataChangedListener>();

export function onPerubahanData(listener: DataChangedListener): () => void {
  dataChangedListeners.add(listener);
  return () => {
    dataChangedListeners.delete(listener);
  };
}

export function kirimNotifikasiPerubahan(entitas?: string, id?: string): void {
  if (bc) bc.postMessage({ type: 'DATA_CHANGED', entitas, id, senderTabId: TAB_ID });
}

export function siarkanPerubahanLokal(entitas?: string, id?: string): void {
  for (const listener of dataChangedListeners) {
    try {
      listener({ entitas, id, senderTabId: TAB_ID });
    } catch (err) {
      console.warn('[db] Listener lokal gagal:', err);
    }
  }
}

const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
      const msg = event.data as { id: string | number; ok: boolean; results: unknown; error?: string };
      if (typeof msg.id === 'string' && (msg.id.startsWith('txq_') || /_(begin|commit|rollback)$/.test(msg.id))) {
        const p = pendingTxInternal.get(msg.id);
        if (!p) return;
        pendingTxInternal.delete(msg.id);
        if (msg.ok) p.resolve(msg.results);
        else p.reject(new Error(msg.error ?? 'TX gagal'));
        return;
      }
      if (typeof msg.id === 'number') {
        const p = pendingLocal.get(msg.id);
        if (!p) return;
        pendingLocal.delete(msg.id);
        if (msg.ok) p.resolve(msg.results);
        else p.reject(new Error(msg.error ?? 'Query gagal'));
      }
    };
  }
  return worker;
}

function executeQueryLocally<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const id = localMsgId++;
    pendingLocal.set(id, {
      resolve: (v) => resolve(v as T[]),
      reject: (e) => reject(e instanceof Error ? e : new Error(String(e))),
    });
    getWorker().postMessage({ id, type: 'query', sql, params });
  });
}

// Jalankan ulang query yang sempat terpancar ke broadcast. Tab ini sekarang
// memegang kunci, jadi worker lokal bisa menjawab langsung. (Balasan broadcast
// dari pemimpin lama, bila masih di jalan, diabaikan karena entri sudah dihapus.)
function jalankanUlangRemote(reqId: string, p: PendingRemote): void {
  pendingRemote.delete(reqId);
  executeQueryLocally(p.sql, p.params).then(
    (val) => p.resolve(val),
    (err) => p.reject(err instanceof Error ? err : new Error(String(err))),
  );
}

// Tunggu keputusan election sebelum memilih jalur lokal vs broadcast:
// - Kunci sudah di tangan tab ini            → langsung selesai (mikrotask).
// - Tab lain memegang kunci                  → follower resmi, aman disiarkan.
// - Kunci masih kosong (saat tab baru dibuka)→ grant tab ini biasanya menyusul
//   dalam ~200 ms; tunggu sampai grant atau MAKS_TUNGGU_ELECTION_MS.
function tungguKeputusanElection(): Promise<void> {
  if (isLeader) return Promise.resolve();
  if (!keputusanElection) {
    keputusanElection = (async () => {
      if (typeof navigator === 'undefined' || !navigator.locks || !bc) return;
      try {
        const snap = await navigator.locks.query();
        if ((snap.held ?? []).some((l) => l.name === LOCK_NAME)) {
          // Pemegang bisa tab lain (kita follower) ATAU tab ini sendiri yang
          // kuncinya baru diberikan tetapi callback grant belum berjalan.
          // Beri grace singkat agar tidak salah memilih jalur siar.
          await Promise.race([
            kunciDiberikan,
            new Promise<void>((resolve) => {
              setTimeout(resolve, 100);
            }),
          ]);
          if (!isLeader) console.info('[db] Tab lain memegang kunci DB — tab ini FOLLOWER.');
          return;
        }
      } catch {
        /* navigator.locks.query() tak didukung → tunggu sampai grasi habis */
      }
      await Promise.race([
        kunciDiberikan,
        new Promise<void>((resolve) => {
          setTimeout(resolve, MAKS_TUNGGU_ELECTION_MS);
        }),
      ]);
    })();
  }
  return keputusanElection;
}

function initLeaderElection(): void {
  if (typeof navigator === 'undefined' || !navigator.locks) {
    isLeader = true;
    resolverKunci?.();
    return;
  }
  navigator.locks
    .request(LOCK_NAME, async () => {
      isLeader = true;
      resolverKunci?.();
      console.info('[db] Web Lock diberikan — tab ini menjadi DB Leader.');
      // Pulihkan query yang sempat terpancar saat masa transisi election:
      // pesan broadcast tidak pernah sampai ke pengirimnya sendiri, jadi tidak
      // akan pernah ada balasan kalau tidak dijalankan ulang di sini.
      if (pendingRemote.size > 0) {
        console.warn(`[db] Menjalankan ulang ${pendingRemote.size} query yang sempat terpancar sebelum jadi leader.`);
        for (const [reqId, p] of [...pendingRemote]) jalankanUlangRemote(reqId, p);
      }
      await new Promise<void>(() => undefined);
    })
    .catch((err) => console.error('[db] Web Lock error:', err));
}

if (bc) {
  bc.onmessage = async (event) => {
    const data = event.data as Record<string, unknown>;
    if (!data || typeof data !== 'object') return;
    if (isLeader && data['type'] === 'DB_QUERY_REQUEST') {
      try {
        const results = await executeQueryLocally(data['sql'] as string, data['params'] as unknown[]);
        bc.postMessage({ type: 'DB_QUERY_RESPONSE', reqId: data['reqId'], ok: true, results, senderTabId: data['senderTabId'] });
      } catch (err) {
        bc.postMessage({ type: 'DB_QUERY_RESPONSE', reqId: data['reqId'], ok: false, error: String(err), senderTabId: data['senderTabId'] });
      }
    }
    if (isLeader && data['type'] === 'DB_TX_CONTROL') {
      const reqId = data['reqId'] as string;
      try {
        await new Promise<void>((resolve, reject) => {
          pendingTxInternal.set(reqId, {
            resolve: () => resolve(),
            reject: (e) => reject(e instanceof Error ? e : new Error(String(e))),
          });
          getWorker().postMessage({ id: reqId, type: 'transaction', sql: data['sql'], txGroupId: data['txGroupId'] });
        });
        bc.postMessage({ type: 'DB_TX_CONTROL_RESPONSE', reqId, ok: true, senderTabId: data['senderTabId'] });
      } catch (err) {
        bc.postMessage({ type: 'DB_TX_CONTROL_RESPONSE', reqId, ok: false, error: String(err), senderTabId: data['senderTabId'] });
      }
    }
    if (isLeader && data['type'] === 'DB_TX_QUERY_REQUEST') {
      const reqId = data['reqId'] as string;
      try {
        const results = await new Promise<unknown>((resolve, reject) => {
          const id = `txq_${++txInternalId}`;
          pendingTxInternal.set(id, {
            resolve: (v) => resolve(v),
            reject: (e) => reject(e instanceof Error ? e : new Error(String(e))),
          });
          getWorker().postMessage({ id, type: 'tx_query', txGroupId: data['txGroupId'], sql: data['sql'], params: data['params'] });
        });
        bc.postMessage({ type: 'DB_TX_QUERY_RESPONSE', reqId, ok: true, results, senderTabId: data['senderTabId'] });
      } catch (err) {
        bc.postMessage({ type: 'DB_TX_QUERY_RESPONSE', reqId, ok: false, error: String(err), senderTabId: data['senderTabId'] });
      }
    }
    if (!isLeader && data['type'] === 'DB_QUERY_RESPONSE' && data['senderTabId'] === TAB_ID) {
      const p = pendingRemote.get(data['reqId'] as string);
      if (!p) return;
      pendingRemote.delete(data['reqId'] as string);
      if (data['ok']) p.resolve(data['results']);
      else p.reject(new Error(String(data['error'])));
    }
    if (!isLeader && (data['type'] === 'DB_TX_QUERY_RESPONSE' || data['type'] === 'DB_TX_CONTROL_RESPONSE') && data['senderTabId'] === TAB_ID) {
      const p = pendingTxInternal.get(data['reqId'] as string);
      if (!p) return;
      pendingTxInternal.delete(data['reqId'] as string);
      if (data['ok']) p.resolve(data['results']);
      else p.reject(new Error(String(data['error'] ?? 'TX gagal')));
    }
    if (data['type'] === 'DATA_CHANGED' && data['senderTabId'] !== TAB_ID) {
      dataChangedListeners.forEach((fn) => {
        try {
          fn({ entitas: data['entitas'] as string | undefined, id: data['id'] as string | undefined, senderTabId: data['senderTabId'] as string });
        } catch (e) {
          console.error('[db] listener error:', e);
        }
      });
    }
  };
}

initLeaderElection();

export async function query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
  const kata = sql.trim().split(/\s+/)[0].toUpperCase();
  const isMutasi = ['INSERT', 'UPDATE', 'DELETE'].includes(kata);
  // Tunggu keputusan election dulu — saat tab baru dibuka kunci Web Locks belum
  // di-grant, dan pesan broadcast tidak pernah sampai ke pengirimnya sendiri.
  await tungguKeputusanElection();
  let promise: Promise<T[]>;
  if (isLeader) {
    promise = executeQueryLocally<T>(sql, params);
  } else {
    if (!bc) throw new Error('BroadcastChannel tidak didukung.');
    const ch = bc;
    promise = new Promise<T[]>((resolve, reject) => {
      const reqId = `${TAB_ID}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const timer = setTimeout(() => {
        if (pendingRemote.has(reqId)) {
          pendingRemote.delete(reqId);
          reject(new Error('Query timeout: DB Leader tidak merespons.'));
        }
      }, 10000);
      pendingRemote.set(reqId, {
        sql,
        params,
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val as T[]);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err instanceof Error ? err : new Error(String(err)));
        },
      });
      ch.postMessage({ type: 'DB_QUERY_REQUEST', reqId, sql, params, senderTabId: TAB_ID });
    });
  }
  if (isMutasi) {
    void promise.then(() => kirimNotifikasiPerubahan()).catch(() => undefined);
  }
  return promise;
}

export type TxQueryFn = <T = unknown>(sql: string, params?: unknown[]) => Promise<T[]>;

let txAntre: Promise<unknown> = Promise.resolve();

async function kirimTxLeader(cmd: string, txGroupId: string, sql?: string, params?: unknown[]): Promise<unknown> {
  if (!bc && !isLeader) return Promise.reject(new Error('BroadcastChannel tidak didukung.'));
  // Sama seperti query(): jangan siarkan sebelum election pasti, karena pesan
  // broadcast tidak pernah sampai ke pengirimnya sendiri.
  await tungguKeputusanElection();
  return new Promise<unknown>((resolve, reject) => {
    // Id `txq_...` (bukan `${TAB_ID}_txq_...`) agar rute di worker.onmessage
    // cocok saat kita ternyata leader dan kirim langsung ke worker.
    const id = cmd === 'QUERY' ? `txq_${++txInternalId}` : `${txGroupId}_${cmd.toLowerCase()}`;
    const timer = setTimeout(() => {
      if (pendingTxInternal.has(id)) {
        pendingTxInternal.delete(id);
        reject(new Error('TX timeout.'));
      }
    }, 10000);
    pendingTxInternal.set(id, {
      resolve: (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    });
    if (isLeader) {
      // Election berubah menjadi leader di tengah jalan → kirim langsung ke worker.
      getWorker().postMessage(
        cmd === 'QUERY'
          ? { id, type: 'tx_query', txGroupId, sql, params }
          : { id, type: 'transaction', sql: cmd, txGroupId },
      );
    } else if (cmd === 'QUERY') {
      bc!.postMessage({ type: 'DB_TX_QUERY_REQUEST', reqId: id, txGroupId, sql, params, senderTabId: TAB_ID });
    } else {
      bc!.postMessage({ type: 'DB_TX_CONTROL', reqId: id, sql: cmd, senderTabId: TAB_ID, txGroupId });
    }
  });
}

function txQueryLokal(txGroupId: string): TxQueryFn {
  return <U>(sql: string, params?: unknown[]): Promise<U[]> =>
    new Promise<U[]>((resolve, reject) => {
      const id = `txq_${++txInternalId}`;
      pendingTxInternal.set(id, {
        resolve: (v) => resolve(v as U[]),
        reject: (e) => reject(e instanceof Error ? e : new Error(String(e))),
      });
      getWorker().postMessage({ id, type: 'tx_query', txGroupId, sql, params });
    });
}

function kontrolLokal(cmd: string, txGroupId: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const id = `${txGroupId}_${cmd.toLowerCase()}`;
    pendingTxInternal.set(id, {
      resolve: () => resolve(),
      reject: (e) => reject(e instanceof Error ? e : new Error(String(e))),
    });
    getWorker().postMessage({ id, type: 'transaction', sql: cmd, txGroupId });
  });
}

function withTransactionInti<T>(fn: (txQuery: TxQueryFn) => Promise<T>): Promise<T> {
  const txGroupId = `${TAB_ID}_txgrp_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const txQuery: TxQueryFn = isLeader
    ? txQueryLokal(txGroupId)
    : (<U>(sql: string, params?: unknown[]): Promise<U[]> => kirimTxLeader('QUERY', txGroupId, sql, params) as Promise<U[]>);
  const kontrol = (cmd: string): Promise<unknown> =>
    isLeader ? kontrolLokal(cmd, txGroupId) : kirimTxLeader(cmd, txGroupId);
  return (async () => {
    await kontrol('BEGIN');
    try {
      const hasil = await fn(txQuery);
      await kontrol('COMMIT');
      kirimNotifikasiPerubahan();
      return hasil;
    } catch (err) {
      try {
        await kontrol('ROLLBACK');
      } catch {
        /* abaikan */
      }
      throw err;
    } finally {
      for (const k of [...pendingTxInternal.keys()]) {
        if (k.startsWith(txGroupId)) pendingTxInternal.delete(k);
      }
    }
  })();
}

export function withTransaction<T>(fn: (txQuery: TxQueryFn) => Promise<T>): Promise<T> {
  const hasil = txAntre.then(() => withTransactionInti(fn));
  txAntre = hasil.catch(() => undefined);
  return hasil;
}

export async function barisHasil<T>(sql: string, params?: unknown[]): Promise<T[]> {
  const res = await query<{ columns: string[]; rows: unknown[][] }>(sql, params);
  if (res.length === 0) return [];
  const { columns, rows } = res[0];
  return rows.map((row) => Object.fromEntries(columns.map((col, i) => [col, row[i]])) as T);
}

if (typeof window !== 'undefined') {
  (window as unknown as { __dbDebug?: () => Promise<void> }).__dbDebug = async () => {
    const meta = await query<{ columns: string[]; rows: unknown[][] }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    );
    const names: string[] = (meta[0]?.rows ?? []).map((r) => r[0] as string);
    console.groupCollapsed(`[crate-quiz db] ${names.length} tabel (${isLeader ? 'LEADER' : 'FOLLOWER'})`);
    for (const name of names) {
      const res = await barisHasil<Record<string, unknown>>(`SELECT * FROM \`${name}\``);
      console.groupCollapsed(`"${name}" -> ${res.length} baris`);
      console.table(res);
      console.groupEnd();
    }
    console.groupEnd();
  };
}

