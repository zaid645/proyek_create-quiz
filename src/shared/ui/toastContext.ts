// src/shared/ui/toastContext.ts — Konteks + tipe toast (dipisah dari komponen
// agar Toast.tsx hanya mengekspor komponen, sesuai aturan react-refresh).
import { createContext } from 'react';

export type TipeToast = 'success' | 'error' | 'info';

export const ToastContext = createContext<(pesan: string, tipe?: TipeToast) => void>(() => undefined);
