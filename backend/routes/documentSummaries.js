const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { getSource, sourceHash, readSummary, saveSummary, savedRanges, listSavedSummaries } = require('../services/documentSummaryStore');
const { generateSummary, getConfig, sourceInfo } = require('../services/geminiSummary');

const { findSections, resolveScope, publicScope } = require('../services/summaryScopes');

const { readLevel } = require('../services/summaryLevels');

const router = express.Router();
const active = new Set();
const lastAttempt = new Map();
let globalAttempt = 0;

function sendError(error, res, next) {
  if (res.destroyed) return;
  if (error.status) return res.status(error.status).json({ success: false, message: error.message, code: error.code });
  return next(error);
}

function selectionData(documentId, userId, full, scopeKey, oldSummary = null) {
  const catalog = findSections(full);
  let selected;
  let unavailable = false;
  try { selected = resolveScope(full, scopeKey, catalog); }
  catch (error) {
    if (!oldSummary || error.code !== 'INVALID_SUMMARY_SCOPE') throw error;
    // A saved section can still be read after its old heading/range disappears.
    selected = { scope: oldSummary.scope, extraction: null };
    unavailable = true;
  }
  const source = sourceInfo(selected.extraction);
  if (full) source.sourceUnit = full.sourceUnit;
  if (unavailable) source.reason = 'Phạm vi của bản lưu không còn trong văn bản hiện tại. Bạn vẫn có thể đọc bản cũ; chọn phạm vi mới để tạo tóm tắt.';
  const nonempty = selected.extraction?.pages.filter(p => p.text.trim()) || [];
  return { selected, response: {
    scope: selected.scope,
    sourceVersion: sourceHash(full),
    source: { ...source,
      previewStart: nonempty[0]?.text.slice(0, 300) || '',
      previewEnd: nonempty.at(-1)?.text.slice(-300) || '' },
    documentSource: { pageCount: full?.pageCount || 0, sourceUnit: full?.sourceUnit || 'page' },
    sections: catalog.sections.map(publicScope),
    sectionsTruncated: catalog.truncated,
    savedRanges: savedRanges(documentId, userId, full),
    savedSummaries: listSavedSummaries(documentId, userId, full),
  } };
}

router.get('/summary', (req, res, next) => {
  try {
    if (Object.keys(req.query).some(key => !['level', 'scope'].includes(key))) {
      return res.status(400).json({ success: false, message: 'Tham số chọn phạm vi/mức không hợp lệ.' });
    }
    const level = readLevel(req.query.level);
    const { extraction } = getSource(req.documentId, req.userId);
    res.set('Cache-Control', 'private, no-store');
    const scopeKey = req.query.scope ?? 'all';
    if (typeof scopeKey !== 'string') {
      return res.status(400).json({ success: false, message: 'Phạm vi tóm tắt không hợp lệ.' });
    }
    const summary = readSummary(req.documentId, req.userId, extraction, level, scopeKey);
    const { response } = selectionData(req.documentId, req.userId, extraction, scopeKey, summary);
    res.json({ success: true, level, ...response, summary });
  } catch (error) { sendError(error, res, next); }
});

router.post('/summarize', async (req, res, next) => {
  let ownsSlot = false;
  const controller = new AbortController();
  const startedAt = Date.now();
  let logged = false;
  const logResult = status => {
    if (logged) return;
    logged = true;
    console.info('[summary-api]', JSON.stringify({ documentId: req.documentId, status, elapsedMs: Date.now() - startedAt }));
  };
  res.once('finish', () => logResult(res.statusCode));
  const onClose = () => {
    if (!res.writableEnded) {
      logResult(499);
      controller.abort();
    }
  };
  res.on('close', onClose);
  try {
    const level = readLevel(req.body?.level);
    const force = req.body?.force ?? false;
    if (typeof force !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Tham số tạo lại không hợp lệ.' });
    }
    const { extraction } = getSource(req.documentId, req.userId);
    res.set('Cache-Control', 'private, no-store');
    const { selected, response } = selectionData(req.documentId, req.userId, extraction, req.body?.scope);
    const scopeKey = selected.scope.key;
    // Prevent a selection made against an old extraction from silently changing meaning.
    if ((scopeKey !== 'all' || req.body?.sourceVersion !== undefined)
        && req.body?.sourceVersion !== sourceHash(extraction)) {
      return res.status(409).json({ success: false, code: 'SOURCE_CHANGED',
        message: 'Văn bản đã thay đổi hoặc phạm vi chưa được tải. Bấm Tải bản đã lưu, kiểm tra phạm vi rồi tạo lại.' });
    }
    const existing = readSummary(req.documentId, req.userId, extraction, level, scopeKey);
    if (existing && !existing.stale && !force) {
      return res.json({ success: true, level, cached: true, summary: existing, ...response });
    }
    const source = response.source;
    if (!source.ready) return res.status(422).json({ success: false, message: source.reason });
    getConfig(); // Thiếu key không tiêu tốn khoảng chờ.
    if (active.size) {
      return res.status(409).json({ success: false, message: 'Đang có tài liệu được tóm tắt. Chờ hoàn tất rồi bấm Tải bản đã lưu.' });
    }
    const now = Date.now();
    const waitMs = Math.max(15000 - (now - globalAttempt), 30000 - (now - (lastAttempt.get(req.userId) || 0)));
    if (waitMs > 0) {
      const seconds = Math.ceil(waitMs / 1000);
      res.set('Retry-After', String(seconds));
      return res.status(429).json({ success: false, message: `Vui lòng chờ ${seconds} giây trước khi tạo tóm tắt tiếp theo.` });
    }
    for (const [id, time] of lastAttempt) if (now - time >= 30000) lastAttempt.delete(id);
    globalAttempt = now;
    lastAttempt.set(req.userId, now);
    active.add(req.documentId);
    ownsSlot = true;
    const hash = sourceHash(extraction);
    const result = await generateSummary(selected.extraction, { signal: controller.signal, level, scope: selected.scope });
    if (res.destroyed) return;
    // Xác thực lại vì token có thể bị thu hồi trong khi chờ Gemini.
    requireAuth(req, res, () => {
      const summary = saveSummary(req.documentId, req.userId, hash, result, scopeKey);
      res.json({ success: true, level, cached: false, ...response, summary,
        savedRanges: savedRanges(req.documentId, req.userId, extraction),
        savedSummaries: listSavedSummaries(req.documentId, req.userId, extraction) });
    });
  } catch (error) {
    sendError(error, res, next);
  } finally {
    if (ownsSlot) active.delete(req.documentId);
    res.off('close', onClose);
  }
});

module.exports = router;
