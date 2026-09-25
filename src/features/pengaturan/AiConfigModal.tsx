// src/features/pengaturan/AiConfigModal.tsx
import { useState } from 'react';
import { DAFTAR_MODEL, GET_API_KEY_URL } from '../../config/models';
import { bacaApiKey, bacaModelId, simpanApiKey } from '../../db/repositories/pengaturanRepo';
import { Modal } from '../../shared/ui/Modal';
import { useToast } from '../../shared/ui/Toast';

export function AiConfigModal({ onTutup }: { onTutup: () => void }): React.JSX.Element {
  const toast = useToast();
  const [apiKey, setApiKey] = useState(bacaApiKey());
  const [modelId, setModelId] = useState(bacaModelId());
  const [tampil, setTampil] = useState(false);

  const simpan = (): void => {
    simpanApiKey(apiKey, modelId);
    toast(apiKey.trim() ? 'Konfigurasi AI berhasil disimpan!' : 'Konfigurasi disimpan (tanpa API Key).', apiKey.trim() ? 'success' : 'info');
    onTutup();
  };

  return (
    <Modal judul="Konfigurasi Integrasi AI Gemini" onTutup={onTutup}>
      <p className="text-xs text-slate-500 leading-normal mb-5">
        Masukkan API Key gratis dari Google AI Studio untuk mengaktifkan generator soal. Key Anda disimpan aman di browser lokal (localStorage).
      </p>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">API Key Gemini Anda</label>
          <div className="relative">
            <input
              type={tampil ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-semibold"
              placeholder="AIzaSy..."
            />
            <button onClick={() => setTampil((v) => !v)} className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 text-xs">
              {tampil ? 'Sembunyikan' : 'Lihat'}
            </button>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <a href={GET_API_KEY_URL} target="_blank" rel="noreferrer" className="text-[11px] text-indigo-600 hover:underline font-bold">
              Dapatkan API Key di Google AI Studio (Gratis)
            </a>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${apiKey ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {apiKey ? 'Terpasang' : 'Belum Terpasang'}
            </span>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Model LLM Utama</label>
          <select value={modelId} onChange={(e) => setModelId(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold bg-white">
            {DAFTAR_MODEL.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nama}{m.direkomendasikan ? ' (Direkomendasikan)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
          <p className="text-xs text-amber-800 leading-normal font-medium">
            <strong>Catatan:</strong> karena batas kuota model gratisan, generator merakit 1 (satu) soal baru berkualitas per satu kali proses generate.
          </p>
        </div>
      </div>
      <div className="mt-6 flex justify-end space-x-2">
        <button onClick={onTutup} className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700">Batal</button>
        <button onClick={simpan} className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-100">Simpan Pengaturan</button>
      </div>
    </Modal>
  );
}
