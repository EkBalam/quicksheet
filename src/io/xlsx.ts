import { colLettersToIndex } from '../grid/addr';

export interface ImportedCell {
  col: number;
  row: number;
  raw: string;
  /** Cached value from the file, used if the imported formula can't be evaluated here. */
  fallback?: string;
}

// ---- Minimal ZIP reader (xlsx is a zip of XML files) ----

interface ZipEntry {
  method: number;
  compSize: number;
  dataStart: number;
}

function readZipDirectory(view: DataView, bytes: Uint8Array): Map<string, ZipEntry> {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('No es un archivo .xlsx válido.');

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const entries = new Map<string, ZipEntry>();

  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    entries.set(name, { method, compSize, dataStart: localOffset + 30 + localNameLen + localExtraLen });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readEntryText(
  bytes: Uint8Array,
  entries: Map<string, ZipEntry>,
  name: string,
): Promise<string | null> {
  const e = entries.get(name);
  if (!e) return null;
  const raw = bytes.subarray(e.dataStart, e.dataStart + e.compSize);
  if (e.method === 0) return new TextDecoder().decode(raw);
  if (e.method === 8) return new TextDecoder().decode(await inflateRaw(raw));
  throw new Error('Compresión de .xlsx no soportada.');
}

// ---- XLSX parsing ----

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xml');
}

function byTag(root: Document | Element, name: string): Element[] {
  return Array.from(root.getElementsByTagNameNS('*', name));
}

function firstChildNamed(el: Element, name: string): Element | undefined {
  return Array.from(el.children).find((c) => c.localName === name);
}

/** Text of an <si> / <is> node: all <t> runs, skipping phonetic hints (<rPh>). */
function richText(node: Element): string {
  return byTag(node, 't')
    .filter((t) => t.parentElement?.localName !== 'rPh')
    .map((t) => t.textContent ?? '')
    .join('');
}

function resolveTarget(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

async function findFirstSheetPath(bytes: Uint8Array, entries: Map<string, ZipEntry>): Promise<string> {
  const wb = await readEntryText(bytes, entries, 'xl/workbook.xml');
  const rels = await readEntryText(bytes, entries, 'xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const sheet = byTag(parseXml(wb), 'sheet')[0];
    const rid = sheet?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const rel = byTag(parseXml(rels), 'Relationship').find((r) => r.getAttribute('Id') === rid);
    const target = rel?.getAttribute('Target');
    if (target) return resolveTarget('xl/workbook.xml', target);
  }
  const fallback = Array.from(entries.keys()).find((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k));
  if (!fallback) throw new Error('El archivo .xlsx no contiene hojas.');
  return fallback;
}

export async function parseXlsx(buf: ArrayBuffer): Promise<ImportedCell[]> {
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  const entries = readZipDirectory(view, bytes);

  const sstText = await readEntryText(bytes, entries, 'xl/sharedStrings.xml');
  const shared = sstText ? byTag(parseXml(sstText), 'si').map(richText) : [];

  const sheetPath = await findFirstSheetPath(bytes, entries);
  const sheetText = await readEntryText(bytes, entries, sheetPath);
  if (!sheetText) throw new Error('No se pudo leer la primera hoja del .xlsx.');

  const out: ImportedCell[] = [];
  for (const c of byTag(parseXml(sheetText), 'c')) {
    const ref = c.getAttribute('r')?.match(/^([A-Za-z]+)(\d+)$/);
    if (!ref) continue;
    const col = colLettersToIndex(ref[1]);
    const row = parseInt(ref[2], 10);

    const type = c.getAttribute('t');
    const vEl = firstChildNamed(c, 'v');
    const fEl = firstChildNamed(c, 'f');
    const isEl = firstChildNamed(c, 'is');
    const vText = vEl?.textContent ?? '';

    let value: string;
    if (type === 's') value = shared[parseInt(vText, 10)] ?? '';
    else if (type === 'inlineStr' && isEl) value = richText(isEl);
    else if (type === 'b') value = vText === '1' ? 'VERDADERO' : 'FALSO';
    else value = vText;

    const formula = fEl?.textContent?.trim();
    if (formula) {
      out.push({ col, row, raw: '=' + formula, fallback: value });
    } else if (value !== '') {
      out.push({ col, row, raw: value.trim() });
    }
  }
  return out;
}
