// src/features/soal/QuestionCard.tsx — kartu 1 soal + kontrol poin/visibility/edit/hapus.
import { useRef } from 'react';
import type { SoalPenalaran, SoalPilihanGanda, SoalProyek, SoalRecord, SoalUraian, TipeSoal } from '../../db/types';
import { hapusSoal, ubahPoin, ubahVisibilitas } from '../../db/repositories/soalRepo';
import type { PosisiLepas } from '../../services/urutan';
import { barisPertama } from '../../services/tampilanSoal';
import { TEKS_MULTIBARIS } from '../../services/teks';

// Kendali sortir (drag & drop) yang diorkestrasi SoalDashboard.
// `aktif` = sortir tersedia (tab berisi satu tipe, isi >= 2);
// `adaSeret` = sebuah kartu SEDANG diseret (kartu lain jadi target jatuh);
// `sedangDiseret` = kartu ini yang diseret;
// `posisiLepas` = garis sisip yang tampil di kartu ini ('atas'/'bawah').
export type KendaliSortir = {
  aktif: boolean;
  adaSeret: boolean;
  sedangDiseret: boolean;
  posisiLepas: PosisiLepas | null;
  bisaNaik: boolean;
  bisaTurun: boolean;
  onMulaiSeret: () => void;
  onSelesaiSeret: () => void;
  onSeretDiAtas: (posisi: PosisiLepas) => void;
  // Posisi dilewatkan eksplisit dari event drop (bukan dibaca dari state
  // `targetJatuh`): update state hasil dragover terakhir bisa belum ter-flush
  // saat drop menyala beruntun, sehingga baca-state di sini akan basi.
  onJatuhkan: (posisi: PosisiLepas) => void;
  onPindahKeyboard: (arah: 'naik' | 'turun') => void;
};

export function QuestionCard({
  record,
  nomor,
  onBerubah,
  onEdit,
  sortir,
  ringkas,
  onToggleRingkas,
}: {
  record: SoalRecord;
  nomor: number;
  onBerubah: () => void;
  onEdit: (record: SoalRecord) => void;
  sortir?: KendaliSortir;
  // Mode ringkas/detail. Status HANYA di RAM milik SoalDashboard (tidak ke DB).
  ringkas: boolean;
  onToggleRingkas: () => void;
}): React.JSX.Element {
  const data = JSON.parse(record.data_json) as Record<string, unknown>;
  const redup = record.is_hidden === 1;

  const judul = record.tipe === 'proyek' ? String((data as unknown as SoalProyek).judul) : String(data['soal'] ?? '');

  const kartuRef = useRef<HTMLDivElement>(null);
  const s = sortir;
  // Kartu ini boleh menerima drop bila: sortir aktif, ADA seretan berjalan,
  // dan yang diseret BUKAN dirinya sendiri (kartu sumber tidak jadi target).
  const terimaJatuh = s !== undefined && s.aktif && s.adaSeret && !s.sedangDiseret;

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
    <div
      ref={kartuRef}
      data-kartu-soal={record.id}
      onDragOver={(e) => {
        if (!terimaJatuh || !s) return;
        // preventDefault WAJIB agar event drop bisa menyala.
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        // Posisi sisip ditentukan dari separuh kartu yang di-hover — jadi user
        // bisa menjatuhkan tepat sebelum ATAU sesudah soal target, termasuk
        // paling awal dan paling akhir daftar.
        const r = e.currentTarget.getBoundingClientRect();
        s.onSeretDiAtas(e.clientY < r.top + r.height / 2 ? 'atas' : 'bawah');
      }}
      onDrop={(e) => {
        if (!terimaJatuh || !s) return;
        e.preventDefault();
        // Hitung posisi dari event drop ini sendiri — jangan andalkan state
        // `posisiLepas` dari dragover terakhir yang mungkin belum ter-render.
        const r = e.currentTarget.getBoundingClientRect();
        s.onJatuhkan(e.clientY < r.top + r.height / 2 ? 'atas' : 'bawah');
      }}
      className={`relative ${redup ? 'opacity-50 bg-slate-50' : 'bg-white'} ${s?.sedangDiseret ? 'opacity-40' : ''} ${ringkas ? 'px-4 py-2.5' : 'p-5'} rounded-2xl border border-slate-200 shadow-sm space-y-4`}
    >
      {s?.posisiLepas === 'atas' && (
        <span aria-hidden className="absolute -top-2 left-4 right-4 h-1 rounded-full bg-indigo-500" />
      )}
      <div className="flex items-start justify-between gap-4">
        {/* Nomor dipisah ke kolom flex sendiri (bukan spasi di awal teks) supaya
            SEMUA baris lanjutan otomatis lurus di belakang teks, bukan mulai dari
            tepi kiri. Objek teks juga dibungkus agar bisa 'display: inline-block':
            tanpa itu, elemen blok tetap bisa terpotong ke tepi container. */}
        <div className="flex-1 min-w-0 flex gap-1 items-start text-sm font-bold text-slate-900 leading-relaxed">
          {s?.aktif === true && (
            <button
              type="button"
              draggable
              onDragStart={(e) => {
                // Hanya handle yang draggable (bukan seluruh kartu) supaya teks
                // soal tetap bisa di-block/di-copy dengan mouse seperti biasa.
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', record.id);
                // Preview seret = seluruh kartu, bukan cuma handle-nya.
                if (kartuRef.current) e.dataTransfer.setDragImage(kartuRef.current, 24, 24);
                s.onMulaiSeret();
              }}
              onDragEnd={() => s.onSelesaiSeret()}
              onKeyDown={(e) => {
                // Jalur keyboard: fokuskan handle lalu Alt+↑ / Alt+↓.
                if (!e.altKey) return;
                if (e.key === 'ArrowUp') { e.preventDefault(); s.onPindahKeyboard('naik'); }
                else if (e.key === 'ArrowDown') { e.preventDefault(); s.onPindahKeyboard('turun'); }
              }}
              title="Tarik untuk menyortir (atau fokus lalu Alt+↑ / Alt+↓)"
              aria-label={`Pindahkan soal nomor ${nomor}`}
              className="shrink-0 mt-0.5 px-0.5 cursor-grab active:cursor-grabbing text-slate-300 hover:text-indigo-500 rounded leading-none disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ⠿
            </button>
          )}
          {/* Tombol nomor = toggle ringkas/detail. Sengaja dipakai supaya tidak
              menambah UI: klik/Enter untuk buka-tutup kartu. */}
          <button
            type="button"
            onClick={onToggleRingkas}
            title={ringkas ? 'Buka detail soal' : 'Ringkas soal (tutup detail)'}
            aria-label={`${ringkas ? 'Buka detail' : 'Ringkas'} soal nomor ${nomor}`}
            aria-expanded={!ringkas}
            data-tombol-nomor={record.id}
            className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold cursor-pointer hover:bg-indigo-100 hover:ring-2 hover:ring-indigo-200 transition"
          >
            {nomor}
          </button>
          {/* Mode ringkas: HANYA baris pertama soal (truncate). `barisPertama`
              memotong eksplisit di `\n` pertama karena CSS truncate saja tidak
              cukup untuk teks multibaris (baris lanjutan ikut tampil). */}
          <span dir="auto" className={`${ringkas ? 'truncate whitespace-nowrap' : TEKS_MULTIBARIS} inline-block flex-1 min-w-0`} title={ringkas ? barisPertama(judul) : undefined}>{ringkas ? barisPertama(judul) : judul}</span>
        </div>
        <div className="flex items-center space-x-1 shrink-0">
          {/* Mode ringkas: cuma tombol hide/edit/hapus (tanpa input poin). */}
          {!ringkas && (
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
          )}
          <button onClick={toggle} title="Toggle visibilitas (hidden = tidak ikut ekspor .doc)" className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
            {redup ? '🙈' : '👁'}
          </button>
          <button onClick={() => onEdit(record)} title="Edit soal" className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">✎</button>
          <button onClick={hapus} title="Hapus soal" className="p-1.5 hover:bg-rose-50 hover:text-rose-600 rounded-lg text-slate-400">🗑</button>
        </div>
      </div>
      {!ringkas && (
        <div className="text-xs space-y-3 pl-8">
          <IsiKartu tipe={record.tipe} data={data} />
        </div>
      )}
      {s?.posisiLepas === 'bawah' && (
        <span aria-hidden className="absolute -bottom-2 left-4 right-4 h-1 rounded-full bg-indigo-500" />
      )}
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
