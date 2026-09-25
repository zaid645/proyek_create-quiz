// src/features/generator/useGenerator.ts
// State + aksi generator diangkat ke App supaya tombol melayang (FAB) memakai
// alur yang sama dengan tombol di panel: 1 soal per panggilan API (paritas lama),
// atau loop otomatis sampai target jumlah per tipe tercapai.
import { useCallback, useRef, useState } from 'react';
import type { Proyek, ProyekFile, SoalRecord, TipeSoal } from '../../db/types';
import { bacaApiKey, bacaModelId, cariModelDariId } from './pengaturanHelper';
import { generateSoal, unduhDebugPrompt, type KonteksGenerate } from '../../services/gemini';
import { tambahSoal } from '../../db/repositories/soalRepo';
import { MAKS_TARGET_SOAL, TIPE_LABEL, hitungTipe, poinDefault, targetSoal } from '../../services/tipeSoal';
import { useToast } from '../../shared/ui/Toast';

export type ModeGenerate = 'auto' | 'satu' | 'debug';

export interface OpsiGenerator {
  proyek: Proyek | null;
  daftarFile: ProyekFile[];
  soalSemua: SoalRecord[];
  onSoalBerubah: () => void;
}

export interface HasilGenerator {
  tipe: TipeSoal;
  setTipe: (t: TipeSoal) => void;
  jumlahOpsi: number;
  setJumlahOpsi: (n: number) => void;
  materiTambahan: string;
  setMateriTambahan: (v: string) => void;
  loopAktif: boolean;
  setLoopAktif: (v: boolean) => void;
  memuat: boolean;
  detailMuat: string;
  galat: string | null;
  tutupGalat: () => void;
  jumlahPerTipe: (t: TipeSoal) => number;
  targetPerTipe: (t: TipeSoal) => number;
  sisaTarget: number;
  generate: (mode?: ModeGenerate) => Promise<void>;
  batalkan: () => void;
  unduhPromptDebug: () => void;
}

export function useGenerator({ proyek, daftarFile, soalSemua, onSoalBerubah }: OpsiGenerator): HasilGenerator {
  const toast = useToast();
  const idProyek = proyek?.id ?? null;
  const [tipe, setTipe] = useState<TipeSoal>('pilihan_ganda');
  const [jumlahOpsi, setJumlahOpsi] = useState(4);
  // Materi "sekali pakai" menyimpan id proyek pemiliknya, sehingga otomatis
  // kosong lagi saat pengguna berpindah proyek (tanpa efek/cascading render).
  const [materi, setMateri] = useState<{ idProyek: string | null; teks: string }>({ idProyek, teks: '' });
  const [loopAktif, setLoopAktif] = useState(false);
  const [memuat, setMemuat] = useState(false);
  const [detailMuat, setDetailMuat] = useState('');
  const [galat, setGalat] = useState<string | null>(null);
  const batalRef = useRef(false);

  const materiTambahan = materi.idProyek === idProyek ? materi.teks : '';
  const setMateriTambahan = useCallback((v: string) => {
    setMateri({ idProyek, teks: v });
  }, [idProyek]);

  const jumlahPerTipe = useCallback((t: TipeSoal): number => hitungTipe(soalSemua, t), [soalSemua]);

  const targetPerTipe = useCallback((t: TipeSoal): number => (proyek ? targetSoal(proyek, t) : 0), [proyek]);

  const sisaTarget = Math.max(0, targetPerTipe(tipe) - jumlahPerTipe(tipe));

  const rakitKonteks = useCallback(
    (t: TipeSoal, opsi: number, eksisting: Array<Record<string, unknown>>): KonteksGenerate | null => {
      if (!proyek) return null;
      const teksFile = daftarFile.map((f) => `--- ${f.nama_asli} ---\n${f.konten_teks ?? ''}`).join('\n\n');
      const materi = [teksFile, materiTambahan.trim()].filter(Boolean).join('\n\n');
      return {
        judul: proyek.nama_proyek,
        deskripsi: proyek.deskripsi ?? '',
        customPrompt: proyek.custom_prompt ?? '',
        tipe: t,
        jumlahOpsiPG: opsi,
        soalEksisting: eksisting,
        materiTeks: materi,
      };
    },
    [proyek, daftarFile, materiTambahan],
  );

  // Soal eksisting dikirim ke AI (paritas lama: urutan data, poin, is_hidden, id).
  const eksistingTipe = useCallback(
    (t: TipeSoal): Array<Record<string, unknown>> =>
      soalSemua
        .filter((s) => s.tipe === t)
        .map((s) => ({
          ...(JSON.parse(s.data_json) as Record<string, unknown>),
          poin: s.poin,
          is_hidden: s.is_hidden === 1,
          id: s.id,
        })),
    [soalSemua],
  );

  const unduhPromptDebug = useCallback((): void => {
    const ctx = rakitKonteks(tipe, jumlahOpsi, eksistingTipe(tipe));
    if (!ctx) {
      toast('Pilih atau buat proyek terlebih dahulu.', 'error');
      return;
    }
    unduhDebugPrompt(ctx);
    toast('Debug Prompt berhasil diunduh!', 'success');
  }, [rakitKonteks, tipe, jumlahOpsi, eksistingTipe, toast]);

  const batalkan = useCallback((): void => {
    batalRef.current = true;
  }, []);

  const generate = useCallback(
    async (mode: ModeGenerate = 'auto'): Promise<void> => {
      if (!proyek) {
        toast('Pilih atau buat proyek terlebih dahulu.', 'error');
        return;
      }
      if (mode === 'debug') {
        unduhPromptDebug();
        return;
      }
      const proyekAktif = proyek;
      let total = 1;
      if (loopAktif && mode === 'auto') {
        const target = targetPerTipe(tipe);
        // Target 0 = loop tidak diatur untuk tipe ini, jadi tetap 1 soal per klik.
        if (target > 0) {
          const kurang = target - jumlahPerTipe(tipe);
          if (kurang <= 0) {
            toast(`Target ${TIPE_LABEL[tipe]} sudah tercapai (${jumlahPerTipe(tipe)} soal).`, 'info');
            return;
          }
          total = Math.min(kurang, MAKS_TARGET_SOAL);
        }
      }
      batalRef.current = false;
      setMemuat(true);
      setDetailMuat('Exponential Backoff aktif. Mohon tunggu sebentar.');
      let sukses = 0;
      const eksisting = eksistingTipe(tipe);
      try {
        const apiKey = bacaApiKey();
        const model = cariModelDariId(bacaModelId());
        for (let i = 0; i < total; i += 1) {
          if (batalRef.current) break;
          setDetailMuat(
            total > 1
              ? `Membuat soal ${i + 1} dari ${total} — ${TIPE_LABEL[tipe]}.`
              : 'Mengolah prompt & menghubungi Gemini AI.',
          );
          const ctx = rakitKonteks(tipe, jumlahOpsi, eksisting);
          if (!ctx) return;
          const data = await generateSoal(apiKey, model, ctx, (detik) => {
            setDetailMuat(`Menghubungkan ulang... coba lagi dalam ${detik} detik (soal ${i + 1}/${total}).`);
          });
          const rec = await tambahSoal(proyekAktif.id, tipe, data, poinDefault(proyekAktif, tipe));
          eksisting.push({ ...(data as unknown as Record<string, unknown>), poin: rec.poin, is_hidden: false, id: rec.id });
          sukses += 1;
          onSoalBerubah();
        }
        if (sukses === 0 && batalRef.current) toast('Pembuatan soal dihentikan.', 'info');
        else toast(sukses === 1 ? 'Berhasil menghasilkan 1 soal baru!' : `Berhasil menghasilkan ${sukses} soal baru!`, 'success');
      } catch (err) {
        const alasan = err instanceof Error ? err.message : String(err);
        setGalat(sukses > 0 ? `${alasan}\n\n(${sukses} soal sudah tersimpan sebelum proses berhenti.)` : alasan);
      } finally {
        setMemuat(false);
      }
    },
    [proyek, tipe, jumlahOpsi, loopAktif, rakitKonteks, eksistingTipe, jumlahPerTipe, targetPerTipe, unduhPromptDebug, onSoalBerubah, toast],
  );

  return {
    tipe,
    setTipe,
    jumlahOpsi,
    setJumlahOpsi,
    materiTambahan,
    setMateriTambahan,
    loopAktif,
    setLoopAktif,
    memuat,
    detailMuat,
    galat,
    tutupGalat: () => setGalat(null),
    jumlahPerTipe,
    targetPerTipe,
    sisaTarget,
    generate,
    batalkan,
    unduhPromptDebug,
  };
}
