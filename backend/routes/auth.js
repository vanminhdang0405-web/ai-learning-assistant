const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body ?? {};

    // Kiểm tra dữ liệu gửi lên có đúng kiểu chuỗi không.
    if (
      typeof name !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string'
    ) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập họ tên, email và mật khẩu.',
      });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName || cleanName.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Họ tên phải có từ 1 đến 100 ký tự.',
      });
    }

    if (
      cleanEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Email không hợp lệ.',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu phải có ít nhất 8 ký tự.',
      });
    }

    if (Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu quá dài. Vui lòng dùng mật khẩu ngắn hơn.',
      });
    }

    // Chỉ lưu mật khẩu đã băm vào cơ sở dữ liệu.
    const passwordHash = await bcrypt.hash(password, 12);

    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash)
      VALUES (?, ?, ?)
    `).run(cleanName, cleanEmail, passwordHash);

    return res.status(201).json({
      success: true,
      message: 'Đăng ký thành công.',
      user: {
        id: Number(result.lastInsertRowid),
        name: cleanName,
        email: cleanEmail,
      },
    });
  } catch (error) {
    if (error.code === 'ERR_SQLITE_ERROR' && error.errcode === 2067) {
      return res.status(409).json({
        success: false,
        message: 'Email này đã được đăng ký.',
      });
    }

    console.error('Lỗi đăng nhập:', error.stack);

    return res.status(500).json({
      success: false,
      message: 'Không thể đăng ký lúc này. Vui lòng thử lại.',
    });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập email và mật khẩu.',
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    if (
      cleanEmail.length > 254 ||
      Buffer.byteLength(password, 'utf8') > 72
    ) {
      return res.status(400).json({
        success: false,
        message: 'Thông tin đăng nhập không hợp lệ.',
      });
    }

    const user = db.prepare(`
      SELECT id, name, email, password_hash
      FROM users
      WHERE email = ?
    `).get(cleanEmail);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Email hoặc mật khẩu không đúng.',
      });
    }

    // So sánh mật khẩu nhập vào với bản băm trong cơ sở dữ liệu.
    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: 'Email hoặc mật khẩu không đúng.',
      });
    }

    // Token chứa mã người dùng, có hiệu lực trong 1 giờ.
    const token = jwt.sign(
      {},
      JWT_SECRET,
      {
        algorithm: 'HS256',
        subject: String(user.id),
        expiresIn: '1h',
      }
    );

    return res.json({
      success: true,
      message: 'Đăng nhập thành công.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Lỗi đăng nhập:', error.code ?? error.name);

    return res.status(500).json({
      success: false,
      message: 'Không thể đăng nhập lúc này. Vui lòng thử lại.',
    });
  }
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(`
    SELECT id, name, email, created_at
    FROM users
    WHERE id = ?
  `).get(req.userId);

  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Tài khoản không còn tồn tại.',
    });
  }

  return res.json({
    success: true,
    user,
  });
});

module.exports = router;

