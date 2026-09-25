// src/features/soal/SoalEditorModal.tsx — tambah/edit manual per tipe.
import { useState } from 'react';
import type { DataSoal, SoalPilihanGanda, SoalProyek, SoalRecord, TipeSoal } from '../../db/types';
import { tambahSoal, ubahIsiSoal } from '../../db/repositories/soalRepo';
import { Modal } from '../../shared/ui/Modal';
import { useToast } from '../../shared/ui/Toast';

const HURUF = ['A', 'B', 'C', 'D', 'E'];

export function SoalEditorModal(props: {
  idProyek: string;
  tipeAwal: TipeSoal;
  editTarget: SoalRecord | null;
  poinDefault: (t: TipeSoal) => number;
  onTutup: () => void;
  onSimpan: () => void;
}): React.JSX.Element {
  const { idProyek, tipeAwal, editTarget, poinDefault, onTutup, onSimpan } = props;
  const toast = useToast();
  const [tipe, setTipe] = useState<TipeSoal>(editTarget?.tipe ?? tipeAwal);
  const awal = (editTarget ? JSON.parse(editTarget.data_json) : {}) as Record<string, unknown>;
  const [soal, setSoal] = useState(String(awal['soal'] ?? ''));
  const [opsi, setOpsi] = useState<Array<{ id: string; teks: string }>>(() => {
    const ada = awal['opsi'] as Array<{ id: string; teks: string }> | undefined;
    if (Array.isArray(ada) && ada.length > 0) return ada;
    return [
      { id: 'A', teks: '' },
      { id: 'B', teks: '' },
      { id: 'C', teks: '' },
      { id: 'D', teks: '' },
    ];
  });
  const [kunci, setKunci] = useState(String(awal['id_opsi_benar'] ?? 'A'));
  const [jawabanSingkat, setJawabanSingkat] = useState(String(awal['jawaban_singkat'] ?? ''));
  const [paragraf, setParagraf] = useState(String(awal['paragraf_jawaban'] ?? ''));
  const [judul, setJudul] = useState(String(awal['judul'] ?? ''));
  const [deskripsi, setDeskripsi] = useState(String(awal['deskripsi_proyek'] ?? ''));
  const [langkah, setLangkah] = useState<string[]>(
    Array.isArray(awal['langkah_langkah']) ? (awal['langkah_langkah'] as string[]) : ['', '', ''],
  );


  const simpan = async (): Promise<void> => {
    let data: DataSoal;
    if (tipe === 'pilihan_ganda') {
      if (!soal.trim() || opsi.some((o) => !o.teks.trim())) {
        toast('Soal dan semua opsi wajib diisi.', 'error');
        return;
      }
      const pg: SoalPilihanGanda = { soal, opsi, id_opsi_benar: kunci };
      data = pg;
    } else if (tipe === 'uraian') {
      if (!soal.trim()) {
        toast('Soal wajib diisi.', 'error');
        return;
      }
      data = { soal, jawaban_singkat: jawabanSingkat };
    } else if (tipe === 'penalaran') {
      if (!soal.trim()) {
        toast('Soal wajib diisi.', 'error');
        return;
      }
      data = { soal, paragraf_jawaban: paragraf };
    } else {
      if (!judul.trim()) {
        toast('Judul proyek wajib diisi.', 'error');
        return;
      }
      const pr: SoalProyek = { judul, deskripsi_proyek: deskripsi, langkah_langkah: langkah.filter((s) => s.trim()) };
      data = pr;
    }
    if (editTarget) {
      await ubahIsiSoal(editTarget.id, data);
      toast('Soal diperbarui!', 'success');
    } else {
      await tambahSoal(idProyek, tipe, data, poinDefault(tipe));
      toast('Soal baru ditambahkan!', 'success');
    }
    onSimpan();
    onTutup();
  };

  return (
    <Modal judul={editTarget ? 'Edit Detail Pertanyaan' : 'Tambah Pertanyaan Manual'} onTutup={onTutup} lebar="max-w-2xl">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Tipe Soal</label>
          <select value={tipe} disabled={!!editTarget} onChange={(e) => setTipe(e.target.value as TipeSoal)} className="w-full px-3.5 py-2 rounded-lg border border-slate-200 text-sm font-semibold bg-white">
            <option value="pilihan_ganda">Pilihan Ganda</option>
            <option value="uraian">Uraian</option>
            <option value="penalaran">Penalaran</option>
            <option value="proyek">Proyek Praktis</option>
          </select>
        </div>
        {tipe !== 'proyek' && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Pertanyaan / Soal</label>
            <textarea value={soal} dir="auto" onChange={(e) => setSoal(e.target.value)} className="w-full h-24 px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm" placeholder="Ketik pertanyaan... Enter untuk baris baru." />
          </div>
        )}

        {tipe === 'pilihan_ganda' && (
          <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-100">
            <span className="block text-xs font-bold text-slate-700 uppercase">Opsi & Kunci Jawaban</span>
            {opsi.map((o, i) => (
              <div key={o.id} className="flex items-center space-x-2">
                <input type="radio" name="kunci" checked={kunci === o.id} onChange={() => setKunci(o.id)} className="w-4 h-4" />
                <span className="text-xs font-bold w-4">{o.id}</span>
                <textarea value={o.teks} rows={2} onChange={(e) => setOpsi((prev) => prev.map((p, j) => (j === i ? { ...p, teks: e.target.value } : p)))} dir="auto" className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200" placeholder={`Pilihan ${o.id}...`} />
              </div>
            ))}
            <div className="flex gap-3 pt-1">
              <button onClick={() => {
                if (opsi.length < 5) setOpsi((p) => [...p, { id: HURUF[p.length], teks: '' }]);
              }} className="text-[11px] text-indigo-600 font-bold">+ Opsi (maks E)</button>
              <button onClick={() => {
                if (opsi.length > 2) setOpsi((p) => p.slice(0, -1));
              }} className="text-[11px] text-slate-500 font-bold">- Kurangi</button>
            </div>
          </div>
        )}
        {tipe === 'uraian' && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Jawaban Singkat</label>
            <textarea value={jawabanSingkat} onChange={(e) => setJawabanSingkat(e.target.value)} className="w-full h-20 px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm" />
          </div>
        )}
        {tipe === 'penalaran' && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Paragraf Jawaban Kritis</label>
            <textarea value={paragraf} onChange={(e) => setParagraf(e.target.value)} className="w-full h-24 px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm" />
          </div>
        )}
        {tipe === 'proyek' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Judul Proyek</label>
              <input value={judul} dir="auto" onChange={(e) => setJudul(e.target.value)} className="w-full px-3.5 py-2 rounded-lg border border-slate-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Deskripsi Proyek</label>
              <textarea value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} className="w-full h-20 px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 uppercase">Langkah-langkah</label>
                <button onClick={() => setLangkah((p) => [...p, ''])} className="text-[11px] text-indigo-600 font-bold">+ Tambah Langkah</button>
              </div>
              {langkah.map((s, i) => (
                <div key={i} className="flex items-center space-x-2 mb-2">
                  <span className="text-xs font-bold text-slate-400 w-5">{i + 1}.</span>
                  <textarea value={s} rows={2} onChange={(e) => setLangkah((p) => p.map((v, j) => (j === i ? e.target.value : v)))} dir="auto" className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200" />
                  <button onClick={() => setLangkah((p) => p.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600 text-xs">Hps</button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
          <button onClick={onTutup} className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700">Batal</button>
          <button onClick={() => {
            void simpan();
          }} className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white">Simpan Perubahan</button>
        </div>
      </div>
    </Modal>
  );
}

