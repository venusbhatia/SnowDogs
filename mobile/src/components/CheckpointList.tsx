import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../theme';
import type { EnrichedCheckpoint } from '../types';
import { riskHex } from '../utils/risk';
import SectionCard from './SectionCard';

type Props = {
  checkpoints: EnrichedCheckpoint[];
  selectedCheckpointId: string | null;
  onCheckpointSelect: (checkpoint: EnrichedCheckpoint) => void;
};

export default function CheckpointList({ checkpoints, selectedCheckpointId, onCheckpointSelect }: Props) {
  return (
    <SectionCard
      eyebrow="Checkpoints"
      title="Tap into the route"
      subtitle="Each checkpoint blends forecast timing, road surface context, nearby cameras, and AI support."
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list}>
        {checkpoints.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No checkpoints yet</Text>
            <Text style={styles.emptyText}>Run a scan to build the route timeline.</Text>
          </View>
        ) : (
          checkpoints.map((checkpoint) => {
            const selected = checkpoint.id === selectedCheckpointId;

            return (
              <Pressable
                key={checkpoint.id}
                style={({ pressed }) => [
                  styles.card,
                  selected && styles.cardSelected,
                  pressed && styles.cardPressed
                ]}
                onPress={() => onCheckpointSelect(checkpoint)}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.dot, { backgroundColor: riskHex(checkpoint.riskColor) }]} />
                  <Text style={styles.distance}>{checkpoint.distanceKm.toFixed(0)} km</Text>
                  <Text style={styles.eta}>{checkpoint.etaLocal}</Text>
                </View>
                <Text style={[styles.badge, { color: riskHex(checkpoint.riskColor) }]}>{checkpoint.riskLabel}</Text>
                <Text style={styles.primaryLine}>{checkpoint.forecast?.temperature ?? '-'}C and {checkpoint.forecast?.visibility ?? '-'} m visibility</Text>
                <Text style={styles.secondaryLine}>
                  Snow {checkpoint.forecast?.snowfall ?? 0} cm/h{checkpoint.cameraUrl ? '  •  Camera live' : ''}
                </Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
    paddingRight: spacing.sm
  },
  card: {
    width: 220,
    backgroundColor: colors.panelAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 10
  },
  cardSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.panelSoft
  },
  cardPressed: {
    opacity: 0.92
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill
  },
  distance: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700'
  },
  eta: {
    color: colors.textMuted,
    fontSize: 13
  },
  badge: {
    fontSize: 13,
    fontWeight: '700'
  },
  primaryLine: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20
  },
  secondaryLine: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  emptyState: {
    width: 240,
    backgroundColor: colors.panelAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: 8
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700'
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20
  }
});
