const { parentPort, workerData } = require('node:worker_threads');

async function run() {
  let parser;
  try {
    const { PDFParse } = require('pdf-parse');
    parser = new PDFParse({
      data: new Uint8Array(workerData.content),
      verbosity: 0,
      isEvalSupported: false,
    });
    const info = await parser.getInfo();
    if (!Number.isInteger(info.total) || info.total < 1) {
      throw Object.assign(new Error(), { code: 'INVALID_PDF' });
    }
    if (info.total > 200) {
      throw Object.assign(new Error(), { code: 'PAGE_LIMIT' });
    }

    const result = await parser.getText({ pageJoiner: '' });
    if (result.pages.length !== info.total) {
      throw Object.assign(new Error(), { code: 'INVALID_PDF' });
    }
    let charCount = 0;
    const pages = result.pages.map((page, index) => {
      if (page.num !== index + 1) {
        throw Object.assign(new Error(), { code: 'INVALID_PDF' });
      }
      const text = page.text.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim();
      charCount += text.length;
      if (charCount > 1000000) {
        throw Object.assign(new Error(), { code: 'TEXT_LIMIT' });
      }
      return { pageNumber: page.num, text, charCount: text.length };
    });
    const pagesWithoutText = pages.filter((page) => !page.text.trim()).map((page) => page.pageNumber);
    const status = pagesWithoutText.length === pages.length
      ? 'no_text'
      : pagesWithoutText.length > 0 ? 'partial' : 'ready';

    parentPort.postMessage({
      type: 'pdf-text-result',
      ok: true,
      result: {
        status,
        pageCount: info.total,
        charCount,
        parserVersion: 'pdf-parse@2.4.5',
        pages,
      },
    });
  } catch (error) {
    let code = error.code;
    if (error.name === 'PasswordException') code = 'PASSWORD_REQUIRED';
    if (code === 'MODULE_NOT_FOUND') code = 'PARSER_MISSING';
    console.error('[pdf-text] Extraction error:', error.name, error.code || '', error.message);
    parentPort.postMessage({ type: 'pdf-text-result', ok: false, code: code || 'INVALID_PDF' });
  } finally {
    if (parser) {
      try { await parser.destroy(); } catch { /* Worker sẽ được kết thúc. */ }
    }
  }
}

run();
