const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');
const db = require('../db');

function requireAuth(req, res, next) {
  const authorization = req.get('Authorization') ?? '';
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);

  if (!match) {
    return res.status(401).json({
      success: false,
      message: 'Bạn cần đăng nhập.',
    });
  }

  try {
    const payload = jwt.verify(match[1], JWT_SECRET, {
      algorithms: ['HS256'],
    });

    const userId = Number(payload.sub);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: 'Token không hợp lệ.',
      });
    }

    const user = db.prepare('SELECT token_version FROM users WHERE id = ?').get(userId);
    if (!user || !Number.isSafeInteger(payload.tokenVersion)
      || payload.tokenVersion !== user.token_version) {
      return res.status(401).json({
        success: false,
        message: 'Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại.',
      });
    }

    req.userId = userId;
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
    });
  }

  next();
}

module.exports = requireAuth;