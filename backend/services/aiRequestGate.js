// Shared by summary and Q&A so both features respect the same free-tier budget.
let active = null;
let globalAttempt = 0;
const lastAttempt = new Map();

function acquireAIRequest(userId) {
  if (active) throw Object.assign(new Error('AI đang xử lý một yêu cầu khác. Vui lòng chờ hoàn tất rồi thử lại.'), {
    status: 409, code: 'AI_BUSY',
  });
  const now = Date.now();
  const waitMs = Math.max(15000 - (now - globalAttempt), 30000 - (now - (lastAttempt.get(userId) || 0)));
  if (waitMs > 0) {
    const retryAfter = Math.ceil(waitMs / 1000);
    throw Object.assign(new Error(`Vui lòng chờ ${retryAfter} giây trước khi gửi yêu cầu AI tiếp theo.`), {
      status: 429, code: 'AI_COOLDOWN', retryAfter,
    });
  }
  for (const [id, time] of lastAttempt) if (now - time >= 30000) lastAttempt.delete(id);
  globalAttempt = now;
  lastAttempt.set(userId, now);
  const ticket = Symbol('ai-request');
  active = ticket;
  return () => { if (active === ticket) active = null; };
}

module.exports = { acquireAIRequest };
