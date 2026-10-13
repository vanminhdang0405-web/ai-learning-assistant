const express = require('express');
const multer = require('multer');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { extractOfficeText } = require('../services/officeText');
const { TYPES, validateName, validateTopic, extensionForMime } = require('../services/documentFormats');
const { extractPdfText } = require('../services/pdfText');
const { readExtraction, saveExtraction } = require('../services/documentTextStore');

const activeExtractions = new Set();
const MAX_EXTRACTIONS = 2;
let activeUploads = 0;

const router = express.Router();
const MAX_SIZE = 10 * 1024 * 1024;
const columns = 'id, name, mime_type, size_bytes, created_at, topic';
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
    SELECT content, mime_type FROM documents WHERE id = ? AND user_id = ?
  `).get(req.documentId, req.userId);

  if (!document) {
    return res.status(404).json({
      success: false,
      message: 'Không tìm thấy tài liệu của bạn.',
    });
  }

  const content = Buffer.from(document.content);
  res.set({
    'Content-Type': document.mime_type,
    'Content-Disposition': `inline; filename="document-${req.documentId}.${extensionForMime(document.mime_type)}"`,
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
  if (activeExtractions.size + activeUploads >= MAX_EXTRACTIONS) {
    res.set('Retry-After', '2');
    return res.status(503).json({ success: false, message: 'Backend đang xử lý tài liệu khác. Vui lòng thử lại sau.' });
  }

  activeExtractions.add(req.documentId);
  try {
    const file = db.prepare('SELECT content, mime_type FROM documents WHERE id = ? AND user_id = ?')
      .get(req.documentId, req.userId);
    const result = file.mime_type === TYPES.pdf
      ? await extractPdfText(file.content)
      : await extractOfficeText(file.content, extensionForMime(file.mime_type));
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
            ? 'Tài liệu vượt giới hạn 10 MB.'
            : 'Chỉ gửi một file PDF, DOCX hoặc TXT và một trường tên tài liệu.',
        });
      }
      return next(error);
    }
    next();
  });
}

router.post('/', receiveFile, requireAuth, async (req, res, next) => {
  let ownsSlot = false;
  try {
    const file = req.file;
    if (!file || file.size === 0) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn file PDF, DOCX hoặc TXT không rỗng.' });
    }
    const { name, extension, mimeType } = validateName(req.body?.name ?? file.originalname);
    if (file.size > MAX_SIZE) return res.status(413).json({ success: false, message: 'Tài liệu vượt giới hạn 10 MB.' });
    if (extension === 'pdf' && !file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      return res.status(400).json({ success: false, message: 'Nội dung file không phải PDF hợp lệ.' });
    }
    let extraction;
    if (extension !== 'pdf') {
      if (activeExtractions.size + activeUploads >= MAX_EXTRACTIONS) {
        res.set('Retry-After', '2');
        return res.status(503).json({ success: false, message: 'Backend đang đọc tài liệu khác. Vui lòng thử lại sau.' });
      }
      activeUploads++;
      ownsSlot = true;
      extraction = await extractOfficeText(file.buffer, extension);
    }
    if (res.destroyed) return;
    // Phiên có thể đã bị thu hồi trong thời gian đọc DOCX/TXT.
    requireAuth(req, res, () => {
      let document;
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = db.prepare(`
          INSERT INTO documents (user_id, name, mime_type, size_bytes, content)
          VALUES (?, ?, ?, ?, ?)
        `).run(req.userId, name, mimeType, file.size, file.buffer);
        const id = Number(result.lastInsertRowid);
        // Dùng cùng giao dịch để upload không để lại file dở dang.
        if (extraction) {
          db.prepare(`INSERT INTO document_extractions
            (document_id, status, page_count, char_count, parser_version)
            VALUES (?, ?, ?, ?, ?)`).run(id, extraction.status, extraction.pageCount, extraction.charCount, extraction.parserVersion);
          const insertPage = db.prepare('INSERT INTO document_pages (document_id, page_number, text, char_count) VALUES (?, ?, ?, ?)');
          for (const page of extraction.pages) insertPage.run(id, page.pageNumber, page.text, page.charCount);
        }
        document = db.prepare(`SELECT ${columns} FROM documents WHERE id = ? AND user_id = ?`).get(id, req.userId);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      res.status(201).json({ success: true, document });
    });
  } catch (error) {
    if (res.destroyed) return;
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    next(error);
  } finally {
    if (ownsSlot) activeUploads--;
  }
});

// FR-10/12: chỉ chủ sở hữu được đổi tên hoặc phân loại; giữ nguyên loại file và nội dung.
router.patch('/:id', readDocumentId, (req, res, next) => {
  try {
    const document = db.prepare(`SELECT ${columns} FROM documents WHERE id = ? AND user_id = ?`).get(req.documentId, req.userId);
    if (!document) return res.status(404).json({ success: false, message: 'Không tìm thấy tài liệu của bạn.' });
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || !Object.keys(body).length || Object.keys(body).some(key => !['name', 'topic'].includes(key))) {
      return res.status(400).json({ success: false, message: 'Chỉ gửi tên tài liệu hoặc môn học/chủ đề.' });
    }
    let name = document.name;
    let topic = document.topic;
    if (Object.hasOwn(body, 'name')) {
      const checked = validateName(body.name);
      if (checked.mimeType !== document.mime_type) {
        return res.status(400).json({ success: false, message: 'Không được đổi đuôi định dạng file. Chỉ đổi phần tên tài liệu.' });
      }
      name = checked.name;
    }
    if (Object.hasOwn(body, 'topic')) topic = validateTopic(body.topic);
    db.prepare('UPDATE documents SET name = ?, topic = ? WHERE id = ? AND user_id = ?')
      .run(name, topic, req.documentId, req.userId);
    return res.json({ success: true, document: { ...document, name, topic } });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    next(error);
  }
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
