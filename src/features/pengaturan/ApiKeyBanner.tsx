// src/features/pengaturan/ApiKeyBanner.tsx
// Panel merah melayang: muncul hanya jika API Key masih kosong.
// Mengarahkan user mendapatkan key gratis di Google AI Studio.
import { GET_API_KEY_URL } from '../../config/models';

export function ApiKeyBanner({ onPasang, onTutupSementara }: {
  onPasang: () => void;
  onTutupSementara: () => void;
}): React.JSX.Element {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="animasi-banner fixed top-[4.5rem] left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-2xl"
    >
      <div className="bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-2xl shadow-2xl shadow-red-600/30 border border-red-400/60 overflow-hidden">
        <div className="flex items-start gap-3 p-4 sm:p-5">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl leading-none">
            <span className="animate-pulse">⚠️</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm sm:text-base font-extrabold tracking-tight">
                API Key Belum Terpasang
              </h2>
              <button
                onClick={onTutupSementara}
                title="Sembunyikan sementara"
                aria-label="Sembunyikan peringatan API Key"
                className="shrink-0 -mt-1 -mr-1 p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition text-sm leading-none"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-red-50 leading-relaxed">
              Generator AI tidak bisa berjalan tanpa API Key. Dapatkan gratis di{' '}
              <strong>Google AI Studio</strong>, lalu tempel di Konfigurasi AI.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a
                href={GET_API_KEY_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 bg-white text-red-700 hover:bg-red-50 font-bold text-xs sm:text-sm px-3.5 py-2 rounded-xl shadow transition"
              >
                <span>🔑</span>
                <span>Dapatkan di Google AI Studio ↗</span>
              </a>
              <button
                onClick={onPasang}
                className="inline-flex items-center gap-1.5 bg-red-950/60 hover:bg-red-950/80 border border-white/30 text-white font-bold text-xs sm:text-sm px-3.5 py-2 rounded-xl transition"
              >
                Pasang Sekarang
              </button>
            </div>
          </div>
        </div>
        {/* Strip bawah sebagai penegas status */}
        <div className="bg-red-950/30 px-4 sm:px-5 py-1.5">
          <p className="text-[10px] sm:text-[11px] font-semibold text-red-100 tracking-wide">
            Tanpa API Key, tombol Generate akan selalu gagal. Key hanya tersimpan lokal di browser Anda.
          </p>
        </div>
      </div>
    </div>
  );
}
