import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import {
  getDocuments,
  uploadDocument,
  deleteDocument,
  openDocument,
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
        type: 'application/pdf',
        multiple: false,
        copyToCacheDirectory: false,
      });
      if (result.canceled || !mounted.current) return;
      const asset = result.assets[0];
      if (!asset || !/\.pdf$/i.test(asset.name)) {
        throw new Error('Vui lòng chọn file có đuôi .pdf.');
      }
      if (asset.size === 0) {
        throw new Error('File đang trống. Vui lòng chọn PDF khác.');
      }
      if (asset.size > MAX_SIZE) {
        throw new Error('PDF vượt giới hạn 10 MB.');
      }
      const document = await uploadDocument(asset);
      if (mounted.current) {
        setDocuments((current) => [document, ...current]);
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

  const disabled = busy !== '';
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.heading}>Tài liệu của bạn</Text>
        <Text style={styles.subtitle}>
          Tải lên PDF tối đa 10 MB. Bấm tên tài liệu để mở và đọc.
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={handleUpload}
          style={[styles.uploadButton, disabled && styles.disabled]}
        >
          <Text style={styles.uploadText}>
            {busy === 'uploading' ? 'Đang chọn / tải tài liệu...' : '+ Thêm PDF'}
          </Text>
        </Pressable>
        <View style={styles.toolbar}>
          <Text style={styles.subtitle}>{documents.length} tài liệu</Text>
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
          <Text style={styles.subtitle}>Đang tải / mở PDF...</Text>
        )}
        {busy === 'deleting' && (
          <Text style={styles.subtitle}>Đang xóa tài liệu...</Text>
        )}
      </View>
      <FlatList
        data={documents}
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
                : 'Bạn chưa có tài liệu. Bấm “+ Thêm PDF” để bắt đầu.'}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.pdfLabel}>PDF</Text>
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
              <Text style={styles.openText}>Mở PDF ›</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Xem văn bản ${item.name}`}
              disabled={disabled}
              onPress={() => navigation.navigate('DocumentText', {
                documentId: item.id,
                documentName: item.name,
              })}
              style={styles.textButton}
            >
              <Text style={styles.textButtonLabel}>Văn bản</Text>
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
        )}
      />
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
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 14,
    padding: 14, marginBottom: 12,
  },
  pdfLabel: {
    color: '#1D4ED8', backgroundColor: '#DBEAFE', fontWeight: '700',
    padding: 10, borderRadius: 8, marginRight: 12,
  },
  documentInfo: { flex: 1, paddingVertical: 8 },
  openText: { color: '#2563EB', fontWeight: '600', marginTop: 8 },
  documentName: { fontSize: 15, fontWeight: '600', color: '#172033' },
  documentMeta: { fontSize: 12, color: '#64748B', marginTop: 6 },
  textButton: { paddingVertical: 12, paddingHorizontal: 8 },
  textButtonLabel: { color: '#2563EB', fontWeight: '600' },
  deleteButton: { padding: 10, marginLeft: 4 },
  deleteText: { color: '#DC2626', fontWeight: '600' },
});
