const { sourceVersion: sourceHash, resolveScope } = require('./summaryScopes');
const db = require('../db');
const { readLevel } = require('./summaryLevels');
const { readExtraction } = require('./documentTextStore');


function getSource(documentId, userId) {
  const doc = db.prepare('SELECT id, name FROM documents WHERE id = ? AND user_id = ?')
    .get(documentId, userId);
  if (!doc) throw Object.assign(new Error('Không tìm thấy tài liệu của bạn.'), { status: 404 });
  return { document: doc, extraction: readExtraction(documentId, userId) };
}

function readSummary(documentId, userId, extraction, level = 'medium', scopeKey = 'all') {
  level = readLevel(level);
  const row = db.prepare(`SELECT s.* FROM document_summaries s
    JOIN documents d ON d.id = s.document_id
    WHERE s.document_id = ? AND d.user_id = ? AND s.level = ? AND s.scope_key = ?`).get(documentId, userId, level, scopeKey);
  if (!row) return null;
  return {
    documentId,
    level: row.level,
    scope: JSON.parse(row.scope_json),
    content: JSON.parse(row.summary_json),
    model: row.model,
    createdAt: row.created_at,
    sourcePageCount: row.source_page_count,
    sourceCharCount: row.source_char_count,
    stale: row.source_hash !== sourceHash(extraction),
  };
}

function saveSummary(documentId, userId, originalHash, result, scopeKey = 'all') {
  const level = readLevel(result.level);
  db.exec('BEGIN IMMEDIATE');
  try {
    const { extraction } = getSource(documentId, userId);
    if (!extraction || sourceHash(extraction) !== originalHash) {
      throw Object.assign(new Error('Văn bản tài liệu đã thay đổi. Hãy tải lại rồi tạo tóm tắt mới.'), { status: 409 });
    }
    const selected = resolveScope(extraction, scopeKey);
    db.prepare(`INSERT INTO document_summaries
      (document_id, level, scope_key, scope_json, source_hash, summary_json, model, prompt_version, source_page_count, source_char_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(document_id, level, scope_key) DO UPDATE SET
        scope_json = excluded.scope_json, source_hash = excluded.source_hash, summary_json = excluded.summary_json,
        model = excluded.model, prompt_version = excluded.prompt_version,
        source_page_count = excluded.source_page_count, source_char_count = excluded.source_char_count,
        created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    `).run(documentId, level, scopeKey, JSON.stringify(selected.scope), originalHash, JSON.stringify(result.content), result.model,
      result.promptVersion, selected.extraction.pageCount, selected.extraction.charCount);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return readSummary(documentId, userId, getSource(documentId, userId).extraction, level, scopeKey);
}

function savedRanges(documentId, userId, extraction) {
  const rows = db.prepare(`SELECT DISTINCT s.scope_key FROM document_summaries s
    JOIN documents d ON d.id = s.document_id WHERE s.document_id = ? AND d.user_id = ?
    AND s.scope_key LIKE 'range:%' ORDER BY s.scope_key`).all(documentId, userId);
  return rows.flatMap(row => {
    try { return [resolveScope(extraction, row.scope_key).scope]; }
    catch { return []; } // Old ranges beyond a re-extracted document are unavailable.
  });
}

function listSavedSummaries(documentId, userId, extraction) {
  const hash = sourceHash(extraction);
  return db.prepare(`SELECT s.level, s.scope_json, s.source_hash, s.created_at,
    s.source_page_count, s.source_char_count FROM document_summaries s
    JOIN documents d ON d.id = s.document_id
    WHERE s.document_id = ? AND d.user_id = ? ORDER BY s.created_at DESC, s.scope_key, s.level`)
    .all(documentId, userId).map(row => ({
      level: row.level, scope: JSON.parse(row.scope_json), createdAt: row.created_at,
      stale: row.source_hash !== hash,
      sourcePageCount: row.source_page_count, sourceCharCount: row.source_char_count,
    }));
}

module.exports = { sourceHash, getSource, readSummary, saveSummary, savedRanges, listSavedSummaries };
