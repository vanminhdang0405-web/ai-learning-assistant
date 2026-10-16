const { randomUUID } = require('node:crypto');
const db = require('../db');

const MAX_TURNS = 10;
const TEMP_TTL = 2 * 60 * 60 * 1000;
const temporary = new Map();
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const missing = () => fail(404, 'CONVERSATION_NOT_FOUND', 'Cuộc trò chuyện không còn tồn tại hoặc phiên tạm đã hết hạn. Hãy bắt đầu cuộc trò chuyện mới.');
const conflict = () => fail(409, 'CONVERSATION_CHANGED', 'Hội thoại đã thay đổi. Bấm Đồng bộ hội thoại trước khi gửi lại.');
function prune() {
  for (const [id, item] of temporary) if (item.expiresAt <= Date.now()) temporary.delete(id);
}
const cleanup = setInterval(prune, 60000);
cleanup.unref();

function checkId(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) {
    throw fail(400, 'INVALID_CONVERSATION', 'Mã cuộc trò chuyện không hợp lệ.');
  }
  return id;
}
function checkRevision(revision) {
  if (!Number.isInteger(revision) || revision < 0 || revision > MAX_TURNS) {
    throw fail(400, 'INVALID_CONVERSATION', 'Phiên bản cuộc trò chuyện không hợp lệ.');
  }
  return revision;
}
function fromRow(row) {
  return { id: row.id, documentId: row.document_id, userId: row.user_id, scope: JSON.parse(row.scope_json),
    sourceVersion: row.source_version, sourceUnit: row.source_unit, title: row.title,
    turns: JSON.parse(row.turns_json), revision: row.revision, saved: true, createdAt: row.created_at, updatedAt: row.updated_at };
}
function read(id, documentId, userId) {
  checkId(id); prune();
  const row = db.prepare('SELECT * FROM document_conversations WHERE id=? AND document_id=? AND user_id=?').get(id, documentId, userId);
  if (row) return fromRow(row);
  const item = temporary.get(id);
  if (!item || item.documentId !== documentId || item.userId !== userId) throw missing();
  item.expiresAt = Date.now() + TEMP_TTL;
  return item;
}
function create(documentId, userId, metadata) {
  prune();
  if (temporary.size >= 1000 || [...temporary.values()].filter(item => item.userId === userId).length >= 20) {
    throw fail(429, 'CONVERSATION_CAPACITY', 'Đang có nhiều phiên tạm. Hãy đóng cuộc trò chuyện cũ hoặc thử lại sau.');
  }
  const date = new Date().toISOString();
  const item = { id: randomUUID(), documentId, userId, scope: metadata.scope, sourceVersion: metadata.sourceVersion,
    sourceUnit: metadata.source.sourceUnit, title: 'Cuộc trò chuyện mới', turns: [], revision: 0,
    saved: false, createdAt: date, updatedAt: date, expiresAt: Date.now() + TEMP_TTL };
  temporary.set(item.id, item);
  return item;
}
function expectRevision(item, revision) {
  checkRevision(revision);
  if (item.revision !== revision) throw conflict();
}
function append(id, documentId, userId, revision, turn) {
  const current = read(id, documentId, userId);
  expectRevision(current, revision);
  if (revision >= MAX_TURNS) throw fail(409, 'CONVERSATION_LIMIT', 'Cuộc trò chuyện đã đủ 10 lượt. Hãy lưu nếu cần và bắt đầu cuộc trò chuyện mới.');
  const item = { ...current, turns: [...current.turns, turn], revision: revision + 1,
    title: current.turns.length ? current.title : turn.question.slice(0, 100), updatedAt: new Date().toISOString() };
  if (item.saved) {
    const result = db.prepare('UPDATE document_conversations SET title=?,turns_json=?,revision=?,updated_at=? WHERE id=? AND document_id=? AND user_id=? AND revision=?')
      .run(item.title, JSON.stringify(item.turns), item.revision, item.updatedAt, id, documentId, userId, revision);
    if (!result.changes) throw conflict();
  } else temporary.set(id, item);
  return item;
}
function save(id, documentId, userId, revision) {
  const item = read(id, documentId, userId);
  expectRevision(item, revision);
  if (item.saved) return item;
  if (!item.turns.length) throw fail(400, 'EMPTY_CONVERSATION', 'Hãy hoàn thành ít nhất một lượt hỏi đáp trước khi lưu.');
  if (db.prepare('SELECT COUNT(*) n FROM document_conversations WHERE document_id=? AND user_id=?').get(documentId, userId).n >= 100) {
    throw fail(409, 'HISTORY_FULL', 'Tài liệu đã có 100 cuộc trò chuyện được lưu. Hãy xóa lịch sử không cần thiết trước khi lưu thêm.');
  }
  db.prepare(`INSERT INTO document_conversations
    (id,document_id,user_id,scope_key,scope_json,source_version,source_unit,title,turns_json,revision,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(item.id, documentId, userId, item.scope.key, JSON.stringify(item.scope),
      item.sourceVersion, item.sourceUnit, item.title, JSON.stringify(item.turns), item.revision, item.createdAt, item.updatedAt);
  temporary.delete(id);
  return { ...item, saved: true };
}
function list(documentId, userId, sourceVersion) {
  return db.prepare(`SELECT id,scope_json,title,revision,source_version,created_at,updated_at
    FROM document_conversations WHERE document_id=? AND user_id=? ORDER BY updated_at DESC,id DESC LIMIT 100`)
    .all(documentId, userId).map(row => ({ id: row.id, title: row.title, scope: JSON.parse(row.scope_json),
      turnCount: row.revision, stale: row.source_version !== sourceVersion, createdAt: row.created_at, updatedAt: row.updated_at }));
}
function remove(id, documentId, userId, temporaryOnly = false) {
  const item = read(id, documentId, userId);
  if (temporaryOnly && item.saved) return false;
  db.prepare('DELETE FROM document_conversations WHERE id=? AND document_id=? AND user_id=?').run(id, documentId, userId);
  temporary.delete(id);
  return true;
}
function present(item, sourceVersion) {
  const { userId, expiresAt, ...visible } = item;
  return { ...visible, stale: item.sourceVersion !== sourceVersion, maxTurns: MAX_TURNS };
}

module.exports = { MAX_TURNS, create, read, append, save, list, remove, present, expectRevision };
