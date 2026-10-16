import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import { askDocumentQuestion, getQuestionSource, createConversation, getConversation, getConversations, saveConversation, deleteConversation } from '../services/questions';
import SummaryScopePicker from './SummaryScopePicker';

// Keep labels next to symbols so every action is understandable without the icon.
function ActionButton({ label, icon, onPress, disabled = false, loading = false,
  tone = 'secondary', expanded = undefined, accessibilityLabel = undefined, style = undefined }) {
  const color = disabled ? '#64748B' : tone === 'primary' ? '#FFFFFF' : tone === 'danger' ? '#B91C1C' : '#166534';
  const surface = tone === 'primary' ? styles.buttonPrimary : tone === 'danger' ? styles.buttonDanger
    : tone === 'neutral' ? styles.buttonNeutral : styles.buttonSecondary;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || label}
    accessibilityState={{ disabled, busy: loading, ...(expanded === undefined ? {} : { expanded }) }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.actionButton, surface, style,
      disabled && styles.buttonDisabled, pressed && !disabled && styles.buttonPressed]}>
    {loading ? <ActivityIndicator size="small" color={color} />
      : <Text accessible={false} importantForAccessibility="no" style={[styles.buttonIcon, { color }]}>{icon}</Text>}
    <Text style={[styles.buttonLabel, { color }]}>{label}</Text>
  </Pressable>;
}

export default function DocumentQuestionsPanel({ documentId, documentName, onShowText, onSessionExpired }) {
  const [metadata, setMetadata] = useState(null);
  const [scope, setScope] = useState({ key: 'all', label: 'Toàn bộ tài liệu' });
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [history, setHistory] = useState(null);
  const [busy, setBusy] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [preview, setPreview] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [needsSync, setNeedsSync] = useState(false);
  const chat = useRef(null);
  const selectedScope = useRef('all');
  const sourceVersion = useRef(null);
  const generation = useRef(0);
  const mounted = useRef(false);
  const working = useRef(false);
  const scroll = useRef(null);
  const followBottom = useRef(false);
  const headerHeight = useHeaderHeight();

  useEffect(() => {
    mounted.current = true; working.current = false;
    chat.current = null; setConversation(null); setHistory(null);
    selectedScope.current = 'all'; sourceVersion.current = null;
    setScope({ key: 'all', label: 'Toàn bộ tài liệu' });
    followBottom.current = false;
    setMetadata(null); setMessages([]); setQuestion(''); setBlocked(false); setPreview(false);
    setReadOnly(false); setNeedsSync(false);
    loadSource('all');
    return () => { mounted.current = false; generation.current += 1; };
  }, [documentId]);

  function handleError(error) {
    setErrorMessage(error.message || 'Chưa thực hiện được. Vui lòng thử lại.');
    const documentMissing = error.status === 404 && error.code !== 'CONVERSATION_NOT_FOUND';
    if (error.status === 401 || documentMissing) {
      setMessages([]); setMetadata(null); sourceVersion.current = null; setBlocked(true);
      chat.current = null; setConversation(null); setHistory(null);
    }
    if (error.status === 401) onSessionExpired();
    if (['SOURCE_CHANGED', 'CONVERSATION_SOURCE', 'CONVERSATION_NOT_FOUND'].includes(error.code)) setReadOnly(true);
    if (error.code === 'CONVERSATION_CHANGED') setNeedsSync(true);
  }

  async function run(kind, action) {
    if (working.current) return false;
    working.current = true;
    const ticket = ++generation.current;
    const current = () => mounted.current && generation.current === ticket;
    setBusy(kind); setErrorMessage('');
    try { await action(current); return current(); }
    catch (error) { if (current()) handleError(error); return false; }
    finally { if (current()) { working.current = false; setBusy(''); } }
  }
  function adopt(item) {
    if (item.documentId !== documentId || !item.scope?.key || !Array.isArray(item.turns)) throw new Error('Hội thoại không khớp tài liệu đang mở.');
    chat.current = item; setConversation(item); setMessages(item.turns);
    setScope(item.scope); selectedScope.current = item.scope.key; sourceVersion.current = item.sourceVersion;
    setReadOnly(item.stale); setNeedsSync(false);
  }
  async function readSource(key, current) {
    const data = await getQuestionSource(documentId, key);
    if (!current()) return;
    if (data.scope?.key !== key) throw new Error('Backend chưa trả đúng phạm vi hỏi đáp. Hãy cập nhật cả backend và mobile.');
    setMetadata(data); setScope(data.scope); selectedScope.current = key; sourceVersion.current = data.sourceVersion;
    if (chat.current && chat.current.sourceVersion !== data.sourceVersion) setReadOnly(true);
  }
  function loadSource(key = selectedScope.current) {
    return run('loading', async current => {
      sourceVersion.current = null; setMetadata(null);
      await readSource(key, current);
    });
  }
  async function discardTemporary() {
    if (!chat.current || chat.current.saved) return;
    try {
      // A save may have succeeded even if its HTTP response was lost.
      await deleteConversation(documentId, chat.current.id, true);
    }
    catch (error) { if (error.code !== 'CONVERSATION_NOT_FOUND') throw error; }
  }
  function startFresh(key = 'all') {
    return run('loading', async current => {
      await discardTemporary();
      if (!current()) return;
      chat.current = null; setConversation(null); setMessages([]); setQuestion(''); setHistory(null);
      setReadOnly(false); setNeedsSync(false); setMetadata(null); sourceVersion.current = null;
      selectedScope.current = key; setScope({ key, label: key === 'all' ? 'Toàn bộ tài liệu' : 'Đang tải phạm vi...' });
      setPreview(false); followBottom.current = false;
      await readSource(key, current);
    });
  }
  function saveCurrent() {
    return run('saving', async current => {
      const item = chat.current;
      if (!item) return;
      try {
        const data = await saveConversation(documentId, item.id, item.revision);
        if (current()) { adopt(data.conversation); setHistory(null); }
      } catch (error) {
        if (current() && (!error.status || error.status >= 500)) setNeedsSync(true);
        throw error;
      }
    });
  }
  function confirmLeave(action) {
    if (working.current) return;
    const unsaved = chat.current && !chat.current.saved && chat.current.turns.length > 0;
    if (!unsaved && !question.trim()) { action(); return; }
    /** @type {import('react-native').AlertButton[]} */
    const buttons = [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Tiếp tục', style: 'destructive', onPress: action },
    ];
    if (unsaved && !needsSync) buttons.push({ text: 'Lưu rồi tiếp tục', onPress: async () => { if (await saveCurrent()) action(); } });
    Alert.alert('Rời cuộc trò chuyện?', 'Trao đổi chưa lưu và nội dung đang nhập sẽ không được giữ lại. Lịch sử đã lưu vẫn có thể mở lại.', buttons);
  }
  function showHistory() {
    if (history) { setHistory(null); return; }
    return run('history', async current => {
      const data = await getConversations(documentId);
      if (current()) { setHistory(data.conversations); followBottom.current = false; }
    });
  }
  function openConversation(id, discard = true) {
    return run('loading', async current => {
      const data = await getConversation(documentId, id);
      if (!current()) return;
      if (discard && chat.current?.id !== id) await discardTemporary();
      if (!current()) return;
      const previousRevision = chat.current?.revision || 0;
      adopt(data.conversation); setHistory(null); setMetadata(null); setPreview(false);
      if (discard || data.conversation.revision > previousRevision) setQuestion('');
      followBottom.current = false;
      if (!data.conversation.stale) {
        try { await readSource(data.conversation.scope.key, current); }
        catch (error) { if (current()) setReadOnly(true); throw error; }
      }
    });
  }
  function removeHistory(item) {
    Alert.alert('Xóa lịch sử?', 'Cuộc trò chuyện này sẽ bị xóa. Tài liệu và bản tóm tắt vẫn được giữ.', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: () => run('deleting', async current => {
        await deleteConversation(documentId, item.id);
        if (!current()) return;
        setHistory(previous => previous?.filter(value => value.id !== item.id));
        if (chat.current?.id === item.id) {
          chat.current = null; setConversation(null); setMessages([]); setQuestion('');
          setReadOnly(false); setNeedsSync(false); sourceVersion.current = null; setMetadata(null);
          await readSource('all', current);
        }
      }) },
    ]);
  }
  function leavePanel() {
    confirmLeave(() => run('loading', async current => { await discardTemporary(); if (current()) onShowText(); }));
  }
  function sendQuestion() {
    if (blocked || readOnly || needsSync || !metadata?.source.ready || !sourceVersion.current) return;
    const text = question.trim();
    if (text.length < 3 || text.length > 1000) { setErrorMessage('Câu hỏi cần từ 3 đến 1.000 ký tự.'); return; }
    return run('asking', async current => {
      const requestedScope = selectedScope.current, requestedVersion = sourceVersion.current;
      if (!chat.current) {
        const data = await createConversation(documentId, requestedScope, requestedVersion);
        if (!current()) return;
        adopt(data.conversation);
      }
      const item = chat.current;
      const id = `pending-${item.id}-${item.revision}`;
      setQuestion(''); followBottom.current = true;
      setMessages(previous => [...previous.filter(turn => !turn.error), { id, question: text, pending: true }]);
      try {
        const data = await askDocumentQuestion(documentId, text, requestedScope, requestedVersion, item);
        if (!current()) return;
        if (data.documentId !== documentId || data.scope?.key !== requestedScope || data.sourceVersion !== requestedVersion
            || data.question !== text || data.conversation?.id !== item.id || data.conversation.revision !== item.revision + 1) {
          throw new Error('Câu trả lời không khớp hội thoại. Bấm Đồng bộ hội thoại để kiểm tra.');
        }
        adopt(data.conversation);
      } catch (error) {
        if (!current()) return;
        setQuestion(text);
        setMessages(previous => previous.map(turn => turn.id === id ? { ...turn, pending: false, error: error.message || 'Chưa nhận được câu trả lời.' } : turn));
        // A lost HTTP response may still have been committed. Read server state before retrying.
        if (![429, 422, 400].includes(error.status) && error.code !== 'AI_BUSY') setNeedsSync(true);
        throw error;
      }
    });
  }

  const disabled = !!busy;
  const canSend = !disabled && !blocked && !readOnly && !needsSync && (conversation?.revision || 0) < 10 && metadata?.source.ready && !!sourceVersion.current && question.trim().length >= 3 && question.trim().length <= 1000;
  const unit = metadata?.source.sourceUnit === 'part' ? 'phần văn bản' : 'trang';
  return <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={headerHeight}>
    <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
      onScroll={event => {
        const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
        followBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 100;
      }} scrollEventThrottle={100}
      onContentSizeChange={() => { if (followBottom.current) scroll.current?.scrollToEnd({ animated: true }); }}>
      <Text style={styles.title}>Hỏi đáp với tài liệu</Text>
      <Text style={styles.document}>{documentName}</Text>
      <ActionButton label="Về văn bản tài liệu" icon="←" tone="neutral" onPress={leavePanel} disabled={disabled} style={styles.backButton} />
      <View style={styles.toolbar}>
        <ActionButton label="Cuộc trò chuyện mới" icon="＋" disabled={disabled || blocked}
          onPress={() => confirmLeave(() => startFresh())} style={styles.toolbarButton} />
        <ActionButton label={history ? 'Ẩn lịch sử' : 'Lịch sử đã lưu'} icon={history ? '⌃' : '🕘'}
          disabled={disabled || blocked} loading={busy === 'history'} expanded={!!history}
          onPress={showHistory} style={styles.toolbarButton} />
      </View>
      <Text style={styles.meta}>{conversation?.saved ? 'Đã lưu · Các lượt tiếp theo được tự lưu' : 'Chế độ tạm · Chưa lưu lịch sử'} · {conversation?.revision || 0}/10 lượt</Text>
      <Text style={styles.meta}>Mỗi cuộc tối đa 10 lượt để giới hạn lượng ngữ cảnh gửi AI. Cuộc trò chuyện mới không dùng trao đổi của cuộc cũ.</Text>
      {!!conversation?.turns.length && !conversation.saved && <ActionButton label="Lưu lịch sử" icon="💾" tone="primary"
        disabled={disabled || blocked || needsSync} loading={busy === 'saving'} onPress={saveCurrent} style={styles.spacedButton} />}
      <Text style={styles.description}>Bạn có thể hỏi nối tiếp như “Giải thích thêm về nó” trong cùng cuộc trò chuyện. Câu trả lời vẫn phải dựa trên phạm vi tài liệu đã chọn.</Text>
      <Text style={styles.meta}>Mặc định là trò chuyện tạm: không lưu vào lịch sử, mất khi rời màn hình, backend khởi động lại hoặc sau 2 giờ không hoạt động. Bấm Lưu lịch sử để giữ cuộc trò chuyện và tự lưu các lượt tiếp theo. Khi gửi câu hỏi, phần chữ và các lượt trao đổi trước của cuộc này được gửi tới Gemini.</Text>
      {history && <View style={styles.preview}>
        <Text style={styles.aiLabel}>Lịch sử của tài liệu này</Text>
        {!history.length && <Text style={styles.meta}>Chưa có cuộc trò chuyện nào được lưu.</Text>}
        {history.map(item => <View key={item.id} style={styles.historyItem}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Mở hội thoại ${item.title}`} accessibilityState={{ disabled }}
            disabled={disabled} onPress={() => confirmLeave(() => openConversation(item.id))}
            style={({ pressed }) => [styles.historyOpen, disabled && styles.historyDisabled, pressed && !disabled && styles.buttonPressed]}>
            <Text style={styles.link}>{item.title}</Text>
            <Text style={styles.meta}>{item.scope.label} · {item.turnCount} lượt · {new Date(item.updatedAt).toLocaleString('vi-VN')}</Text>
            {item.stale && <Text style={styles.notice}>Nguồn đã thay đổi · Chỉ xem lịch sử</Text>}
            <Text style={styles.openLabel}>↗ Mở hội thoại</Text>
          </Pressable>
          <ActionButton label="Xóa lịch sử" icon="×" tone="danger" accessibilityLabel={`Xóa hội thoại ${item.title}`}
            disabled={disabled} onPress={() => removeHistory(item)} style={styles.spacedButton} />
        </View>)}
      </View>}
      {readOnly && <Text style={styles.notice}>Cuộc trò chuyện hiện chỉ xem được. Hãy bắt đầu cuộc trò chuyện mới để dùng nguồn hiện tại.</Text>}
      {needsSync && <Text style={styles.notice}>Bấm Đồng bộ hội thoại để kiểm tra lượt vừa gửi trước khi hỏi tiếp. Thao tác này không gọi AI.</Text>}
      {conversation?.revision >= 10 && <Text style={styles.notice}>Đã đủ 10 lượt. Bạn có thể lưu lịch sử và bắt đầu cuộc trò chuyện mới.</Text>}
      <SummaryScopePicker scope={scope} sections={metadata?.sections || []} savedRanges={[]}
        documentSource={metadata?.documentSource} truncated={metadata?.sectionsTruncated} disabled={disabled || blocked}
        heading="Phạm vi hỏi đáp" footer="Chọn phạm vi chỉ đọc văn bản đã lưu. Bấm Gửi câu hỏi mới gọi AI."
        onSelect={key => { if (key !== selectedScope.current) confirmLeave(() => startFresh(key)); }} />
      <ActionButton label={busy === 'loading' ? 'Đang tải...' : conversation ? 'Đồng bộ hội thoại' : 'Tải lại phạm vi'} icon="↻"
        disabled={disabled || blocked} loading={busy === 'loading'}
        onPress={() => conversation ? openConversation(conversation.id, false) : loadSource()} style={styles.spacedButton} />
      {metadata && <Text style={styles.meta}>{metadata.source.pageCount} {unit} · {metadata.source.charCount.toLocaleString('vi-VN')} ký tự</Text>}
      {metadata && !metadata.source.ready && <Text style={styles.notice}>{metadata.source.reason}</Text>}
      {!!metadata?.source.pagesWithoutText.length && <Text style={styles.notice}>Chưa có chữ ở {unit} {metadata.source.pagesWithoutText.join(', ')}. Câu trả lời không bao gồm nội dung hình ảnh chưa được OCR.</Text>}
      {metadata?.source.sourceUnit === 'part' && <Text style={styles.meta}>Tham chiếu là số phần văn bản, không phải số trang DOCX/TXT gốc.</Text>}
      {metadata?.source.previewStart && <View style={styles.preview}>
        <ActionButton label={preview ? 'Ẩn đoạn đầu/cuối' : 'Kiểm tra đoạn đầu/cuối của phạm vi'} icon={preview ? '⌃' : '⌄'}
          expanded={preview} onPress={() => setPreview(!preview)} />
        {preview && <>
          <Text style={styles.meta}>Đầu phạm vi</Text><Text selectable style={styles.body}>{metadata.source.previewStart}</Text>
          <Text style={styles.meta}>Cuối phạm vi</Text><Text selectable style={styles.body}>{metadata.source.previewEnd}</Text>
        </>}
      </View>}
      {!!errorMessage && <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text>}
      {!messages.length && !busy && <Text style={styles.empty}>Đặt một câu hỏi về nội dung tài liệu. Ví dụ: “Khái niệm View được giải thích như thế nào?”</Text>}
      {messages.map(item => <View key={item.id} style={styles.exchange}>
        <View style={styles.userBubble}><Text style={styles.userLabel}>Bạn</Text><Text selectable style={styles.userText}>{item.question}</Text></View>
        <View style={styles.aiBubble}>
          <Text style={styles.aiLabel}>Trợ lý học tập</Text>
          {item.pending ? <View style={styles.waiting}><ActivityIndicator color="#0F766E" /><Text style={styles.meta}>Đang tìm câu trả lời… Có thể mất đến 2 phút.</Text></View>
            : item.error ? <>
              <Text accessibilityRole="alert" style={styles.error}>{item.error}</Text>
              <ActionButton label="Đưa câu hỏi vào ô nhập để thử lại" icon="↩" disabled={disabled || blocked}
                onPress={() => { setQuestion(item.question); setErrorMessage(''); scroll.current?.scrollToEnd({ animated: true }); }} style={styles.spacedButton} />
            </> : item.answer && <>
              {item.answer.status === 'not_found' && <Text style={styles.notice}>Chưa đủ thông tin trong nguồn</Text>}
              <Text selectable style={styles.body}>{item.answer.answer}</Text>
              {item.answer.references.map((ref, index) => <View key={index} style={styles.reference}>
                <Text style={styles.link}>{item.sourceUnit === 'part' ? 'Phần văn bản' : 'Trang'} {ref.page}</Text>
                <Text selectable style={styles.quote}>{ref.quote}</Text>
              </View>)}
              {item.answer.caveats.map((text, index) => <Text key={index} style={styles.notice}>• {text}</Text>)}
            </>}
        </View>
      </View>)}
      {!!messages.length && <Text style={styles.meta}>Đối chiếu câu trả lời với đoạn trích và tài liệu gốc; AI vẫn có thể diễn giải sai.</Text>}
    </ScrollView>
    <View style={styles.composer}>
      <TextInput accessibilityLabel="Câu hỏi về tài liệu" multiline maxLength={1001} editable={!disabled && !blocked}
        value={question} onChangeText={setQuestion} placeholder="Nhập câu hỏi hoặc hỏi nối tiếp…" style={styles.input} />
      <View style={styles.composerRow}>
        <Text style={styles.meta}>{question.trim().length}/1.000 ký tự</Text>
        <ActionButton label={busy === 'asking' ? 'Đang trả lời…' : 'Gửi câu hỏi'} icon="➤" tone="primary"
          disabled={!canSend} loading={busy === 'asking'} onPress={sendQuestion} style={styles.sendButton} />
      </View>
      {question.trim().length > 1000 && <Text style={styles.error}>Câu hỏi vượt 1.000 ký tự. Hãy rút gọn trước khi gửi.</Text>}
      {!sourceVersion.current && metadata?.source.ready && !busy && <Text style={styles.notice}>Tải lại phạm vi trước khi gửi câu hỏi tiếp theo.</Text>}
    </View>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FB' }, content: { padding: 16, paddingBottom: 24 },
  title: { fontSize: 22, fontWeight: '700', color: '#172033', marginBottom: 6 },
  document: { color: '#0F766E', fontWeight: '600', fontSize: 15, lineHeight: 22 },
  description: { color: '#596579', fontSize: 14, lineHeight: 22, marginTop: 12 },
  meta: { fontSize: 12, lineHeight: 20, color: '#596579', marginTop: 6 },
  link: { color: '#0F766E', fontWeight: '600', lineHeight: 22 },
  actionButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  buttonPrimary: { backgroundColor: '#15803D', borderColor: '#15803D' },
  buttonSecondary: { backgroundColor: '#ECFDF3', borderColor: '#86C99D' },
  buttonNeutral: { backgroundColor: '#FFFFFF', borderColor: '#CBD5E1' },
  buttonDanger: { backgroundColor: '#FEF2F2', borderColor: '#F5A8A8' },
  buttonDisabled: { backgroundColor: '#E2E8F0', borderColor: '#CBD5E1' },
  buttonPressed: { opacity: 0.72 },
  buttonIcon: { fontSize: 21, lineHeight: 26, minWidth: 24, textAlign: 'center' },
  buttonLabel: { fontSize: 14, lineHeight: 21, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  backButton: { alignSelf: 'flex-start', marginTop: 12, marginBottom: 12, maxWidth: '100%' },
  spacedButton: { marginTop: 10 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 },
  toolbarButton: { flexGrow: 1, flexBasis: 150 },
  historyItem: { borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingVertical: 12 },
  historyOpen: { minHeight: 48, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#86C99D', backgroundColor: '#F0FDF4' },
  historyDisabled: { opacity: 0.5 }, openLabel: { color: '#166534', fontSize: 14, lineHeight: 21, fontWeight: '700', marginTop: 8 },
  preview: { backgroundColor: '#FFFFFF', padding: 14, borderRadius: 10, marginVertical: 8 },
  notice: { color: '#854D0E', fontSize: 13, lineHeight: 21, marginVertical: 6 },
  error: { color: '#B91C1C', fontSize: 14, lineHeight: 22, marginVertical: 6 },
  empty: { textAlign: 'center', color: '#596579', lineHeight: 23, marginVertical: 20 },
  exchange: { marginTop: 20 }, userBubble: { backgroundColor: '#0F766E', borderRadius: 14, padding: 14, marginLeft: 28 },
  userLabel: { color: '#D1FAE5', fontWeight: '700', fontSize: 12, marginBottom: 5 },
  userText: { color: '#FFFFFF', fontSize: 15, lineHeight: 24 },
  aiBubble: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 14, padding: 14, marginTop: 10, marginRight: 12 },
  aiLabel: { color: '#0F766E', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  body: { color: '#172033', fontSize: 15, lineHeight: 25 }, waiting: { gap: 8, alignItems: 'flex-start' },
  reference: { borderLeftWidth: 3, borderLeftColor: '#99D5C7', paddingLeft: 10, marginTop: 12 },
  quote: { color: '#596579', fontSize: 13, lineHeight: 21 },
  composer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  input: { minHeight: 48, maxHeight: 120, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, padding: 12, color: '#172033', fontSize: 15, textAlignVertical: 'top' },
  composerRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 6 },
  sendButton: { maxWidth: '100%' },
});
