const { fail } = require('./exerciseStore');
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
function inspectImage(file) {
  const data = file?.buffer;
  const invalid = () => fail(400, 'INVALID_EXERCISE_IMAGE', 'Ảnh không hợp lệ. Hãy chụp/chọn lại ảnh JPEG hoặc PNG rõ nét.');
  if (!Buffer.isBuffer(data) || data.length < 24) throw invalid();
  if (data.length > MAX_IMAGE_BYTES) throw fail(413, 'IMAGE_TOO_LARGE', 'Ảnh vượt giới hạn 5 MB. Hãy chọn ảnh nhỏ hơn.');
  let mimeType, width, height;
  if (data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && data.toString('ascii', 12, 16) === 'IHDR') {
    mimeType = 'image/png'; width = data.readUInt32BE(16); height = data.readUInt32BE(20);
  } else if (data[0] === 0xff && data[1] === 0xd8) {
    mimeType = 'image/jpeg';
    let offset = 2;
    while (offset + 4 <= data.length) {
      if (data[offset++] !== 0xff) throw invalid();
      while (data[offset] === 0xff) offset++;
      const marker = data[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > data.length) throw invalid();
      const length = data.readUInt16BE(offset);
      if (length < 2 || offset + length > data.length) throw invalid();
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        if (length < 8) throw invalid();
        height = data.readUInt16BE(offset + 3); width = data.readUInt16BE(offset + 5); break;
      }
      offset += length;
    }
  }
  if (!mimeType || file.mimetype !== mimeType || !width || !height) throw invalid();
  if (width > 8192 || height > 8192 || width * height > 16000000) throw fail(413, 'IMAGE_DIMENSIONS', 'Ảnh có độ phân giải quá lớn. Chọn lại ảnh qua ứng dụng để thu nhỏ.');
  return { mimeType, data: data.toString('base64'), width, height };
}
module.exports = { inspectImage, MAX_IMAGE_BYTES };
