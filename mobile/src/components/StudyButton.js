import { Button } from './AppUI';

export default function StudyButton({ label, icon = '', onPress, disabled = false, loading = false, tone = 'secondary', style = undefined, accessibilityLabel = undefined }) {
  return <Button label={label} icon={icon} onPress={onPress} disabled={disabled} loading={loading}
    tone={tone} style={[{ marginTop: 8 }, style]} accessibilityLabel={accessibilityLabel} />;
}
