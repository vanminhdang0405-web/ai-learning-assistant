const path = require('node:path');
const { fork } = require('node:child_process');

const errors = {
  PASSWORD_REQUIRED: [422, 'PDF đang được bảo vệ bằng mật khẩu. Hãy dùng bản PDF không khóa.'],
  PAGE_LIMIT: [422, 'Bản này hỗ trợ trích xuất tối đa 200 trang mỗi PDF.'],
  TEXT_LIMIT: [422, 'Văn bản vượt giới hạn 1.000.000 ký tự. Hãy chia nhỏ tài liệu.'],
  INVALID_PDF: [422, 'Không phân tích được PDF. File có thể bị lỗi hoặc có cấu trúc chưa được hỗ trợ.'],
  PARSER_MISSING: [500, 'Backend thiếu thư viện PDF. Chạy npm install trong thư mục backend.'],
  EXTRACTION_TIMEOUT: [504, 'Trích xuất quá 30 giây. Hãy thử tài liệu nhỏ hơn.'],
  PROCESS_FAILED: [500, 'Tiến trình đọc PDF bị dừng. Backend vẫn hoạt động; hãy xem log [pdf-text] trong terminal.'],
};

function extractionError(code) {
  const key = Object.hasOwn(errors, code) ? code : 'INVALID_PDF';
  const [status, message] = errors[key];
  return Object.assign(new Error(message), { status, code: key });
}

// PDF chạy trong tiến trình Node riêng: lỗi native không làm sập API.
function extractPdfText(content) {
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
        console.error('[pdf-text] Cannot stop child:', killError.message);
        finish(failure);
      }
    }

    try {
      const env = { ...process.env };
      delete env.WATCH_REPORT_DEPENDENCIES;
      child = fork(path.join(__dirname, 'pdfTextProcess.js'), [], {
        execArgv: ['--max-old-space-size=256'],
        serialization: 'advanced',
        stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
        windowsHide: true,
        env,
      });
    } catch (error) {
      console.error('[pdf-text] Cannot start child:', error.message);
      finish(extractionError('PROCESS_FAILED'));
      return;
    }

    timer = setTimeout(() => stop(extractionError('EXTRACTION_TIMEOUT')), 30000);
    child.on('message', (message) => {
      if (!message || message.type !== 'pdf-text-result' || typeof message.ok !== 'boolean') return;
      if (!reply) reply = message;
      // Không kill khi có kết quả. Cho parser dọn dẹp và tiến trình tự thoát.
    });
    child.once('error', (error) => {
      console.error('[pdf-text] Child error:', error.message);
      stop(extractionError('PROCESS_FAILED'));
    });
    child.once('exit', (code, signal) => {
      if (failure) return finish(failure);
      if (code !== 0 || !reply) {
        console.error('[pdf-text] Child stopped:', { code, signal, receivedResult: !!reply });
        return finish(extractionError('PROCESS_FAILED'));
      }
      if (reply.ok) finish(null, reply.result);
      else finish(extractionError(reply.code));
    });

    try {
      child.send({ type: 'pdf-text-input', content: new Uint8Array(content) }, (error) => {
        if (!error || settled || reply) return;
        console.error('[pdf-text] Send failed:', error.message);
        stop(extractionError('PROCESS_FAILED'));
      });
    } catch (error) {
      console.error('[pdf-text] Send failed:', error.message);
      stop(extractionError('PROCESS_FAILED'));
    }
  });
}

module.exports = { extractPdfText };
