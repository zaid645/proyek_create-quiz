// src/features/soal/SoalDashboard.tsx — statistik + tab + impor/ekspor + daftar.
import { useState } from 'react';
import type { Proyek, SoalRecord, StatistikSoal, TipeSoal } from '../../db/types';
import { kosongkanSoal, tambahSoal, ubahVisibilitas } from '../../db/repositories/soalRepo';
import { ubahProyek } from '../../db/repositories/proyekRepo';
import { bacaFileJSON, eksporJSON, petakanImpor } from '../../services/exportImport';
import { eksporDoc } from '../../services/exportDoc';
import { validasiHasil } from '../../services/gemini';
import { poinDefault } from '../../services/tipeSoal';
import { QuestionCard } from './QuestionCard';
import { SoalEditorModal } from './SoalEditorModal';
import { useToast } from '../../shared/ui/Toast';
import { ErrorModal } from '../../shared/ui/Modal';

export type TabSoal = 'all' | TipeSoal;

const TAB_LABEL: Record<TabSoal, string> = {
  all: 'Semua',
  pilihan_ganda: 'Pilihan Ganda',
  uraian: 'Uraian',
  penalaran: 'Nalar',
  proyek: 'Proyek',
};

export function SoalDashboard(props: {
  proyek: Proyek;
  soal: SoalRecord[];
  stats: StatistikSoal;
  onBerubah: () => void;
  onProyekBerubah: () => void;
}): React.JSX.Element {
  const { proyek, soal, stats, onBerubah, onProyekBerubah } = props;
  const toast = useToast();
  const [tab, setTab] = useState<TabSoal>('all');
  const [bukaEditor, setBukaEditor] = useState(false);
  const [editTarget, setEditTarget] = useState<SoalRecord | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const tampil = tab === 'all' ? soal : soal.filter((s) => s.tipe === tab);

  const bukaTambah = (): void => {
    setEditTarget(null);
    setBukaEditor(true);
  };
  const bukaEdit = (r: SoalRecord): void => {
    setEditTarget(r);
    setBukaEditor(true);
  };


  const impor = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    try {
      const bank = await bacaFileJSON(file);
      await ubahProyek(proyek.id, {
        nama_proyek: bank.metadata.judul_soal,
        deskripsi: bank.metadata.deskripsi_soal,
        custom_prompt: bank.metadata.custom_prompt,
      });
      await kosongkanSoal(proyek.id);
      for (const item of petakanImpor(bank)) {
        const data = validasiHasil(item.tipe, item.data);
        const rec = await tambahSoal(proyek.id, item.tipe, data, item.poin);
        if (item.isHidden) await ubahVisibilitas(rec.id, true);
      }
      toast('Sukses mengimpor bank soal!', 'success');
      onBerubah();
      onProyekBerubah();
    } catch (err) {
      setGalat(err instanceof Error ? err.message : String(err));
    }
  };

  const kosongkan = async (): Promise<void> => {
    if (!confirm('Hapus seluruh soal di proyek ini? Tindakan tidak dapat dibatalkan.')) return;
    await kosongkanSoal(proyek.id);
    toast('Daftar soal dikosongkan.', 'info');
    onBerubah();
  };

  const bank = { proyek, soal };
  const jumlahTab = (t: TipeSoal): number =>
    t === 'pilihan_ganda' ? stats.pilihan_ganda
    : t === 'uraian' ? stats.uraian
    : t === 'penalaran' ? stats.penalaran
    : stats.proyek;

  return (
    <div className="space-y-6">
      <div className="bg-white px-6 py-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 leading-tight">{proyek.nama_proyek}</h3>
          <p className="text-xs text-slate-400 font-medium">Status Bank Soal: <span className="font-bold text-indigo-600">{stats.total}</span> Soal terkumpul</p>
        </div>
        <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl flex-wrap">
          {(Object.keys(TAB_LABEL) as TabSoal[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs transition ${tab === t ? 'font-bold bg-white text-indigo-900 shadow-sm' : 'font-semibold text-slate-600'}`}
            >
              {TAB_LABEL[t]}{t !== 'all' ? ` (${jumlahTab(t)})` : ''}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-slate-900">Kelola Lembaran Soal</h2>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center justify-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-700 py-2.5 px-3 rounded-lg text-xs font-bold cursor-pointer">
            Impor JSON
            <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => {
              void impor(e.target.files?.[0]);
              e.target.value = '';
            }} />
          </label>
          <button onClick={() => eksporJSON(bank)} className="border border-slate-200 hover:bg-slate-50 text-slate-700 py-2.5 px-3 rounded-lg text-xs font-bold">
            Ekspor JSON
          </button>
        </div>
        <button onClick={() => {
          eksporDoc(bank);
          toast('Dokumen lembar soal diunduh!', 'success');
        }} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-4 rounded-lg text-xs font-bold">
          Ekspor Dokumen (.doc)
        </button>
        <button onClick={() => {
          void kosongkan();
        }} className="w-full text-center text-xs font-bold text-rose-500 hover:underline pt-2">
          Kosongkan Semua Soal proyek ini
        </button>
      </div>

      {soal.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-sm">
          <h4 className="text-base font-bold text-slate-900 mb-1">Belum ada soal tersedia</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-6">Generate lewat AI di panel kiri atau tambahkan manual.</p>
          <button onClick={bukaTambah} className="inline-flex items-center bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-4 py-2 rounded-xl text-xs">
            + Tambah Soal Manual
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {tampil.map((s, i) => (
            <QuestionCard key={s.id} record={s} nomor={i + 1} onBerubah={onBerubah} onEdit={bukaEdit} />
          ))}
          {tampil.length === 0 && (
            <p className="text-xs text-slate-400 text-center bg-white border border-slate-200 rounded-2xl p-6">Tidak ada soal pada tab ini.</p>
          )}
        </div>
      )}

      {soal.length > 0 && (
        <div className="flex items-center justify-between bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <span className="text-xs text-slate-500 font-medium">Butuh soal variatif lainnya? Tambahkan manual.</span>
          <button onClick={bukaTambah} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-xl text-xs">
            + Tambah Soal Manual
          </button>
        </div>
      )}

      {bukaEditor && (
        <SoalEditorModal
          idProyek={proyek.id}
          tipeAwal={tab === 'all' ? 'pilihan_ganda' : tab}
          editTarget={editTarget}
          poinDefault={(t) => poinDefault(proyek, t)}
          onTutup={() => setBukaEditor(false)}
          onSimpan={onBerubah}
        />
      )}
      {galat && <ErrorModal pesan={galat} onTutup={() => setGalat(null)} />}
    </div>
  );
}
