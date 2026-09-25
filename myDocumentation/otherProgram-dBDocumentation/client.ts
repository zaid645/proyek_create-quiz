// src/db/client.ts
// Dipakai oleh repository.ts tiap modul untuk bicara ke worker database.
//
// ARSITEKTUR MULTI-TAB: LEADER ELECTION + BROADCASTCHANNEL PROXYING
// 1. Satu tab dipilih sebagai LEADER menggunakan Web Locks API (navigator.locks).
// 2. Tab LEADER adalah satu-satunya tab yang membuka Dedicated Worker ('worker.ts')
//    dan memegang FileSystemSyncAccessHandle OPFS /novel-outliner.
// 3. Tab FOLLOWER yang dibuka di window/tab lain akan meneruskan semua query SQL
//    ke tab LEADER melalui BroadcastChannel ('novel-outliner-db-channel').
// 4. Jika tab LEADER ditutup, browser secara otomatis melepas Web Lock, dan salah satu
//    tab FOLLOWER secara otomatis diangkat menjadi LEADER baru (Seamless Failover).
// 5. Setiap kali ada mutasi data (INSERT/UPDATE/DELETE), sinyal DATA_CHANGED dikirim
//    via BroadcastChannel agar tab lain dapat melakukan soft-update / menampilkan notifikasi.

const LOCK_NAME = 'novel-outliner-opfs-lock'
const CHANNEL_NAME = 'novel-outliner-db-channel'
const TAB_ID = Math.random().toString(36).substring(2, 9)

let worker: Worker | null = null
let localMsgId = 0
const pendingLocal = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>()

let isLeader = false
const pendingRemote = new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>()

type DataChangedListener = (info: { entitas?: string; id?: string; senderTabId: string }) => void
const dataChangedListeners = new Set<DataChangedListener>()

export function onPerubahanData(listener: DataChangedListener): () => void {
  dataChangedListeners.add(listener)
  return () => {
    dataChangedListeners.delete(listener)
  }
}

export function kirimNotifikasiPerubahan(entitas?: string, id?: string) {
  if (bc) {
    console.log(`[db] DATA_CHANGED disiarkan (entitas: ${entitas ?? '-'}, id: ${id ?? '-'})`)
    bc.postMessage({ type: 'DATA_CHANGED', entitas, id, senderTabId: TAB_ID })
  }
}

// Sinyal perubahan HANYA untuk tab ini (tanpa broadcast — BroadcastChannel
// memang tidak mengirim ke tab pengirim). Dipakai lapisan aplikasi setelah
// mutasi yang dilakukan di tab yang sama agar UI lokal ikut menyegarkan —
// mis. fungsi Chat AI mengubah data semesta saat chat berjalan.
export function siarkanPerubahanLokal(entitas?: string, id?: string): void {
  console.log(`[db] DATA_CHANGED lokal (entitas: ${entitas ?? '-'}, id: ${id ?? '-'})`)
  for (const listener of dataChangedListeners) {
    try {
      listener({ entitas, id, senderTabId: TAB_ID })
    } catch (err) {
      console.warn('[db] Listener DATA_CHANGED lokal gagal:', err)
    }
  }
}

// Setup BroadcastChannel
const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event) => {
      const { id, ok, results, error } = event.data
      // 1) Pesan TX internal (BEGIN/COMMIT/ROLLBACK + tx_query) — dihandle duluan
      if (typeof id === 'string' && id.startsWith('txq_')) {
        const p = pendingTxInternal.get(id)
        if (!p) return
        pendingTxInternal.delete(id)
        if (ok) p.resolve(results)
        else p.reject(new Error(error ?? 'TX query gagal'))
        return
      }
      // 2) Pesan TX group control (BEGIN/COMMIT/ROLLBACK lewat withTransaction)
      if (typeof id === 'string' && /_(begin|commit|rollback)$/.test(id)) {
        const p = pendingTxInternal.get(id)
        if (!p) return
        pendingTxInternal.delete(id)
        if (ok) p.resolve(results)
        else p.reject(new Error(error ?? 'TX control gagal'))
        return
      }
      // 3) Pesan query biasa
      const p = pendingLocal.get(id)
      if (!p) return
      pendingLocal.delete(id)
      if (ok) p.resolve(results)
      else p.reject(new Error(error))
    }
  }
  return worker
}

// Eksekusi query secara lokal di Dedicated Worker (hanya untuk Tab Leader)
const MAKS_WAKTU_QUERY_LEADER_MS = 30_000 // 30 detik timeout untuk Leader

function executeQueryLocally<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const id = localMsgId++
    let timer: ReturnType<typeof setTimeout> | null = null

    pendingLocal.set(id, {
      resolve: (v) => {
        if (timer) clearTimeout(timer)
        resolve(v as T[])
      },
      reject: (e) => {
        if (timer) clearTimeout(timer)
        reject(e instanceof Error ? e : new Error(String(e)))
      },
    })

    // Timeout jaring pengaman jika OPFS Worker stall
    timer = setTimeout(() => {
      if (pendingLocal.has(id)) {
        pendingLocal.delete(id)
        reject(new Error(`Query timeout: OPFS Worker tidak merespons dalam ${MAKS_WAKTU_QUERY_LEADER_MS}ms. SQL: ${sql.slice(0, 80)}`))
      }
    }, MAKS_WAKTU_QUERY_LEADER_MS)

    getWorker().postMessage({ id, type: 'query', sql, params })
  })
}

// Eksekusi perintah kontrol transaksi (BEGIN/COMMIT/ROLLBACK) di worker lokal
function executeTxControlLocally(sql: string, txGroupId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // id HARUS diakhiri dengan _begin/_commit/_rollback agar listener
    // routing di getWorker().onmessage (line 76 regex) bisa menemukan entry
    // di pendingTxInternal. Sebelumnya id pakai pola
    // `${TAB_ID}_txctrl_${ts}_${counter}` yang TIDAK match regex → response
    // dari worker tidak pernah di-resolve → leak di pendingTxInternal.
    const suffix = sql.trim().split(/\s+/)[0].toLowerCase() // 'begin'|'commit'|'rollback'
    const id = `${txGroupId}_${suffix}`
    pendingTxInternal.set(id, {
      resolve: () => resolve(),
      reject: (e) => reject(e instanceof Error ? e : new Error(String(e))),
    })
    // txGroupId dikirim di data pesan (bukan diturunkan dari `id`) — worker
    // membacanya dari `msg.data.txGroupId` agar sama persis dengan
    // txGroupId yang dipakai tx_query di transaksi yang sama.
    getWorker().postMessage({ id, type: 'transaction', sql, txGroupId })
  })
}

// Eksekusi query di dalam transaksi (worker LEADER). txGroupId memastikan
// query hanya diproses jika worker sedang dalam mode transaksi untuk group tsb.
function executeTxQueryLocally<T = unknown>(
  sql: string,
  txGroupId: string,
  params?: unknown[],
): Promise<T[]> {
  return new Promise<T[]>((resolve, reject) => {
    const id = `txq_${++txInternalId}`
    pendingTxInternal.set(id, {
      resolve: (v) => resolve(v as T[]),
      reject: (e) => reject(e instanceof Error ? e : new Error(String(e))),
    })
    getWorker().postMessage({ id, type: 'tx_query', txGroupId, sql, params })
  })
}

// Inisialisasi Leader Election via Web Locks API
function initLeaderElection() {
  if (typeof navigator === 'undefined' || !navigator.locks) {
    // Fallback jika browser tidak mendukung Web Locks API -> anggap sebagai Leader
    isLeader = true
    return
  }

  navigator.locks.request(LOCK_NAME, async () => {
    // Tab ini memegang lock -> Resmi menjadi LEADER!
    console.info(`[db:${TAB_ID}] Tab ini resmi menjadi DB LEADER (Primary). Membuka OPFS Worker...`)
    isLeader = true

    // Tahan lock selama browsing context / tab aktif
    await new Promise<void>(() => {
      // Menggantung selama tab hidup
    })
  }).catch((err) => {
    console.error('[db] Error saat registrasi Web Lock Leader:', err)
  })
}

// Jalankan leader election saat file dimuat
initLeaderElection()

// ── Factory Reset helpers (OPFS wipe) ──────────────────────────────────────
// Dipakai tab Penyimpanan Data untuk "Hapus Semua Data" = seakan buka pertama kali.
// Leader menghapus folder OPFS /novel-outliner lalu reload; follower didelegasikan.
async function lakukanFactoryResetOPFS(): Promise<void> {
  console.info(`[db:${TAB_ID}] Factory Reset: mematikan worker & menghapus OPFS /novel-outliner…`)
  if (worker) {
    try { worker.terminate() } catch { /* abaikan */ }
    worker = null
  }
  try {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry('novel-outliner', { recursive: true })
    console.info('[db] Folder OPFS /novel-outliner berhasil dihapus (factory reset).')
  } catch (err) {
    // Folder belum ada = sudah bersih; selain itu lempar agar fallback SQL bisa dipakai.
    const msg = String(err)
    if (/NoModificationAllowed|not found|NotFound/i.test(msg)) {
      console.warn('[db] Factory Reset OPFS dilewati (tidak ada folder):', err)
    } else {
      throw err
    }
  }
  if (bc) {
    try { bc.postMessage({ type: 'FACTORY_RESET', senderTabId: TAB_ID }) } catch { /* abaikan */ }
  }
  // Reload semua tab (leader dulu) agar migrasi 001..007 re-seed dari nol.
  window.location.reload()
}

/**
 * Hapus semua data — factory reset total seakan baru pertama kali membuka website.
 * - Jika tab ini leader: langsung wipe OPFS + reload (semua follower ikut reload via broadcast).
 * - Jika follower: kirim permintaan ke leader; leader yang wipe. Jika leader tidak
 *   merespons dalam 4 detik, follower mencoba wipe sendiri (fallback) lalu reload.
 * - Jika wipe OPFS gagal, lempar error agar pemanggil bisa fallback ke SQL wipe
 *   (DELETE per tabel).
 */
export async function hapusSemuaDataFactoryReset(): Promise<void> {
  if (!bc) {
    // Tanpa BroadcastChannel = single-tab — langsung wipe.
    await lakukanFactoryResetOPFS()
    return
  }
  if (isLeader) {
    await lakukanFactoryResetOPFS()
    return
  }
  // Follower: minta leader melakukan wipe — reload ditangani handler global FACTORY_RESET
  const reqId = `${TAB_ID}_${Date.now()}`
  console.info(`[db:${TAB_ID}] FOLLOWER meminta factory reset ke LEADER (req ${reqId})`)
  return new Promise<void>((resolve, reject) => {
    let selesai = false
    const onMsg = (event: MessageEvent) => {
      const d = event.data
      if (!d || typeof d !== 'object') return
      if (d.type === 'FACTORY_RESET' && !selesai) {
        selesai = true
        bc!.removeEventListener('message', onMsg)
        clearTimeout(timer)
        console.info(`[db:${TAB_ID}] Menerima FACTORY_RESET broadcast (via penunggu) — biarkan handler global reload…`)
        resolve()
      }
      if (d.type === 'FACTORY_RESET_ERROR' && d.senderTabId === TAB_ID && !selesai) {
        selesai = true
        bc!.removeEventListener('message', onMsg)
        clearTimeout(timer)
        reject(new Error(String(d.error ?? 'Factory reset gagal di leader')))
      }
    }
    bc.addEventListener('message', onMsg)
    const timer = setTimeout(async () => {
      if (selesai) return
      bc.removeEventListener('message', onMsg)
      console.warn(`[db:${TAB_ID}] Leader tidak merespons factory reset — follower coba wipe sendiri (fallback).`)
      try {
        await lakukanFactoryResetOPFS()
        selesai = true
        resolve()
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }, 4000)
    bc.postMessage({ type: 'FACTORY_RESET_REQUEST', reqId, senderTabId: TAB_ID })
  })
}

// Penanganan pesan BroadcastChannel (komunikasi antar-tab)
if (bc) {
  bc.onmessage = async (event) => {
    const data = event.data
    if (!data || typeof data !== 'object') return

    // ── FACTORY RESET: follower minta leader wipe OPFS ───────────────────
    if (isLeader && data.type === 'FACTORY_RESET_REQUEST') {
      console.info(`[db:${TAB_ID}] LEADER menerima FACTORY_RESET_REQUEST dari ${data.senderTabId} → wipe OPFS…`)
      try {
        await lakukanFactoryResetOPFS()
      } catch (err) {
        console.error('[db] Factory Reset via request GAGAL:', err)
        bc.postMessage({ type: 'FACTORY_RESET_ERROR', error: String(err), senderTabId: data.senderTabId })
      }
      return
    }
    // Semua tab (termasuk follower) menerima FACTORY_RESET → reload agar sinkron
    if (data.type === 'FACTORY_RESET' && data.senderTabId !== TAB_ID) {
      console.info(`[db:${TAB_ID}] Menerima FACTORY_RESET dari ${data.senderTabId} → reload…`)
      window.location.reload()
      return
    }

    // TAB LEADER MEMPROSES REQUEST QUERY DARI FOLLOWER
    if (isLeader && data.type === 'DB_QUERY_REQUEST') {
      const { reqId, sql, params, senderTabId } = data
      try {
        const results = await executeQueryLocally(sql, params)
        bc.postMessage({
          type: 'DB_QUERY_RESPONSE',
          reqId,
          ok: true,
          results,
          senderTabId,
        })
      } catch (err) {
        bc.postMessage({
          type: 'DB_QUERY_RESPONSE',
          reqId,
          ok: false,
          error: String(err),
          senderTabId,
        })
      }
    }

    // TAB LEADER MEMPROSES TX INTERNAL DARI FOLLOWER
    // 1) Perintah kontrol (BEGIN/COMMIT/ROLLBACK) dari withTransaction
    if (isLeader && data.type === 'DB_TX_CONTROL') {
      const { reqId, sql, senderTabId, txGroupId: txGrpId } = data
      try {
        // txGrpId dari follower mungkin undefined (untuk COMMIT/ROLLBACK
        // pada jalur legacy); executeTxControlLocally akan mengirim apa
        // adanya — worker abaikan jika null.
        await executeTxControlLocally(sql, txGrpId ?? '')
        bc.postMessage({ type: 'DB_TX_CONTROL_RESPONSE', reqId, ok: true, senderTabId })
      } catch (err) {
        bc.postMessage({
          type: 'DB_TX_CONTROL_RESPONSE',
          reqId,
          ok: false,
          error: String(err),
          senderTabId,
        })
      }
    }
    // 2) Query di dalam transaksi
    if (isLeader && data.type === 'DB_TX_QUERY_REQUEST') {
      const { reqId, sql, params, txGroupId, senderTabId } = data
      try {
        const results = await executeTxQueryLocally(sql, txGroupId, params)
        bc.postMessage({
          type: 'DB_TX_QUERY_RESPONSE',
          reqId,
          ok: true,
          results,
          senderTabId,
        })
      } catch (err) {
        bc.postMessage({
          type: 'DB_TX_QUERY_RESPONSE',
          reqId,
          ok: false,
          error: String(err),
          senderTabId,
        })
      }
    }

    // TAB FOLLOWER MEMPROSES BALASAN QUERY DARI LEADER
    if (!isLeader && data.type === 'DB_QUERY_RESPONSE' && data.senderTabId === TAB_ID) {
      const { reqId, ok, results, error } = data
      const p = pendingRemote.get(reqId)
      if (!p) return
      pendingRemote.delete(reqId)
      if (ok) p.resolve(results)
      else p.reject(new Error(error))
    }

    // TAB FOLLOWER MEMPROSES BALASAN TX DARI LEADER
    if (!isLeader && data.type === 'DB_TX_QUERY_RESPONSE' && data.senderTabId === TAB_ID) {
      const { reqId, ok, results, error } = data
      const p = pendingTxInternal.get(reqId)
      if (!p) return
      pendingTxInternal.delete(reqId)
      if (ok) p.resolve(results)
      else p.reject(new Error(error ?? 'TX query gagal'))
    }
    if (!isLeader && data.type === 'DB_TX_CONTROL_RESPONSE' && data.senderTabId === TAB_ID) {
      const { reqId, ok, error } = data
      const p = pendingTxInternal.get(reqId)
      if (!p) return
      pendingTxInternal.delete(reqId)
      if (ok) p.resolve(undefined)
      else p.reject(new Error(error ?? 'TX control gagal'))
    }

    // TAB MEMPROSES NOTIFIKASI PERUBAHAN DATA DARI TAB LAIN
    if (data.type === 'DATA_CHANGED' && data.senderTabId !== TAB_ID) {
      dataChangedListeners.forEach((fn) => {
        try {
          fn({ entitas: data.entitas, id: data.id, senderTabId: data.senderTabId })
        } catch (e) {
          console.error('[db] Error pada listener dataChanged:', e)
        }
      })
    }
  }
}

// Fungsi utama query yang dipanggil dari repository.ts tiap modul
export async function query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
  const sqlType = sql.trim().split(/\s+/)[0].toUpperCase()
  const isMutation = ['INSERT', 'UPDATE', 'DELETE'].includes(sqlType)

  let promise: Promise<T[]>

  // Jika tab ini adalah LEADER, jalankan query langsung ke Worker lokal
  if (isLeader) {
    console.debug(`[db:${TAB_ID}] LEADER menjalankan query.\nSQL: ${sql.slice(0, 200)}`)
    promise = executeQueryLocally<T>(sql, params)
  } else {
    // Jika tab ini adalah FOLLOWER, kirim query ke LEADER via BroadcastChannel
    if (!bc) {
      throw new Error('BroadcastChannel tidak didukung di browser ini.')
    }
    console.debug(`[db:${TAB_ID}] FOLLOWER meneruskan query ke LEADER.\nSQL: ${sql.slice(0, 200)}`)

    promise = new Promise((resolve, reject) => {
      const reqId = `${TAB_ID}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`

      // Timeout jaring pengaman jika Leader lambat atau crash saat failover
      const timer = setTimeout(() => {
        if (pendingRemote.has(reqId)) {
          pendingRemote.delete(reqId)
          if (isLeader) {
            executeQueryLocally<T>(sql, params).then(resolve).catch(reject)
          } else {
            reject(new Error('Query timeout: DB Leader tidak merespons.'))
          }
        }
      }, 10000)

      pendingRemote.set(reqId, {
        resolve: (val) => {
          clearTimeout(timer)
          resolve(val as T[])
        },
        reject: (err) => {
          clearTimeout(timer)
          reject(err instanceof Error ? err : new Error(String(err)))
        },
      })

      bc.postMessage({
        type: 'DB_QUERY_REQUEST',
        reqId,
        sql,
        params,
        senderTabId: TAB_ID,
      })
    })
  }

  // Kirim sinyal perubahan jika query mengubah data
  if (isMutation) {
    promise.then(() => kirimNotifikasiPerubahan()).catch(() => undefined)
  }

  return promise
}

// ── TRANSAKSI (BEGIN/COMMIT/ROLLBACK atomik) ─────────────────────────────────
//
// withTransaction(fn): jalankan fn(txQuery) di dalam satu transaksi SQLite.
// txQuery mengirim pesan 'tx_query' ke worker; worker mengelola state
// `inTransaction` lokal — saat true, query biasa langsung dikembalikan
// {ok:false, error:'TX_ACTIVE'} sehingga tidak bisa tumpang tindih.
//
// CATATAN: dari tab FOLLOWER, transaksi HARUS dieksekusi di LEADER.
// Cara sederhana: setiap txQuery di-forward via BroadcastChannel, sama
// dengan query biasa. Worker LEADER yang memegang `inTransaction`.
//
// Risiko: tab FOLLOWER yang mengirim query biasa saat LEADER transaksi
// akan gagal dengan TX_ACTIVE. Mitigasi awal: hanya gunakan transaksi
// dari aksi single-user (ganti nomor BAB, hapus cascade); panggilan
// repository `withTransaction` didokumentasikan tidak overlap dengan
// event handler lain.
//
// Pola fn(txQuery): kembalikan Promise<T>. Bila throw → ROLLBACK otomatis.
type TxQueryFn = <T = unknown>(sql: string, params?: unknown[]) => Promise<T[]>

let txId = 0

// Karena worker.onmessage hanya satu slot, kita ubah strategi: setiap txQuery
// dari dalam fn(txQuery) mengirim pesan `tx_query` ke worker, yang mengirim
// kembali `tx_query_result` dengan id unik internal. Hasil tersebut diambil
// oleh listener terpisah yang dipasang saat transaksi dimulai.
const pendingTxInternal = new Map<
  string,
  { resolve: (v: unknown) => void; reject: (e: unknown) => void }
>()
let txInternalId = 0

async function withTransactionInti<T>(
  fn: (txQuery: TxQueryFn) => Promise<T>,
): Promise<T> {
  // NOTE: Listener TX_QUERY_RESULT dipasang lewat alur onmessage worker
  // (lihat search 'tx_query_result' di worker.ts). Pemanggilan attachTxHandler
  // tidak lagi diperlukan — handler sudah terpasang saat getWorker() pertama.
  const txGroupId = `${TAB_ID}_txgrp_${Date.now()}_${++txId}`
  const txQuery: TxQueryFn = <U>(sql: string, params?: unknown[]): Promise<U[]> => {
    if (isLeader) {
      return new Promise<U[]>((resolve, reject) => {
        const id = `txq_${++txInternalId}`
        pendingTxInternal.set(id, {
          resolve: (v) => resolve(v as U[]),
          reject: (e) => reject(e instanceof Error ? e : new Error(String(e))),
        })
        getWorker().postMessage({ id, type: 'tx_query', txGroupId, sql, params })
      })
    } else {
      // FOLLOWER → broadcast ke LEADER. Untuk tahap 1 implementasi,
      // kita pakai pendekatan sederhana: query biasa via BroadcastChannel,
      // diasumsikan LEADER sementara tidak ada query lain yang masuk.
      // Worker LEADER akan mengelola status TX_ACTIVE.
      return new Promise<U[]>((resolve, reject) => {
        const id = `${TAB_ID}_txq_${++txInternalId}`
        const timer = setTimeout(() => {
          if (pendingTxInternal.has(id)) {
            pendingTxInternal.delete(id)
            reject(new Error('TX timeout: Leader tidak merespons.'))
          }
        }, 10000)
        pendingTxInternal.set(id, {
          resolve: (v) => {
            clearTimeout(timer)
            resolve(v as U[])
          },
          reject: (e) => {
            clearTimeout(timer)
            reject(e instanceof Error ? e : new Error(String(e)))
          },
        })
        if (!bc) {
          pendingTxInternal.delete(id)
          reject(new Error('BroadcastChannel tidak didukung.'))
          return
        }
        bc.postMessage({
          type: 'DB_TX_QUERY_REQUEST',
          reqId: id,
          txGroupId,
          sql,
          params,
          senderTabId: TAB_ID,
        })
      })
    }
  }

  try {
    if (isLeader) {
      // Mulai transaksi di worker. txGroupId disertakan di data pesan agar
      // worker dapat memvalidasinya pada COMMIT/ROLLBACK/tx_query berikutnya
      // — lihat perbaikan di worker.ts. Pola id `${txGroupId}_begin` tetap
      // dipakai supaya listener routing `_(begin|commit|rollback)$` di
      // onmessage worker masih mengenali pesan kontrol TX.
      await new Promise<void>((resolve, reject) => {
        pendingTxInternal.set(`${txGroupId}_begin`, {
          resolve: () => resolve(),
          reject: (e) => reject(e instanceof Error ? e : new Error(String(e))),
        })
        getWorker().postMessage({ id: `${txGroupId}_begin`, type: 'transaction', sql: 'BEGIN', txGroupId })
      })
      try {
        const hasil = await fn(txQuery)
        await new Promise<void>((resolve, reject) => {
          pendingTxInternal.set(`${txGroupId}_commit`, {
            resolve: () => resolve(),
            reject: (e) => reject(e instanceof Error ? e : new Error(String(e))),
          })
          getWorker().postMessage({ id: `${txGroupId}_commit`, type: 'transaction', sql: 'COMMIT', txGroupId })
        })
        return hasil
      } catch (err) {
        await new Promise<void>((resolve) => {
          pendingTxInternal.set(`${txGroupId}_rollback`, {
            resolve: () => resolve(),
            reject: () => resolve(), // abaikan error rollback
          })
          getWorker().postMessage({
            id: `${txGroupId}_rollback`,
            type: 'transaction',
            sql: 'ROLLBACK',
            txGroupId,
          })
        })
        throw err
      }
    } else {
      // FOLLOWER: broadcast ke LEADER (sederhana — pakai jalur BC biasa).
      // Untuk tahap 1 kita pakai pendekatan: kirim BC_TX_BEGIN, tunggu ack,
      // jalankan fn (yang mengirim DB_TX_QUERY_REQUEST per txQuery), lalu
      // BC_TX_COMMIT/ROLLBACK.
      if (!bc) throw new Error('BroadcastChannel tidak didukung.')
      const send = (sql: string): Promise<void> =>
        new Promise((resolve, reject) => {
          const id = `${txGroupId}_${sql.toLowerCase()}`
          const timer = setTimeout(() => {
            pendingTxInternal.delete(id)
            reject(new Error('TX control timeout.'))
          }, 10000)
          pendingTxInternal.set(id, {
            resolve: () => {
              clearTimeout(timer)
              resolve()
            },
            reject: (e) => {
              clearTimeout(timer)
              reject(e instanceof Error ? e : new Error(String(e)))
            },
          })
          // Sertakan txGroupId agar leader meneruskannya ke worker.
          bc.postMessage({ type: 'DB_TX_CONTROL', reqId: id, sql, senderTabId: TAB_ID, txGroupId })
        })
      await send('BEGIN')
      try {
        const hasil = await fn(txQuery)
        await send('COMMIT')
        return hasil
      } catch (err) {
        try {
          await send('ROLLBACK')
        } catch {
          /* abaikan */
        }
        throw err
      }
    }
  } finally {
    // Bersihkan pending map untuk group ini
    for (const k of [...pendingTxInternal.keys()]) {
      if (k.startsWith(txGroupId)) pendingTxInternal.delete(k)
    }
  }
}

// ── ANTREAN TRANSAKSI (mutex) ─────────────────────────────────────────────────
// Worker hanya mendukung SATU transaksi aktif global: BEGIN kedua menimpa
// txGroupId sehingga tx_query transaksi pertama gagal dengan pesan
// "txGroupId tidak cocok dengan transaksi aktif". Mutex ini menjamin dalam
// satu tab hanya ada satu withTransaction yang berjalan; pemanggil lain
// otomatis menunggu giliran. (Kasus lintas-tab tetap dijaga guard BEGIN di
// worker.ts yang menolak dengan TX_ACTIVE tanpa merusak transaksi berjalan.)
let txAntre: Promise<unknown> = Promise.resolve()

export function withTransaction<T>(
  fn: (txQuery: TxQueryFn) => Promise<T>,
): Promise<T> {
  const hasil = txAntre.then(() => withTransactionInti(fn))
  // Antrean tetap lanjut walau transaksi ini gagal (jangan tumpuk rejection).
  txAntre = hasil.catch(() => undefined)
  return hasil
}

// Hook agar worker.onmessage juga menangani pesan tx internal.
// Karena worker.onmessage sudah dipakai pendingLocal, kita perlu route pesan
// tx_internal ke pendingTxInternal. Cara termudah: extend handler via
// penyimpanan referensi & memanggil handler tambahan.
// (Implementasi: lihat `getWorker()` modifikasi di bawah.)

// Helper periksaKunciDatabase (selalu true karena multi-tab didukung penuh)
export async function periksaKunciDatabase(): Promise<boolean> {
  return true
}

// Reset koneksi database di worker (utilitas pemulihan). Menutup sesi DB aktif
// dan menghapus status kegagalan inisialisasi agar query berikutnya mencoba
// membuka database dari nol. Berguna setelah pengguna menutup tab lain yang
// masih mengunci OPFS (penyebab NoModificationAllowedError). Hanya relevan di
// Tab LEADER; di Tab FOLLOWER tidak melakukan apa-apa karena akses DB lewat
// Leader.
export function resetKoneksiDatabase(): Promise<void> {
  if (!worker) {
    console.log('[db] Reset koneksi dilewati: worker belum ada (tab folower / belum dipakai).')
    return Promise.resolve()
  }
  console.log('[db] Mengirim permintaan reset koneksi ke worker...')
  return new Promise((resolve, reject) => {
    const id = localMsgId++
    pendingLocal.set(id, {
      resolve: () => resolve(),
      reject: (e) => reject(e instanceof Error ? e : new Error(String(e))),
    })
    getWorker().postMessage({ id, type: 'reset' })
  })
}

// ── HMR: matikan worker & tutup BroadcastChannel sebelum modul reload ───────
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (worker) {
      console.info('[db] HMR: mematikan worker lama.')
      worker.terminate()
      worker = null
    }
    if (bc) {
      bc.close()
    }
  })
}

// ── Recovery helper: reset OPFS (khusus dev) ────────────────────────────────
async function resetOPFS() {
  if (!import.meta.env.DEV) {
    console.warn('[__resetOPFS] Hanya tersedia dalam mode development.')
    return
  }

  console.info('[__resetOPFS] Mematikan worker…')
  if (worker) {
    worker.terminate()
    worker = null
  }

  try {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry('novel-outliner', { recursive: true })
    console.info('[__resetOPFS] Folder OPFS /novel-outliner berhasil dihapus.')
  } catch (err) {
    console.warn('[__resetOPFS] Gagal menghapus folder OPFS:', err)
  }

  window.location.reload()
}

// ── Debug helper ────────────────────────────────────────────────────────────
async function dbDebug() {
  const tableMeta = await query<{ columns: string[]; rows: unknown[][] }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  )
  const tableNames: string[] = (tableMeta[0]?.rows ?? []).map((r) => r[0] as string)

  if (tableNames.length === 0) {
    console.warn('[dbDebug] Tidak ada tabel ditemukan di database.')
    return
  }

  console.groupCollapsed(
    `[dbDebug] Database memiliki ${tableNames.length} tabel: ${tableNames.join(', ')} (Status Tab: ${isLeader ? 'LEADER' : 'FOLLOWER'
    })`
  )

  for (const name of tableNames) {
    const res = await query<{ columns: string[]; rows: unknown[][] }>(
      `SELECT * FROM ${name}`
    )
    const result = res[0]
    if (!result || result.rows.length === 0) {
      console.log(`Tabel "${name}" → kosong`)
      continue
    }
    const objects = result.rows.map((row) =>
      Object.fromEntries(result.columns.map((col, i) => [col, row[i]]))
    )
    console.groupCollapsed(`Tabel "${name}" → ${result.rows.length} baris`)
    console.table(objects)
    console.groupEnd()
  }

  console.groupEnd()
}

// Pasang ke window agar bisa dipanggil dari DevTools console
type DevToolsWindow = typeof window & {
  __dbDebug?: typeof dbDebug
  __resetOPFS?: typeof resetOPFS
  __resetKoneksiDatabase?: typeof resetKoneksiDatabase
}
if (typeof window !== 'undefined') {
  const w = window as DevToolsWindow
  w.__dbDebug = dbDebug
  w.__resetOPFS = resetOPFS
  w.__resetKoneksiDatabase = resetKoneksiDatabase
  console.info(`💡 [dbDebug] Tab ${TAB_ID} (${isLeader ? 'LEADER' : 'FOLLOWER'}) — Ketik __dbDebug() di console.`)
  console.info('🔄 [resetOPFS] Ketik __resetOPFS() di console untuk reset database OPFS (dev).')
  console.info('♻️ [resetKoneksi] Ketik __resetKoneksiDatabase() untuk menutup & membuka ulang koneksi DB (mis. setelah tab lain dikunci).')
}