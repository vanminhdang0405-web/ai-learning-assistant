const express = require('express');
const multer = require('multer');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { extractPdfText } = require('../services/pdfText');
const { readExtraction, saveExtraction } = require('../services/documentTextStore');

const activeExtractions = new Set();
const MAX_EXTRACTIONS = 2;

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

router.use(requireAuth);

function readDocumentId(req, res, next) {
  const id = Number(req.params.id);
  if (!/^\d+$/.test(req.params.id) || !Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      success: false,
      message: 'Mã tài liệu không hợp lệ.',
    });
  }
  req.documentId = id;
  next();
}

router.get('/', (req, res) => {
  const documents = db.prepare(`
    SELECT ${columns} FROM documents
    WHERE user_id = ? ORDER BY id DESC
  `).all(req.userId);
  res.json({ success: true, documents });
});

// Chỉ chủ sở hữu được tải nội dung. Không phục vụ PDF qua thư mục public.
router.get('/:id/content', readDocumentId, (req, res) => {
  const document = db.prepare(`
    SELECT content FROM documents WHERE id = ? AND user_id = ?
  `).get(req.documentId, req.userId);

  if (!document) {
    return res.status(404).json({
      success: false,
      message: 'Không tìm thấy tài liệu của bạn.',
    });
  }

  const content = Buffer.from(document.content);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="document-${req.documentId}.pdf"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  return res.send(content);
});

// Lấy văn bản đã lưu; chưa xử lý thì trả extraction=null.
router.get('/:id/text', readDocumentId, (req, res) => {
  const document = db.prepare('SELECT id FROM documents WHERE id = ? AND user_id = ?')
    .get(req.documentId, req.userId);
  if (!document) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy tài liệu của bạn.' });
  }
  res.set('Cache-Control', 'private, no-store');
  return res.json({ success: true, extraction: readExtraction(req.documentId, req.userId) });
});

router.post('/:id/extract', readDocumentId, async (req, res, next) => {
  const force = req.body?.force ?? false;
  if (typeof force !== 'boolean') {
    return res.status(400).json({ success: false, message: 'Tham số trích xuất không hợp lệ.' });
  }
  const document = db.prepare('SELECT id FROM documents WHERE id = ? AND user_id = ?')
    .get(req.documentId, req.userId);
  if (!document) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy tài liệu của bạn.' });
  }
  res.set('Cache-Control', 'private, no-store');
  const previous = readExtraction(req.documentId, req.userId);
  if (previous && !force) {
    return res.json({ success: true, cached: true, extraction: previous });
  }
  if (activeExtractions.has(req.documentId)) {
    return res.status(409).json({ success: false, message: 'Tài liệu đang được trích xuất. Chờ một chút rồi bấm Làm mới.' });
  }
  if (activeExtractions.size >= MAX_EXTRACTIONS) {
    res.set('Retry-After', '2');
    return res.status(503).json({ success: false, message: 'Backend đang xử lý tài liệu khác. Vui lòng thử lại sau.' });
  }

  activeExtractions.add(req.documentId);
  try {
    const file = db.prepare('SELECT content FROM documents WHERE id = ? AND user_id = ?')
      .get(req.documentId, req.userId);
    const result = await extractPdfText(file.content);
    if (res.destroyed) return;

    // Kiểm tra lại phiên đăng nhập sau thao tác có thể kéo dài.
    requireAuth(req, res, () => {
      const extraction = saveExtraction(req.documentId, req.userId, result);
      res.json({ success: true, cached: false, extraction });
    });
  } catch (error) {
    if (res.destroyed) return;
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    next(error);
  } finally {
    activeExtractions.delete(req.documentId);
  }
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

router.post('/', receiveFile, requireAuth, (req, res) => {
  const file = req.file;
  if (!file || file.size === 0) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn một file PDF.' });
  }
  const rawName = req.body?.name ?? file.originalname;
  if (typeof rawName !== 'string') {
    return res.status(400).json({ success: false, message: 'Tên tài liệu không hợp lệ.' });
  }
  const name = rawName.replace(/\\/g, '/').split('/').pop().trim();
  const hasPdfHeader = file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'));
  if (!name || name.length > 200 || !/\.pdf$/i.test(name) || !hasPdfHeader) {
    return res.status(400).json({
      success: false,
      message: 'Chọn file PDF có tên tối đa 200 ký tự và nội dung PDF hợp lệ.',
    });
  }
  if (file.size > MAX_SIZE) {
    return res.status(413).json({ success: false, message: 'PDF vượt giới hạn 10 MB.' });
  }
  const result = db.prepare(`
    INSERT INTO documents (user_id, name, mime_type, size_bytes, content)
    VALUES (?, ?, 'application/pdf', ?, ?)
  `).run(req.userId, name, file.size, file.buffer);
  const document = db.prepare(`
    SELECT ${columns} FROM documents WHERE id = ? AND user_id = ?
  `).get(Number(result.lastInsertRowid), req.userId);
  return res.status(201).json({ success: true, document });
});

router.delete('/:id', readDocumentId, (req, res) => {
  const result = db.prepare('DELETE FROM documents WHERE id = ? AND user_id = ?')
    .run(req.documentId, req.userId);
  if (Number(result.changes) === 0) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy tài liệu của bạn.' });
  }
  return res.json({ success: true, message: 'Đã xóa tài liệu.' });
});

router.use('/:id', readDocumentId, require('./documentSummaries'));

module.exports = router;
