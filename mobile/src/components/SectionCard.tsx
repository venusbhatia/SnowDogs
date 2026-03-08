import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '../theme';

type Props = PropsWithChildren<{
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  style?: StyleProp<ViewStyle>;
}>;

export default function SectionCard({ eyebrow, title, subtitle, style, children }: Props) {
  return (
    <View style={[styles.card, style]}>
      {(eyebrow || title || subtitle) && (
        <View style={styles.header}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6
  },
  header: {
    gap: 6
  },
  eyebrow: {
    color: colors.accent,
    textTransform: 'uppercase',
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: '700'
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700'
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20
  }
});
