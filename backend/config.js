const path = require('node:path');

require('dotenv').config({
  path: path.join(__dirname, '.env'),
});

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || !/^[a-f0-9]{64}$/i.test(JWT_SECRET)) {
  throw new Error(
    'JWT_SECRET chưa hợp lệ. Hãy đặt chuỗi hex 64 ký tự vào backend/.env.'
  );
}

module.exports = { JWT_SECRET };