import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDocumentText, extractDocumentText } from '../services/documents';

export default function DocumentTextScreen({ route, navigation }) {
  const { documentId, documentName } = route.params;
  const [extraction, setExtraction] = useState(null);
  const [busy, setBusy] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const mounted = useRef(false);
  const working = useRef(false);
  const currentId = useRef(documentId);

  useEffect(() => {
    mounted.current = true;
    currentId.current = documentId;
    working.current = false;
    setExtraction(null);
    loadSaved();
    return () => { mounted.current = false; };
  }, [documentId]);

  function isCurrent(id) {
    return mounted.current && currentId.current === id;
  }

  function showError(error) {
    setErrorMessage(error.message || 'Vui lòng thử lại.');
    if (error.status === 401) {
      setExtraction(null);
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      Alert.alert('Cần đăng nhập', 'Phiên đăng nhập đã hết hạn. Bạn vui lòng đăng nhập lại.');
    } else if (error.status === 404) {
      setExtraction(null);
      Alert.alert('Tài liệu không còn khả dụng', error.message);
    } else {
      Alert.alert('Chưa thực hiện được', error.message || 'Vui lòng thử lại.');
    }
  }

  async function loadSaved() {
    if (working.current) return;
    const id = documentId;
    working.current = true;
    setBusy('loading');
    setErrorMessage('');
    try {
      const result = await getDocumentText(id);
      if (isCurrent(id)) setExtraction(result);
    } catch (error) {
      if (isCurrent(id)) showError(error);
    } finally {
      if (isCurrent(id)) {
        working.current = false;
        setBusy('');
      }
    }
  }

  async function handleExtract() {
    if (working.current) return;
    const id = documentId;
    working.current = true;
    setBusy('extracting');
    setErrorMessage('');
    try {
      const result = await extractDocumentText(id, extraction !== null);
      if (isCurrent(id)) setExtraction(result);
    } catch (error) {
      if (isCurrent(id)) showError(error);
    } finally {
      if (isCurrent(id)) {
        working.current = false;
        setBusy('');
      }
    }
  }

  const disabled = busy !== '';
  const isPart = (extraction?.sourceUnit || route.params.sourceUnit) === 'part';
  const statusLabel = !extraction ? ''
    : extraction.status === 'no_text' ? 'Chưa tìm thấy lớp chữ'
      : extraction.status === 'partial' ? 'Có trang chưa tìm thấy chữ'
        : 'Đã đọc lớp chữ có sẵn';

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <FlatList
        data={extraction?.pages ?? []}
        keyExtractor={(page) => String(page.pageNumber)}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>{documentName}</Text>
            <Text style={styles.description}>
              {isPart ? 'DOCX/TXT được lưu thành các phần văn bản, không giữ phân trang của file gốc.' : 'Lấy phần chữ trong PDF và lưu theo trang để chuẩn bị cho tóm tắt, hỏi đáp.'}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={handleExtract}
              style={[styles.primaryButton, disabled && styles.disabled]}
            >
              <Text style={styles.primaryText}>
                {busy === 'extracting' ? 'Đang trích xuất...'
                  : extraction ? 'Trích xuất lại' : 'Trích xuất văn bản'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={loadSaved}
              style={styles.refreshButton}
            >
              <Text style={styles.refreshText}>
                {busy === 'loading' ? 'Đang tải bản đã lưu...' : 'Làm mới bản đã lưu'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => navigation.navigate('DocumentSummary', { documentId, documentName })}
              style={[styles.aiButton, disabled && styles.disabled]}
            >
              <Text style={styles.primaryText}>Tóm tắt bằng AI</Text>
            </Pressable>
            {!!errorMessage && <Text style={styles.error}>{errorMessage}</Text>}
            {extraction && (
              <View style={styles.summary}>
                <Text style={styles.status}>{statusLabel}</Text>
                <Text style={styles.description}>
                  {extraction.pageCount} {isPart ? 'phần văn bản' : 'trang'} · {extraction.charCount.toLocaleString('vi-VN')} ký tự
                </Text>
                <Text style={styles.small}>
                  Đã lưu: {new Date(extraction.extractedAt).toLocaleString('vi-VN')}
                </Text>
                {!isPart && extraction.status !== 'ready' && (
                  <Text style={styles.notice}>
                    {extraction.status === 'no_text'
                      ? 'PDF có thể là ảnh scan hoặc không chứa chữ. Nếu trang có chữ dưới dạng ảnh, cần OCR để đọc. Bản này chưa thực hiện OCR.'
                      : `Trang chưa tìm thấy chữ: ${extraction.pagesWithoutText.join(', ')}. Những trang này có thể trống hoặc chứa ảnh; nếu là ảnh có chữ, cần OCR.`}
                  </Text>
                )}
                <Text style={styles.small}>
                  Chỉ đọc lớp chữ có sẵn. Chữ nằm trong ảnh chưa được nhận dạng.
                  Bố cục bảng, công thức hoặc cột có thể khác tài liệu gốc.
                </Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {busy === 'extracting'
              ? 'Backend đang đọc tài liệu. Bạn có thể chờ tại màn hình này.'
              : busy === 'loading' ? ''
                : errorMessage ? 'Chưa tải được kết quả. Bạn có thể thử lại.'
                  : 'Tài liệu chưa được trích xuất. Bấm nút phía trên để bắt đầu.'}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.page}>
            <Text style={styles.pageTitle}>{isPart ? 'Phần văn bản' : 'Trang'} {item.pageNumber}</Text>
            <Text selectable style={styles.pageText}>
              {item.text || 'Không tìm thấy nội dung văn bản.'}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FB' },
  content: { padding: 20, paddingBottom: 40, flexGrow: 1 },
  title: { fontSize: 22, fontWeight: '700', color: '#172033', marginBottom: 10 },
  description: { fontSize: 14, lineHeight: 22, color: '#596579' },
  primaryButton: { backgroundColor: '#2563EB', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 18 },
  aiButton: { backgroundColor: '#0F766E', borderRadius: 12, padding: 15, alignItems: 'center', marginBottom: 18 },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  refreshButton: { paddingVertical: 14, alignItems: 'center' },
  refreshText: { color: '#2563EB', fontWeight: '600' },
  error: { color: '#B91C1C', lineHeight: 22, marginBottom: 14 },
  summary: { backgroundColor: '#EAF1FF', borderRadius: 12, padding: 16, marginBottom: 18 },
  status: { color: '#1D4ED8', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  small: { fontSize: 12, lineHeight: 19, color: '#596579', marginTop: 8 },
  notice: { color: '#854D0E', fontSize: 14, lineHeight: 22, marginTop: 10 },
  empty: { textAlign: 'center', color: '#596579', lineHeight: 23, marginTop: 24 },
  page: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', padding: 16, marginBottom: 16 },
  pageTitle: { fontSize: 16, fontWeight: '700', color: '#2563EB', marginBottom: 12 },
  pageText: { fontSize: 15, lineHeight: 24, color: '#172033' },
});
