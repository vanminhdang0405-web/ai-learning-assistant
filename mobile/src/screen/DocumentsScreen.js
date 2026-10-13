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
        setTopicFilter(null);
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
      setTopicFilter(null);
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
  const visibleDocuments = topicFilter === null ? documents
    : documents.filter(item => (item.topic || '') === topicFilter);

  const disabled = busy !== '';
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.heading}>Tài liệu của bạn</Text>
        <Text style={styles.subtitle}>
          PDF, DOCX, TXT · tối đa 10 MB/file. DOCX/TXT được đọc chữ khi tải lên.
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={handleUpload}
          style={[styles.uploadButton, disabled && styles.disabled]}
        >
          <Text style={styles.uploadText}>
            {busy === 'uploading' ? 'Đang chọn / đọc tài liệu...' : '+ Thêm tài liệu'}
          </Text>
        </Pressable>
        <View style={styles.toolbar}>
          <Text style={styles.subtitle}>{visibleDocuments.length}/{documents.length} tài liệu</Text>
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={loadDocuments}
          >
            <Text style={styles.refreshText}>
              {busy === 'loading' ? 'Đang tải...' : 'Làm mới'}
            </Text>
          </Pressable>
        </View>
        {!!loadError && (
          <Text style={styles.error}>
            Chưa tải được danh sách. Bấm Làm mới để thử lại.
          </Text>
        )}
        {busy === 'opening' && (
          <Text style={styles.subtitle}>Đang tải / mở tài liệu...</Text>
        )}
        {busy === 'deleting' && (
          <Text style={styles.subtitle}>Đang xóa tài liệu...</Text>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
          {[{ value: null, label: 'Tất cả' }, { value: '', label: 'Chưa phân loại' },
            ...topics.map(topic => ({ value: topic, label: topic }))].map(option => (
              <Pressable key={option.value === null ? 'all' : `topic:${option.value}`}
                accessibilityRole="button" accessibilityState={{ selected: topicFilter === option.value }}
                disabled={disabled} onPress={() => setTopicFilter(option.value)}
                style={[styles.chip, topicFilter === option.value && styles.chipSelected]}>
                <Text style={styles.chipText}>{option.label}</Text>
              </Pressable>
            ))}
        </ScrollView>
      </View>
      <FlatList
        data={visibleDocuments}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshing={busy === 'loading'}
        onRefresh={loadDocuments}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {busy === 'loading'
              ? 'Đang tải danh sách...'
              : loadError
                ? 'Chưa có dữ liệu để hiển thị.'
                : 'Chưa có tài liệu trong nhóm này. Chọn “Tất cả” hoặc thêm tài liệu mới.'}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.pdfLabel}>{item.name.split('.').pop().toUpperCase()}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Mở ${item.name}`}
              disabled={disabled}
              onPress={() => handleOpen(item)}
              style={[styles.documentInfo, disabled && styles.disabled]}
            >
              <Text style={styles.documentName}>{item.name}</Text>
              <Text style={styles.documentMeta}>
                {formatSize(item.size_bytes)}{' · '}
                {new Date(item.created_at).toLocaleDateString('vi-VN')}
              </Text>
              <Text style={styles.documentMeta}>Môn/chủ đề: {item.topic || 'Chưa phân loại'}</Text>
              <Text style={styles.openText}>Mở file gốc ›</Text>
            </Pressable>
            <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Xem văn bản ${item.name}`}
              disabled={disabled}
              onPress={() => navigation.navigate('DocumentText', {
                documentId: item.id,
                documentName: item.name,
                sourceUnit: item.mime_type === 'application/pdf' ? 'page' : 'part',
              })}
              style={styles.textButton}
            >
              <Text style={styles.textButtonLabel}>Văn bản</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Sửa thông tin ${item.name}`}
              disabled={disabled} onPress={() => beginEdit(item)} style={styles.textButton}>
              <Text style={styles.textButtonLabel}>Sửa thông tin</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Xóa ${item.name}`}
              disabled={disabled}
              onPress={() => confirmDelete(item)}
              style={styles.deleteButton}
            >
              <Text style={styles.deleteText}>Xóa</Text>
            </Pressable>
            </View>
          </View>
        )}
      />
      <Modal visible={!!editing} transparent animationType="fade"
        onRequestClose={() => { if (!working.current) setEditing(null); }}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.heading}>Thông tin tài liệu</Text>
              <Text style={styles.subtitle}>Tên tài liệu (giữ đuôi file)</Text>
              <TextInput accessibilityLabel="Tên tài liệu" value={editName} onChangeText={setEditName}
                maxLength={200} editable={!disabled} style={styles.input} autoCapitalize="none" />
              <Text style={styles.subtitle}>Môn học/chủ đề</Text>
              <TextInput accessibilityLabel="Môn học hoặc chủ đề" value={editTopic} onChangeText={setEditTopic}
                maxLength={80} editable={!disabled} style={styles.input} placeholder="Ví dụ: Lập trình di động" />
              <Text style={styles.subtitle}>Để trống nếu chưa phân loại. Chọn nhóm đã có hoặc nhập nhóm mới.</Text>
              <View style={styles.suggestions}>
                {topics.map(topic => <Pressable key={topic} accessibilityRole="button" disabled={disabled}
                  onPress={() => setEditTopic(topic)} style={styles.chip}>
                  <Text style={styles.chipText}>{topic}</Text>
                </Pressable>)}
              </View>
              {!!editError && <Text accessibilityRole="alert" style={styles.error}>{editError}</Text>}
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" disabled={disabled} onPress={() => setEditing(null)} style={styles.textButton}>
                  <Text style={styles.textButtonLabel}>Hủy</Text>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={disabled} onPress={saveDetails}
                  style={[styles.saveButton, disabled && styles.disabled]}>
                  <Text style={styles.uploadText}>{busy === 'saving' ? 'Đang lưu...' : 'Lưu thay đổi'}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FB' },
  header: { padding: 20, paddingBottom: 10 },
  heading: { fontSize: 24, fontWeight: '700', color: '#172033', marginBottom: 8 },
  subtitle: { fontSize: 14, lineHeight: 21, color: '#596579' },
  uploadButton: {
    backgroundColor: '#2563EB', borderRadius: 12, padding: 15,
    alignItems: 'center', marginTop: 18,
  },
  uploadText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  toolbar: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: 20,
  },
  refreshText: { color: '#2563EB', fontWeight: '600', paddingVertical: 8 },
  error: { color: '#B91C1C', marginTop: 8 },
  list: { padding: 20, paddingTop: 8, flexGrow: 1 },
  empty: { color: '#596579', textAlign: 'center', lineHeight: 23, marginTop: 40 },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 14,
    padding: 14, marginBottom: 12,
  },
  pdfLabel: {
    color: '#1D4ED8', backgroundColor: '#DBEAFE', fontWeight: '700',
    padding: 8, borderRadius: 8, alignSelf: 'flex-start',
  },
  documentInfo: { paddingVertical: 8 },
  openText: { color: '#2563EB', fontWeight: '600', marginTop: 8 },
  documentName: { fontSize: 15, fontWeight: '600', color: '#172033' },
  documentMeta: { fontSize: 12, color: '#64748B', marginTop: 6 },
  textButton: { paddingVertical: 12, paddingHorizontal: 8 },
  textButtonLabel: { color: '#2563EB', fontWeight: '600' },
  deleteButton: { padding: 10, marginLeft: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' },
  filters: { marginTop: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 16, backgroundColor: '#E2E8F0', marginRight: 8, marginBottom: 8 },
  chipSelected: { backgroundColor: '#BFDBFE', borderWidth: 1, borderColor: '#2563EB' },
  chipText: { color: '#172033', fontSize: 13 },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: 12 },
  modalOverlay: { flex: 1, justifyContent: 'center', backgroundColor: '#00000088', padding: 20 },
  modalCard: { maxHeight: '90%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20 },
  input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, color: '#172033', fontSize: 16, padding: 12, marginVertical: 10 },
  saveButton: { backgroundColor: '#2563EB', padding: 13, borderRadius: 10 },
  deleteText: { color: '#DC2626', fontWeight: '600' },
});
