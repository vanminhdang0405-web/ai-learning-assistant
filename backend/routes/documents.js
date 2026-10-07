const express = require('express');
const multer = require('multer');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
const MAX_SIZE = 10 * 1024 * 1024;
const columns = 'id, name, mime_type, size_bytes, created_at';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_SIZE,
    files: 1,
    fields: 1,
    parts: 3,
    fieldSize: 1024,
    fieldNameSize: 100,
  },
}).single('file');

// Tất cả API tài liệu đều yêu cầu đăng nhập.
router.use(requireAuth);

router.get('/', (req, res) => {
  const documents = db.prepare(`
    SELECT ${columns}
    FROM documents
    WHERE user_id = ?
    ORDER BY id DESC
  `).all(req.userId);

  res.json({ success: true, documents });
});

function receiveFile(req, res, next) {
  upload(req, res, (error) => {
    if (error) {
      if (error instanceof multer.MulterError) {
        const tooLarge = error.code === 'LIMIT_FILE_SIZE';

        return res.status(tooLarge ? 413 : 400).json({
          success: false,
          message: tooLarge
            ? 'PDF vượt giới hạn 10 MB.'
            : 'Chỉ gửi một file PDF và một trường tên tài liệu.',
        });
      }

      return next(error);
    }

    next();
  });
}

// Kiểm tra lại token sau khi nhận file, phòng khi token vừa hết hạn.
router.post('/', receiveFile, requireAuth, (req, res) => {
  const file = req.file;

  if (!file || file.size === 0) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng chọn một file PDF.',
    });
  }

  const rawName = req.body?.name ?? file.originalname;

  if (typeof rawName !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Tên tài liệu không hợp lệ.',
    });
  }

  const name = rawName
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .trim();

  const hasPdfHeader = file.buffer
    .subarray(0, 5)
    .equals(Buffer.from('%PDF-'));

  if (
    !name ||
    name.length > 200 ||
    !/\.pdf$/i.test(name) ||
    !hasPdfHeader
  ) {
    return res.status(400).json({
      success: false,
      message: 'Chọn file PDF có tên tối đa 200 ký tự và nội dung PDF hợp lệ.',
    });
  }

  if (file.size > MAX_SIZE) {
    return res.status(413).json({
      success: false,
      message: 'PDF vượt giới hạn 10 MB.',
    });
  }

  const result = db.prepare(`
    INSERT INTO documents
      (user_id, name, mime_type, size_bytes, content)
    VALUES (?, ?, 'application/pdf', ?, ?)
  `).run(req.userId, name, file.size, file.buffer);

  const document = db.prepare(`
    SELECT ${columns}
    FROM documents
    WHERE id = ? AND user_id = ?
  `).get(Number(result.lastInsertRowid), req.userId);

  return res.status(201).json({
    success: true,
    document,
  });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);

  if (
    !/^\d+$/.test(req.params.id) ||
    !Number.isSafeInteger(id) ||
    id < 1
  ) {
    return res.status(400).json({
      success: false,
      message: 'Mã tài liệu không hợp lệ.',
    });
  }

  const result = db.prepare(`
    DELETE FROM documents
    WHERE id = ? AND user_id = ?
  `).run(id, req.userId);

  if (Number(result.changes) === 0) {
    return res.status(404).json({
      success: false,
      message: 'Không tìm thấy tài liệu của bạn.',
    });
  }

  return res.json({
    success: true,
    message: 'Đã xóa tài liệu.',
  });
});

module.exports = router;