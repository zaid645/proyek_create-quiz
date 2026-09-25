// src/shared/ui/Toast.tsx
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type TipeToast = 'success' | 'error' | 'info';

interface ToastState {
  id: number;
  pesan: string;
  tipe: TipeToast;
}

const ToastContext = createContext<(pesan: string, tipe?: TipeToast) => void>(() => undefined);

export function useToast(): (pesan: string, tipe?: TipeToast) => void {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [toast, setToast] = useState<ToastState | null>(null);

  const tampilkan = useCallback((pesan: string, tipe: TipeToast = 'info') => {
    const id = Date.now();
    setToast({ id, pesan, tipe });
    setTimeout(() => {
      setToast((t) => (t?.id === id ? null : t));
    }, 3500);
  }, []);

  const warna =
    toast?.tipe === 'success'
      ? 'bg-emerald-100 text-emerald-700'
      : toast?.tipe === 'error'
        ? 'bg-rose-100 text-rose-700'
        : 'bg-indigo-100 text-indigo-700';
  const ikon = toast?.tipe === 'success' ? '✓' : toast?.tipe === 'error' ? '✕' : 'i';

  return (
    <ToastContext.Provider value={tampilkan}>
      {children}
      <div
        className={`fixed bottom-24 right-6 z-50 transform transition-all duration-300 pointer-events-none ${
          toast ? 'translate-y-0 opacity-100' : 'translate-y-40 opacity-0'
        }`}
      >
        {toast && (
          <div className="bg-slate-900 text-white px-5 py-3 rounded-2xl flex items-center space-x-3 shadow-2xl border border-slate-800">
            <div className={`w-6 h-6 rounded-lg ${warna} flex items-center justify-center text-xs font-bold shrink-0`}>
              {ikon}
            </div>
            <p className="text-xs font-semibold pr-4">{toast.pesan}</p>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
