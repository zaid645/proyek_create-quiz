// src/db/shared-worker-types.d.ts
// Deklarasi minimal untuk SharedWorker.
// Sengaja tidak menambah lib "webworker" ke tsconfig karena akan
// bentrok dengan lib "DOM" yang dipakai bagian React lainnya.
interface SharedWorkerGlobalScope {
  onconnect: (event: MessageEvent) => void
}