// config.js hiện tại đã nạp biến môi trường từ backend/.env
require('./config');

const nodemailer = require('nodemailer');

const smtpUser = process.env.SMTP_USER?.trim();
const smtpPass = process.env.SMTP_PASS?.replace(/\s/g, '');

if (!smtpUser || !smtpPass) {
  throw new Error('Thiếu SMTP_USER hoặc SMTP_PASS trong backend/.env');
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 30000,
});

async function sendEmail({ to, subject, text }) {
  return transporter.sendMail({
    from: {
      name: 'AI Learning Assistant',
      address: smtpUser,
    },
    to,
    subject,
    text,
  });
}

module.exports = { sendEmail };