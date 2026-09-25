export type TipeSoal = 'pilihan_ganda' | 'uraian' | 'penalaran' | 'proyek';

export interface OpsiPG {
  id: string;
  teks: string;
}

export interface SoalPilihanGanda {
  soal: string;
  opsi: OpsiPG[];
  id_opsi_benar: string;
}

export interface SoalUraian {
  soal: string;
  jawaban_singkat: string;
}

export interface SoalPenalaran {
  soal: string;
  paragraf_jawaban: string;
}

export interface SoalProyek {
  judul: string;
  deskripsi_proyek: string;
  langkah_langkah: string[];
}

export type DataSoal = SoalPilihanGanda | SoalUraian | SoalPenalaran | SoalProyek;

export interface SoalRecord {
  id: string;
  id_proyek: string;
  tipe: TipeSoal;
  data_json: string;
  poin: number;
  is_hidden: number;
  urutan: number | null;
  dibuat_pada: string | null;
  diubah_pada: string | null;
}

export interface SoalDenganData<T extends DataSoal = DataSoal> {
  record: SoalRecord;
  data: T;
}

export interface Proyek {
  id: string;
  nama_proyek: string;
  deskripsi: string | null;
  custom_prompt: string | null;
  bahasa: string;
  gaya_teks: string;
  default_poin_pg: number;
  default_poin_uraian: number;
  default_poin_penalaran: number;
  default_poin_proyek: number;
  target_pg: number;
  target_uraian: number;
  target_penalaran: number;
  target_proyek: number;
  dibuat_pada: string | null;
  diubah_pada: string | null;
}

export interface ProyekFile {
  id: string;
  id_proyek: string;
  nama_asli: string;
  mime_type: string;
  ukuran_byte: number;
  konten_teks: string | null;
  dibuat_pada: string | null;
}

export interface StatistikSoal {
  total: number;
  pilihan_ganda: number;
  uraian: number;
  penalaran: number;
  proyek: number;
}

// Format impor/ekspor JSON — kompatibel 1:1 dengan program lama.
export interface BankSoalJSON {
  metadata: {
    judul_soal: string;
    deskripsi_soal: string;
    custom_prompt: string;
  };
  daftar_soal: {
    pilihan_ganda: Array<Record<string, unknown>>;
    uraian: Array<Record<string, unknown>>;
    penalaran: Array<Record<string, unknown>>;
    proyek: Array<Record<string, unknown>>;
  };
}
