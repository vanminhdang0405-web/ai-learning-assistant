// DOCX/TXT chạy trong tiến trình riêng, giới hạn bộ nhớ và thời gian ở tiến trình cha.
const { TextDecoder } = require('node:util');
const MAX_TEXT = 1000000;
const MAX_EXPANDED = 25 * 1024 * 1024;
const error = code => Object.assign(new Error(code), { code });

function decodeText(buffer) {
  let encoding = 'utf-8';
  if (buffer[0] === 0xff && buffer[1] === 0xfe) encoding = 'utf-16le';
  if (buffer[0] === 0xfe && buffer[1] === 0xff) encoding = 'utf-16be';
  let text;
  try { text = new TextDecoder(encoding, { fatal: true }).decode(buffer); }
  catch { throw error('TEXT_ENCODING'); }
  if (/[\x00-\x08\x0b\x0e-\x1f\x7f]/.test(text)) throw error('INVALID_TEXT');
  return text;
}

// Đọc lần lượt từng entry, kiểm tra kích thước thực tế trước khi đưa vào Mammoth.
function validateDocx(buffer) {
  const yauzl = require('yauzl');
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (err, zip) => {
      if (err) return reject(error('INVALID_DOCX'));
      let settled = false;
      let count = 0;
      let declared = 0;
      let actual = 0;
      let stream;
      const names = new Set();
      const fail = code => {
        if (settled) return;
        settled = true;
        stream?.destroy();
        zip.close();
        reject(error(code));
      };
      zip.on('error', () => fail('INVALID_DOCX'));
      zip.on('entry', entry => {
        if (settled) return;
        count++;
        declared += entry.uncompressedSize;
        if (count > 2000 || declared > MAX_EXPANDED) return fail('DOCX_LIMIT');
        if (names.has(entry.fileName) || (entry.generalPurposeBitFlag & 1)) return fail('INVALID_DOCX');
        names.add(entry.fileName);
        if (entry.fileName.endsWith('/')) return zip.readEntry();
        zip.openReadStream(entry, (readError, opened) => {
          if (readError) return fail('INVALID_DOCX');
          stream = opened;
          opened.on('error', () => fail('INVALID_DOCX'));
          opened.on('data', chunk => {
            actual += chunk.length;
            if (actual > MAX_EXPANDED) fail('DOCX_LIMIT');
          });
          opened.on('end', () => { if (!settled) zip.readEntry(); });
        });
      });
      zip.on('end', () => {
        if (settled) return;
        if (!names.has('[Content_Types].xml') || !names.has('word/document.xml')) return fail('INVALID_DOCX');
        settled = true;
        resolve();
      });
      zip.readEntry();
    });
  });
}

async function run(content, extension) {
  const buffer = Buffer.from(content);
  let text;
  if (extension === 'txt') {
    text = decodeText(buffer);
  } else if (extension === 'docx') {
    await validateDocx(buffer);
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer }, { externalFileAccess: false });
    if (result.messages?.some(message => message.type === 'error')) throw error('INVALID_DOCX');
    text = result.value;
  } else {
    throw error('INVALID_TEXT');
  }
  text = text.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim();
  if (text.length > MAX_TEXT) throw error('TEXT_LIMIT');
  // Chia phần để màn hình mobile không phải dựng một Text khổng lồ.
  // Đây là đơn vị đọc nội bộ, không phải trang hoặc chương của file gốc.
  const pages = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + 8000, text.length);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf('\n', end - 1), text.lastIndexOf(' ', end - 1));
      if (boundary > start + 4000) end = boundary + 1;
      if (/^[\uDC00-\uDFFF]$/.test(text[end])) end--;
    }
    const part = text.slice(start, end);
    pages.push({ pageNumber: pages.length + 1, text: part, charCount: part.length });
    start = end;
  }
  if (!pages.length) pages.push({ pageNumber: 1, text: '', charCount: 0 });
  return {
    status: text ? 'ready' : 'no_text', pageCount: pages.length, charCount: text.length,
    parserVersion: extension === 'docx' ? 'mammoth-raw-text-v1' : 'txt-unicode-v1',
    pages,
  };
}

process.once('message', async message => {
  let reply;
  try {
    if (message?.type !== 'office-text-input') throw error('INVALID_TEXT');
    reply = { type: 'office-text-result', ok: true, result: await run(message.content, message.extension) };
  } catch (err) {
    reply = { type: 'office-text-result', ok: false,
      code: err.code === 'MODULE_NOT_FOUND' ? 'PARSER_MISSING' : err.code || 'INVALID_DOCX' };
  }
  if (process.connected) process.send(reply, err => {
    if (err) process.exitCode = 1;
    if (process.connected) process.disconnect();
  });
});
