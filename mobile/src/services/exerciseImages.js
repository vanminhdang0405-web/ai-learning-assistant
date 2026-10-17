import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';

export async function removePreparedImage(image) {
  if (!image?.uri?.startsWith(Paths.cache.uri) || !image.uri.split('/').pop().startsWith('exercise-image-')) return;
  try { await FileSystem.deleteAsync(image.uri, { idempotent: true }); } catch { /* Cache cleanup is best effort. */ }
}
async function prepare(result) {
  if (!result || result.canceled) return null;
  if (result.code) throw new Error('Không nhận được ảnh từ thiết bị. Hãy chọn/chụp lại.');
  const asset = result.assets?.[0];
  if (!asset?.uri || (asset.type && asset.type !== 'image')) throw new Error('Hãy chọn một ảnh đề bài.');
  if (asset.fileSize > 25 * 1024 * 1024) throw new Error('Ảnh gốc vượt 25 MB. Hãy chọn ảnh nhỏ hơn.');
  const context = ImageManipulator.manipulate(asset.uri);
  let rendered, saved, target;
  try {
    if (asset.width > 0 && asset.height > 0 && Math.max(asset.width, asset.height) > 2048) {
      context.resize(asset.width >= asset.height ? { width: 2048 } : { height: 2048 });
    }
    rendered = await context.renderAsync();
    if (Math.max(rendered.width, rendered.height) > 2048) {
      context.resize(rendered.width >= rendered.height ? { width: 2048 } : { height: 2048 });
      rendered.release(); rendered = await context.renderAsync();
    }
    saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
    target = new File(Paths.cache, `exercise-image-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
    await FileSystem.copyAsync({ from: saved.uri, to: target.uri });
    if (!target.exists || !target.size || target.size > 5 * 1024 * 1024) throw new Error('Ảnh sau xử lý chưa hợp lệ hoặc vượt 5 MB. Hãy chọn ảnh khác.');
    return { uri: target.uri, width: saved.width, height: saved.height, size: target.size };
  } catch (error) {
    if (target) await removePreparedImage(target);
    throw error;
  } finally {
    rendered?.release(); context.release();
    if (saved?.uri) { try { await FileSystem.deleteAsync(saved.uri, { idempotent: true }); } catch { /* Own generated cache only. */ } }
  }
}
export async function chooseExerciseImage(fromCamera = false) {
  if (fromCamera) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error(permission.canAskAgain
      ? 'Bạn chưa cho phép dùng máy ảnh. Bấm Chụp đề bài và cấp quyền, hoặc chọn ảnh có sẵn.'
      : 'Quyền máy ảnh đang bị chặn. Vào Cài đặt điện thoại → Ứng dụng → Expo Go/ứng dụng này → Quyền → Máy ảnh để bật lại.');
  }
  /** @type {ImagePicker.ImagePickerOptions} */
  const options = { mediaTypes: ['images'], allowsEditing: false, allowsMultipleSelection: false, quality: 1, exif: false };
  return prepare(fromCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options));
}
export async function recoverExerciseImage() {
  return prepare(await ImagePicker.getPendingResultAsync());
}
