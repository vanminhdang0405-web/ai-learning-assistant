const path = require('node:path');
const { fork } = require('node:child_process');

const errors = {
  INVALID_DOCX: [422, 'DOCX không hợp lệ, bị khóa hoặc không đọc được. Hãy lưu lại bằng Word rồi thử lại.'],
  DOCX_LIMIT: [422, 'DOCX quá phức tạp hoặc dữ liệu giải nén vượt 25 MB. Hãy chia nhỏ tài liệu.'],
  TEXT_ENCODING: [422, 'TXT cần lưu dạng UTF-8 hoặc UTF-16 có BOM. Hãy mở bằng Notepad và lưu lại dạng UTF-8.'],
  INVALID_TEXT: [422, 'File TXT chứa dữ liệu nhị phân hoặc không hợp lệ.'],
  TEXT_LIMIT: [422, 'Văn bản vượt giới hạn 1.000.000 ký tự. Hãy chia nhỏ tài liệu.'],
  PARSER_MISSING: [500, 'Backend thiếu thư viện DOCX. Chạy npm install trong thư mục backend.'],
  EXTRACTION_TIMEOUT: [504, 'Đọc tài liệu quá 30 giây. Hãy thử tài liệu nhỏ hơn.'],
  PROCESS_FAILED: [500, 'Tiến trình đọc tài liệu bị dừng. Backend vẫn hoạt động; hãy thử file nhỏ hơn.'],
};

function extractionError(code) {
  const key = Object.hasOwn(errors, code) ? code : 'INVALID_DOCX';
  const [status, message] = errors[key];
  return Object.assign(new Error(message), { status, code: key });
}

// DOCX/TXT chạy trong tiến trình Node riêng: lỗi native không làm sập API.
function extractOfficeText(content, extension) {
  return new Promise((resolve, reject) => {
    let child;
    let settled = false;
    let reply;
    let failure;
    let timer;

    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    }

    function stop(error) {
      if (settled) return;
      failure = failure || error;
      if (!child?.pid) return finish(failure);
      // Chờ exit để giải phóng suất xử lý ở route sau khi tiến trình dừng.
      try {
        if (!child.kill('SIGKILL')) finish(failure);
      } catch (killError) {
        console.error('[office-text] Cannot stop child:', killError.message);
        finish(failure);
      }
    }

    try {
      const env = { ...process.env };
      delete env.WATCH_REPORT_DEPENDENCIES;
      child = fork(path.join(__dirname, 'officeTextProcess.js'), [], {
        execArgv: ['--max-old-space-size=256'],
        serialization: 'advanced',
        stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
        windowsHide: true,
        env,
      });
    } catch (error) {
      console.error('[office-text] Cannot start child:', error.message);
      finish(extractionError('PROCESS_FAILED'));
      return;
    }

    timer = setTimeout(() => stop(extractionError('EXTRACTION_TIMEOUT')), 30000);
    child.on('message', (message) => {
      if (!message || message.type !== 'office-text-result' || typeof message.ok !== 'boolean') return;
      if (!reply) reply = message;
      // Không kill khi có kết quả. Cho parser dọn dẹp và tiến trình tự thoát.
    });
    child.once('error', (error) => {
      console.error('[office-text] Child error:', error.message);
      stop(extractionError('PROCESS_FAILED'));
    });
    child.once('exit', (code, signal) => {
      if (failure) return finish(failure);
      if (code !== 0 || !reply) {
        console.error('[office-text] Child stopped:', { code, signal, receivedResult: !!reply });
        return finish(extractionError('PROCESS_FAILED'));
      }
      if (reply.ok) finish(null, reply.result);
      else finish(extractionError(reply.code));
    });

    try {
      child.send({ type: 'office-text-input', content: new Uint8Array(content), extension }, (error) => {
        if (!error || settled || reply) return;
        console.error('[office-text] Send failed:', error.message);
        stop(extractionError('PROCESS_FAILED'));
      });
    } catch (error) {
      console.error('[office-text] Send failed:', error.message);
      stop(extractionError('PROCESS_FAILED'));
    }
  });
}

module.exports = { extractOfficeText };
