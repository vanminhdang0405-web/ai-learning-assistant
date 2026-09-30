const express = require('express');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Backend AI Learning Assistant đang hoạt động',
  });
});

// Các API tài khoản.
app.use('/api/auth', authRoutes);

// Đặt sau các route để xử lý đường dẫn không tồn tại.
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Không tìm thấy API',
  });
});

// Trả lỗi JSON rõ ràng nếu nội dung gửi lên bị lỗi.
app.use((error, req, res, next) => {
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      message: 'Dữ liệu JSON không hợp lệ.',
    });
  }

  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: 'Dữ liệu gửi lên quá lớn.',
    });
  }

  console.error('Lỗi server:', error.code ?? error.name);

  return res.status(500).json({
    success: false,
    message: 'Đã xảy ra lỗi server.',
  });
});

app.listen(PORT, '0.0.0.0', (error) => {
  if (error) {
    console.error('Không thể khởi động server:', error.message);
    process.exit(1);
  }

  console.log(`Backend đang chạy tại http://localhost:${PORT}`);
});