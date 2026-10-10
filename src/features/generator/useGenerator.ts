// src/features/generator/useGenerator.ts
// State + aksi generator diangkat ke App supaya tombol melayang (FAB) memakai
// alur yang sama dengan tombol di panel: loop otomatis memanggil AI per BATCH
// (beberapa soal sekaligus per panggilan, batas di config/generator.ts)
// sampai target jumlah per tipe tercapai.
import { useCallback, useRef, useState } from 'react';
import type { DataSoal, Proyek, ProyekFile, SoalRecord, TipeSoal } from '../../db/types';
import { bacaApiKey, bacaModelId, cariModelDariId } from './pengaturanHelper';
import { generateSoalBatch, unduhDebugPrompt, type KonteksGenerate } from '../../services/gemini';
import {
  kunciDedup,
  potongKonteksEksisting,
  ukuranBatch,
} from '../../config/generator';
import { tambahSoal } from '../../db/repositories/soalRepo';
import { MAKS_TARGET_SOAL, TIPE_LABEL, hitungTipe, poinDefault, targetSoal } from '../../services/tipeSoal';
import { useToast } from '../../shared/ui/useToast';

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
  // Ref pendamping state `memuat`: state React tidak bisa dibaca sinkron di
  // dalam callback async sehingga guard klik-ganda memakai ref ini.
  const memuatRef = useRef(false);

  const materiTambahan = materi.idProyek === idProyek ? materi.teks : '';
  const setMateriTambahan = useCallback((v: string) => {
    setMateri({ idProyek, teks: v });
  }, [idProyek]);

  const jumlahPerTipe = useCallback((t: TipeSoal): number => hitungTipe(soalSemua, t), [soalSemua]);

  const targetPerTipe = useCallback((t: TipeSoal): number => (proyek ? targetSoal(proyek, t) : 0), [proyek]);

  const sisaTarget = Math.max(0, targetPerTipe(tipe) - jumlahPerTipe(tipe));

  const rakitKonteks = useCallback(
    (t: TipeSoal, opsi: number, eksisting: Array<Record<string, unknown>>, jumlahMinta: number): KonteksGenerate | null => {
      if (!proyek) return null;
      const teksFile = daftarFile.map((f) => `--- ${f.nama_asli} ---\n${f.konten_teks ?? ''}`).join('\n\n');
      const materi = [teksFile, materiTambahan.trim()].filter(Boolean).join('\n\n');
      return {
        judul: proyek.nama_proyek,
        deskripsi: proyek.deskripsi ?? '',
        customPrompt: proyek.custom_prompt ?? '',
        tipe: t,
        jumlahOpsiPG: opsi,
        soalEksisting: potongKonteksEksisting(t, eksisting),
        materiTeks: materi,
        jumlahMinta,
        bahasa: proyek.bahasa,
        gayaTeks: proyek.gaya_teks,
      };
    },
    [proyek, daftarFile, materiTambahan],
  );

  // Soal eksisting versi RINGKAS untuk anti-duplikasi AI: hanya batang soal
  // (PG tanpa opsi/kunci, uraian/nalar tanpa jawaban, proyek hanya judul)
  // supaya payload ringan. Batas jumlah diatur di config/generator.ts.
  const eksistingTipe = useCallback(
    (t: TipeSoal): Array<Record<string, unknown>> =>
      soalSemua
        .filter((s) => s.tipe === t)
        .map((s) => {
          try {
            const data = JSON.parse(s.data_json) as Record<string, unknown>;
            if (t === 'proyek') {
              return typeof data['judul'] === 'string' ? { judul: data['judul'] } : {};
            }
            return typeof data['soal'] === 'string' ? { soal: data['soal'] } : {};
          } catch {
            return {};
          }
        }),
    [soalSemua],
  );

  // Kunci dedup seluruh soal tersimpan (untuk cek duplikat sisi klien).
  const kunciTersimpan = useCallback(
    (t: TipeSoal): Set<string> => {
      const set = new Set<string>();
      for (const s of soalSemua) {
        if (s.tipe !== t) continue;
        try {
          set.add(kunciDedup(t, JSON.parse(s.data_json) as DataSoal));
        } catch {
          // Abaikan baris korup — tidak boleh menggagalkan generate.
        }
      }
      return set;
    },
    [soalSemua],
  );

  const unduhPromptDebug = useCallback((): void => {
    // Debug memakai batch penuh tipe aktif agar terlihat persis seperti loop.
    const ctx = rakitKonteks(tipe, jumlahOpsi, eksistingTipe(tipe), ukuranBatch(tipe, 1));
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
      // Guard konkurensi: cegah klik ganda (panel + FAB) yang memakai
      // snapshot eksisting sama sehingga AI mengembalikan soal kembar.
      if (memuatRef.current) {
        toast('Generator masih berjalan, mohon tunggu...', 'info');
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
      memuatRef.current = true;
      batalRef.current = false;
      setMemuat(true);
      setDetailMuat('Exponential Backoff aktif. Mohon tunggu sebentar.');
      let sukses = 0;
      let duplikatLewat = 0;
      // Salinan lokal agar batch berikutnya sadar batch sebelumnya dalam 1 sesi.
      const eksisting = eksistingTipe(tipe);
      const kunciLihat = kunciTersimpan(tipe);
      const kunciBaru = (d: DataSoal): string => kunciDedup(tipe, d);
      const catatEksisting = (d: DataSoal): void => {
        kunciLihat.add(kunciBaru(d));
        eksisting.push(d as unknown as Record<string, unknown>);
      };
      try {
        const apiKey = bacaApiKey();
        const model = cariModelDariId(bacaModelId());
        let dibuat = 0;
        let batchKe = 0;
        while (dibuat < total) {
          if (batalRef.current) break;
          const sisa = total - dibuat;
          const minta = mode === 'satu' ? 1 : ukuranBatch(tipe, sisa);
          batchKe += 1;
          setDetailMuat(
            total > 1
              ? `Batch ${batchKe}: membuat ${minta} soal (${dibuat + 1}–${Math.min(dibuat + minta, total)} dari ${total}) — ${TIPE_LABEL[tipe]}.`
              : 'Mengolah prompt & menghubungi Gemini AI.',
          );
          const ctx = rakitKonteks(tipe, jumlahOpsi, eksisting, minta);
          if (!ctx) return;
          const hasil = await generateSoalBatch(apiKey, model, ctx, (detik) => {
            setDetailMuat(`Menghubungkan ulang... coba lagi dalam ${detik} detik (batch ${batchKe}).`);
          });
          let tersimpanBatch = 0;
          for (const data of hasil) {
            if (dibuat + tersimpanBatch >= total) break;
            // Dedup sisi klien: normalisasi lalu bandingkan dengan soal
            // tersimpan + soal baru sesi ini (+ sesama batch via kunciLihat).
            const kunci = kunciBaru(data);
            if (kunciLihat.has(kunci)) {
              duplikatLewat += 1;
              continue;
            }
            await tambahSoal(proyekAktif.id, tipe, data, poinDefault(proyekAktif, tipe));
            catatEksisting(data);
            tersimpanBatch += 1;
            sukses += 1;
            onSoalBerubah();
          }
          dibuat += tersimpanBatch;
          // Batch tanpa soal baru (semua duplikat/gagal skema parsial):
          // coba 1 batch susulan sebelum menyerah agar loop tidak macet.
          if (tersimpanBatch === 0) {
            if (batalRef.current) break;
            setDetailMuat(`Batch ${batchKe} tidak menghasilkan soal baru, mencoba variasi lain...`);
            const ctxUlang = rakitKonteks(tipe, jumlahOpsi, eksisting, minta);
            if (!ctxUlang) return;
            const ulang = await generateSoalBatch(apiKey, model, ctxUlang, (detik) => {
              setDetailMuat(`Menghubungkan ulang... coba lagi dalam ${detik} detik (batch ${batchKe} ulangan).`);
            });
            for (const data of ulang) {
              if (dibuat + tersimpanBatch >= total) break;
              const kunci = kunciBaru(data);
              if (kunciLihat.has(kunci)) {
                duplikatLewat += 1;
                continue;
              }
              await tambahSoal(proyekAktif.id, tipe, data, poinDefault(proyekAktif, tipe));
              catatEksisting(data);
              tersimpanBatch += 1;
              sukses += 1;
              onSoalBerubah();
            }
            dibuat += tersimpanBatch;
            if (tersimpanBatch === 0) {
              throw new Error(
                `AI berulang menghasilkan duplikat untuk ${TIPE_LABEL[tipe]}. ` +
                `Coba ubah materi/custom prompt atau kecilkan target.`,
              );
            }
          }
          // Kalah jumlah (AI mengembalikan < minta karena sebagian gagal
          // skema): while akan mengejar sisa di batch berikutnya.
        }
        if (sukses === 0 && batalRef.current) toast('Pembuatan soal dihentikan.', 'info');
        else {
          const infoDuplikat = duplikatLewat > 0 ? ` (${duplikatLewat} duplikat dilewati)` : '';
          toast(
            sukses === 1
              ? `Berhasil menghasilkan 1 soal baru!${infoDuplikat}`
              : `Berhasil menghasilkan ${sukses} soal baru!${infoDuplikat}`,
            'success',
          );
        }
      } catch (err) {
        const alasan = err instanceof Error ? err.message : String(err);
        setGalat(sukses > 0 ? `${alasan}\n\n(${sukses} soal sudah tersimpan sebelum proses berhenti.)` : alasan);
      } finally {
        memuatRef.current = false;
        setMemuat(false);
      }
    },
    [proyek, tipe, jumlahOpsi, loopAktif, rakitKonteks, eksistingTipe, kunciTersimpan, jumlahPerTipe, targetPerTipe, unduhPromptDebug, onSoalBerubah, toast],
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
