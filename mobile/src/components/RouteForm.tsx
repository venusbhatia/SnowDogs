import { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent
} from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';

import { CITIES, ROUTE_PRESETS, getCityByValue, tomorrowAtSix } from '../constants/locations';
import { colors, radius, spacing } from '../theme';
import type { CameraScanProgress, RouteSearchPayload, ScanStage } from '../types';
import SectionCard from './SectionCard';

type Props = {
  loading: boolean;
  scanStage: ScanStage;
  cameraProgress: CameraScanProgress;
  onSubmit: (payload: RouteSearchPayload) => Promise<void>;
};

function formatDeparture(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

function submitLabel(loading: boolean, scanStage: ScanStage, cameraProgress: CameraScanProgress): string {
  if (!loading) {
    return 'Scan winter route';
  }
  if (scanStage === 'route') {
    return 'Mapping corridor...';
  }
  if (scanStage === 'weather') {
    return 'Pulling forecast...';
  }
  if (scanStage === 'roads') {
    return 'Loading road conditions...';
  }
  if (scanStage === 'cameras') {
    if (cameraProgress.total > 0) {
      return `Checking cameras ${cameraProgress.completed}/${cameraProgress.total}...`;
    }

    return 'Checking nearby cameras...';
  }
  if (scanStage === 'risk') {
    return 'Scoring hazards...';
  }

  return 'Scanning route...';
}

export default function RouteForm({ loading, scanStage, cameraProgress, onSubmit }: Props) {
  const defaultPreset = ROUTE_PRESETS.find((preset) => preset.recommended) ?? ROUTE_PRESETS[0];
  const [originValue, setOriginValue] = useState<string>(defaultPreset?.originValue ?? CITIES[0]?.value ?? '');
  const [destinationValue, setDestinationValue] = useState<string>(defaultPreset?.destinationValue ?? CITIES[1]?.value ?? '');
  const [departureTime, setDepartureTime] = useState<Date>(tomorrowAtSix());
  const [showPicker, setShowPicker] = useState(false);

  const origin = getCityByValue(originValue);
  const destination = getCityByValue(destinationValue);
  const sameCity = originValue === destinationValue;
  const activePresetId =
    ROUTE_PRESETS.find((preset) => preset.originValue === originValue && preset.destinationValue === destinationValue)?.id ?? null;

  const handleDateChange = (event: DateTimePickerEvent, nextDate?: Date) => {
    if (event.type === 'dismissed') {
      return;
    }

    if (nextDate) {
      setDepartureTime(nextDate);
    }
  };

  const openDeparturePicker = () => {
    if (loading) {
      return;
    }

    if (Platform.OS !== 'android') {
      setShowPicker(true);
      return;
    }

    // On Android, the component-based `mode="datetime"` path is unstable (can throw `dismiss` errors).
    // Use the supported imperative API to show date -> time pickers instead.
    DateTimePickerAndroid.open({
      value: departureTime,
      mode: 'date',
      onChange: (event, nextDate) => {
        if (event.type === 'dismissed' || !nextDate) {
          return;
        }

        const datePicked = new Date(departureTime);
        datePicked.setFullYear(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());

        DateTimePickerAndroid.open({
          value: datePicked,
          mode: 'time',
          onChange: (timeEvent, nextTime) => {
            if (timeEvent.type === 'dismissed' || !nextTime) {
              return;
            }

            const combined = new Date(datePicked);
            combined.setHours(nextTime.getHours(), nextTime.getMinutes(), 0, 0);
            setDepartureTime(combined);
          }
        });
      }
    });
  };

  const handleSubmit = async () => {
    if (!origin || !destination || sameCity) {
      return;
    }

    await onSubmit({
      origin: origin.coords,
      destination: destination.coords,
      departureTime,
      originLabel: origin.label,
      destinationLabel: destination.label
    });
  };

  const applyPreset = (originPresetValue: string, destinationPresetValue: string) => {
    setOriginValue(originPresetValue);
    setDestinationValue(destinationPresetValue);
    setDepartureTime(tomorrowAtSix());
  };

  const swapRoute = () => {
    setOriginValue(destinationValue);
    setDestinationValue(originValue);
  };

  return (
    <SectionCard
      eyebrow="Route Scan"
      title="Plan the drive"
      subtitle="Pick a corridor, estimate arrival checkpoints, and scan for weather, surface conditions, cameras, and AI advisories."
    >
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Quick routes</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
          {ROUTE_PRESETS.map((preset) => {
            const active = preset.id === activePresetId;

            return (
              <Pressable
                key={preset.id}
                style={({ pressed }) => [
                  styles.presetCard,
                  active && styles.presetCardActive,
                  loading && styles.controlDisabled,
                  pressed && styles.presetCardPressed
                ]}
                disabled={loading}
                onPress={() => applyPreset(preset.originValue, preset.destinationValue)}
              >
                <View style={styles.presetHeader}>
                  <Text style={styles.presetTitle}>{preset.label}</Text>
                  {preset.recommended ? <Text style={styles.recommendedBadge}>Best demo</Text> : null}
                </View>
                <Text style={styles.presetNote}>{preset.note}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>From</Text>
        <View style={styles.pickerWrap}>
          <Picker
            selectedValue={originValue}
            dropdownIconColor={colors.text}
            style={styles.picker}
            enabled={!loading}
            onValueChange={(value) => setOriginValue(String(value))}
          >
            {CITIES.map((city) => (
              <Picker.Item key={city.value} label={city.label} value={city.value} />
            ))}
          </Picker>
        </View>
      </View>

      <View style={styles.swapRow}>
        <Pressable
          style={({ pressed }) => [styles.swapButton, loading && styles.controlDisabled, pressed && styles.swapButtonPressed]}
          disabled={loading}
          onPress={swapRoute}
        >
          <Text style={styles.swapButtonText}>Swap route</Text>
        </Pressable>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>To</Text>
        <View style={styles.pickerWrap}>
          <Picker
            selectedValue={destinationValue}
            dropdownIconColor={colors.text}
            style={styles.picker}
            enabled={!loading}
            onValueChange={(value) => setDestinationValue(String(value))}
          >
            {CITIES.map((city) => (
              <Picker.Item key={city.value} label={city.label} value={city.value} />
            ))}
          </Picker>
        </View>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Departure</Text>
        <Pressable style={[styles.dateButton, loading && styles.controlDisabled]} disabled={loading} onPress={openDeparturePicker}>
          <Text style={styles.dateText}>{formatDeparture(departureTime)}</Text>
        </Pressable>
        {showPicker && Platform.OS === 'ios' ? (
          <DateTimePicker
            value={departureTime}
            mode="datetime"
            accentColor={colors.accent}
            display="compact"
            onChange={(event, nextDate) => {
              if (event.type === 'dismissed') {
                setShowPicker(false);
                return;
              }

              handleDateChange(event, nextDate);
            }}
          />
        ) : null}
      </View>

      {sameCity ? <Text style={styles.error}>Choose two different cities to run the scan.</Text> : null}

      <Pressable
        style={({ pressed }) => [
          styles.submitButton,
          (pressed || loading || sameCity) && styles.submitButtonPressed,
          (loading || sameCity) && styles.submitButtonDisabled
        ]}
        disabled={loading || sameCity}
        onPress={handleSubmit}
      >
        <Text style={styles.submitText}>{submitLabel(loading, scanStage, cameraProgress)}</Text>
      </Pressable>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  fieldGroup: {
    gap: 8
  },
  label: {
    color: colors.textSoft,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700'
  },
  presetRow: {
    gap: spacing.sm,
    paddingRight: spacing.sm
  },
  presetCard: {
    width: 220,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.panelAlt,
    padding: spacing.md,
    gap: 8
  },
  presetCardActive: {
    borderColor: colors.accent,
    backgroundColor: colors.panelSoft
  },
  presetCardPressed: {
    opacity: 0.92
  },
  presetHeader: {
    gap: 8
  },
  presetTitle: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700'
  },
  recommendedBadge: {
    alignSelf: 'flex-start',
    color: colors.accent,
    borderWidth: 1,
    borderColor: colors.accentSoft,
    backgroundColor: 'rgba(74, 158, 255, 0.12)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '700'
  },
  presetNote: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.panelAlt
  },
  picker: {
    color: colors.text,
    backgroundColor: colors.panelAlt
  },
  swapRow: {
    alignItems: 'flex-end'
  },
  swapButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.panelAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: 8
  },
  swapButtonPressed: {
    opacity: 0.88
  },
  controlDisabled: {
    opacity: 0.6
  },
  swapButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600'
  },
  dateButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.panelAlt
  },
  dateText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600'
  },
  error: {
    color: colors.red,
    fontSize: 13
  },
  submitButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center'
  },
  submitButtonPressed: {
    opacity: 0.88
  },
  submitButtonDisabled: {
    backgroundColor: colors.accentSoft
  },
  submitText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700'
  }
});
