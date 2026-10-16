const express = require('express');
const { randomUUID } = require('node:crypto');
const requireAuth = require('../middleware/requireAuth');
const { getSource, sourceHash } = require('../services/documentSummaryStore');
const { readQuestion, getQuestionSource } = require('../services/documentQuestionSource');
const { getConfig } = require('../services/geminiSummary');
const { generateAnswer } = require('../services/geminiQuestions');
const { acquireAIRequest } = require('../services/aiRequestGate');
const conversations = require('../services/documentConversationStore');

const router = express.Router();
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
function checkBody(body, fields) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !fields.includes(key))) {
    throw fail(400, 'INVALID_REQUEST', 'Nội dung yêu cầu không hợp lệ.');
  }
}
function readySource(documentId, userId, scope, version) {
  const data = getQuestionSource(documentId, userId, scope);
  if (version !== data.metadata.sourceVersion) throw fail(409, 'SOURCE_CHANGED', 'Văn bản đã thay đổi. Hãy bắt đầu cuộc trò chuyện mới để dùng nguồn hiện tại.');
  if (!data.metadata.source.ready) throw fail(422, 'SOURCE_NOT_READY', data.metadata.source.reason);
  return data;
}
function sendError(error, res, next) {
  if (res.destroyed) return;
  if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
  if (error.status) return res.status(error.status).json({ success: false, code: error.code, message: error.message });
  next(error);
}

router.get('/questions/source', (req, res, next) => {
  try {
    if (Object.keys(req.query).some(key => key !== 'scope')) {
      return res.status(400).json({ success: false, message: 'Tham số phạm vi không hợp lệ.' });
    }
    const { metadata } = getQuestionSource(req.documentId, req.userId, req.query.scope);
    res.set('Cache-Control', 'private, no-store');
    res.json({ success: true, ...metadata });
  } catch (error) { sendError(error, res, next); }
});

router.get('/conversations', (req, res, next) => {
  try {
    const version = sourceHash(getSource(req.documentId, req.userId).extraction);
    res.set('Cache-Control', 'private, no-store');
    res.json({ success: true, conversations: conversations.list(req.documentId, req.userId, version) });
  } catch (error) { sendError(error, res, next); }
});
router.post('/conversations', (req, res, next) => {
  try {
    getSource(req.documentId, req.userId);
    checkBody(req.body, ['scope', 'sourceVersion']);
    const { metadata } = readySource(req.documentId, req.userId, req.body.scope, req.body.sourceVersion);
    const item = conversations.create(req.documentId, req.userId, metadata);
    res.set('Cache-Control', 'private, no-store');
    res.status(201).json({ success: true, conversation: conversations.present(item, metadata.sourceVersion) });
  } catch (error) { sendError(error, res, next); }
});
router.get('/conversations/:conversationId', (req, res, next) => {
  try {
    const version = sourceHash(getSource(req.documentId, req.userId).extraction);
    const item = conversations.read(req.params.conversationId, req.documentId, req.userId);
    res.set('Cache-Control', 'private, no-store');
    res.json({ success: true, conversation: conversations.present(item, version) });
  } catch (error) { sendError(error, res, next); }
});
router.post('/conversations/:conversationId/save', (req, res, next) => {
  try {
    const version = sourceHash(getSource(req.documentId, req.userId).extraction);
    checkBody(req.body, ['revision']);
    const item = conversations.save(req.params.conversationId, req.documentId, req.userId, req.body.revision);
    res.set('Cache-Control', 'private, no-store');
    res.json({ success: true, conversation: conversations.present(item, version) });
  } catch (error) { sendError(error, res, next); }
});
router.delete('/conversations/:conversationId', (req, res, next) => {
  try {
    getSource(req.documentId, req.userId);
    if (Object.keys(req.query).some(key => key !== 'temporaryOnly')
        || (req.query.temporaryOnly !== undefined && req.query.temporaryOnly !== 'true')) {
      throw fail(400, 'INVALID_REQUEST', 'Tham số xóa hội thoại không hợp lệ.');
    }
    const removed = conversations.remove(req.params.conversationId, req.documentId, req.userId, req.query.temporaryOnly === 'true');
    res.json({ success: true, removed });
  } catch (error) { sendError(error, res, next); }
});

router.post('/questions', async (req, res, next) => {
  const controller = new AbortController();
  let releaseSlot;
  const startedAt = Date.now();
  let logged = false;
  const logResult = status => {
    if (logged) return;
    logged = true;
    console.info('[question-api]', JSON.stringify({ documentId: req.documentId, status, elapsedMs: Date.now() - startedAt }));
  };
  res.once('finish', () => logResult(res.statusCode));
  const onClose = () => { if (!res.writableEnded) { logResult(499); controller.abort(); } };
  res.on('close', onClose);
  try {
    getSource(req.documentId, req.userId); // Check ownership before processing content.
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
        || Object.keys(req.body).some(key => !['question', 'scope', 'sourceVersion', 'conversationId', 'revision'].includes(key))) {
      return res.status(400).json({ success: false, message: 'Nội dung yêu cầu hỏi đáp không hợp lệ.' });
    }
    const question = readQuestion(req.body.question);
    let conversation;
    if (Object.hasOwn(req.body, 'conversationId')) {
      conversation = conversations.read(req.body.conversationId, req.documentId, req.userId);
      conversations.expectRevision(conversation, req.body.revision);
      if (conversation.scope.key !== req.body.scope || conversation.sourceVersion !== req.body.sourceVersion) {
        throw fail(409, 'CONVERSATION_SOURCE', 'Cuộc trò chuyện thuộc phạm vi hoặc phiên bản văn bản khác. Hãy bắt đầu cuộc trò chuyện mới.');
      }
      if (conversation.revision >= conversations.MAX_TURNS) throw fail(409, 'CONVERSATION_LIMIT', 'Đã đủ 10 lượt hỏi đáp. Hãy bắt đầu cuộc trò chuyện mới.');
    } else if (Object.hasOwn(req.body, 'revision')) throw fail(400, 'INVALID_CONVERSATION', 'Thiếu mã cuộc trò chuyện.');
    const { extraction, metadata } = getQuestionSource(req.documentId, req.userId, req.body.scope);
    res.set('Cache-Control', 'private, no-store');
    if (!metadata.source.ready) return res.status(422).json({ success: false, code: 'SOURCE_NOT_READY', message: metadata.source.reason });
    if (req.body.sourceVersion !== metadata.sourceVersion) {
      return res.status(409).json({ success: false, code: 'SOURCE_CHANGED', message: 'Văn bản đã thay đổi hoặc chưa được tải. Bấm Tải lại phạm vi rồi gửi lại câu hỏi.' });
    }
    getConfig();
    releaseSlot = acquireAIRequest(req.userId);
    const result = await generateAnswer(extraction, question, { signal: controller.signal, scope: metadata.scope,
      history: conversation?.turns || [] });
    if (res.destroyed) return;
    requireAuth(req, res, () => {
      const current = getSource(req.documentId, req.userId).extraction;
      if (sourceHash(current) !== metadata.sourceVersion) {
        throw Object.assign(new Error('Văn bản thay đổi trong lúc AI trả lời. Tải lại phạm vi rồi hỏi lại.'), { status: 409, code: 'SOURCE_CHANGED' });
      }
      const createdAt = new Date().toISOString();
      const updated = conversation ? conversations.append(conversation.id, req.documentId, req.userId, req.body.revision,
        { id: randomUUID(), question, answer: result.content, sourceUnit: metadata.source.sourceUnit, createdAt }) : null;
      res.json({ success: true, documentId: req.documentId, question, scope: metadata.scope,
        sourceVersion: metadata.sourceVersion, sourceUnit: metadata.source.sourceUnit,
        answer: result.content, createdAt, ...(updated ? { conversation: conversations.present(updated, metadata.sourceVersion) } : {}) });
    });
  } catch (error) { sendError(error, res, next); }
  finally { releaseSlot?.(); res.off('close', onClose); }
});

module.exports = router;
