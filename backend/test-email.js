const { sendEmail } = require('./mailer');

async function main() {
  // Gửi thử đến chính Gmail đã cấu hình.
  const result = await sendEmail({
    to: process.env.SMTP_USER.trim(),
    subject: 'Kiểm tra email - AI Learning Assistant',
    text: [
      'Xin chào!',
      '',
      'Backend AI Learning Assistant đã gửi được email.',
      'Đây là thư kiểm tra cấu hình, chưa phải mã đặt lại mật khẩu.',
    ].join('\n'),
  });

  if (!result.accepted || result.accepted.length === 0) {
    throw new Error('Máy chủ email chưa chấp nhận người nhận.');
  }

  console.log('Máy chủ email đã chấp nhận thư gửi thử.');
  console.log('Hãy kiểm tra Hộp thư đến và thư Spam của Gmail.');
}

main().catch((error) => {
  console.error('Gửi email thất bại:', error.code || '', error.message);
  process.exitCode = 1;
});