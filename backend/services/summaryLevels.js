const LEVELS = Object.freeze({
  short: {
    label: 'Ngắn', mainPoints: 3, keyTerms: 2, takeaways: 2, caveats: 2,
    instruction: 'Mức NGẮN: ưu tiên ý cốt lõi, khoảng 100–180 từ nếu nguồn đủ nội dung. Overview 1–2 câu; tối đa 3 ý chính, mỗi ý 1 câu; tối đa 2 thuật ngữ và 2 điều cần nhớ. Không mở rộng giải thích.',
  },
  medium: {
    label: 'Trung bình', mainPoints: 6, keyTerms: 6, takeaways: 5, caveats: 4,
    instruction: 'Mức TRUNG BÌNH: cân bằng độ bao quát và ngắn gọn, khoảng 250–400 từ nếu nguồn đủ nội dung. Overview 2–3 câu; tối đa 6 ý chính với giải thích ngắn, tối đa 6 thuật ngữ và 5 điều cần nhớ.',
  },
  detailed: {
    label: 'Chi tiết', mainPoints: 10, keyTerms: 10, takeaways: 8, caveats: 6,
    instruction: 'Mức CHI TIẾT: bao quát các ý quan trọng và mối liên hệ, khoảng 500–800 từ nếu nguồn đủ nội dung. Overview 3–4 câu; tối đa 10 ý chính, giải thích rõ hơn từng ý; tối đa 10 thuật ngữ và 8 điều cần nhớ. Chỉ đưa ví dụ, quy trình hoặc điều kiện khi nguồn có cung cấp.',
  },
});

function readLevel(value = 'medium') {
  if (typeof value !== 'string' || !Object.hasOwn(LEVELS, value)) {
    throw Object.assign(new Error('Mức tóm tắt không hợp lệ. Chọn Ngắn, Trung bình hoặc Chi tiết.'), {
      status: 400, code: 'INVALID_SUMMARY_LEVEL',
    });
  }
  return value;
}

module.exports = { LEVELS, readLevel };
