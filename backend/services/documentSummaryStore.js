const { createHash } = require('node:crypto');
const db = require('../db');
const { readExtraction } = require('./documentTextStore');

function sourceHash(extraction) {
  if (!extraction) return null;
  return createHash('sha256').update(JSON.stringify({
    status: extraction.status,
    pages: extraction.pages.map(({ pageNumber, text }) => ({ pageNumber, text })),
  })).digest('hex');
}

function getSource(documentId, userId) {
  const doc = db.prepare('SELECT id, name FROM documents WHERE id = ? AND user_id = ?')
    .get(documentId, userId);
  if (!doc) throw Object.assign(new Error('Không tìm thấy tài liệu của bạn.'), { status: 404 });
  return { document: doc, extraction: readExtraction(documentId, userId) };
}

function readSummary(documentId, userId, extraction) {
  const row = db.prepare(`SELECT s.* FROM document_summaries s
    JOIN documents d ON d.id = s.document_id
    WHERE s.document_id = ? AND d.user_id = ?`).get(documentId, userId);
  if (!row) return null;
  return {
    documentId,
    content: JSON.parse(row.summary_json),
    model: row.model,
    createdAt: row.created_at,
    sourcePageCount: row.source_page_count,
    sourceCharCount: row.source_char_count,
    stale: row.source_hash !== sourceHash(extraction),
  };
}

function saveSummary(documentId, userId, originalHash, result) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const { extraction } = getSource(documentId, userId);
    if (!extraction || sourceHash(extraction) !== originalHash) {
      throw Object.assign(new Error('Văn bản tài liệu đã thay đổi. Hãy tải lại rồi tạo tóm tắt mới.'), { status: 409 });
    }
    db.prepare(`INSERT INTO document_summaries
      (document_id, source_hash, summary_json, model, prompt_version, source_page_count, source_char_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(document_id) DO UPDATE SET
        source_hash = excluded.source_hash, summary_json = excluded.summary_json,
        model = excluded.model, prompt_version = excluded.prompt_version,
        source_page_count = excluded.source_page_count, source_char_count = excluded.source_char_count,
        created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    `).run(documentId, originalHash, JSON.stringify(result.content), result.model,
      result.promptVersion, extraction.pageCount, extraction.charCount);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return readSummary(documentId, userId, getSource(documentId, userId).extraction);
}

module.exports = { sourceHash, getSource, readSummary, saveSummary };
