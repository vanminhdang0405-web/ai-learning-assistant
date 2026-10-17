import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { colors, ui } from '../theme';

const symbols = { '‹': 'arrow-left', '←': 'arrow-left', '＋': 'plus', '☰': 'clock', '↗': 'arrow-up-right', '×': 'x',
  '↻': 'refresh-cw', '📷': 'camera', '▧': 'image', '⌕': 'maximize', '→': 'arrow-right', '✎': 'edit-3',
  '💡': 'sun', '✓': 'check', 'ⓘ': 'info', '↑': 'arrow-up', '➤': 'send', '🕘': 'clock', '💾': 'save', '⌃': 'chevron-up', '⌄': 'chevron-down', '↩': 'corner-up-left' };
export function Icon({ name, size = 20, color = colors.primary }) {
  return <Feather name={/** @type {any} */ (symbols[name] || name)} size={size} color={color} accessible={false} />;
}
export function Button({ label, onPress, icon = '', tone = 'primary', disabled = false, loading = false,
  compact = false, style = undefined, accessibilityLabel = undefined, expanded = undefined }) {
  const blocked = disabled || loading;
  const color = blocked ? colors.muted : tone === 'primary' ? '#FFFFFF' : tone === 'danger' ? colors.danger : colors.primary;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || label}
    accessibilityState={{ disabled: blocked, busy: loading, ...(expanded === undefined ? {} : { expanded }) }}
    disabled={blocked} onPress={onPress} style={({ pressed }) => [s.button, compact && s.compact,
      tone === 'primary' ? s.primary : tone === 'danger' ? s.danger : tone === 'ghost' ? s.ghost : s.secondary,
      style, blocked && s.disabled, pressed && !blocked && s.pressed]}>
    {loading ? <ActivityIndicator size="small" color={color} /> : !!icon && <Icon name={icon} size={compact ? 17 : 20} color={color} />}
    <Text style={[s.buttonText, { color }, compact && { fontSize: 13 }]}>{label}</Text>
  </Pressable>;
}
export function Badge({ label, icon = '', tone = 'green' }) {
  const shade = tone === 'amber' ? [colors.warningSoft, colors.warning] : tone === 'blue' ? [colors.blueSoft, colors.blue] : [colors.soft, colors.primary];
  return <View style={[s.badge, { backgroundColor: shade[0] }]}>{!!icon && <Icon name={icon} size={13} color={shade[1]} />}<Text style={[s.badgeText, { color: shade[1] }]}>{label}</Text></View>;
}
export function ScreenIntro({ eyebrow = '', title, description = '', icon = '' }) {
  return <View style={s.intro}>{!!eyebrow && <Text style={s.eyebrow}>{eyebrow}</Text>}
    <View style={s.introRow}><Text style={[ui.title, s.flex]}>{title}</Text>{!!icon && <View style={s.introIcon}><Icon name={icon} size={24} /></View>}</View>
    {!!description && <Text style={[ui.caption, s.description]}>{description}</Text>}
  </View>;
}
export function Field({ label, icon = '', hint = '', secureTextEntry = false, ...props }) {
  const [focused, setFocused] = useState(false), [visible, setVisible] = useState(false);
  return <View style={s.field}><Text style={s.fieldLabel}>{label}</Text>
    <View style={[s.inputWrap, focused && s.focused, props.editable === false && s.readonly]}>
      {!!icon && <Icon name={icon} size={18} color={focused ? colors.primary : colors.muted} />}
      <TextInput {...props} accessibilityLabel={props.accessibilityLabel || label} placeholderTextColor={colors.muted}
        autoCapitalize={props.autoCapitalize || 'none'} autoCorrect={props.autoCorrect ?? false}
        secureTextEntry={secureTextEntry && !visible} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={[s.input, props.style]} />
      {secureTextEntry && <Pressable accessibilityRole="button" accessibilityLabel={`${visible ? 'Ẩn' : 'Hiện'} ${label.toLowerCase()}`}
        onPress={() => setVisible(value => !value)} style={s.eye} disabled={props.editable === false}>
        <Icon name={visible ? 'eye-off' : 'eye'} size={19} color={colors.muted} />
      </Pressable>}
    </View>{!!hint && <Text style={[ui.caption, s.hint]}>{hint}</Text>}
  </View>;
}
export function Notice({ children, tone = 'info', loading = false }) {
  const color = tone === 'error' ? colors.danger : tone === 'warning' ? colors.warning : colors.primary;
  return <View accessibilityLiveRegion="polite" style={[s.notice, { backgroundColor: tone === 'error' ? colors.dangerSoft : tone === 'warning' ? colors.warningSoft : colors.soft }]}>
    {loading ? <ActivityIndicator color={color} size="small" /> : <Icon name={tone === 'error' ? 'alert-circle' : 'info'} size={18} color={color} />}
    <Text style={[s.noticeText, { color }]}>{children}</Text>
  </View>;
}
export function EmptyState({ title, description, icon = 'book-open', children = null }) {
  return <View style={s.empty}><View style={s.emptyIcon}><Icon name={icon} size={28} /></View>
    <Text style={s.emptyTitle}>{title}</Text><Text style={s.emptyDescription}>{description}</Text>{children}</View>;
}
export function Disclosure({ title, children, icon = 'info', defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return <View style={s.disclosure}><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }}
    accessibilityLabel={title} onPress={() => setOpen(value => !value)} style={s.disclosureHeader}>
    <Icon name={icon} size={18} /><Text style={s.disclosureTitle}>{title}</Text><Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} />
  </Pressable>{open && <View style={s.disclosureBody}>{children}</View>}</View>;
}
export function Steps({ current = 0, labels = ['Chọn ảnh', 'Duyệt đề', 'Cùng giải'] }) {
  return <View style={s.steps}>{labels.map((label, index) => <View key={label} style={s.step}>
    <View style={[s.stepDot, index <= current && s.stepActive]}>{index < current ? <Icon name="check" size={14} color="#FFFFFF" />
      : <Text style={[s.stepNumber, index <= current && { color: '#FFFFFF' }]}>{index + 1}</Text>}</View>
    <Text style={[s.stepLabel, index === current && { color: colors.primary, fontWeight: '700' }]}>{label}</Text>
  </View>)}</View>;
}
const s = StyleSheet.create({
  flex: { flex: 1 }, button: { minHeight: 52, paddingVertical: 13, paddingHorizontal: 17, borderRadius: 15, borderWidth: 1, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center' },
  compact: { minHeight: 44, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12 }, primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  secondary: { backgroundColor: colors.soft, borderColor: colors.border }, ghost: { backgroundColor: 'transparent', borderColor: colors.border }, danger: { backgroundColor: colors.dangerSoft, borderColor: '#F1D9D3' },
  disabled: { backgroundColor: colors.disabled, borderColor: colors.disabled }, pressed: { opacity: 0.75 }, buttonText: { fontSize: 15, fontWeight: '700', lineHeight: 22, flexShrink: 1, textAlign: 'center' },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, flexDirection: 'row', gap: 5, alignItems: 'center', alignSelf: 'flex-start' }, badgeText: { fontSize: 11, lineHeight: 17, fontWeight: '700' },
  intro: { marginBottom: 22 }, eyebrow: { color: colors.primary, fontSize: 11, letterSpacing: 1.6, fontWeight: '700', marginBottom: 10 }, introRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  introIcon: { width: 50, height: 50, borderRadius: 17, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }, description: { marginTop: 8 },
  field: { marginBottom: 18 }, fieldLabel: { color: colors.text, fontSize: 13, lineHeight: 20, fontWeight: '600', marginBottom: 8 },
  inputWrap: { minHeight: 54, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface, paddingLeft: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  focused: { borderColor: colors.primary, backgroundColor: '#FBFFF8' }, readonly: { backgroundColor: '#F0F3EC' }, input: { flex: 1, minWidth: 0, minHeight: 52, color: colors.text, fontSize: 16, paddingVertical: 12, paddingRight: 12 },
  eye: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }, hint: { fontSize: 12, marginTop: 6 },
  notice: { padding: 14, borderRadius: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginVertical: 10 }, noticeText: { flex: 1, fontSize: 13, lineHeight: 22 },
  empty: { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 32 }, emptyIcon: { width: 72, height: 72, borderRadius: 25, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { ...ui.section, textAlign: 'center', marginBottom: 8 }, emptyDescription: { ...ui.caption, textAlign: 'center', marginBottom: 16 },
  disclosure: { borderColor: colors.border, borderWidth: 1, borderRadius: 16, backgroundColor: colors.surface, marginTop: 12 }, disclosureHeader: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  disclosureTitle: { flex: 1, fontSize: 13, lineHeight: 21, fontWeight: '600', color: colors.text }, disclosureBody: { paddingHorizontal: 16, paddingBottom: 16 },
  steps: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.border, marginTop: 14 },
  step: { flex: 1, alignItems: 'center', gap: 6 }, stepDot: { width: 26, height: 26, borderRadius: 9, backgroundColor: colors.disabled, alignItems: 'center', justifyContent: 'center' }, stepActive: { backgroundColor: colors.primary },
  stepNumber: { fontSize: 12, fontWeight: '700', color: colors.muted }, stepLabel: { fontSize: 11, lineHeight: 17, color: colors.muted, textAlign: 'center' },
});
