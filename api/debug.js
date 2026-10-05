/* DEBUG sementara: dump raw baris SHIFT2# dengan huruf kolom. HAPUS setelah dipakai. */
import { getDb_ } from '../lib/utils.js';
import { TAB, S2_WIDTH } from '../lib/config.js';

function colName(i) {
  let n = '', x = i;
  do { n = String.fromCharCode(65 + (x % 26)) + n; x = Math.floor(x / 26) - 1; } while (x >= 0);
  return n;
}

export default async function handler(req, res) {
  try {
    const { iso, kode, action } = req.body || req.query || {};
    if (!iso) return res.status(400).json({ error: 'iso required (YYYY-MM-DD)' });
    const sh = getDb_().getSheetByName(TAB.S2);
    // Cari blok tanggal: scan kolom A
    const colA = await sh.getValues(1, 1, 500, 1);
    let dateRow = -1;
    for (let r = 0; r < colA.length; r++) {
      const v = String(colA[r][0] || '').trim();
      if (v.includes(iso.slice(8, 10)) && v.includes(iso.slice(0, 4))) { dateRow = r + 1; break; }
    }
    if (dateRow < 0) return res.json({ error: 'blok tanggal tidak ketemu', iso });

    // ACTION: clear = hapus data tgl tsb (kecuali kolom A,B), biar user input ulang
    if (action === 'clear') {
      const N_STORES = 20;
      for (let i = 0; i < N_STORES; i++) {
        const r = dateRow + 3 + i;
        // Clear C..CI (idx 2..86), sisakan A (kode) dan B (nama toko)
        for (let c = 2; c < S2_WIDTH; c++) {
          await sh.clearCell(r, c + 1);
        }
      }
      await sh.flush();
      return res.json({ ok: true, cleared: iso, dateRow });
    }
    // Baca header (3 baris pertama blok) + cari baris toko
    const head = await sh.getValues(dateRow, 1, 3, S2_WIDTH);
    const stores = await sh.getValues(dateRow + 3, 1, 25, S2_WIDTH);
    let targetRow = -1, targetIdx = -1;
    stores.forEach((r, i) => {
      if (String(r[0] || '').trim().toUpperCase() === String(kode || '').toUpperCase()) {
        targetRow = dateRow + 3 + i; targetIdx = i;
      }
    });
    const out = { iso, dateRow, targetRow, kode };
    // Header: tampilkan yang terisi saja
    out.header = [];
    head.forEach((hr, hi) => {
      hr.forEach((v, ci) => {
        if (v !== '' && v !== undefined && v !== null)
          out.header.push({ row: dateRow + hi, col: colName(ci), idx: ci, val: String(v).slice(0, 40) });
      });
    });
    // Data toko: tampilkan yang terisi saja
    if (targetIdx >= 0) {
      out.data = [];
      stores[targetIdx].forEach((v, ci) => {
        if (v !== '' && v !== undefined && v !== null)
          out.data.push({ col: colName(ci), idx: ci, val: v });
      });
    } else {
      out.storeList = stores.map(r => String(r[0] || '').trim()).filter(Boolean);
    }
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
