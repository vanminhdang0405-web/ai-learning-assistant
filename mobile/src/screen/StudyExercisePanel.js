import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import StudyButton from '../components/StudyButton';
import ExerciseResult from '../components/ExerciseResult';
import { chooseExerciseImage, recoverExerciseImage, removePreparedImage } from '../services/exerciseImages';
import { recognizeExerciseImage, createExercise, listExercises, getExercise, deleteExercise, supportExercise } from '../services/exercises';
import { showAICooldown } from '../utils/aiCooldown';
import { Badge, Button, Disclosure, Icon, Notice, ScreenIntro, Steps } from '../components/AppUI';
import { colors } from '../theme';

const newKey = () => `exercise-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
const statusLabels = { ready: 'Đề đã đủ rõ để bắt đầu', needs_clarification: 'Cần bổ sung đề bài', unsupported: 'Đề này chưa phù hợp' };

export default function StudyExercisePanel({ onClose, onSessionExpired }) {
  const [image, setImage] = useState(null);
  const [text, setText] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [exercise, setExercise] = useState(null);
  const [history, setHistory] = useState(null);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [needsSync, setNeedsSync] = useState(false);
  const mounted = useRef(true), working = useRef(false), current = useRef(null), imageRef = useRef(null), creationKey = useRef(newKey());

  function adopt(item) { current.current = item; setExercise(item); setNeedsSync(false); }
  function replaceImage(next) {
    const previous = imageRef.current;
    imageRef.current = next; setImage(next);
    if (previous?.uri !== next?.uri) void removePreparedImage(previous);
  }
  async function run(label, operation, syncOnFailure = false) {
    if (working.current || !mounted.current) return;
    working.current = true; setBusy(label); setError('');
    const live = () => mounted.current;
    try { await operation(live); }
    catch (failure) {
      if (!live()) return;
      if (showAICooldown(failure)) return;
      if (failure.status === 401) { onSessionExpired(); return; }
      if (failure.code === 'EXERCISE_NOT_FOUND' && syncOnFailure) {
        // Preserve the text for review if a session was deleted on another device.
        if (current.current) setText(current.current.problemText);
        adopt(null); setConfirmed(false); creationKey.current = newKey();
      } else if (syncOnFailure && current.current &&
        (!failure.status || failure.status >= 500 || failure.code === 'EXERCISE_CHANGED')) setNeedsSync(true);
      setError(failure.message || 'Chưa thực hiện được. Hãy thử lại.');
    } finally {
      working.current = false;
      if (live()) setBusy('');
    }
  }
  useEffect(() => {
    mounted.current = true;
    // Android can recreate the activity while the system camera is open.
    void run('Đang kiểm tra ảnh vừa chụp…', async live => {
      const recovered = await recoverExerciseImage();
      if (!live()) { await removePreparedImage(recovered); return; }
      if (recovered) replaceImage(recovered);
    });
    return () => { mounted.current = false; void removePreparedImage(imageRef.current); };
  }, []);

  function confirmDiscard(action) {
    if (working.current) return;
    if ((!current.current && (text.trim() || image)) || question.trim()) {
      Alert.alert('Rời nội dung chưa gửi?', 'Ảnh, đề đang soạn và câu hỏi chưa gửi sẽ không được lưu. Các bài đã gửi vẫn nằm trong Lịch sử bài tập.',
        [{ text: 'Ở lại', style: 'cancel' }, { text: 'Tiếp tục', onPress: action }]);
    } else action();
  }
  function leave() {
    if (working.current) { Alert.alert('Đang xử lý', 'Hãy đợi thao tác hiện tại kết thúc rồi quay lại.'); return; }
    confirmDiscard(onClose);
  }
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { leave(); return true; });
    return () => subscription.remove();
  });

  function resetDraft(prefill = '', keepImage = false) {
    adopt(null); setText(prefill); setConfirmed(false); setWarnings([]); setQuestion(''); setHistory(null); setError('');
    creationKey.current = newKey();
    if (!keepImage) replaceImage(null);
  }
  function pick(fromCamera) {
    void run(fromCamera ? 'Đang mở máy ảnh…' : 'Đang chọn ảnh…', async live => {
      const selected = await chooseExerciseImage(fromCamera);
      if (!live()) { await removePreparedImage(selected); return; }
      if (!selected) return; // Cancel keeps the previous draft intact.
      const useSelected = () => {
        if (!mounted.current || working.current) { void removePreparedImage(selected); return; }
        resetDraft(); replaceImage(selected);
      };
      if (text.trim() || image) {
        Alert.alert('Dùng ảnh mới?', 'Nội dung đề đang soạn sẽ được thay bằng một bản mới.', [
          { text: 'Giữ bản hiện tại', style: 'cancel', onPress: () => { void removePreparedImage(selected); } },
          { text: 'Dùng ảnh mới', onPress: useSelected },
        ], { cancelable: false });
      } else { resetDraft(); replaceImage(selected); }
    });
  }
  function recognize() {
    const execute = () => { void run('Đang nhận dạng chữ trong ảnh…', async live => {
      const result = await recognizeExerciseImage(imageRef.current);
      if (!live()) return;
      setText(result.text); setConfirmed(false); creationKey.current = newKey();
      setWarnings(result.status === 'no_text' ? ['Chưa đọc được chữ. Hãy chụp rõ hơn hoặc nhập đề trực tiếp.', ...result.warnings] : result.warnings);
    }); };
    if (text.trim()) Alert.alert('Nhận dạng lại?', 'Kết quả mới sẽ thay nội dung bạn đang sửa.',
      [{ text: 'Hủy', style: 'cancel' }, { text: 'Nhận dạng lại', onPress: execute }]);
    else execute();
  }
  function analyze() {
    if (!current.current && (!confirmed || text.trim().length < 3 || text.length > 12000)) return;
    void run('Đang phân tích đề bài…', async live => {
      let item = current.current;
      if (!item) {
        item = await createExercise(text, creationKey.current);
        if (!live()) return;
        adopt(item); setHistory(null);
      }
      if (!item.analysis) {
        item = await supportExercise(item, 'analyze');
        if (!live()) return;
        adopt(item);
      }
    }, true);
  }
  function ask(kind, content = '') {
    const labels = { hint: 'Đang tạo gợi ý tiếp theo…', explain: 'Đang giải thích khái niệm…', solution: 'Đang tạo lời giải tham khảo…', followup: 'Đang trả lời câu hỏi…' };
    void run(labels[kind], async live => {
      const item = await supportExercise(current.current, kind, content);
      if (!live()) return;
      adopt(item);
      if (kind === 'followup') setQuestion('');
    }, true);
  }
  function showSolution() {
    if (working.current) return;
    Alert.alert('Xem lời giải tham khảo?', 'Thao tác này sẽ yêu cầu AI đưa ra các bước giải đầy đủ và kết quả. Bạn có thể tiếp tục tự làm với gợi ý trước.', [
      { text: 'Tiếp tục tự làm', style: 'cancel' }, { text: 'Xem lời giải', onPress: () => ask('solution') },
    ]);
  }
  function sync() {
    void run('Đang đồng bộ bài tập…', async live => {
      const item = await getExercise(current.current.id);
      if (!live()) return;
      const last = item.turns.at(-1);
      if (item.revision > current.current.revision && last?.kind === 'followup' && last.question === question.trim()) setQuestion('');
      adopt(item);
    }, true);
  }
  function showHistory() {
    if (history !== null) { setHistory(null); return; }
    void run('Đang tải lịch sử…', async live => {
      const items = await listExercises();
      if (live()) setHistory(items);
    });
  }
  function openSaved(id) {
    confirmDiscard(() => { void run('Đang mở bài tập…', async live => {
      const item = await getExercise(id);
      if (!live()) return;
      replaceImage(null); adopt(item); setText(item.problemText); setConfirmed(true); setWarnings([]); setQuestion(''); setHistory(null);
    }); });
  }
  function removeSaved(item) {
    Alert.alert('Xóa bài tập đã lưu?', `Bài “${item.title}” cùng các gợi ý và trao đổi sẽ bị xóa.`, [
      { text: 'Hủy', style: 'cancel' }, { text: 'Xóa bài tập', style: 'destructive', onPress: () => {
        void run('Đang xóa bài tập…', async live => {
          await deleteExercise(item.id);
          if (!live()) return;
          const remaining = history.filter(entry => entry.id !== item.id);
          if (current.current?.id === item.id) resetDraft();
          setHistory(remaining);
        });
      } },
    ]);
  }

  const analysis = exercise?.analysis;
  const hints = exercise?.turns.filter(turn => turn.kind === 'hint').length || 0;
  const hasSolution = exercise?.turns.some(turn => turn.kind === 'solution');
  const limited = !!exercise && (exercise.revision >= exercise.maxTurns || exercise.contextFull);
  const canAsk = !!analysis && !busy && !needsSync && !limited;
  const validText = text.trim().length >= 3 && text.length <= 12000;

  return <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Button icon="arrow-left" label="Về trang chủ" onPress={leave} disabled={!!busy} compact tone="ghost" style={{ alignSelf: 'flex-start' }} />
      <View style={styles.intro}><ScreenIntro eyebrow="TỰ TÌM RA CÁCH GIẢI" title="Từng bước, hiểu bài." description="Chụp đề, kiểm tra nội dung và cùng AI tìm hướng giải." icon="maximize" /></View>
      <Steps current={exercise ? 2 : text ? 1 : 0} />
      <View style={styles.row}>
        <StudyButton icon="＋" label="Bài tập mới" onPress={() => confirmDiscard(() => resetDraft())} disabled={!!busy} style={styles.half} />
        <StudyButton icon="☰" label={history !== null ? 'Đóng lịch sử' : 'Lịch sử bài tập'} onPress={showHistory} disabled={!!busy} style={styles.half} />
      </View>
      {!!busy && <Notice loading>{busy}{'\n'}Có thể cần đến 2 phút. Bạn hãy chờ một chút nhé.</Notice>}
      {!!error && <Notice tone="error">{error}</Notice>}
      {needsSync && <View style={styles.notice}><Text style={styles.body}>Chưa xác định được kết quả yêu cầu vừa gửi. Bấm Đồng bộ bài tập để lấy trạng thái mới nhất trước khi gửi lại.</Text></View>}
      {exercise && <StudyButton icon="↻" label="Đồng bộ bài tập" disabled={!!busy} onPress={sync} />}

      {history !== null && <View style={styles.card}>
        <Text style={styles.title}>Bài tập đã lưu ({history.length}/100)</Text>
        <Text style={styles.muted}>Chỉ hiển thị bài của tài khoản đang đăng nhập. Mở lại không gọi AI.</Text>
        {!history.length && <Text style={styles.body}>Bạn chưa có bài tập đã lưu.</Text>}
        {history.map(item => <View key={item.id} style={styles.historyItem}>
          <Text style={styles.label}>{item.title}</Text>
          <Text style={styles.muted}>{item.analyzed ? 'Đã phân tích' : 'Đã lưu đề, chưa phân tích'} · {new Date(item.updatedAt).toLocaleString('vi-VN')}</Text>
          <View style={styles.row}>
            <StudyButton icon="↗" label="Mở bài" accessibilityLabel={`Mở bài ${item.title}`} onPress={() => openSaved(item.id)} disabled={!!busy} style={styles.half} />
            <StudyButton icon="×" label="Xóa" accessibilityLabel={`Xóa bài ${item.title}`} tone="danger" onPress={() => removeSaved(item)} disabled={!!busy} style={styles.half} />
          </View>
        </View>)}
      </View>}

      {!exercise ? <>
        <View style={styles.card}>
          <View style={styles.sectionHeading}><Badge label="BƯỚC 01" icon="camera" /><Text style={styles.title}>Chọn đề bài</Text></View>
          <Text style={styles.muted}>Chụp rõ một đề bài và hình vẽ đi kèm. Hoặc nhập đề trực tiếp ở bước tiếp theo.</Text>

          <View style={styles.row}>
            <StudyButton icon="📷" label="Chụp đề bài" onPress={() => pick(true)} disabled={!!busy} style={styles.half} />
            <StudyButton icon="▧" label="Chọn ảnh" onPress={() => pick(false)} disabled={!!busy} style={styles.half} />
          </View>
          {!image && <View style={styles.photoPlaceholder}><View style={styles.cameraCircle}><Icon name="camera" size={30} /></View><Text style={styles.photoTitle}>Đưa bài học vào khung hình</Text><Text style={styles.muted}>Ảnh rõ nét giúp AI đọc đúng hơn.</Text></View>}
          {image && <>
            <Image source={{ uri: image.uri }} style={styles.image} resizeMode="contain" accessibilityLabel="Ảnh đề bài đã chọn" />
            <Text style={styles.muted}>Bấm Nhận dạng chữ để gửi ảnh đến Gemini. Lịch sử bài tập lưu bản văn bản đã xác nhận.</Text>
            <StudyButton icon="⌕" label="Nhận dạng chữ" tone="primary" disabled={!!busy} onPress={recognize} />
          </>}
        </View>
        <View style={styles.card}>
          <View style={styles.sectionHeading}><Badge label="BƯỚC 02" icon="edit-3" /><Text style={styles.title}>Duyệt lại đề bài</Text></View>
          {warnings.map((line, index) => <Text key={index} style={styles.warning}>• {line}</Text>)}
          <TextInput accessibilityLabel="Nội dung đề bài" placeholder="Nội dung nhận diện sẽ hiện ở đây. Hoặc nhập một đề bài…"
            placeholderTextColor="#66776D" value={text} editable={!busy} multiline maxLength={12001} textAlignVertical="top"
            style={styles.editor} onChangeText={value => { setText(value); setConfirmed(false); creationKey.current = newKey(); }} />
          <Text style={text.length > 12000 ? styles.warning : styles.muted}>{text.length.toLocaleString('vi-VN')}/12.000 ký tự</Text>
          <Text style={styles.muted}>Kiểm tra dấu tiếng Việt, dấu âm, số mũ, phân số và dữ kiện hình vẽ. Sửa hoặc bổ sung chỗ [không rõ] trước khi gửi.</Text>
          <Pressable accessibilityRole="checkbox" accessibilityLabel="Tôi đã kiểm tra đề bài" accessibilityState={{ checked: confirmed, disabled: !!busy || !validText }}
            disabled={!!busy || !validText} onPress={() => setConfirmed(value => !value)} style={styles.checkbox}>
            <View style={[styles.checkBox, confirmed && styles.checkBoxActive]}>{confirmed && <Icon name="check" size={16} color="#FFFFFF" />}</View><Text style={styles.checkLabel}>Tôi đã kiểm tra và xác nhận nội dung đề bài.</Text>
          </Pressable>
          <StudyButton icon="→" label="Phân tích đề bài" tone="primary" disabled={!!busy || !confirmed || !validText} onPress={analyze} />
          <Text style={styles.footnote}>Khi gửi, đề đã xác nhận và các kết quả AI được lưu vào tài khoản để học tiếp. Chỉnh sửa đề sau đó sẽ tạo một bài mới.</Text>
        </View>
      </> : <>
        <View style={styles.card}>
          <Badge label="Đề đã xác nhận" icon="check-circle" />
          <Disclosure title="Xem đề bài và ảnh để đối chiếu" icon="file-text" defaultOpen={!analysis}>
          {image && <Image source={{ uri: image.uri }} style={styles.image} resizeMode="contain" accessibilityLabel="Ảnh đề bài để đối chiếu" />}
          <Text selectable style={styles.body}>{exercise.problemText}</Text>
          </Disclosure>
          <StudyButton icon="✎" label="Sửa đề để tạo bài mới" disabled={!!busy} onPress={() => confirmDiscard(() => resetDraft(exercise.problemText, true))} />
          <Text style={styles.footnote}>Đã lưu trong tài khoản · {exercise.revision}/{exercise.maxTurns} lần hỗ trợ thành công.</Text>
          {!analysis && <StudyButton icon="→" label="Phân tích đề đã lưu" tone="primary" disabled={!!busy || needsSync || limited} onPress={analyze} />}
        </View>
        {analysis && <>
          <View style={styles.card}>
            <Text style={styles.badge}>PHÂN TÍCH ĐỀ</Text>
            <Text style={styles.title}>{analysis.title}</Text>
            <Text style={styles.label}>{analysis.subject} · {analysis.problemType}</Text>
            <Text style={analysis.status === 'ready' ? styles.good : styles.warning}>{statusLabels[analysis.status]}</Text>
            <Text selectable style={styles.body}>{analysis.summary}</Text>
            {!!analysis.given.length && <Text style={styles.label}>Dữ kiện đã có</Text>}
            {analysis.given.map((line, index) => <Text key={index} selectable style={styles.body}>• {line}</Text>)}
            <Text style={styles.label}>Cần tìm / cần làm</Text><Text selectable style={styles.body}>{analysis.goal}</Text>
            {analysis.questions.map((line, index) => <Text key={index} style={styles.warning}>Cần làm rõ: {line}</Text>)}
            {analysis.caveats.map((line, index) => <Text key={index} style={styles.warning}>• {line}</Text>)}
            {analysis.status !== 'ready' && <Text style={styles.muted}>Bấm Sửa đề để bổ sung dữ kiện rồi xác nhận và phân tích lại.</Text>}
          </View>
          {!!analysis.concepts.length && <Disclosure title="Khái niệm liên quan · Giải thích thêm" icon="book-open">
            {analysis.concepts.map((concept, index) => <View key={index} style={styles.concept}>
              <Text style={styles.label}>{concept.name}</Text><Text selectable style={styles.body}>{concept.description}</Text>
              <StudyButton icon="ⓘ" label={`Giải thích: ${concept.name}`} disabled={!canAsk}
                onPress={() => ask('explain', `Giải thích khái niệm ${concept.name} trong bài này.`)} />
            </View>)}
          </Disclosure>}
          {exercise.turns.map(turn => <ExerciseResult key={turn.id} turn={turn} />)}
          <View style={styles.card}>
            <Text style={styles.title}>Bạn muốn tiếp tục thế nào?</Text>
            <Text style={styles.muted}>Mỗi lần bấm nhận một gợi ý. Hãy thử làm trước khi lấy bước tiếp theo.</Text>
            <StudyButton icon="💡" label={hints ? `Gợi ý tiếp theo (${Math.min(hints + 1, exercise.maxHints)}/${exercise.maxHints})` : 'Gợi ý bước 1'} tone="primary"
              disabled={!canAsk || analysis.status !== 'ready' || hints >= exercise.maxHints || hasSolution} onPress={() => ask('hint')} />
            <StudyButton icon="✓" label={hasSolution ? 'Đã có lời giải ở bên dưới' : 'Xem lời giải tham khảo'}
              disabled={!canAsk || analysis.status !== 'ready' || hasSolution} onPress={showSolution} />
            {hints >= exercise.maxHints && !hasSolution && <Text style={styles.muted}>Đã có đủ 6 gợi ý. Bạn có thể hỏi về bước còn vướng hoặc mở lời giải.</Text>}
            {limited && <Text style={styles.warning}>Bài này đã đạt giới hạn hỗ trợ hoặc độ dài. Kết quả vẫn được giữ để xem lại; bạn có thể tạo bài mới.</Text>}

          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Hỏi tiếp về cách làm</Text>
            <TextInput accessibilityLabel="Câu hỏi tiếp theo" placeholder="Ví dụ: Vì sao ở bước vừa rồi phải đổi dấu?" placeholderTextColor="#66776D"
              value={question} onChangeText={setQuestion} editable={!busy && !limited} multiline maxLength={1000} style={[styles.editor, styles.question]} />
            <Text style={styles.muted}>{question.length}/1.000 ký tự</Text>
            <StudyButton icon="↑" label="Gửi câu hỏi" tone="primary" disabled={!canAsk || question.trim().length < 3} onPress={() => ask('followup', question)} />
          </View>
        </>}
      </>}
      <Disclosure title="Lưu ý khi học với AI" icon="info"><Text style={styles.muted}>AI có thể nhận diện hoặc tính toán sai. Hãy đối chiếu đề gốc và tự kiểm tra kết quả, nhất là ký hiệu toán và hình vẽ. Các chức năng AI dùng chung thời gian chờ; nếu có popup, đợi đủ số giây rồi thử lại.</Text></Disclosure>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  intro: { marginTop: 22, marginBottom: -12 }, sectionHeading: { gap: 10, marginBottom: 4 },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center', padding: 24, borderWidth: 1, borderStyle: 'dashed', borderColor: '#C4D1BB', borderRadius: 18, backgroundColor: '#F8FAF4', marginTop: 18, marginBottom: 8 }, cameraCircle: { width: 66, height: 66, borderRadius: 23, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }, photoTitle: { color: colors.primary, fontSize: 14, fontWeight: '700', lineHeight: 22 },
  checkBox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1, borderColor: '#9CAE90', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }, checkBoxActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  container: { flex: 1, backgroundColor: '#F6F8F2' }, content: { padding: 18, paddingBottom: 40 },
  heading: { color: '#143D2C', fontSize: 25, fontWeight: '800', marginTop: 20, marginBottom: 8 },
  title: { color: '#253B31', fontSize: 18, lineHeight: 26, fontWeight: '700', marginBottom: 8 },
  body: { color: '#253B31', fontSize: 15, lineHeight: 25 }, muted: { color: '#66776D', fontSize: 13, lineHeight: 21, marginTop: 4 },
  label: { color: '#253B31', fontSize: 15, lineHeight: 24, fontWeight: '700', marginTop: 10, marginBottom: 4 },
  badge: { color: '#216647', fontSize: 12, lineHeight: 20, fontWeight: '800', marginBottom: 6 },
  row: { flexDirection: 'row', gap: 8 }, half: { flex: 1 },
  card: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 22, borderWidth: 1, borderColor: '#DEE6D9', marginTop: 16 },
  notice: { backgroundColor: '#E9F2E3', padding: 14, borderRadius: 18, marginTop: 14 },
  error: { backgroundColor: '#FFF1EE', padding: 14, borderRadius: 18, marginTop: 14 }, errorText: { color: '#B33B3B', lineHeight: 23 },
  image: { width: '100%', height: 260, marginVertical: 12, backgroundColor: '#E9F2E3', borderRadius: 14 },
  editor: { borderWidth: 1, borderColor: '#C4D1BB', borderRadius: 14, padding: 12, minHeight: 200, fontSize: 15, lineHeight: 24, color: '#253B31', backgroundColor: '#FCFDF9', marginTop: 12, textAlignVertical: 'top' },
  question: { minHeight: 90 }, checkbox: { flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 56, paddingVertical: 10 },
  check: { fontSize: 28, color: '#216647' }, checkLabel: { flex: 1, fontSize: 14, lineHeight: 22, color: '#253B31' },
  footnote: { fontSize: 12, lineHeight: 20, color: '#66776D', marginTop: 14 },
  warning: { color: '#92530F', lineHeight: 23, marginVertical: 6 }, good: { color: '#216647', fontWeight: '700', lineHeight: 23, marginVertical: 6 },
  historyItem: { borderTopWidth: 1, borderColor: '#DEE6D9', marginTop: 14, paddingTop: 6 },
  concept: { marginTop: 8 },
});
