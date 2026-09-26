// src/features/pengaturan/useApiKeyStatus.ts
// Hook reaktif: true selama API Key masih kosong.
import { useCallback, useEffect, useState } from 'react';
import { EVENT_API_KEY_BERUBAH, apiKeyKosong } from '../../db/repositories/pengaturanRepo';

export function useApiKeyKosong(): boolean {
  const [kosong, setKosong] = useState<boolean>(() => apiKeyKosong());

  const periksa = useCallback(() => {
    setKosong(apiKeyKosong());
  }, []);

  useEffect(() => {
    window.addEventListener(EVENT_API_KEY_BERUBAH, periksa);
    window.addEventListener('storage', periksa);
    window.addEventListener('focus', periksa);
    document.addEventListener('visibilitychange', periksa);
    return () => {
      window.removeEventListener(EVENT_API_KEY_BERUBAH, periksa);
      window.removeEventListener('storage', periksa);
      window.removeEventListener('focus', periksa);
      document.removeEventListener('visibilitychange', periksa);
    };
  }, [periksa]);

  return kosong;
}
