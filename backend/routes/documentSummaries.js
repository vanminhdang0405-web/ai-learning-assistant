const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { getSource, sourceHash, readSummary, saveSummary } = require('../services/documentSummaryStore');
const { generateSummary, getConfig, sourceInfo } = require('../services/geminiSummary');

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

router.get('/summary', (req, res, next) => {
  try {
    const level = readLevel(req.query.level);
    const { extraction } = getSource(req.documentId, req.userId);
    res.set('Cache-Control', 'private, no-store');
    res.json({ success: true, level, summary: readSummary(req.documentId, req.userId, extraction, level), source: sourceInfo(extraction) });
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
    const existing = readSummary(req.documentId, req.userId, extraction, level);
    if (existing && !existing.stale && !force) {
      return res.json({ success: true, level, cached: true, summary: existing, source: sourceInfo(extraction) });
    }
    const source = sourceInfo(extraction);
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
    const result = await generateSummary(extraction, { signal: controller.signal, level });
    if (res.destroyed) return;
    // Xác thực lại vì token có thể bị thu hồi trong khi chờ Gemini.
    requireAuth(req, res, () => {
      const summary = saveSummary(req.documentId, req.userId, hash, result);
      res.json({ success: true, level, cached: false, summary, source });
    });
  } catch (error) {
    sendError(error, res, next);
  } finally {
    if (ownsSlot) active.delete(req.documentId);
    res.off('close', onClose);
  }
});

module.exports = router;
