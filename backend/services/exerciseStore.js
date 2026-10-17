const { randomUUID } = require('node:crypto');
const db = require('../db');
const MAX_TURNS = 20;
const MAX_HINTS = 6;
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
function readText(value, max = 12000, min = 3) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max
      || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) {
    throw fail(400, 'INVALID_EXERCISE_TEXT', `Nội dung cần từ ${min} đến ${max.toLocaleString('vi-VN')} ký tự, không chứa ký tự điều khiển.`);
  }
  return value.trim();
}
function checkId(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) {
    throw fail(400, 'INVALID_EXERCISE_ID', 'Mã bài tập không hợp lệ.');
  }
}
function unpack(row) {
  return { id: row.id, problemText: row.problem_text, analysis: row.analysis_json ? JSON.parse(row.analysis_json) : null,
    turns: JSON.parse(row.turns_json), revision: row.revision, maxTurns: MAX_TURNS, maxHints: MAX_HINTS,
    contextFull: row.problem_text.length + (row.analysis_json || '').length + row.turns_json.length >= 70000,
    createdAt: row.created_at, updatedAt: row.updated_at };
}
function read(id, userId) {
  checkId(id);
  const row = db.prepare('SELECT * FROM exercise_sessions WHERE id=? AND user_id=?').get(id, userId);
  if (!row) throw fail(404, 'EXERCISE_NOT_FOUND', 'Bài tập không tồn tại hoặc không thuộc tài khoản của bạn.');
  return unpack(row);
}
function create(userId, text, creationKey) {
  text = readText(text);
  if (typeof creationKey !== 'string' || !/^[a-zA-Z0-9-]{20,100}$/.test(creationKey)) throw fail(400, 'INVALID_CREATION_KEY', 'Mã yêu cầu tạo bài tập không hợp lệ.');
  const previous = db.prepare('SELECT * FROM exercise_sessions WHERE user_id=? AND creation_key=?').get(userId, creationKey);
  if (previous) {
    if (previous.problem_text !== text) throw fail(409, 'CREATION_KEY_USED', 'Yêu cầu tạo bài đã dùng cho đề khác. Hãy mở bài mới.');
    return { exercise: unpack(previous), created: false };
  }
  if (db.prepare('SELECT COUNT(*) n FROM exercise_sessions WHERE user_id=?').get(userId).n >= 100) {
    throw fail(409, 'EXERCISE_STORAGE_FULL', 'Đã lưu 100 bài tập. Hãy xóa bài không cần thiết trước khi tạo thêm.');
  }
  const id = randomUUID(), date = new Date().toISOString();
  db.prepare('INSERT INTO exercise_sessions(id,user_id,creation_key,problem_text,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .run(id, userId, creationKey, text, date, date);
  return { exercise: read(id, userId), created: true };
}
function list(userId) {
  return db.prepare('SELECT id,problem_text,analysis_json,revision,created_at,updated_at FROM exercise_sessions WHERE user_id=? ORDER BY updated_at DESC,id DESC LIMIT 100')
    .all(userId).map(row => ({ id: row.id, title: row.analysis_json ? JSON.parse(row.analysis_json).title : row.problem_text.slice(0, 90),
      analyzed: !!row.analysis_json, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at }));
}
function expectRevision(item, revision) {
  if (!Number.isInteger(revision) || revision < 0 || revision > MAX_TURNS) throw fail(400, 'INVALID_REVISION', 'Phiên bản bài tập không hợp lệ.');
  if (item.revision !== revision) throw fail(409, 'EXERCISE_CHANGED', 'Bài tập đã có kết quả mới. Bấm Đồng bộ bài tập trước khi gửi lại.');
}
function prepare(item, body) {
  expectRevision(item, body.revision);
  const kind = body.kind;
  if (!['analyze', 'hint', 'explain', 'solution', 'followup'].includes(kind)) throw fail(400, 'INVALID_STUDY_ACTION', 'Loại hỗ trợ không hợp lệ.');
  const question = ['explain', 'followup'].includes(kind) ? readText(body.question, 1000) : '';
  if (!question && body.question !== undefined && body.question !== '') throw fail(400, 'INVALID_STUDY_ACTION', 'Thao tác này không nhận câu hỏi riêng.');
  if (kind === 'solution' && body.confirmSolution !== true) throw fail(400, 'CONFIRM_SOLUTION', 'Hãy xác nhận muốn xem lời giải tham khảo.');
  if (kind === 'analyze' && item.analysis) return { cached: true, kind, question };
  if (kind === 'solution' && item.turns.some(turn => turn.kind === 'solution')) return { cached: true, kind, question };
  if (kind !== 'analyze' && !item.analysis) throw fail(409, 'ANALYSIS_REQUIRED', 'Hãy phân tích đề bài trước.');
  if (['hint', 'solution'].includes(kind) && item.analysis.status !== 'ready') {
    throw fail(422, 'PROBLEM_NEEDS_REVIEW', 'Đề còn thiếu dữ kiện hoặc chưa phù hợp. Bấm Sửa đề để bổ sung rồi phân tích lại.');
  }
  if (kind === 'hint' && item.turns.some(turn => turn.kind === 'solution')) throw fail(409, 'SOLUTION_ALREADY_SHOWN', 'Đã mở lời giải. Bạn có thể hỏi tiếp về các bước hoặc tạo bài mới.');
  const hintNumber = item.turns.filter(turn => turn.kind === 'hint').length + 1;
  if (kind === 'hint' && hintNumber > MAX_HINTS) throw fail(409, 'HINT_LIMIT', 'Đã có 6 gợi ý. Hãy hỏi về bước còn vướng hoặc chủ động xem lời giải tham khảo.');
  if (item.revision >= MAX_TURNS) throw fail(409, 'STUDY_LIMIT', 'Bài này đã đủ 20 lần hỗ trợ. Bạn vẫn xem được kết quả hoặc tạo bài mới.');
  if (item.contextFull) throw fail(409, 'STUDY_LIMIT', 'Ngữ cảnh bài này đã đạt giới hạn độ dài. Bạn vẫn xem được kết quả hoặc tạo bài mới.');
  return { cached: false, kind, question, hintNumber };
}
function commit(id, userId, revision, action, content) {
  const item = read(id, userId);
  expectRevision(item, revision);
  const date = new Date().toISOString();
  const analysis = action.kind === 'analyze' ? content : item.analysis;
  const turns = action.kind === 'analyze' ? item.turns : [...item.turns, { id: randomUUID(), kind: action.kind,
    question: action.question, ...(action.kind === 'hint' ? { hintNumber: action.hintNumber } : {}), content, createdAt: date }];
  const result = db.prepare('UPDATE exercise_sessions SET analysis_json=?,turns_json=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND revision=?')
    .run(JSON.stringify(analysis), JSON.stringify(turns), date, id, userId, revision);
  if (!result.changes) throw fail(409, 'EXERCISE_CHANGED', 'Bài tập đã thay đổi. Hãy đồng bộ lại.');
  return read(id, userId);
}
function remove(id, userId) {
  read(id, userId);
  db.prepare('DELETE FROM exercise_sessions WHERE id=? AND user_id=?').run(id, userId);
}
module.exports = { fail, readText, create, read, list, prepare, commit, remove };
