const express = require('express');
const bcrypt = require('bcryptjs');
const { randomInt, randomBytes, createHmac, timingSafeEqual } = require('node:crypto');
const db = require('../db');
const { JWT_SECRET } = require('../config');
const { sendEmail } = require('../mailer');

const router = express.Router();
const CODE_TTL = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const GENERIC_MESSAGE =
  'Nếu email đã đăng ký và chưa vượt giới hạn gửi, mã xác nhận sẽ được gửi. Vui lòng kiểm tra cả thư Spam.';
const INVALID_CODE = 'Mã không hợp lệ, đã hết hạn hoặc đã vượt số lần thử. Vui lòng yêu cầu mã mới.';

// Tách khóa HMAC theo mục đích; không lưu mã 6 chữ số dạng rõ vào SQLite.
const resetKey = createHmac('sha256', JWT_SECRET)
  .update('ai-learning-assistant:password-reset:v1')
  .digest();

function digest(value) {
  return createHmac('sha256', resetKey).update(value).digest('hex');
}

function codeHash(userId, challengeId, code) {
  return digest(JSON.stringify(['code', userId, challengeId, code]));
}

function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email : null;
}

// Giới hạn lưu trong SQLite nên không bị xóa khi nodemon khởi động lại.
function takeLimit(scope, identity, maximum, duration) {
  const now = Date.now();
  const key = digest(JSON.stringify(['rate', scope, identity]));
  db.prepare('DELETE FROM auth_rate_limits WHERE expires_at <= ?').run(now);
  const result = db.prepare(`
    INSERT INTO auth_rate_limits (bucket_key, hits, expires_at)
    VALUES (?, 1, ?)
    ON CONFLICT(bucket_key) DO UPDATE SET hits = hits + 1
    WHERE hits < ?
  `).run(key, now + duration, maximum);
  return Number(result.changes) === 1;
}

function tooMany(res) {
  return res.status(429).json({
    success: false,
    message: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau 15 phút.',
  });
}

async function deliverCode(user, challengeId, code) {
  try {
    const result = await sendEmail({
      to: user.email,
      subject: 'Mã đặt lại mật khẩu - AI Learning Assistant',
      text: [
        `Mã đặt lại mật khẩu của bạn: ${code}`,
        'Mã có hiệu lực 10 phút và chỉ dùng được một lần.',
        'Khi yêu cầu mã mới, hãy dùng mã trong email mới nhất.',
        'Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.',
        'Không chia sẻ mã này với người khác.',
      ].join('\n'),
    });
    if (!result.accepted?.length) throw new Error('MAIL_NOT_ACCEPTED');
    db.prepare(`
      UPDATE password_resets SET status = 'active'
      WHERE user_id = ? AND challenge_id = ?
    `).run(user.id, challengeId);
  } catch (error) {
    // Không ghi email, mật khẩu, mã xác nhận hay toàn bộ lỗi SMTP vào log.
    console.error('Không gửi được email đặt lại mật khẩu. Kiểm tra cấu hình SMTP/kết nối.');
    db.prepare(`
      DELETE FROM password_resets WHERE user_id = ? AND challenge_id = ?
    `).run(user.id, challengeId);
  }
}

router.post('/forgot-password', (req, res) => {
  try {
    if (!takeLimit('forgot-ip', req.ip, 10, 15 * 60 * 1000)) return tooMany(res);
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email không hợp lệ.' });
    }

    // Cùng cách trả lời cho email có/không có tài khoản và khi bị giới hạn theo email.
    const allowed = takeLimit('forgot-cooldown', email, 1, 60 * 1000)
      && takeLimit('forgot-email-hour', email, 5, 60 * 60 * 1000);
    const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);

    if (allowed && user) {
      const code = String(randomInt(0, 1000000)).padStart(6, '0');
      const challengeId = randomBytes(16).toString('hex');
      db.prepare('DELETE FROM password_resets WHERE expires_at <= ?').run(Date.now());
      db.prepare(`
        INSERT INTO password_resets
          (user_id, challenge_id, code_hash, expires_at, attempts, status)
        VALUES (?, ?, ?, ?, 0, 'pending')
        ON CONFLICT(user_id) DO UPDATE SET
          challenge_id = excluded.challenge_id,
          code_hash = excluded.code_hash,
          expires_at = excluded.expires_at,
          attempts = 0,
          status = 'pending'
      `).run(user.id, challengeId, codeHash(user.id, challengeId, code), Date.now() + CODE_TTL);

      // Không chờ SMTP trong response để tránh tiết lộ tài khoản qua thời gian gửi mail.
      // Phù hợp backend học tập 1 tiến trình; production cần hàng đợi gửi mail bền vững.
      setImmediate(() => {
        deliverCode(user, challengeId, code).catch(() => {
          console.error('Lỗi xử lý yêu cầu gửi mã đặt lại mật khẩu.');
        });
      });
    }

    return res.json({ success: true, message: GENERIC_MESSAGE });
  } catch (error) {
    console.error('Lỗi tạo yêu cầu đặt lại mật khẩu.');
    return res.status(500).json({ success: false, message: 'Chưa xử lý được yêu cầu. Vui lòng thử lại.' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    if (!takeLimit('reset-ip', req.ip, 30, 15 * 60 * 1000)) return tooMany(res);
    const email = normalizeEmail(req.body?.email);
    const { code, newPassword } = req.body ?? {};
    if (!email || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập email và mã gồm 6 chữ số.' });
    }
    // Đồng nhất quy tắc mật khẩu với route đăng ký hiện có.
    if (typeof newPassword !== 'string' || newPassword.length < 8
      || Buffer.byteLength(newPassword, 'utf8') > 72) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu phải có ít nhất 8 ký tự và tối đa 72 byte UTF-8.',
      });
    }

    const reset = db.prepare(`
      SELECT r.*, u.token_version FROM password_resets r
      JOIN users u ON u.id = r.user_id WHERE u.email = ?
    `).get(email);
    const invalid = () => res.status(400).json({ success: false, message: INVALID_CODE });
    if (!reset || reset.status !== 'active' || reset.expires_at <= Date.now()
      || reset.attempts >= MAX_ATTEMPTS) return invalid();

    const expected = Buffer.from(reset.code_hash, 'hex');
    const actual = Buffer.from(codeHash(reset.user_id, reset.challenge_id, code), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      db.prepare(`
        UPDATE password_resets SET attempts = attempts + 1
        WHERE user_id = ? AND challenge_id = ?
      `).run(reset.user_id, reset.challenge_id);
      return invalid();
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Sau await phải kiểm tra lại: mã có thể đã được đổi/dùng/hết hạn trong lúc băm.
    // Transaction đảm bảo chỉ một request thành công và thu hồi JWT cùng lúc đổi pass.
    db.exec('BEGIN IMMEDIATE');
    try {
      const removed = db.prepare(`
        DELETE FROM password_resets
        WHERE user_id = ? AND challenge_id = ? AND status = 'active'
          AND expires_at > ? AND attempts < ?
          AND EXISTS (SELECT 1 FROM users WHERE id = ? AND token_version = ?)
      `).run(reset.user_id, reset.challenge_id, Date.now(), MAX_ATTEMPTS,
        reset.user_id, reset.token_version);
      if (Number(removed.changes) !== 1) {
        db.exec('ROLLBACK');
        return invalid();
      }
      const updated = db.prepare(`
        UPDATE users SET password_hash = ?, token_version = token_version + 1
        WHERE id = ? AND token_version = ?
      `).run(passwordHash, reset.user_id, reset.token_version);
      if (Number(updated.changes) !== 1) throw new Error('ACCOUNT_CHANGED');
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    return res.json({
      success: true,
      message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.',
    });
  } catch (error) {
    console.error('Lỗi đặt lại mật khẩu.');
    return res.status(500).json({ success: false, message: 'Chưa đặt lại được mật khẩu. Vui lòng thử lại.' });
  }
});

module.exports = router;