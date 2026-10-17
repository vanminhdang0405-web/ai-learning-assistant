import { File } from 'expo-file-system';
import { authorizedRequest } from './auth';

function id(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)) throw new Error('Mã bài tập không hợp lệ.');
  return value;
}
export async function recognizeExerciseImage(image) {
  if (!image?.uri) throw new Error('Hãy chọn hoặc chụp ảnh trước.');
  const file = new File(image.uri);
  if (!file.exists || !file.size) throw new Error('Không đọc được ảnh đã chọn. Hãy chọn lại.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Ảnh vượt giới hạn 5 MB.');
  const body = new FormData();
  // Expo File implements Blob; do not append the old {uri,name,type} object.
  body.append('image', file);
  const data = await authorizedRequest('/exercises/recognize', { method: 'POST', body, timeoutMs: 150000 });
  return data.recognition;
}
export async function createExercise(text, creationKey) {
  if (typeof text !== 'string' || text.trim().length < 3 || text.length > 12000) throw new Error('Đề bài cần từ 3 đến 12.000 ký tự.');
  const data = await authorizedRequest('/exercises', { method: 'POST', body: { text: text.trim(), confirmed: true, creationKey } });
  return data.exercise;
}
export async function listExercises() { return (await authorizedRequest('/exercises')).exercises; }
export async function getExercise(value) { return (await authorizedRequest(`/exercises/${id(value)}`)).exercise; }
export function deleteExercise(value) { return authorizedRequest(`/exercises/${id(value)}`, { method: 'DELETE' }); }
export async function supportExercise(exercise, kind, question = '') {
  if (!['analyze','hint','explain','solution','followup'].includes(kind)) throw new Error('Thao tác hỗ trợ chưa hợp lệ.');
  if (!Number.isInteger(exercise?.revision) || exercise.revision < 0 || exercise.revision > 20) throw new Error('Hãy đồng bộ lại bài tập.');
  if (['explain','followup'].includes(kind) && (question.trim().length < 3 || question.trim().length > 1000)) throw new Error('Câu hỏi cần từ 3 đến 1.000 ký tự.');
  return (await authorizedRequest(`/exercises/${id(exercise.id)}/support`, { method: 'POST', timeoutMs: 150000,
    body: { kind, revision: exercise.revision, ...(['explain','followup'].includes(kind) ? { question: question.trim() } : {}),
      ...(kind === 'solution' ? { confirmSolution: true } : {}) } })).exercise;
}
