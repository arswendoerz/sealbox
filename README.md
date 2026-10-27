<p align="center"><img src="assets/logo-wordmark.svg" alt="Sealbox" height="80"></p>

Password manager zero-knowledge berbasis React. Semua enkripsi berjalan di browser, jadi data hanya tersimpan dalam bentuk terenkripsi.

## Status: Fase 1 (offline)

Vault tersimpan di IndexedDB browser ini. Belum ada sinkronisasi antar perangkat.

- Daftar dengan master password dan recovery key
- Buka/kunci vault, kunci otomatis setelah 5 menit tidak aktif
- Pulihkan akses dengan recovery key
- Tambah, edit, hapus, cari item; folder dan favorit
- Generator password: mode acak dan mudah diingat (passphrase bahasa Indonesia)
- Salin ke clipboard, dihapus otomatis setelah 30 detik

## Menjalankan

```bash
npm install
npm run dev
```

## Desain kriptografi

```
Master password ──PBKDF2-SHA256 (600.000 iterasi, salt acak)──► Master Key
Master Key  ──AES-GCM wrap──► Vault Key (acak, AES-256)
Recovery Key ──SHA-256──► kunci pembungkus kedua untuk Vault Key
Vault Key   ──AES-256-GCM──► setiap item
```

Kode ada di [`src/crypto/`](src/crypto). Vault Key hanya disimpan di memori dan hilang saat vault dikunci.

## Struktur

```
src/
├── crypto/      # kdf, aes, keys, generator, wordlist
├── lib/db.js    # IndexedDB (hanya data terenkripsi)
├── context/     # VaultContext: status, kunci, item
├── hooks/       # auto-lock, clipboard
├── components/  # generator, form, detail item
└── pages/       # Register, Unlock, Recover, Vault
mockup/          # mockup HTML semua layar
```

## Roadmap

1. ✅ Offline: enkripsi, vault, generator
2. Sinkronisasi Supabase dan deploy ke Cloudflare Pages
3. Export/backup, 2FA, PWA, daftar kata diceware lengkap (7.776 kata)
4. Kesehatan password dan generator pintar
5. Ekstensi browser (simpan login dan autofill)
