export interface OpsiModelAI {
  id: string;
  nama: string;
  stringModel: string;
  direkomendasikan?: boolean;
}

// ─── TAMBAH MODEL BARU CUKUP DI SINI (satu baris per model) ───
// Array ini adalah single source of truth: dipakai dropdown UI
// (features/pengaturan) DAN seed tabel DB `opsi_model_ai` di
// src/db/migrations/001_init_schema.sql. Jaga agar keduanya sinkron.
export const DAFTAR_MODEL: OpsiModelAI[] = [
  { id: 'gemini-3.1-flash-lite', nama: 'Gemini 3.1 Flash Lite', stringModel: 'gemini-3.1-flash-lite' },
  { id: 'gemini-3.5-flash', nama: 'Gemini 3.5 Flash', stringModel: 'gemini-3.5-flash' },
  { id: 'gemini-3.5-flash-lite', nama: 'Gemini 3.5 Flash Lite', stringModel: 'gemini-3.5-flash-lite', direkomendasikan: true },
  { id: 'gemini-3.6-flash', nama: 'Gemini 3.6 Flash', stringModel: 'gemini-3.6-flash' },
  { id: 'gemini-3.7-flash', nama: 'Gemini 3.7 Flash', stringModel: 'gemini-3.7-flash' },
  { id: 'gemini-3.8-flash', nama: 'Gemini 3.8 Flash', stringModel: 'gemini-3.8-flash' },
];

export const MODEL_DEFAULT_ID = 'gemini-3-flash';

export const API_ENDPOINT_PREFIX = 'https://generativelanguage.googleapis.com/v1beta';
export const GET_API_KEY_URL = 'https://aistudio.google.com/';

export function cariModel(id: string | null | undefined): OpsiModelAI {
  return DAFTAR_MODEL.find((m) => m.id === id) ?? DAFTAR_MODEL.find((m) => m.id === MODEL_DEFAULT_ID)!;
}
