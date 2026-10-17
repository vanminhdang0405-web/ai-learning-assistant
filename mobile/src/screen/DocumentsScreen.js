import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Button, EmptyState, Icon, Notice, ScreenIntro } from '../components/AppUI';
import { colors, ui } from '../theme';
import * as DocumentPicker from 'expo-document-picker';
import {
  getDocuments,
  uploadDocument,
  deleteDocument,
  openDocument,
  updateDocument,
} from '../services/documents';

const MAX_SIZE = 10 * 1024 * 1024;

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsScreen({ navigation }) {
  const [documents, setDocuments] = useState([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');
  const [loadError, setLoadError] = useState('');
  const [topicFilter, setTopicFilter] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [editTopic, setEditTopic] = useState('');
  const [editError, setEditError] = useState('');
  const working = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    loadDocuments();
    return () => { mounted.current = false; };
  }, []);

  function showError(error) {
    if (!mounted.current) return;
    if (error.status === 401) {
      setDocuments([]);
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      Alert.alert(
        'Cần đăng nhập',
        'Phiên đăng nhập đã hết hạn. Bạn vui lòng đăng nhập lại.'
      );
      return;
    }
    Alert.alert('Chưa thực hiện được', error.message || 'Vui lòng thử lại.');
  }

  async function loadDocuments() {
    if (working.current) return;
    working.current = true;
    setBusy('loading');
    setLoadError('');
    try {
      const items = await getDocuments();
      if (mounted.current) setDocuments(items);
    } catch (error) {
      if (mounted.current) {
        setLoadError(error.message);
        showError(error);
      }
    } finally {
      working.current = false;
      if (mounted.current) setBusy('');
    }
  }

  async function handleUpload() {
    if (working.current) return;
    working.current = true;
    setBusy('uploading');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
        multiple: false,
        copyToCacheDirectory: false,
      });
      if (result.canceled || !mounted.current) return;
      const asset = result.assets[0];
      if (!asset || !/\.(pdf|docx|txt)$/i.test(asset.name)) {
        throw new Error('Vui lòng chọn PDF, DOCX hoặc TXT.');
      }
      if (asset.size === 0) {
        throw new Error('File đang trống. Vui lòng chọn tài liệu khác.');
      }
      if (asset.size > MAX_SIZE) {
        throw new Error('Tài liệu vượt giới hạn 10 MB.');
      }
      const document = await uploadDocument(asset);
      if (mounted.current) {
        setDocuments((current) => [document, ...current]);
        setTopicFilter(null); setSearch('');
        Alert.alert('Thành công', 'Đã tải tài liệu lên.');
      }
    } catch (error) {
      showError(error);
    } finally {
      working.current = false;
      if (mounted.current) setBusy('');
    }
  }

  async function handleOpen(document) {
    if (working.current || !mounted.current) return;
    working.current = true;
    setBusy('opening');
    try {
      await openDocument(
        document,
        () => mounted.current && navigation.isFocused()
      );
    } catch (error) {
      showError(error);
    } finally {
      working.current = false;
      if (mounted.current) setBusy('');
    }
  }

  async function removeDocument(document) {
    if (working.current || !mounted.current) return;
    working.current = true;
    setBusy('deleting');
    try {
      await deleteDocument(document.id);
      if (mounted.current) {
        setDocuments((current) =>
          current.filter((item) => item.id !== document.id)
        );
      }
    } catch (error) {
      showError(error);
    } finally {
      working.current = false;
      if (mounted.current) setBusy('');
    }
  }

  function confirmDelete(document) {
    if (working.current) return;
    Alert.alert('Xóa tài liệu?', `Bạn muốn xóa "${document.name}"?`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => removeDocument(document),
      },
    ]);
  }

  function beginEdit(document) {
    if (working.current) return;
    setEditing(document);
    setEditName(document.name);
    setEditTopic(document.topic || '');
    setEditError('');
  }

  async function saveDetails() {
    if (working.current || !editing) return;
    const name = editName.trim();
    const topic = editTopic.trim();
    if (!name || name.length > 200 || topic.length > 80) {
      setEditError('Tên tài liệu từ 1–200 ký tự; môn học/chủ đề tối đa 80 ký tự.');
      return;
    }
    const extension = editing.name.split('.').pop().toLowerCase();
    if (!name.toLowerCase().endsWith(`.${extension}`)) {
      setEditError(`Giữ nguyên đuôi .${extension} khi đổi tên.`);
      return;
    }
    working.current = true;
    setBusy('saving');
    setEditError('');
    try {
      const updated = await updateDocument(editing.id, { name, topic });
      if (!mounted.current) return;
      setDocuments(current => current.map(item => item.id === updated.id ? updated : item));
      setEditing(null);
      // Tránh tài liệu vừa chuyển nhóm biến mất khỏi danh sách đang xem.
      setTopicFilter(null); setSearch('');
    } catch (error) {
      if (!mounted.current) return;
      setEditError(error.message || 'Chưa lưu được. Vui lòng thử lại.');
      if (error.status === 401) { setEditing(null); showError(error); }
    } finally {
      working.current = false;
      if (mounted.current) setBusy('');
    }
  }

  const topics = [...new Set(documents.map(item => item.topic || '').filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'vi'));
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
  const query = normalize(search.trim());
  const visibleDocuments = documents.filter(item => (topicFilter === null || (item.topic || '') === topicFilter)
    && normalize(`${item.name} ${item.topic || ''}`).includes(query));
  const disabled = busy !== '';
  function study(item) {
    navigation.navigate('DocumentText', { documentId: item.id, documentName: item.name, sourceUnit: item.mime_type === 'application/pdf' ? 'page' : 'part' });
  }
  function more(item) {
    if (disabled) return;
    Alert.alert(item.name, 'Quản lý tài liệu', [
      { text: 'Sửa thông tin', onPress: () => beginEdit(item) },
      { text: 'Xóa tài liệu', style: 'destructive', onPress: () => confirmDelete(item) },
      { text: 'Đóng', style: 'cancel' },
    ]);
  }
  return <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
    <FlatList data={visibleDocuments} keyExtractor={item => String(item.id)} contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} refreshing={busy === 'loading'} onRefresh={loadDocuments}
      ListHeaderComponent={<View>
        <ScreenIntro eyebrow="THƯ VIỆN CỦA BẠN" title="Kiến thức, được sắp xếp." description="Tất cả bài học ở một nơi. Chọn tài liệu và bắt đầu khám phá." icon="layers" />
        <Button icon="plus" label={busy === 'uploading' ? 'Đang thêm tài liệu…' : 'Thêm tài liệu'} onPress={handleUpload} disabled={disabled} loading={busy === 'uploading'} />
        <Text style={styles.formats}>PDF · DOCX · TXT  /  Tối đa 10 MB</Text>
        <View style={styles.search}><Icon name="search" size={19} color={colors.muted} /><TextInput accessibilityLabel="Tìm tài liệu" placeholder="Tìm tên tài liệu hoặc môn học…" placeholderTextColor={colors.muted}
          value={search} onChangeText={setSearch} autoCorrect={false} style={styles.searchInput} />
          {!!search && <Pressable accessibilityRole="button" accessibilityLabel="Xóa từ khóa tìm kiếm" onPress={() => setSearch('')} style={styles.clear}><Icon name="x" size={18} /></Pressable>}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {[{ value: null, label: 'Tất cả' }, { value: '', label: 'Chưa phân loại' }, ...topics.map(topic => ({ value: topic, label: topic }))].map(option => <Pressable
            key={option.value === null ? 'all' : `topic:${option.value}`} accessibilityRole="button" accessibilityState={{ selected: topicFilter === option.value }}
            disabled={disabled} onPress={() => setTopicFilter(option.value)} style={[styles.chip, topicFilter === option.value && styles.chipSelected]}>
            <Text style={[styles.chipText, topicFilter === option.value && styles.chipTextSelected]}>{option.label}</Text>
          </Pressable>)}
        </ScrollView>
        <View style={styles.toolbar}><Text style={styles.count}>{visibleDocuments.length} tài liệu{query || topicFilter !== null ? ` / ${documents.length}` : ''}</Text>
          <Button compact tone="ghost" icon="refresh-cw" label="Làm mới" onPress={loadDocuments} disabled={disabled} loading={busy === 'loading'} />
        </View>
        {!!loadError && <Notice tone="error">Chưa tải được danh sách. Bấm Làm mới để thử lại.</Notice>}
        {busy === 'opening' && <Notice loading>Đang mở file gốc…</Notice>}
        {busy === 'deleting' && <Notice loading>Đang xóa tài liệu…</Notice>}
      </View>}
      ListEmptyComponent={<EmptyState icon={query ? 'search' : 'folder-plus'} title={busy === 'loading' ? 'Đang mở thư viện…' : loadError ? 'Chưa tải được thư viện' : query || topicFilter !== null ? 'Chưa có tài liệu phù hợp' : 'Thêm bài học đầu tiên'}
        description={loadError ? 'Kiểm tra kết nối rồi thử làm mới.' : query || topicFilter !== null ? 'Thử từ khóa khác hoặc chọn Tất cả.' : 'Tải tài liệu lên để đọc, tóm tắt và hỏi đáp cùng AI.'} />}
      renderItem={({ item }) => <View style={styles.card}>
        <View style={styles.documentHeader}><View style={styles.fileIcon}><Icon name="file-text" size={25} /></View>
          <View style={styles.documentInfo}><Badge label={item.name.split('.').pop().toUpperCase()} />
            <Text style={styles.documentName} numberOfLines={2}>{item.name}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Tùy chọn ${item.name}`} disabled={disabled} onPress={() => more(item)} style={styles.more}><Icon name="more-horizontal" /></Pressable>
        </View>
        <View style={styles.metadata}><Icon name="tag" size={12} color={colors.muted} /><Text style={styles.topic}>{item.topic || 'Chưa phân loại'}</Text></View>
        <Text style={styles.documentMeta}>{formatSize(item.size_bytes)} · {new Date(item.created_at).toLocaleDateString('vi-VN')}</Text>
        <View style={styles.actions}><Button compact label="Văn bản & AI" icon="book-open" onPress={() => study(item)} disabled={disabled} style={styles.flex} accessibilityLabel={`Xem văn bản ${item.name}`} />
          <Button compact label="Mở file" icon="external-link" tone="ghost" onPress={() => handleOpen(item)} disabled={disabled} accessibilityLabel={`Mở ${item.name}`} /></View>
      </View>} />
    <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => { if (!working.current) setEditing(null); }}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <SafeAreaView style={styles.modalCard} edges={['bottom']}>
          <View style={styles.handle} /><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}><Text style={ui.section}>Thông tin tài liệu</Text><Pressable accessibilityRole="button" accessibilityLabel="Đóng chỉnh sửa" disabled={disabled} onPress={() => setEditing(null)} style={styles.more}><Icon name="x" /></Pressable></View>
            <Text style={styles.label}>Tên tài liệu</Text><TextInput accessibilityLabel="Tên tài liệu" value={editName} onChangeText={setEditName} maxLength={200} editable={!disabled} style={styles.input} autoCapitalize="none" />
            <Text style={styles.hint}>Giữ nguyên phần đuôi file khi đổi tên.</Text>
            <Text style={styles.label}>Môn học / chủ đề</Text><TextInput accessibilityLabel="Môn học hoặc chủ đề" value={editTopic} onChangeText={setEditTopic} maxLength={80} editable={!disabled} style={styles.input} placeholder="Ví dụ: Lập trình di động" placeholderTextColor={colors.muted} />
            <Text style={styles.hint}>Chọn một nhóm có sẵn hoặc nhập nhóm mới.</Text><View style={styles.suggestions}>{topics.map(topic => <Pressable key={topic} accessibilityRole="button" disabled={disabled} onPress={() => setEditTopic(topic)} style={styles.chip}><Text style={styles.chipText}>{topic}</Text></Pressable>)}</View>
            {!!editError && <Notice tone="error">{editError}</Notice>}
            <Button icon="check" label={busy === 'saving' ? 'Đang lưu…' : 'Lưu thay đổi'} onPress={saveDetails} disabled={disabled} loading={busy === 'saving'} />
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  container: ui.screen, list: { padding: 20, paddingBottom: 36, flexGrow: 1 }, flex: { flex: 1 }, formats: { ...ui.caption, fontSize: 11, textAlign: 'center', marginVertical: 12 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 15, borderRadius: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, minHeight: 52, marginTop: 8 },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 14, color: colors.text, fontSize: 14 }, clear: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  filters: { gap: 8, paddingTop: 14, paddingBottom: 4 }, chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 13, backgroundColor: colors.soft }, chipSelected: { backgroundColor: colors.forest }, chipText: { color: colors.primary, fontSize: 12, fontWeight: '600' }, chipTextSelected: { color: '#FFFFFF' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 15, marginBottom: 14 }, count: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  card: { ...ui.card, marginBottom: 14 }, documentHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, fileIcon: { width: 50, height: 60, backgroundColor: colors.soft, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, documentInfo: { flex: 1, gap: 8 }, more: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  documentName: { color: colors.heading, fontSize: 15, lineHeight: 22, fontWeight: '700' }, metadata: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 }, topic: { color: colors.muted, fontSize: 12, lineHeight: 18, flexShrink: 1 }, documentMeta: { color: colors.muted, fontSize: 11, marginTop: 6 }, actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#102A2066' }, modalCard: { maxHeight: '90%', backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28 }, handle: { width: 36, height: 4, backgroundColor: '#C5D1BF', borderRadius: 3, alignSelf: 'center', marginTop: 12 }, modalContent: { padding: 22, paddingBottom: 24 }, modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  label: { color: colors.text, fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 14 }, input: { minHeight: 54, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface, color: colors.text, fontSize: 15, padding: 14 }, hint: { ...ui.caption, fontSize: 12, marginTop: 6 }, suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginVertical: 18 },
});
