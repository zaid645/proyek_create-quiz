// src/features/generator/GeneratorPanel.tsx
// Panel generator: informasi ujian, tipe soal, target loop, poin default, file materi.
// State proses API (tipe, jumlah opsi, loop, progress) dipegang useGenerator di App
// agar tombol melayang di kanan bawah (FAB) memakai aksi yang sama.
import type { Proyek, ProyekFile, TipeSoal } from '../../db/types';
import { bacaFileMateri } from '../../services/fileInput';
import { simpanFile, hapusFile } from '../../db/repositories/fileRepo';
import { ubahProyek } from '../../db/repositories/proyekRepo';
import {
  DAFTAR_TIPE,
  MAKS_TARGET_SOAL,
  TIPE_LABEL,
  TIPE_SINGKAT,
  batasiTarget,
  kunciTarget,
  targetSoal,
} from '../../services/tipeSoal';
import { useToast } from '../../shared/ui/Toast';
import { ErrorModal, LoadingOverlay } from '../../shared/ui/Modal';
import type { HasilGenerator } from './useGenerator';

export function GeneratorPanel(props: {
  proyek: Proyek;
  daftarFile: ProyekFile[];
  gen: HasilGenerator;
  onProyekBerubah: () => void;
  onFileBerubah: () => void;
}): React.JSX.Element {
  const { proyek, daftarFile, gen, onProyekBerubah, onFileBerubah } = props;
  const toast = useToast();

  const simpanProyek = (patch: Parameters<typeof ubahProyek>[1]): void => {
    void ubahProyek(proyek.id, patch).then(onProyekBerubah);
  };

  const unggah = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    try {
      const siap = await bacaFileMateri(file);
      await simpanFile(proyek.id, siap.namaAsli, siap.mimeType, siap.ukuranByte, siap.kontenTeks);
      toast('File materi berhasil dibaca!', 'success');
      onFileBerubah();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal membaca file materi.', 'error');
    }
  };

  const ubahTarget = (t: TipeSoal, nilai: number): void => {
    simpanProyek({ [kunciTarget(t)]: batasiTarget(nilai) } as Partial<Proyek>);
  };

  const sisaLoop = gen.sisaTarget;
  const targetAktif = gen.targetPerTipe(gen.tipe);
  // Loop hanya bergerak bila target tipe terpilih > 0 (0 = tanpa target).
  const loopJalan = gen.loopAktif && targetAktif > 0;
  const tombolUtama = gen.memuat
    ? 'Merakit...'
    : loopJalan
      ? sisaLoop > 0
        ? `Hasilkan ${sisaLoop} Soal (Loop)`
        : `Target ${TIPE_LABEL[gen.tipe]} Tercapai`
      : 'Hasilkan Soal Sekarang';
  const tombolMati = gen.memuat || (loopJalan && sisaLoop === 0);

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-slate-900">Informasi Ujian</h2>
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Judul Lembar Soal</label>
          <input
            value={proyek.nama_proyek}
            onChange={(e) => simpanProyek({ nama_proyek: e.target.value })}
            className="w-full px-3.5 py-2 rounded-lg border border-slate-200 text-sm font-medium"
            placeholder="Masukkan judul ujian..."
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Deskripsi Ujian (Konteks)</label>
          <textarea
            value={proyek.deskripsi ?? ''}
            onChange={(e) => simpanProyek({ deskripsi: e.target.value })}
            className="w-full h-16 px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm custom-scrollbar"
            placeholder="Target kompetensi atau deskripsi ujian..."
          />
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-5">
        <h2 className="text-base font-bold text-slate-900">Buat Soal Otomatis</h2>
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Tipe Soal</label>
          <div className="grid grid-cols-2 gap-2">
            {DAFTAR_TIPE.map((t) => (
              <button
                key={t}
                onClick={() => gen.setTipe(t)}
                className={`p-3 rounded-xl border text-left text-xs font-bold h-16 ${gen.tipe === t ? 'border-indigo-500 bg-indigo-50/40 text-indigo-950' : 'border-slate-200 text-slate-700 bg-white'}`}
              >
                {TIPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-amber-900">Loop Sampai Target Soal</p>
              <p className="text-[10px] text-amber-700/80 leading-snug">
                Target jumlah per tipe tersimpan di proyek ini. Bila aktif, generator akan memanggil AI berulang (1 soal per panggilan) sampai target tipe terpilih tercapai.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={gen.loopAktif}
              aria-label="Aktifkan loop sampai target"
              onClick={() => gen.setLoopAktif(!gen.loopAktif)}
              className={`relative w-11 h-6 shrink-0 rounded-full transition ${gen.loopAktif ? 'bg-amber-500' : 'bg-slate-300'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${gen.loopAktif ? 'translate-x-5' : ''}`}
              />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2 text-[11px]">
            {DAFTAR_TIPE.map((t) => (
              <label key={t} className="font-semibold text-amber-900">
                {TIPE_SINGKAT[t]}
                <input
                  type="number"
                  min={0}
                  max={MAKS_TARGET_SOAL}
                  value={targetSoal(proyek, t)}
                  onChange={(e) => ubahTarget(t, Number(e.target.value))}
                  className="w-full mt-1 border border-amber-200 rounded-lg px-1.5 py-1.5 text-center text-xs bg-white"
                />
                <span className="block text-center font-normal text-amber-700/80 mt-0.5">
                  {gen.jumlahPerTipe(t)}/{targetSoal(proyek, t)}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
          <label className="block text-xs font-bold text-indigo-900 mb-2">Nilai Default Poin (per proyek)</label>
          <div className="grid grid-cols-4 gap-2 text-xs">
            <label>{TIPE_SINGKAT.pilihan_ganda}
              <input type="number" value={proyek.default_poin_pg} onChange={(e) => simpanProyek({ default_poin_pg: Number(e.target.value) || 0 })} className="w-full border border-indigo-200 rounded-lg px-2 py-1.5 text-center" />
            </label>
            <label>{TIPE_SINGKAT.uraian}
              <input type="number" value={proyek.default_poin_uraian} onChange={(e) => simpanProyek({ default_poin_uraian: Number(e.target.value) || 0 })} className="w-full border border-indigo-200 rounded-lg px-2 py-1.5 text-center" />
            </label>
            <label>{TIPE_SINGKAT.penalaran}
              <input type="number" value={proyek.default_poin_penalaran} onChange={(e) => simpanProyek({ default_poin_penalaran: Number(e.target.value) || 0 })} className="w-full border border-indigo-200 rounded-lg px-2 py-1.5 text-center" />
            </label>
            <label>{TIPE_SINGKAT.proyek}
              <input type="number" value={proyek.default_poin_proyek} onChange={(e) => simpanProyek({ default_poin_proyek: Number(e.target.value) || 0 })} className="w-full border border-indigo-200 rounded-lg px-2 py-1.5 text-center" />
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">File Rujukan Materi (.txt / .md)</label>
          {gen.tipe === 'pilihan_ganda' && (
            <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700">Opsi Pilihan Ganda (A–E):</span>
              <div className="flex items-center space-x-1">
                <button onClick={() => gen.setJumlahOpsi(Math.max(2, gen.jumlahOpsi - 1))} className="w-7 h-7 bg-white border border-slate-200 rounded-md text-xs font-bold">-</button>
                <span className="px-2 text-sm font-bold">{gen.jumlahOpsi}</span>
                <button onClick={() => gen.setJumlahOpsi(Math.min(5, gen.jumlahOpsi + 1))} className="w-7 h-7 bg-white border border-slate-200 rounded-md text-xs font-bold">+</button>
              </div>
            </div>
          )}
          <label className="flex flex-col items-center justify-center w-full min-h-24 border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-xl cursor-pointer p-4 text-center">
            <p className="text-xs font-semibold text-slate-700">Pilih File Teks Rujukan</p>
            <p className="text-[10px] text-slate-400 mt-1">.txt / .md, maks 2MB, tersimpan per proyek</p>
            <input
              type="file"
              accept=".txt,.md,.markdown,text/plain,text/markdown"
              className="hidden"
              onChange={(e) => {
                void unggah(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          {daftarFile.length > 0 && (
            <ul className="space-y-1">
              {daftarFile.map((f) => (
                <li key={f.id} className="flex items-center justify-between text-xs bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                  <span className="font-semibold text-slate-700 truncate">{f.nama_asli} <span className="text-slate-400">({Math.round(f.ukuran_byte / 1024)} KB)</span></span>
                  <button onClick={() => {
                    void hapusFile(f.id).then(onFileBerubah);
                  }} className="text-rose-600 hover:underline font-semibold shrink-0 ml-2">
                    Hapus
                  </button>
                </li>
              ))}
            </ul>
          )}
          <textarea
            value={gen.materiTambahan}
            onChange={(e) => gen.setMateriTambahan(e.target.value)}
            className="w-full h-20 p-2.5 text-xs border border-slate-200 rounded-lg custom-scrollbar"
            placeholder="Atau ketik/tempel intisari materi di sini (sekali pakai)..."
          />
          <textarea
            value={proyek.custom_prompt ?? ''}
            onChange={(e) => simpanProyek({ custom_prompt: e.target.value })}
            className="w-full h-16 p-2.5 text-xs border border-slate-200 rounded-lg custom-scrollbar"
            placeholder="Instruksi khusus untuk AI (tersimpan per proyek)..."
          />
        </div>

        <div className="space-y-2">
          <button
            onClick={() => {
              void gen.generate('auto');
            }}
            disabled={tombolMati}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition"
          >
            {tombolUtama}
          </button>
          {gen.loopAktif && (
            <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 leading-snug">
              {targetAktif > 0
                ? `Loop aktif — ${gen.jumlahPerTipe(gen.tipe)} dari ${targetAktif} soal ${TIPE_LABEL[gen.tipe]} sudah ada${gen.sisaTarget > 0 ? `, sisa ${gen.sisaTarget} soal.` : ' (target tercapai).'}`
                : `Target ${TIPE_LABEL[gen.tipe]} masih 0, jadi loop berhenti di 1 soal per klik. Isi target di atas untuk mengaktifkan loop.`}
            </p>
          )}
          <button
            onClick={() => gen.unduhPromptDebug()}
            className="w-full text-xs font-bold text-slate-500 hover:text-slate-700 hover:underline"
          >
            Mode Debug: unduh JSON prompt tanpa panggil API
          </button>
        </div>
      </div>

      {gen.memuat && <LoadingOverlay detail={gen.detailMuat} onBatal={gen.batalkan} />}
      {gen.galat && <ErrorModal pesan={gen.galat} onTutup={gen.tutupGalat} />}
    </div>
  );
}
