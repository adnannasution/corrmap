# CAIS PFD — Railway Deployment Guide

## Struktur Project

```
cais-railway/
├── server.js          ← Backend Express + PostgreSQL API
├── package.json       ← Dependencies
├── railway.toml       ← Railway config
├── .env.example       ← Template environment variables
└── public/
    └── index.html     ← PFD diagram (HTML statis + API client)
```

## Cara Deploy ke Railway

### Step 1 — Persiapan

1. Pastikan sudah punya akun di [railway.app](https://railway.app)
2. Install Railway CLI (opsional):
   ```bash
   npm install -g @railway/cli
   ```

### Step 2 — Buat Project di Railway

1. Buka [railway.app](https://railway.app) → **New Project**
2. Pilih **Deploy from GitHub repo**
   - Upload folder `cais-railway` ini ke GitHub dulu
   - Atau gunakan **Empty Project** lalu push via CLI

### Step 3 — Tambah PostgreSQL

1. Di dashboard Railway project → klik **+ New**
2. Pilih **Database** → **PostgreSQL**
3. Railway otomatis set `DATABASE_URL` di environment

### Step 4 — Set Environment Variables

Di Railway project settings → **Variables**, tambahkan:
```
NODE_ENV=production
```
> `DATABASE_URL` sudah otomatis dari PostgreSQL plugin

### Step 5 — Deploy

**Via GitHub (recommended):**
1. Push ke GitHub
2. Railway auto-deploy setiap ada commit baru

**Via CLI:**
```bash
cd cais-railway
railway login
railway link        # link ke project yang sudah dibuat
railway up          # deploy
```

### Step 6 — Selesai!

Railway akan memberikan URL publik seperti:
```
https://cais-pfd-production.up.railway.app
```

Buka URL tersebut → PFD diagram langsung jalan dengan database.

---

## Cara Kerja

```
User buka URL Railway
       ↓
Browser load index.html (statis)
       ↓
JavaScript fetch GET /api/conditions
       ↓
Server query PostgreSQL → return JSON
       ↓
Browser tampilkan warna kondisi di diagram

User klik 💾 Save (di tab Visual/Corrosion/RL)
       ↓
JavaScript POST /api/conditions dengan data baru
       ↓
Server upsert ke PostgreSQL
       ↓
Semua user yang refresh akan lihat data terbaru
```

## API Endpoints

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/api/conditions` | Ambil semua kondisi |
| GET | `/api/conditions/:tag` | Ambil kondisi 1 tag |
| POST | `/api/conditions` | Simpan/update kondisi |
| DELETE | `/api/conditions/:tag` | Hapus kondisi |

## Update HTML (jika ada revisi PFD)

1. Edit tag/tipe via double-click di HTML lokal
2. Download HTML baru
3. Ganti file `public/index.html` dengan yang baru
4. Push ke GitHub → Railway auto-redeploy
5. Data kondisi di database **tidak hilang** (tersimpan di PostgreSQL)

## Offline Mode

Jika HTML dibuka sebagai file lokal (`file://`), API calls otomatis dinonaktifkan.
Data kondisi yang sudah ada di `COND` variable tetap tampil (built-in data).
