import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DocumentQuestionsPanel from './DocumentQuestionsPanel';
import { getDocumentText, extractDocumentText } from '../services/documents';
import { Badge, Button, Disclosure, EmptyState, Icon, Notice } from '../components/AppUI';
import { colors, ui } from '../theme';

export default function DocumentTextScreen({ route, navigation }) {
  const { documentId, documentName } = route.params;
  const [showQuestions, setShowQuestions] = useState(false);
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
    setShowQuestions(false);
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

  if (showQuestions) {
    return <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <DocumentQuestionsPanel documentId={documentId} documentName={documentName}
        onShowText={() => { setShowQuestions(false); loadSaved(); }}
        onSessionExpired={() => showError({ status: 401, message: 'Phiên đăng nhập đã hết hạn.' })} />
    </SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <FlatList
        data={extraction?.pages ?? []}
        keyExtractor={(page) => String(page.pageNumber)}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <Text style={styles.eyebrow}>KHÔNG GIAN TÀI LIỆU</Text><Text style={styles.title}>{documentName}</Text>
            <Text style={styles.description}>Đọc nội dung, nắm ý chính và hỏi sâu hơn.</Text>
            <View style={styles.tabs}>
              <View style={[styles.tab, styles.activeTab]}><Icon name="align-left" size={17} /><Text style={styles.activeLabel}>Văn bản</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel="Tóm tắt bằng AI" disabled={disabled} onPress={() => navigation.navigate('DocumentSummary', { documentId, documentName })} style={styles.tab}><Icon name="zap" size={17} color={colors.muted} /><Text style={styles.tabLabel}>Tóm tắt</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Hỏi đáp với tài liệu" disabled={disabled} onPress={() => setShowQuestions(true)} style={styles.tab}><Icon name="message-circle" size={17} color={colors.muted} /><Text style={styles.tabLabel}>Hỏi đáp</Text></Pressable>
            </View>
            <View style={styles.readerActions}>
              <Button compact icon="file-text" label={busy === 'extracting' ? 'Đang trích xuất…' : extraction ? 'Trích xuất lại' : 'Trích xuất văn bản'}
                tone={extraction ? 'secondary' : 'primary'} disabled={disabled} loading={busy === 'extracting'} onPress={handleExtract} style={{ flex: 1 }} />
              <Button compact tone="ghost" label="Làm mới" icon="refresh-cw" disabled={disabled} loading={busy === 'loading'} onPress={loadSaved} />
            </View>
            {!!errorMessage && <Text style={styles.error}>{errorMessage}</Text>}
            {extraction && <>
              <View style={styles.statusRow}><Badge label={statusLabel} icon={extraction.status === 'ready' ? 'check-circle' : 'info'} tone={extraction.status === 'ready' ? 'green' : 'amber'} />
                <Text style={styles.small}>{extraction.pageCount} {isPart ? 'phần' : 'trang'} · {extraction.charCount.toLocaleString('vi-VN')} ký tự</Text>
              </View>
              {!isPart && extraction.status !== 'ready' && <Notice tone="warning">{extraction.status === 'no_text'
                ? 'PDF chưa có lớp chữ để đọc. Với đề bài dạng ảnh, bạn có thể dùng Quét đề bài ở trang chủ.'
                : `Chưa đọc được chữ ở trang ${extraction.pagesWithoutText.join(', ')}. Kết quả chỉ gồm phần chữ đã nhận được.`}</Notice>}
              <Disclosure title="Thông tin bản trích xuất" icon="file-text"><Text style={styles.description}>
                {isPart ? 'DOCX/TXT được lưu thành phần văn bản, không giữ phân trang gốc.' : 'Chỉ đọc lớp chữ có sẵn trong PDF. Chữ nằm trong ảnh chưa được nhận dạng ở màn hình này.'}
                {'\n'}Bảng, công thức hoặc cột có thể khác bố cục file gốc.
              </Text><Text style={styles.small}>Đã lưu: {new Date(extraction.extractedAt).toLocaleString('vi-VN')}</Text></Disclosure>
              <Text style={styles.readingLabel}>NỘI DUNG TÀI LIỆU</Text>
            </>}

          </View>
        }
        ListEmptyComponent={<EmptyState icon="file-text" title={busy ? 'Đang chuẩn bị nội dung…' : errorMessage ? 'Chưa tải được nội dung' : 'Sẵn sàng đọc bài học?'}
          description={busy ? 'Vui lòng chờ trong giây lát.' : errorMessage ? 'Bấm Làm mới để thử tải lại.' : 'Bấm Trích xuất văn bản để bắt đầu đọc và sử dụng các chức năng AI.'} />}
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
  container: ui.screen, content: { padding: 20, paddingBottom: 40, flexGrow: 1 }, eyebrow: { color: colors.primary, fontSize: 10, letterSpacing: 1.6, fontWeight: '700', marginBottom: 10 },
  title: { ...ui.title, fontSize: 23, lineHeight: 31, marginBottom: 8 }, description: ui.caption, tabs: { flexDirection: 'row', padding: 5, borderRadius: 16, backgroundColor: '#E9EEE3', marginVertical: 22, gap: 3 },
  tab: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 8 }, activeTab: { backgroundColor: colors.surface }, activeLabel: { color: colors.primary, fontSize: 12, fontWeight: '700' }, tabLabel: { color: colors.muted, fontSize: 12, fontWeight: '600' }, readerActions: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  error: { color: colors.danger, lineHeight: 22, marginVertical: 12 }, statusRow: { gap: 7, marginTop: 12 }, small: { ...ui.caption, fontSize: 11, marginTop: 4 }, readingLabel: { color: colors.muted, fontSize: 10, letterSpacing: 1.5, fontWeight: '700', marginTop: 26, marginBottom: 14 },
  page: { ...ui.card, padding: 22, marginBottom: 16 }, pageTitle: { color: colors.primary, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 18 }, pageText: { color: colors.text, fontSize: 16, lineHeight: 28 },
});
