// Được gọi bởi pdfText.js qua child_process.fork, không chạy trong worker thread.
async function run(content) {
  let parser;
  let response;
  try {
    const { PDFParse } = require('pdf-parse');
    parser = new PDFParse({
      data: new Uint8Array(content),
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

    response = {
      type: 'pdf-text-result',
      ok: true,
      result: {
        status,
        pageCount: info.total,
        charCount,
        parserVersion: 'pdf-parse@2.4.5',
        pages,
      },
    };
  } catch (error) {
    let code = error.code;
    if (error.name === 'PasswordException') code = 'PASSWORD_REQUIRED';
    if (code === 'MODULE_NOT_FOUND') code = 'PARSER_MISSING';
    console.error('[pdf-text] Extraction error:', error.name, error.code || '', error.message);
    response = { type: 'pdf-text-result', ok: false, code: code || 'INVALID_PDF' };
  } finally {
    if (parser) {
      try { await parser.destroy(); } catch (error) {
        console.error('[pdf-text] Parser cleanup:', error.message);
      }
    }
  }
  // Gửi sau khi dọn dẹp; ngắt IPC để Node tự thoát bình thường.
  if (process.connected) {
    process.send(response, (error) => {
      if (error) process.exitCode = 1;
      if (process.connected) process.disconnect();
    });
  }
}

process.once('message', (message) => {
  if (!message || message.type !== 'pdf-text-input') {
    process.exitCode = 1;
    if (process.connected) process.disconnect();
    return;
  }
  run(message.content).catch((error) => {
    console.error('[pdf-text] Unhandled child error:', error);
    process.exitCode = 1;
    if (process.connected) process.disconnect();
  });
});
