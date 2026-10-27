<p align="center"><img src="assets/logo-wordmark.svg" alt="Sealbox" height="80"></p>

Password manager zero-knowledge berbasis React. Semua enkripsi berjalan di browser, jadi data hanya tersimpan dalam bentuk terenkripsi.

## Status: Fase 2 (online)

Vault disinkronkan lewat Supabase, dengan salinan terenkripsi di IndexedDB untuk dibaca saat offline.

- Daftar dan masuk dengan email dan master password, plus recovery key
- Vault lokal dari Fase 1 dipindahkan otomatis saat masuk dengan email dan password yang sama
- Buka/kunci vault, kunci otomatis setelah 5 menit tidak aktif
- Pulihkan akses dengan recovery key
- Tambah, edit, hapus, cari item; folder dan favorit
- Generator password: mode acak dan mudah diingat (passphrase dari daftar EFF 7.776 kata, atau daftar contoh bahasa Indonesia)
- Salin ke clipboard, dihapus otomatis setelah 30 detik
- Backup terenkripsi: ekspor ke file `.json` dan impor kembali (dibuka dengan master password atau recovery key)
- 2FA (TOTP) dengan aplikasi authenticator, plus recovery code; ditegakkan oleh RLS di server
- PWA: bisa di-install dan dibuka offline (vault dibaca dari cache terenkripsi), tanpa aset dari CDN pihak ketiga

## Menjalankan

```bash
cp .env.example .env.local   # isi URL dan publishable key Supabase
npm install
npm run dev
```

### Menyiapkan Supabase

1. Jalankan [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), lalu [`0002_mfa.sql`](supabase/migrations/0002_mfa.sql), di **SQL Editor**.
2. **Authentication → URL Configuration**: isi *Site URL* dan *Redirect URLs* dengan alamat aplikasi (`http://localhost:5173` dan URL produksi).

### Deploy ke Cloudflare Pages

Hubungkan repo ini di Cloudflare Pages: build command `npm run build`, output `dist`, lalu isi environment variable `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY`. Header keamanan ada di [`public/_headers`](public/_headers).

## Desain kriptografi

```
salt        = SHA-256("sealbox:v1:" + email)
Master password ──PBKDF2-SHA256 (600.000 iterasi)──► HKDF ─┬─► Master Key (tidak pernah keluar dari browser)
                                                            └─► Auth Hash (dipakai sebagai password Supabase)
Master Key   ──AES-GCM wrap──► Vault Key (acak, AES-256)
Recovery Key ──SHA-256──► kunci pembungkus kedua untuk Vault Key
Vault Key    ──AES-256-GCM──► setiap item
```

Server hanya menyimpan Vault Key yang terbungkus dan item terenkripsi. Row Level Security memastikan tiap akun hanya bisa mengakses barisnya sendiri.

Kode ada di [`src/crypto/`](src/crypto). Vault Key hanya disimpan di memori dan hilang saat vault dikunci.

## Struktur

```
src/
├── crypto/      # kdf, aes, keys, generator, wordlist
├── lib/         # supabase client, IndexedDB cache (hanya data terenkripsi)
├── context/     # VaultContext: status, kunci, item
├── hooks/       # auto-lock, clipboard
├── components/  # generator, form, detail item
└── pages/       # Login, Register, Unlock, Recover, Vault
supabase/        # skema database dan RLS
mockup/          # mockup HTML semua layar
```

## Roadmap

1. ✅ Offline: enkripsi, vault, generator
2. ✅ Sinkronisasi Supabase dan deploy ke Cloudflare Pages
3. ✅ Export/backup, ✅ daftar kata diceware lengkap (EFF, 7.776 kata), ✅ PWA, ✅ 2FA
4. Kesehatan password dan generator pintar
5. Ekstensi browser (simpan login dan autofill)

## Kredit

Daftar kata passphrase bahasa Inggris: [EFF Large Wordlist](https://www.eff.org/dice) oleh Electronic Frontier Foundation, lisensi [CC BY 3.0 US](https://creativecommons.org/licenses/by/3.0/us/).
