/* Wrapper Google Sheets API v4 — pengganti SpreadsheetApp.
 * Menyediakan class Sheet dengan API mirip Apps Script (1-based row/col)
 * agar porting logika bisnis tetap faithful. Write di-buffer dan di-flush
 * via batch agar hemat kuota API; read selalu flush dulu (konsisten).
 *
 * Env yang dibutuhkan:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_PRIVATE_KEY   (escape \n bila satu baris)
 *   SPREADSHEET_ID       (opsional; default = DB_ID di lib/config.js)
 */
import { google } from 'googleapis';
import { DB_ID } from './config.js';

let sheetsClient = null;

export function getSheetsClient() {
  if (sheetsClient) return sheetsClient;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !key) {
    throw new Error('Env GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY belum diisi');
  }
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

export function spreadsheetId() {
  return process.env.SPREADSHEET_ID || DB_ID;
}

function colToLetter(col) {
  // 1-based -> 'A', 'Z', 'AA', ...
  let s = '';
  while (col > 0) {
    const m = (col - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    col = Math.floor((col - 1) / 26);
  }
  return s;
}

function quoted(name) {
  return `'${String(name).replace(/'/g, "''")}'`;
}

function normValue(v) {
  // Samakan perilaku setValue(Date) ala Apps Script -> tulis ISO agar
  // Sheets mengenali sebagai tanggal (valueInputOption USER_ENTERED).
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getFullYear(), m = v.getMonth() + 1, d = v.getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return v;
}

class Sheet {
  constructor(spreadsheet, name) {
    this.spreadsheet = spreadsheet;
    this.name = name;
    this._updates = new Map(); // "r,c" -> value
    this._clears = new Set();  // "r,c"
    this._sheetId = null;
  }

  _a1(r, c, nr, nc) {
    const c1 = colToLetter(c), c2 = colToLetter(c + nc - 1);
    if (nr === 1 && nc === 1) return `${quoted(this.name)}!${c1}${r}`;
    return `${quoted(this.name)}!${c1}${r}:${c2}${r + nr - 1}`;
  }

  async _sheetId_() {
    if (this._sheetId !== null) return this._sheetId;
    const meta = await getSheetsClient().spreadsheets.get({
      spreadsheetId: this.spreadsheet.id,
      fields: 'sheets.properties(sheetId,title)',
    });
    for (const sh of meta.data.sheets || []) {
      if (sh.properties.title === this.name) { this._sheetId = sh.properties.sheetId; break; }
    }
    if (this._sheetId === null) throw new Error(`Sheet tidak ketemu: ${this.name}`);
    return this._sheetId;
  }

  /** Terapkan semua write yang di-buffer (dipanggil otomatis sebelum read). */
  async flush() {
    if (this._updates.size === 0 && this._clears.size === 0) return;
    const api = getSheetsClient();
    const sid = this.spreadsheet.id;
    if (this._updates.size) {
      const data = [];
      for (const [k, v] of this._updates) {
        const [r, c] = k.split(',').map(Number);
        data.push({ range: this._a1(r, c, 1, 1), values: [[normValue(v)]] });
      }
      await api.spreadsheets.values.batchUpdate({
        spreadsheetId: sid,
        requestBody: { valueInputOption: 'USER_ENTERED', data },
      });
      this._updates.clear();
    }
    if (this._clears.size) {
      const ranges = [];
      for (const k of this._clears) {
        const [r, c] = k.split(',').map(Number);
        ranges.push(this._a1(r, c, 1, 1));
      }
      await api.spreadsheets.values.batchClear({ spreadsheetId: sid, requestBody: { ranges } });
      this._clears.clear();
    }
  }

  // ---------- read (1-based, seperti Range Apps Script) ----------
  async getValues(r, c, nr, nc) {
    await this.flush();
    const res = await getSheetsClient().spreadsheets.values.get({
      spreadsheetId: this.spreadsheet.id,
      range: this._a1(r, c, nr, nc),
      valueRenderOption: 'FORMATTED_VALUE',
    });
    const vals = res.data.values || [];
    // Pad seperti getValues() Apps Script: selalu nr x nc
    const out = [];
    for (let i = 0; i < nr; i++) {
      const row = vals[i] || [];
      const rr = [];
      for (let j = 0; j < nc; j++) rr.push(row[j] !== undefined ? row[j] : '');
      out.push(rr);
    }
    return out;
  }

  async getValue(r, c) {
    const v = await this.getValues(r, c, 1, 1);
    return v[0][0];
  }

  /** TRUE bila sel berisi formula (untuk logika "jangan timpa formula"). */
  async hasFormula(r, c) {
    const f = await this.getFormulaFlags(r, c, 1, 1);
    return f[0][0];
  }

  /** Matriks boolean: TRUE bila sel berisi formula. 1 panggilan API untuk blok. */
  async getFormulaFlags(r, c, nr, nc) {
    await this.flush();
    const res = await getSheetsClient().spreadsheets.values.get({
      spreadsheetId: this.spreadsheet.id,
      range: this._a1(r, c, nr, nc),
      valueRenderOption: 'FORMULA',
    });
    const vals = res.data.values || [];
    const out = [];
    for (let i = 0; i < nr; i++) {
      const row = vals[i] || [];
      const rr = [];
      for (let j = 0; j < nc; j++) {
        const cell = row[j];
        rr.push(typeof cell === 'string' && cell.startsWith('='));
      }
      out.push(rr);
    }
    return out;
  }

  /** Nilai kolom (1 kolom penuh) sebagai array — untuk findBlockRow_/getAllBlocks_. */
  async getColumnValues(c) {
    await this.flush();
    const res = await getSheetsClient().spreadsheets.values.get({
      spreadsheetId: this.spreadsheet.id,
      range: `${quoted(this.name)}!${colToLetter(c)}:${colToLetter(c)}`,
      valueRenderOption: 'FORMATTED_VALUE',
    });
    return (res.data.values || []).map((row) => (row[0] !== undefined ? row[0] : ''));
  }

  async getLastRow() {
    const col = await this.getColumnValues(1);
    let last = 0;
    for (let i = 0; i < col.length; i++) {
      if (String(col[i] || '').trim() !== '') last = i + 1;
    }
    return last;
  }

  async getMaxRows() {
    const meta = await getSheetsClient().spreadsheets.get({
      spreadsheetId: this.spreadsheet.id,
      fields: 'sheets.properties(title,gridProperties.rowCount)',
    });
    for (const sh of meta.data.sheets || []) {
      if (sh.properties.title === this.name) return sh.properties.gridProperties.rowCount;
    }
    throw new Error(`Sheet tidak ketemu: ${this.name}`);
  }

  // ---------- write (di-buffer; panggil flush() / otomatis saat read) ----------
  setValue(r, c, v) {
    const k = `${r},${c}`;
    this._clears.delete(k);
    this._updates.set(k, v);
  }

  clearCell(r, c) {
    const k = `${r},${c}`;
    this._updates.delete(k);
    this._clears.add(k);
  }

  // ---------- operasi struktural ----------
  /** Salin blok (nilai+formula+format) — pengganti Range.copyTo. */
  async copyBlock(srcRow, numRows, numCols, destRow) {
    await this.flush();
    const sheetId = await this._sheetId_();
    await getSheetsClient().spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheet.id,
      requestBody: {
        requests: [{
          copyPaste: {
            source: {
              sheetId,
              startRowIndex: srcRow - 1, endRowIndex: srcRow - 1 + numRows,
              startColumnIndex: 0, endColumnIndex: numCols,
            },
            destination: {
              sheetId,
              startRowIndex: destRow - 1, endRowIndex: destRow - 1 + numRows,
              startColumnIndex: 0, endColumnIndex: numCols,
            },
            pasteType: 'PASTE_NORMAL',
          },
        }],
      },
    });
  }

  async insertRowsAfter(row, n) {
    await this.flush();
    // Sheets API otomatis expand grid saat tulis/copy ke baris baru,
    // jadi insert hanya optimasi. Jika sheet terproteksi, insertDimension
    // ditolak ("protected cell") — abaikan dan lanjutkan (auto-expand).
    try {
      const sheetId = await this._sheetId_();
      await getSheetsClient().spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheet.id,
        requestBody: {
          requests: [{
            insertDimension: {
              range: { sheetId, dimension: 'ROWS', startIndex: row, endIndex: row + n },
              inheritFromBefore: true,
            },
          }],
        },
      });
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/protected/i.test(msg)) return; // proteksi: lanjutkan via auto-expand
      throw e;
    }
  }
}

class Spreadsheet {
  constructor(id) {
    this.id = id;
    this._sheets = new Map();
  }
  getSheetByName(name) {
    if (!this._sheets.has(name)) this._sheets.set(name, new Sheet(this, name));
    return this._sheets.get(name);
  }
  async flushAll() {
    for (const sh of this._sheets.values()) await sh.flush();
  }
}

/** Pengganti getDb_() di Apps Script. */
export function getDb() {
  return new Spreadsheet(spreadsheetId());
}

/** Pengganti SpreadsheetApp.flush() — flush semua buffer sheet yang terbuka. */
const openSpreadsheets = new Set();
export function trackSpreadsheet(ss) {
  openSpreadsheets.add(ss);
  return ss;
}
export async function flushAll() {
  for (const ss of openSpreadsheets) await ss.flushAll();
}
