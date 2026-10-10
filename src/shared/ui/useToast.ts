// src/shared/ui/useToast.ts — Hook toast (dipisah dari Toast.tsx agar file
// komponen hanya mengekspor komponen, sesuai aturan react-refresh).
import { useContext } from 'react';
import { ToastContext, type TipeToast } from './toastContext';

export function useToast(): (pesan: string, tipe?: TipeToast) => void {
  return useContext(ToastContext);
}
