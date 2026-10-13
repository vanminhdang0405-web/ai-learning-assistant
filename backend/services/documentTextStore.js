const db = require('../db');

function readExtraction(documentId, userId) {
  const row = db.prepare(`
    SELECT e.*, d.mime_type FROM document_extractions e
    JOIN documents d ON d.id = e.document_id
    WHERE e.document_id = ? AND d.user_id = ?
  `).get(documentId, userId);
  if (!row) return null;
  const pages = db.prepare(`
    SELECT page_number AS pageNumber, text, char_count AS charCount
    FROM document_pages WHERE document_id = ? ORDER BY page_number
  `).all(documentId);
  return {
    documentId,
    sourceUnit: row.mime_type === 'application/pdf' ? 'page' : 'part',
    status: row.status,
    pageCount: row.page_count,
    charCount: row.char_count,
    parserVersion: row.parser_version,
    extractedAt: row.extracted_at,
    pagesWithoutText: pages.filter((page) => !page.text.trim()).map((page) => page.pageNumber),
    pages,
  };
}

function saveExtraction(documentId, userId, result) {
  db.exec('BEGIN IMMEDIATE');
  try {
    // PDF có thể đã bị xóa trong lúc worker đang chạy.
    const document = db.prepare('SELECT id FROM documents WHERE id = ? AND user_id = ?')
      .get(documentId, userId);
    if (!document) {
      throw Object.assign(new Error('Tài liệu đã bị xóa hoặc không còn khả dụng.'), { status: 404 });
    }
    db.prepare(`
      INSERT INTO document_extractions
        (document_id, status, page_count, char_count, parser_version)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(document_id) DO UPDATE SET
        status = excluded.status,
        page_count = excluded.page_count,
        char_count = excluded.char_count,
        parser_version = excluded.parser_version,
        extracted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    `).run(documentId, result.status, result.pageCount, result.charCount, result.parserVersion);
    db.prepare('DELETE FROM document_pages WHERE document_id = ?').run(documentId);
    const insert = db.prepare(`
      INSERT INTO document_pages (document_id, page_number, text, char_count)
      VALUES (?, ?, ?, ?)
    `);
    for (const page of result.pages) {
      insert.run(documentId, page.pageNumber, page.text, page.charCount);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return readExtraction(documentId, userId);
}

module.exports = { readExtraction, saveExtraction };
