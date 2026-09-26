// src/features/soal/QuestionCard.tsx — kartu 1 soal + kontrol poin/visibility/edit/hapus.
import type { SoalPenalaran, SoalPilihanGanda, SoalProyek, SoalRecord, SoalUraian, TipeSoal } from '../../db/types';
import { hapusSoal, ubahPoin, ubahVisibilitas } from '../../db/repositories/soalRepo';
import { TEKS_MULTIBARIS } from '../../services/teks';

export function QuestionCard({
  record,
  nomor,
  onBerubah,
  onEdit,
}: {
  record: SoalRecord;
  nomor: number;
  onBerubah: () => void;
  onEdit: (record: SoalRecord) => void;
}): React.JSX.Element {
  const data = JSON.parse(record.data_json) as Record<string, unknown>;
  const redup = record.is_hidden === 1;

  const judul = record.tipe === 'proyek' ? String((data as unknown as SoalProyek).judul) : String(data['soal'] ?? '');

  const simpanPoin = (nilai: number): void => {
    void ubahPoin(record.id, nilai).then(onBerubah);
  };
  const toggle = (): void => {
    void ubahVisibilitas(record.id, record.is_hidden !== 1).then(onBerubah);
  };
  const hapus = (): void => {
    if (!confirm('Hapus soal ini?')) return;
    void hapusSoal(record.id).then(onBerubah);
  };

  return (
    <div className={`${redup ? 'opacity-50 bg-slate-50' : 'bg-white'} p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4`}>
      <div className="flex items-start justify-between gap-4">
        {/* Nomor dipisah ke kolom flex sendiri (bukan spasi di awal teks) supaya
            SEMUA baris lanjutan otomatis lurus di belakang teks, bukan mulai dari
            tepi kiri. Objek teks juga dibungkus agar bisa 'display: inline-block':
            tanpa itu, elemen blok tetap bisa terpotong ke tepi container. */}
        <div className="flex-1 min-w-0 flex gap-2 text-sm font-bold text-slate-900 leading-relaxed">
          <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold">{nomor}</span>
          <span dir="auto" className={`${TEKS_MULTIBARIS} inline-block flex-1 min-w-0`}>{judul}</span>
        </div>
        <div className="flex items-center space-x-1 shrink-0">
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 mr-1">
            <label className="text-[10px] text-slate-500 font-bold mr-2 uppercase">Poin:</label>
            <input
              type="number"
              defaultValue={record.poin}
              key={record.id + record.poin}
              onBlur={(e) => simpanPoin(Number(e.target.value) || 0)}
              className="w-12 text-xs border border-slate-200 rounded p-1 text-center bg-white"
            />
          </div>
          <button onClick={toggle} title="Toggle visibilitas (hidden = tidak ikut ekspor .doc)" className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
            {redup ? '🙈' : '👁'}
          </button>
          <button onClick={() => onEdit(record)} title="Edit soal" className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">✎</button>
          <button onClick={hapus} title="Hapus soal" className="p-1.5 hover:bg-rose-50 hover:text-rose-600 rounded-lg text-slate-400">🗑</button>
        </div>
      </div>
      <div className="text-xs space-y-3 pl-8">
        <IsiKartu tipe={record.tipe} data={data} />
      </div>
    </div>
  );
}

function IsiKartu({ tipe, data }: { tipe: TipeSoal; data: Record<string, unknown> }): React.JSX.Element {
  if (tipe === 'pilihan_ganda') {
    const d = data as unknown as SoalPilihanGanda;
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {(d.opsi ?? []).map((o) => {
          const benar = o.id === d.id_opsi_benar;
          return (
            <div key={o.id} className={`p-2.5 rounded-lg border flex items-start gap-2.5 ${benar ? 'border-emerald-500 bg-emerald-50/20 font-semibold' : 'border-slate-100 bg-slate-50/30'}`}>
              <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-white border text-[10px] shrink-0">{o.id}</span>
              <span className={`leading-normal ${TEKS_MULTIBARIS}`} dir="auto">{o.teks}</span>
            </div>
          );
        })}
      </div>
    );
  }
  if (tipe === 'uraian') {
    const d = data as unknown as SoalUraian;
    return (
      <div className="p-3 bg-indigo-50/20 border border-indigo-100/30 rounded-xl">
        <span className="block font-bold text-[10px] text-indigo-700 uppercase mb-1">Kunci Jawaban Singkat:</span>
        <p className={`text-slate-600 font-medium ${TEKS_MULTIBARIS}`} dir="auto">{d.jawaban_singkat}</p>
      </div>
    );
  }
  if (tipe === 'penalaran') {
    const d = data as unknown as SoalPenalaran;
    return (
      <div className="p-3 bg-indigo-50/20 border border-indigo-100/30 rounded-xl">
        <span className="block font-bold text-[10px] text-indigo-700 uppercase mb-1">Analisis Kunci Jawaban:</span>
        <p className={`text-slate-600 font-medium ${TEKS_MULTIBARIS}`} dir="auto">{d.paragraf_jawaban}</p>
      </div>
    );
  }
  const d = data as unknown as SoalProyek;
  return (
    <div>
      <p className={`text-slate-500 italic mb-2 ${TEKS_MULTIBARIS}`} dir="auto">{d.deskripsi_proyek}</p>
      <div className="p-4 bg-slate-50/50 border border-slate-100 rounded-xl">
        <span className="block font-bold text-[10px] text-slate-700 uppercase mb-2">Panduan Pelaksanaan:</span>
        <ul className="space-y-1.5">
          {(d.langkah_langkah ?? []).map((s, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="w-4 h-4 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-[9px] font-bold inline-flex items-center justify-center mt-0.5 shrink-0">{i + 1}</span>
              <span className={`text-slate-600 ${TEKS_MULTIBARIS}`} dir="auto">{s}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
