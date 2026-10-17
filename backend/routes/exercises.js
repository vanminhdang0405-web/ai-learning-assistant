const express = require('express');
const multer = require('multer');
const requireAuth = require('../middleware/requireAuth');
const store = require('../services/exerciseStore');
const { inspectImage, MAX_IMAGE_BYTES } = require('../services/exerciseImages');
const { recognizeImage, supportExercise } = require('../services/geminiExercises');
const { getConfig } = require('../services/geminiSummary');
const { acquireAIRequest } = require('../services/aiRequestGate');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0, parts: 2, fieldNameSize: 50 } }).single('image');
let activeUploads = 0;
function bodyOnly(body, keys) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !keys.includes(k))) throw store.fail(400, 'INVALID_REQUEST', 'Nội dung yêu cầu không hợp lệ.');
}
router.use(requireAuth);
router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.get('/', (req, res) => res.json({ success: true, exercises: store.list(req.userId) }));
router.post('/', (req, res, next) => {
  try {
    bodyOnly(req.body, ['text','confirmed','creationKey']);
    if (req.body.confirmed !== true) throw store.fail(400, 'REVIEW_REQUIRED', 'Hãy kiểm tra và xác nhận nội dung đề trước khi gửi.');
    const result = store.create(req.userId, req.body.text, req.body.creationKey);
    res.status(result.created ? 201 : 200).json({ success: true, exercise: result.exercise });
  } catch (error) { next(error); }
});

async function withAI(req, res, next, task) {
  const controller = new AbortController();
  const close = () => { if (!res.writableEnded) controller.abort(); };
  res.on('close', close);
  let release;
  try {
    getConfig(); release = acquireAIRequest(req.userId);
    const finish = await task(controller.signal);
    if (res.destroyed) return;
    // Re-check token revocation/user existence before returning or persisting a result.
    requireAuth(req, res, () => res.json({ success: true, ...finish() }));
  } catch (error) { if (!res.destroyed) next(error); }
  finally { release?.(); res.off('close', close); }
}
router.post('/recognize', (req, res, next) => {
  if (activeUploads >= 2) return next(store.fail(429, 'UPLOAD_BUSY', 'Đang nhận nhiều ảnh. Hãy chờ rồi thử lại.'));
  activeUploads++;
  upload(req, res, error => {
    activeUploads--;
    if (error) return next(error);
    let image;
    try { image = inspectImage(req.file); } catch (failure) { return next(failure); }
    return withAI(req, res, next, async signal => {
      const recognition = await recognizeImage(image, signal);
      return () => ({ recognition });
    });
  });
});
router.get('/:id', (req, res, next) => {
  try { res.json({ success: true, exercise: store.read(req.params.id, req.userId) }); } catch (error) { next(error); }
});
router.delete('/:id', (req, res, next) => {
  try { store.remove(req.params.id, req.userId); res.json({ success: true }); } catch (error) { next(error); }
});
router.post('/:id/support', (req, res, next) => {
  try {
    bodyOnly(req.body, ['kind','question','revision','confirmSolution']);
    const item = store.read(req.params.id, req.userId);
    const action = store.prepare(item, req.body);
    if (action.cached) return res.json({ success: true, exercise: item, cached: true });
    return withAI(req, res, next, async signal => {
      const content = await supportExercise(item, action, signal);
      return () => ({ exercise: store.commit(item.id, req.userId, item.revision, action, content) });
    });
  } catch (error) { next(error); }
});
router.use((error, req, res, next) => {
  if (res.destroyed) return;
  if (error instanceof multer.MulterError) {
    const large = error.code === 'LIMIT_FILE_SIZE';
    return res.status(large ? 413 : 400).json({ success: false, code: large ? 'IMAGE_TOO_LARGE' : 'INVALID_IMAGE_UPLOAD',
      message: large ? 'Ảnh vượt giới hạn 5 MB.' : 'Chỉ gửi một ảnh trong trường image, không kèm dữ liệu khác.' });
  }
  if (!error.status) return next(error);
  if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
  res.status(error.status).json({ success: false, code: error.code, message: error.message });
});
module.exports = router;
