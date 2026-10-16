import { authorizedRequest } from './auth';

function checkedId(id) {
  const value = Number(id);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('Mã tài liệu không hợp lệ.');
  return value;
}
function checkedScope(scope) {
  if (typeof scope !== 'string' || !/^(all|range:[1-9]\d{0,5}:[1-9]\d{0,5}|section:[1-9]\d{0,5}:\d{1,7})$/.test(scope)) {
    throw new Error('Phạm vi hỏi đáp không hợp lệ.');
  }
  return scope;
}

export function getQuestionSource(id, scope = 'all') {
  return authorizedRequest(`/documents/${checkedId(id)}/questions/source?scope=${encodeURIComponent(checkedScope(scope))}`);
}

export function askDocumentQuestion(id, question, scope, sourceVersion, conversation = null) {
  if (typeof question !== 'string' || question.trim().length < 3 || question.trim().length > 1000) {
    throw new Error('Câu hỏi cần từ 3 đến 1.000 ký tự.');
  }
  if (typeof sourceVersion !== 'string' || !/^[a-f0-9]{64}$/.test(sourceVersion)) {
    throw new Error('Hãy tải lại phạm vi trước khi gửi câu hỏi.');
  }
  return authorizedRequest(`/documents/${checkedId(id)}/questions`, {
    method: 'POST', body: { question: question.trim(), scope: checkedScope(scope), sourceVersion,
      ...(conversation ? { conversationId: checkedConversationId(conversation.id), revision: checkedRevision(conversation.revision) } : {}) }, timeoutMs: 150000,
  });
}

function checkedConversationId(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) throw new Error('Mã hội thoại không hợp lệ.');
  return id;
}
function checkedRevision(value) {
  if (!Number.isInteger(value) || value < 0 || value > 10) throw new Error('Phiên bản hội thoại không hợp lệ.');
  return value;
}
const conversationPath = (id, conversationId) => `/documents/${checkedId(id)}/conversations/${checkedConversationId(conversationId)}`;
export function createConversation(id, scope, sourceVersion) {
  return authorizedRequest(`/documents/${checkedId(id)}/conversations`, {
    method: 'POST', body: { scope: checkedScope(scope), sourceVersion },
  });
}
export function getConversations(id) {
  return authorizedRequest(`/documents/${checkedId(id)}/conversations`);
}
export function getConversation(id, conversationId) {
  return authorizedRequest(conversationPath(id, conversationId));
}
export function saveConversation(id, conversationId, revision) {
  return authorizedRequest(`${conversationPath(id, conversationId)}/save`, { method: 'POST', body: { revision: checkedRevision(revision) } });
}
export function deleteConversation(id, conversationId, temporaryOnly = false) {
  return authorizedRequest(`${conversationPath(id, conversationId)}${temporaryOnly ? '?temporaryOnly=true' : ''}`, { method: 'DELETE' });
}
