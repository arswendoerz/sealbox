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
- Generator pintar: aturan password per item (panjang, karakter wajib/terlarang), preset seperti PIN 6 digit, dan aturan otomatis untuk 436 situs
- Riwayat item 30 hari: setiap perubahan atau penghapusan menyimpan versi sebelumnya (terenkripsi) yang bisa dipulihkan
- Kesehatan password: lemah, dipakai ulang, lama, dan cek kebocoran lewat Have I Been Pwned (k-anonymity: hanya 5 karakter awal hash SHA-1 yang dikirim)
- 2FA (TOTP) dengan aplikasi authenticator, plus recovery code; ditegakkan oleh RLS di server
- PWA: bisa di-install dan dibuka offline (vault dibaca dari cache terenkripsi), tanpa aset dari CDN pihak ketiga

## Menjalankan

```bash
cp .env.example .env.local   # isi URL dan publishable key Supabase
npm install
npm run dev
```

### Tes

```bash
npm test             # sekali jalan
npm run test:watch   # jalan ulang setiap ada perubahan
```

Tes unit (Vitest) ada di [`test/`](test): kriptografi, backup, rotasi kunci vault, aturan password, generator, cek kebocoran, dan pencocokan situs di ekstensi. Supabase dan HIBP selalu di-*mock*, jadi tes tidak menyentuh project sungguhan. GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) menjalankan tes dan kedua build di setiap push ke `main` dan setiap pull request.

### Menyiapkan Supabase

1. Jalankan [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), lalu [`0002_mfa.sql`](supabase/migrations/0002_mfa.sql), [`0003_protect_vault.sql`](supabase/migrations/0003_protect_vault.sql) dan [`0004_key_rotation.sql`](supabase/migrations/0004_key_rotation.sql), di **SQL Editor**.
2. **Authentication → URL Configuration**: isi *Site URL* dan *Redirect URLs* dengan alamat aplikasi (`http://localhost:5173` dan URL produksi).

### Deploy ke Cloudflare Pages

Hubungkan repo ini di Cloudflare Pages: build command `npm run build`, output `dist`, lalu isi environment variable `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY`. Header keamanan ada di [`public/_headers`](public/_headers).

### Ekstensi browser (Chrome, Edge, Brave)

```bash
npm run build:ext
```

Buka `chrome://extensions`, nyalakan **Developer mode**, klik **Load unpacked**, lalu pilih folder `extension/dist`. Setelah build ulang, klik ↻ pada kartu Sealbox. Ekstensi memakai `.env.local` yang sama dan login sendiri (email, master password, 2FA). Vault Key disimpan di `chrome.storage.session` (hanya di memori) dan dihapus setelah 5 menit tidak dipakai.

Autofill: ikon Sealbox muncul di kolom login; isi hanya setelah diklik. Login ditawarkan hanya untuk situs yang sama menurut *public suffix list* (`tldts`), item https tidak ditawarkan di halaman http, dan iframe dari situs lain tidak diisi.

Simpan login: setelah login atau daftar, banner menawarkan "Simpan" atau "Perbarui". Login yang menunggu disimpan di `chrome.storage.session` paling lama 3 menit dan hanya ditawarkan di situs yang sama. Jika vault terkunci, tawaran muncul di popup setelah vault dibuka.

Generator di halaman: kolom password baru (daftar, ubah password) mendapat pilihan "Buat password kuat" di menu Sealbox. Password 20 karakter mengikuti aturan situs bila dikenal, diisi ke kolom password dan konfirmasinya, dan langsung disimpan sementara (10 menit) supaya bisa disimpan dari popup walaupun pengiriman form tidak terdeteksi.

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

Mengubah materi kunci di server butuh bukti bahwa klien memegang Vault Key saat ini (server hanya menyimpan SHA-256 dari bukti itu), bukan sekadar sesi login. Pemulihan akun membuat Vault Key baru dan mengenkripsi ulang semua item serta riwayatnya, sehingga master password lama dan salinan lama kunci terbungkus tidak membuka apa pun lagi. Setiap item menyimpan versi kuncinya; perangkat yang masih memegang kunci lama ditolak saat menyimpan.

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
extension/       # ekstensi browser (MV3): popup, background, offscreen
supabase/        # skema database dan RLS
test/            # tes unit (Vitest)
mockup/          # mockup HTML semua layar
```

## Roadmap

1. ✅ Offline: enkripsi, vault, generator
2. ✅ Sinkronisasi Supabase dan deploy ke Cloudflare Pages
3. ✅ Export/backup, ✅ daftar kata diceware lengkap (EFF, 7.776 kata), ✅ PWA, ✅ 2FA
4. ✅ Kesehatan password dan generator pintar
5. Ekstensi browser: ✅ M1 popup (masuk, 2FA, cari dan salin), ✅ M2 autofill, ✅ M3 simpan login, ✅ M4 generator di halaman

## Kredit

Daftar kata passphrase bahasa Inggris: [EFF Large Wordlist](https://www.eff.org/dice) oleh Electronic Frontier Foundation, lisensi [CC BY 3.0 US](https://creativecommons.org/licenses/by/3.0/us/).

Aturan password per situs: [password-manager-resources](https://github.com/apple/password-manager-resources) oleh Apple, lisensi MIT ([salinan lisensi](src/data/apple-password-rules.LICENSE.md)).
