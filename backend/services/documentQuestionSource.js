const { getSource, sourceHash } = require('./documentSummaryStore');
const { findSections, resolveScope, publicScope } = require('./summaryScopes');

const MAX_QUESTION_CHARS = 1000;
const MAX_SOURCE_CHARS = 60000;

function readQuestion(value) {
  if (typeof value !== 'string') throw invalidQuestion();
  const question = value.trim();
  if (question.length < 3 || question.length > MAX_QUESTION_CHARS || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(question)) {
    throw invalidQuestion();
  }
  return question;
}

function invalidQuestion() {
  return Object.assign(new Error('Câu hỏi cần từ 3 đến 1.000 ký tự và không chứa ký tự điều khiển.'), {
    status: 400, code: 'INVALID_QUESTION',
  });
}

function questionSourceInfo(extraction) {
  const pages = extraction?.pages || [];
  const charCount = pages.reduce((sum, p) => sum + p.text.length, 0);
  let reason = '';
  if (!extraction) reason = 'Hãy trích xuất văn bản của tài liệu trước khi đặt câu hỏi.';
  else if (pages.reduce((sum, p) => sum + p.text.trim().length, 0) < 80) reason = 'Phạm vi chưa đủ 80 ký tự để hỏi đáp. Chọn phạm vi khác hoặc kiểm tra phần chữ đã trích xuất.';
  else if (charCount > MAX_SOURCE_CHARS) reason = 'Phạm vi vượt 60.000 ký tự. Chọn một chương hoặc khoảng trang/phần nhỏ hơn để hỏi đáp.';
  const nonempty = pages.filter(p => p.text.trim());
  return { ready: !reason, reason, charCount, pageCount: pages.length,
    sourceUnit: extraction?.sourceUnit || 'page', maxChars: MAX_SOURCE_CHARS,
    pagesWithoutText: extraction?.pagesWithoutText || [],
    previewStart: nonempty[0]?.text.slice(0, 300) || '', previewEnd: nonempty.at(-1)?.text.slice(-300) || '' };
}

function getQuestionSource(documentId, userId, scopeKey) {
  const { extraction: full } = getSource(documentId, userId);
  const catalog = findSections(full);
  const selected = resolveScope(full, scopeKey, catalog);
  return { extraction: selected.extraction, metadata: {
    scope: selected.scope, sourceVersion: sourceHash(full), source: questionSourceInfo(selected.extraction),
    documentSource: { pageCount: full?.pageCount || 0, sourceUnit: full?.sourceUnit || 'page' },
    sections: catalog.sections.map(publicScope), sectionsTruncated: catalog.truncated,
    maxQuestionChars: MAX_QUESTION_CHARS,
  } };
}

module.exports = { readQuestion, questionSourceInfo, getQuestionSource };
