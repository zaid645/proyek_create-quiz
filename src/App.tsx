// src/App.tsx — shell: header + drawer proyek + generator + dashboard + FAB.
import { useCallback, useEffect, useState } from 'react';
import type { Proyek, ProyekFile, SoalRecord, StatistikSoal } from './db/types';
import { listProyek, ambilProyek } from './db/repositories/proyekRepo';
import { listSoal, statistikSoal } from './db/repositories/soalRepo';
import { listFile } from './db/repositories/fileRepo';
import { bacaProyekTerakhir, simpanProyekTerakhir } from './db/repositories/pengaturanRepo';
import { onPerubahanData } from './db/client';
import { ProyekSidebar } from './features/proyek/ProyekSidebar';
import { GeneratorPanel } from './features/generator/GeneratorPanel';
import { useGenerator } from './features/generator/useGenerator';
import { SoalDashboard } from './features/soal/SoalDashboard';
import { AiConfigModal } from './features/pengaturan/AiConfigModal';
import { ToastProvider, useToast } from './shared/ui/Toast';
import { ErrorModal } from './shared/ui/Modal';

const STATS_KOSONG: StatistikSoal = { total: 0, pilihan_ganda: 0, uraian: 0, penalaran: 0, proyek: 0 };

function Shell(): React.JSX.Element {
  const toast = useToast();
  const [daftarProyek, setDaftarProyek] = useState<Proyek[]>([]);
  const [aktifId, setAktifId] = useState<string | null>(null);
  const [proyek, setProyek] = useState<Proyek | null>(null);
  const [soal, setSoal] = useState<SoalRecord[]>([]);
  const [stats, setStats] = useState<StatistikSoal>(STATS_KOSONG);
  const [daftarFile, setDaftarFile] = useState<ProyekFile[]>([]);
  const [bukaConfig, setBukaConfig] = useState(false);
  const [bukaProyek, setBukaProyek] = useState(false);
  const [galatDb, setGalatDb] = useState<string | null>(null);
  const [siap, setSiap] = useState(false);

  const muatProyek = useCallback(async () => {
    try {
      const daftar = await listProyek();
      setDaftarProyek(daftar);
      setAktifId((sekarang) => {
        let pilihan = sekarang ?? bacaProyekTerakhir();
        if (!pilihan || !daftar.some((p) => p.id === pilihan)) pilihan = daftar[0]?.id ?? null;
        simpanProyekTerakhir(pilihan);
        return pilihan;
      });
      setSiap(true);
    } catch (err) {
      setGalatDb(err instanceof Error ? err.message : String(err));
      setSiap(true);
    }
  }, []);

  const muatIsi = useCallback(async (id: string) => {
    try {
      const [p, s, st, f] = await Promise.all([ambilProyek(id), listSoal(id), statistikSoal(id), listFile(id)]);
      setProyek(p);
      setSoal(s);
      setStats(st);
      setDaftarFile(f);
    } catch (err) {
      setGalatDb(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Menyegarkan soal + statistik + file proyek aktif (dipakai generator & dashboard).
  const segarkanIsi = useCallback(() => {
    if (aktifId) void muatIsi(aktifId);
  }, [aktifId, muatIsi]);

  // State generator diangkat ke sini agar tombol melayang (kanan bawah) dan
  // tombol di panel memakai alur + target loop yang sama.
  const gen = useGenerator({ proyek, daftarFile, soalSemua: soal, onSoalBerubah: segarkanIsi });

  useEffect(() => {
    void muatProyek();
  }, [muatProyek]);

  useEffect(() => {
    if (aktifId) void muatIsi(aktifId);
    else {
      setProyek(null);
      setSoal([]);
      setStats(STATS_KOSONG);
      setDaftarFile([]);
    }
  }, [aktifId, muatIsi]);

  useEffect(() => onPerubahanData(() => {
    void muatProyek();
  }), [muatProyek]);

  const pilihProyek = (id: string): void => {
    setAktifId(id);
    simpanProyekTerakhir(id);
    toast('Proyek aktif diganti.', 'info');
  };

  // Label FAB mengikuti mode: 1 soal per klik atau loop sampai target tipe aktif.
  const targetAktif = gen.targetPerTipe(gen.tipe);
  const loopJalan = gen.loopAktif && targetAktif > 0;
  const labelFab = gen.memuat ? 'Merakit...' : loopJalan ? `Generate ${gen.sisaTarget} Soal` : 'Generate Soal';

  return (
    <div className="bg-slate-50 text-slate-800 min-h-screen flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center space-x-3 min-w-0">
            <button
              onClick={() => setBukaProyek(true)}
              title="Buka daftar proyek"
              className="shrink-0 flex items-center gap-2 text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 px-2.5 py-2 rounded-lg text-xs font-semibold transition"
            >
              <span className="text-sm leading-none">🗂</span>
              <span className="hidden sm:inline max-w-[9rem] truncate">{proyek?.nama_proyek ?? 'Proyek Saya'}</span>
            </button>
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold shrink-0">Q</div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-950 tracking-tight truncate">AI Question Generator</h1>
              <p className="text-xs text-slate-500 font-medium">Automatic Assessment Creator</p>
            </div>
          </div>
          <button onClick={() => setBukaConfig(true)} className="shrink-0 text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 px-3 py-2 rounded-lg text-sm font-semibold transition">Konfigurasi AI</button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {!siap ? (
          <p className="lg:col-span-12 text-sm text-slate-400">Memuat database lokal (OPFS)...</p>
        ) : !proyek ? (
          <div className="lg:col-span-12 bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-sm h-fit">
            <h4 className="text-base font-bold text-slate-900 mb-1">Belum ada proyek</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Klik tombol 🗂 di pojok kiri atas untuk membuat proyek pertama, lalu mulai generate dan menyimpan bank soal.
            </p>
          </div>
        ) : (
          <>
            <div className="lg:col-span-5">
              <GeneratorPanel
                proyek={proyek}
                daftarFile={daftarFile}
                gen={gen}
                onProyekBerubah={() => {
                  segarkanIsi();
                  void muatProyek();
                }}
                onFileBerubah={segarkanIsi}
              />
            </div>
            <div className="lg:col-span-7">
              <SoalDashboard
                proyek={proyek}
                soal={soal}
                stats={stats}
                onBerubah={segarkanIsi}
                onProyekBerubah={() => {
                  segarkanIsi();
                  void muatProyek();
                }}
              />
            </div>
          </>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-6 pb-24 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-slate-400 font-medium">
          <p>© 2026 Generator Pertanyaan Otomatis — lokal (OPFS + SQLite), API key di localStorage.</p>
        </div>
      </footer>

      {/* Tombol Generate: layer sendiri di kanan bawah (di bawah modal/panel soal). */}
      {proyek && (
        <button
          onClick={() => {
            void gen.generate('auto');
          }}
          disabled={gen.memuat || (loopJalan && gen.sisaTarget === 0)}
          title={loopJalan ? 'Loop sampai target soal tercapai' : 'Hasilkan 1 soal baru dengan AI'}
          className="fixed bottom-6 right-6 z-30 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold text-sm px-5 py-3.5 rounded-full shadow-2xl shadow-indigo-600/30 transition"
        >
          <span className="text-base leading-none">{gen.memuat ? '⏳' : '⚡'}</span>
          <span>{labelFab}</span>
        </button>
      )}

      <ProyekSidebar
        daftar={daftarProyek}
        aktifId={aktifId}
        terbuka={bukaProyek}
        onTutup={() => setBukaProyek(false)}
        onPilih={pilihProyek}
        onBerubah={() => {
          void muatProyek();
        }}
      />
      {bukaConfig && <AiConfigModal onTutup={() => setBukaConfig(false)} />}
      {galatDb && <ErrorModal pesan={galatDb} onTutup={() => setGalatDb(null)} />}
    </div>
  );
}

export default function App(): React.JSX.Element {
  return (<ToastProvider><Shell /></ToastProvider>);
}
