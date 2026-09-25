// src/shared/ui/Modal.tsx — modal generik + dialog error/konfirmasi.
import type { ReactNode } from 'react';

export function Modal({
  judul,
  onTutup,
  children,
  lebar = 'max-w-lg',
}: {
  judul: ReactNode;
  onTutup: () => void;
  children: ReactNode;
  lebar?: string;
}): React.JSX.Element {
  return (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={onTutup}>
      <div
        className={`bg-white rounded-3xl ${lebar} w-full p-6 shadow-2xl relative border border-slate-100 my-8`}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onTutup} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-2" aria-label="Tutup">
          ✕
        </button>
        <h3 className="text-lg font-bold text-slate-900 mb-4 pr-8">{judul}</h3>
        {children}
      </div>
    </div>
  );
}

export function ErrorModal({ pesan, onTutup }: { pesan: string; onTutup: () => void }): React.JSX.Element {
  return (
    <Modal judul="Operasi Gagal / Eror" onTutup={onTutup} lebar="max-w-md">
      <div className="space-y-4">
        <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto text-xl font-bold">
          !
        </div>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed whitespace-pre-wrap text-center">{pesan}</p>
        <button onClick={onTutup} className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800">
          Tutup Notifikasi
        </button>
      </div>
    </Modal>
  );
}

export function ConfirmModal({
  judul,
  deskripsi,
  teksAksi = 'Hapus',
  onBatal,
  onKonfirmasi,
}: {
  judul: string;
  deskripsi: string;
  teksAksi?: string;
  onBatal: () => void;
  onKonfirmasi: () => void;
}): React.JSX.Element {
  return (
    <Modal judul={judul} onTutup={onBatal} lebar="max-w-md">
      <p className="text-sm text-slate-500 leading-relaxed">{deskripsi}</p>
      <div className="mt-6 flex justify-end space-x-2">
        <button onClick={onBatal} className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700">
          Batal
        </button>
        <button onClick={onKonfirmasi} className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white">
          {teksAksi}
        </button>
      </div>
    </Modal>
  );
}

export function LoadingOverlay({ detail, onBatal }: { detail: string; onBatal?: () => void }): React.JSX.Element {
  return (
    <div className="fixed inset-0 bg-slate-900/60 flex flex-col items-center justify-center z-50">
      <div className="bg-white p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl border border-slate-100 space-y-4 mx-4">
        <div className="relative w-16 h-16 mx-auto">
          <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
          <div className="absolute inset-0 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin" />
        </div>
        <div>
          <h4 className="text-base font-bold text-slate-900">Merakit Soal Otomatis...</h4>
          <p className="text-xs text-slate-400 mt-1">Mengolah prompt &amp; menghubungi Gemini AI.</p>
        </div>
        <div className="p-3 bg-indigo-50/50 rounded-xl">
          <p className="text-[10px] text-indigo-700 font-semibold leading-normal">{detail}</p>
        </div>
        {onBatal && (
          <button
            onClick={onBatal}
            className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
          >
            Hentikan Setelah Soal Ini
          </button>
        )}
      </div>
    </div>
  );
}
