import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../theme';
import type { EnrichedCheckpoint } from '../types';
import { riskHex } from '../utils/risk';
import SectionCard from './SectionCard';

type Props = {
  checkpoints: EnrichedCheckpoint[];
  onCheckpointSelect: (checkpoint: EnrichedCheckpoint) => void;
};

export default function RiskStrip({ checkpoints, onCheckpointSelect }: Props) {
  const flagged = checkpoints.filter((checkpoint) => checkpoint.riskScore >= 0.5).length;

  return (
    <SectionCard
      eyebrow="Timeline"
      title="Risk strip"
      subtitle={
        checkpoints.length > 0
          ? `${flagged} checkpoint${flagged === 1 ? '' : 's'} above caution threshold.`
          : 'Your route risk band will appear here after a scan.'
      }
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.track}>
        {checkpoints.length === 0 ? (
          <View style={styles.emptyBar} />
        ) : (
          checkpoints.map((checkpoint) => (
            <Pressable
              key={checkpoint.id}
              accessibilityRole="button"
              accessibilityLabel={`Jump to ${checkpoint.distanceKm.toFixed(0)} kilometer checkpoint`}
              style={({ pressed }) => [styles.bar, { backgroundColor: riskHex(checkpoint.riskColor) }, pressed && styles.barPressed]}
              onPress={() => onCheckpointSelect(checkpoint)}
            />
          ))
        )}
      </ScrollView>
      {checkpoints.length > 0 ? (
        <View style={styles.footer}>
          <Text style={styles.footerText}>{checkpoints[0]?.etaLocal}</Text>
          <Text style={styles.footerText}>{checkpoints[checkpoints.length - 1]?.etaLocal}</Text>
        </View>
      ) : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  track: {
    gap: 6,
    alignItems: 'center'
  },
  bar: {
    width: 20,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  barPressed: {
    transform: [{ scaleY: 0.95 }],
    opacity: 0.85
  },
  emptyBar: {
    width: 240,
    height: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.border
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  footerText: {
    color: colors.textMuted,
    fontSize: 12
  }
});
