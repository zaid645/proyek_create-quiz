// src/features/proyek/ProyekSidebar.tsx
// Navigasi proyek sebagai LAYER sendiri: dipicu tombol kecil di pojok kiri atas
// (lihat App.tsx). Panel ini melayang di atas seluruh halaman, sama seperti
// rencana tombol Generate Soal yang juga berdiri di layernya sendiri.
import { useState } from 'react';
import type { Proyek } from '../../db/types';
import { buatProyek, hapusProyek } from '../../db/repositories/proyekRepo';
import { Modal, ConfirmModal } from '../../shared/ui/Modal';
import { useToast } from '../../shared/ui/Toast';

export function ProyekSidebar({
  daftar,
  aktifId,
  terbuka,
  onTutup,
  onPilih,
  onBerubah,
}: {
  daftar: Proyek[];
  aktifId: string | null;
  terbuka: boolean;
  onTutup: () => void;
  onPilih: (id: string) => void;
  onBerubah: () => void;
}): React.JSX.Element | null {
  const toast = useToast();
  const [bukaBaru, setBukaBaru] = useState(false);
  const [nama, setNama] = useState('');
  const [hapusTarget, setHapusTarget] = useState<Proyek | null>(null);
  const [sibuk, setSibuk] = useState(false);

  if (!terbuka) return null;

  const simpanBaru = async (): Promise<void> => {
    if (!nama.trim()) {
      toast('Nama proyek wajib diisi.', 'error');
      return;
    }
    setSibuk(true);
    try {
      const p = await buatProyek(nama.trim());
      setNama('');
      setBukaBaru(false);
      toast('Proyek baru dibuat!', 'success');
      onPilih(p.id);
      onBerubah();
      onTutup();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal membuat proyek.', 'error');
    } finally {
      setSibuk(false);
    }
  };

  const konfirmasiHapus = async (): Promise<void> => {
    if (!hapusTarget) return;
    setSibuk(true);
    try {
      await hapusProyek(hapusTarget.id);
      toast('Proyek beserta seluruh soalnya dihapus.', 'info');
      setHapusTarget(null);
      onBerubah();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menghapus proyek.', 'error');
    } finally {
      setSibuk(false);
    }
  };

  const pilih = (id: string): void => {
    onPilih(id);
    onTutup();
  };

  return (
    <>
      <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Daftar proyek">
        <div className="absolute inset-0 bg-slate-900/50 animasi-latar" onClick={onTutup} />
        <aside className="relative h-full w-80 max-w-[85vw] bg-white shadow-2xl flex flex-col animasi-drawer">
          <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Proyek Saya</h2>
              <p className="text-[10px] text-slate-400">{daftar.length} proyek tersimpan lokal</p>
            </div>
            <button
              onClick={onTutup}
              aria-label="Tutup daftar proyek"
              className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg w-8 h-8 flex items-center justify-center transition"
            >
              ✕
            </button>
          </div>

          <div className="p-3">
            <button
              onClick={() => setBukaBaru(true)}
              className="w-full text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl transition"
            >
              + Proyek Baru
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-4 space-y-1.5">
            {daftar.length === 0 && (
              <p className="text-xs text-slate-400 leading-relaxed px-1">
                Belum ada proyek. Buat proyek pertama untuk mulai menyimpan bank soal per proyek.
              </p>
            )}
            {daftar.map((p) => (
              <div
                key={p.id}
                className={`group flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition cursor-pointer ${
                  p.id === aktifId ? 'border-indigo-500 bg-indigo-50/40' : 'border-slate-100 hover:border-slate-300 bg-white'
                }`}
                onClick={() => pilih(p.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">{p.nama_proyek}</p>
                  <p className="text-[10px] text-slate-400 truncate">{p.deskripsi || 'Tanpa deskripsi'}</p>
                </div>
                {p.id === aktifId && <span className="text-[10px] font-bold text-indigo-600 shrink-0">aktif</span>}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setHapusTarget(p);
                  }}
                  title="Hapus proyek beserta isinya"
                  className="p-1.5 hover:bg-rose-50 hover:text-rose-600 rounded-lg text-slate-300 transition shrink-0"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>

          <div className="px-4 py-3 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 leading-snug">
              Data tersimpan di browser (OPFS + SQLite). Menghapus proyek juga menghapus seluruh soal &amp; file di dalamnya.
            </p>
          </div>
        </aside>
      </div>

      {bukaBaru && (
        <Modal judul="Buat Proyek Baru" onTutup={() => setBukaBaru(false)} lebar="max-w-md">
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Nama Proyek</label>
          <input
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            placeholder="cth: UAS Ganjil - IPA Kelas 6"
            className="w-full px-3.5 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
          <div className="mt-4 flex justify-end space-x-2">
            <button onClick={() => setBukaBaru(false)} className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700">Batal</button>
            <button onClick={simpanBaru} disabled={sibuk} className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50">
              {sibuk ? 'Menyimpan...' : 'Buat Proyek'}
            </button>
          </div>
        </Modal>
      )}

      {hapusTarget && (
        <ConfirmModal
          judul="Hapus Proyek?"
          deskripsi={`"${hapusTarget.nama_proyek}" beserta SELURUH soal dan file materi di dalamnya akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`}
          teksAksi={sibuk ? 'Menghapus...' : 'Ya, Hapus'}
          onBatal={() => setHapusTarget(null)}
          onKonfirmasi={konfirmasiHapus}
        />
      )}
    </>
  );
}
