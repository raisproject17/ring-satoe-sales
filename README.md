# RING SATOE SALES — Vercel (port dari Google Apps Script)

Backend Node.js (ES modules) untuk Vercel Serverless Functions.
Database tetap spreadsheet yang sama (via Sheets API v4 + service account).

## Struktur

```
lib/config.js   <- konstanta (TAB, S2_FIELDS, S2_COLS, N_STORES, dsb) — port 00_config.gs
lib/sheets.js   <- wrapper Sheets API v4 (pengganti SpreadsheetApp)
lib/utils.js    <- utilitas + helper data bersama — port 01_utils.gs (+ helper 10_api.gs)
lib/cache.js    <- in-memory cache TTL (pengganti CacheService)
api/auth.js     <- POST {action:'login', id}
api/dashboard.js<- POST {action:'status'|'ranking'|'rekap'|'tokodash'|'tren', ...}
api/input.js    <- POST {action:'getblock'|'notif'|'notiftoko', ...}
api/save.js     <- POST {action:'save', shift, iso, kode, nik, nama, nikKasir, actuals}
api/target.js   <- POST {action:'targetget'|'targetset'|'beanspot', ...}
api/laporan.js  <- POST {action:'generate', iso, rpo, soKas}
api/admin.js    <- POST {action:'cfgget'|'cfgset'|'stores'|'lookupnik', ...}
public/         <- frontend static (index.html hasil adaptasi dari Apps Script)
```

## Setup

1. **Service account** — Google Cloud Console > IAM & Admin > Service Accounts:
   - Buat service account + key JSON.
   - Share spreadsheet `1YNNIenONWOcWq11be86xYWYbPoSfPnphfOUrJAL6PTE` ke email
     service account sebagai **Editor**.
2. **Env di Vercel** (Project > Settings > Environment Variables):
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_PRIVATE_KEY` (isi `\n` tetap sebagai backslash-n satu baris, atau
     pakai multiline — kode me-replace `\\n` jadi newline otomatis)
   - `LAPOR_CFG` (opsional, JSON — setting laporan cabang)
3. **Deploy**: hubungkan repo GitHub ini ke Vercel, atau `vercel --prod`.

## API contract (untuk frontend)

Semua endpoint terima `POST` JSON, balas JSON. Error -> HTTP 500 `{error: "pesan"}`.

| Endpoint | action | params | balas |
|---|---|---|---|
| /api/auth | login | id | {ok, role, nik, nama, kode, namaToko, s3} |
| /api/dashboard | status | iso? | {iso, tgl, shifts} |
| /api/dashboard | ranking | iso?, mode? | {iso, tgl, mode, rows} |
| /api/dashboard | rekap | iso?, mode? | {iso, tgl, mode, stores, total, byComp} |
| /api/dashboard | tokodash | kode, iso?, mode? | {kode, iso, tgl, shifts, nett, std, gm, comps} |
| /api/dashboard | tren | kode, n? | {kode, s1, s2, s3} |
| /api/input | getblock | shift, iso, kode | {exists, mode, fields/comps, targets, mine, tf} |
| /api/input | notif | nik | {ok, tgl, nowWIB, shifts} (korwil/admin) |
| /api/input | notiftoko | kode | {ok, kode, tgl, nowWIB, miss} |
| /api/save | save | shift, iso, kode, nik, nama, nikKasir, actuals | {ok, msg} |
| /api/target | targetget | nik, iso | {ok, iso, stores, psmW, pwpP, sgP} |
| /api/target | targetset | nik, iso, data | {ok} |
| /api/target | beanspot | nik, iso? | {iso, tgl, ngopi, rows} |
| /api/laporan | generate | iso, rpo, soKas | {text} atau {ok:false, missing:[...]} |
| /api/admin | cfgget | nik | {...cfg} |
| /api/admin | cfgset | nik, cfg | {ok} |
| /api/admin | stores | — | [{kode, nama, s3}] |
| /api/admin | lookupnik | nik | {nik, nama, posisi, toko} \| null |

Frontend lama memanggil via `google.script.run`; ganti jadi
`fetch('/api/<domain>', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action, ...})})`.

## Catatan porting (perbedaan perilaku vs Apps Script)

- **Write di-buffer**: `setValue`/`clearCell` ditampung lalu di-flush via
  batch (hemat kuota). Read selalu flush dulu — konsisten.
- **Validasi apiSave atomik**: bila validasi gagal, tidak ada sel tertulis
  (versi GAS bisa meninggalkan row parsial).
- **CacheService -> in-memory** per instance (cold start mengosongkan).
- **ScriptProperties LAPOR_CFG -> env `LAPOR_CFG` (JSON)** + override in-memory
  per instance via `cfgset`. Untuk persist permanen, update env di Vercel.
- **Tanggal**: WIB dihitung via offset UTC+7 (tanpa DST) — identik untuk WIB.
- Sel tanggal baru ditulis sebagai ISO `YYYY-MM-DD` (USER_ENTERED) agar
  dikenali sebagai tanggal; `parseTglID_` sudah menangani format ISO.
