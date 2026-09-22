/**
 * Settings tab — rebuilt in VS Code style: a schema-driven, searchable list
 * of settings with dot-namespaced ids (editor.fontSize, files.autoSave…),
 * left accent bars on modified settings, and dropdown/stepper/switch controls.
 * Provider management, project actions and About live below the schema list.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePalette, type Palette } from '@/src/constants/theme';
import { ProviderList } from '@/src/components/settings/ProviderList';
import {
  filterSettings,
  SETTING_DEFS,
  SETTING_SECTIONS,
  type SettingDef,
} from '@/src/lib/settings/schema';
import { useProjectStore } from '@/src/store/projectStore';
import { useSettingsStore } from '@/src/store/settingsStore';

export default function SettingsScreen() {
  const palette = usePalette();
  const [query, setQuery] = useState('');
  const [enumPicker, setEnumPicker] = useState<Extract<SettingDef, { kind: 'enum' }> | null>(null);

  // One subscription — re-renders the list when any value changes.
  const values = useSettingsStore();
  const setOption = useSettingsStore((s) => s.setOption);

  const projectName = useProjectStore((s) => s.projectName);
  const closeProject = useProjectStore((s) => s.closeProject);

  const visible = useMemo(() => filterSettings(SETTING_DEFS, query), [query]);
  const searching = query.trim().length > 0;

  const valueFor = (def: SettingDef) =>
    (values as unknown as Record<string, unknown>)[def.key];
  const isModified = (def: SettingDef) => {
    const value = valueFor(def);
    const expected =
      def.kind === 'enum' && def.key === 'tabSize' ? Number(def.defaultValue) : def.defaultValue;
    return value !== expected;
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.bg }]} edges={['top']}>
      <View
        style={[styles.header, { backgroundColor: palette.bgSecondary, borderColor: palette.border }]}
      >
        <Ionicons name="settings-outline" size={18} color={palette.tint} />
        <Text style={[styles.headerTitle, { color: palette.text }]}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* VS Code-style search bar */}
        <View style={[styles.searchBox, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Ionicons name="search" size={15} color={palette.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search settings"
            placeholderTextColor={palette.textSecondary}
            style={[styles.searchInput, { color: palette.text }]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search settings"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={16} color={palette.textSecondary} />
            </Pressable>
          )}
        </View>
        {searching && (
          <Text style={[styles.resultCount, { color: palette.textSecondary }]}>
            {visible.length} {visible.length === 1 ? 'Setting' : 'Settings'} Found
          </Text>
        )}

        {/* Schema-driven sections */}
        {SETTING_SECTIONS.map((section) => {
          const defs = visible.filter((d) => d.section === section.id);
          if (defs.length === 0) return null;
          return (
            <SchemaSection
              key={section.id}
              palette={palette}
              label={section.label}
              defs={defs}
              valueFor={valueFor}
              isModified={isModified}
              onChange={setOption}
              onEnumPress={setEnumPicker}
            />
          );
        })}

        {searching && visible.length === 0 && (
          <View style={styles.noResults}>
            <Ionicons name="search-outline" size={28} color={palette.textSecondary} />
            <Text style={[styles.noResultsText, { color: palette.textSecondary }]}>
              No settings match “{query.trim()}”.
            </Text>
          </View>
        )}

        {/* AI providers — not schema-driven (needs keychain interactions) */}
        {!searching && (
          <Section palette={palette} title="AI providers">
            <ProviderList palette={palette} />
          </Section>
        )}

        {/* Project */}
        {!searching && projectName && (
          <Section palette={palette} title="Project">
            <Pressable
              onPress={() => void closeProject()}
              style={({ pressed }) => [
                styles.dangerButton,
                { borderColor: palette.danger },
                pressed && { backgroundColor: palette.surfacePressed },
              ]}
              accessibilityRole="button"
            >
              <Ionicons name="close-circle-outline" size={16} color={palette.danger} />
              <Text style={[styles.dangerButtonText, { color: palette.danger }]}>
                Close “{projectName}”
              </Text>
            </Pressable>
          </Section>
        )}

        {/* About */}
        {!searching && (
          <Section palette={palette} title="About">
            <Text style={[styles.aboutText, { color: palette.textSecondary }]}>
              Mayank IDE — editor + Forge agent + providers.{'\n'}
              Settings are stored on-device; API keys live in your OS keychain.
            </Text>
          </Section>
        )}
      </ScrollView>

      {/* Enum dropdown (VS Code-style select) */}
      <EnumPickerModal
        palette={palette}
        def={enumPicker}
        value={enumPicker ? String(valueFor(enumPicker)) : ''}
        onSelect={(v) => {
          if (enumPicker) setOption(enumPicker.key, v);
          setEnumPicker(null);
        }}
        onClose={() => setEnumPicker(null)}
      />
    </SafeAreaView>
  );
}

/* ─── Schema section ─────────────────────────────────────────── */

function SchemaSection({
  palette,
  label,
  defs,
  valueFor,
  isModified,
  onChange,
  onEnumPress,
}: {
  palette: Palette;
  label: string;
  defs: SettingDef[];
  valueFor: (def: SettingDef) => unknown;
  isModified: (def: SettingDef) => boolean;
  onChange: (key: string, value: boolean | string | number) => void;
  onEnumPress: (def: Extract<SettingDef, { kind: 'enum' }>) => void;
}) {
  return (
    <View style={[styles.section, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>{label.toUpperCase()}</Text>
      {defs.map((def, i) => (
        <SettingRow
          key={def.id}
          palette={palette}
          def={def}
          value={valueFor(def)}
          modified={isModified(def)}
          last={i === defs.length - 1}
          onChange={onChange}
          onEnumPress={onEnumPress}
        />
      ))}
    </View>
  );
}

/* ─── Setting row + controls ─────────────────────────────────── */

function SettingRow({
  palette,
  def,
  value,
  modified,
  last,
  onChange,
  onEnumPress,
}: {
  palette: Palette;
  def: SettingDef;
  value: unknown;
  modified: boolean;
  last: boolean;
  onChange: (key: string, value: boolean | string | number) => void;
  onEnumPress: (def: Extract<SettingDef, { kind: 'enum' }>) => void;
}) {
  return (
    <View style={[styles.rowWrap, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.border }]}>
      {/* VS Code "modified" accent bar */}
      <View
        style={[
          styles.modifiedBar,
          { backgroundColor: modified ? palette.tint : 'transparent' },
        ]}
      />
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={[styles.rowLabel, { color: palette.text }]}>{def.title}</Text>
          <Text style={[styles.rowHint, { color: palette.textSecondary }]}>{def.description}</Text>
          <Text style={[styles.settingId, { color: palette.textSecondary }]}>{def.id}</Text>
        </View>

        {def.kind === 'boolean' && (
          <Switch
            value={Boolean(value)}
            onValueChange={(v) => onChange(def.key, v)}
            trackColor={{ false: palette.surfacePressed, true: palette.tint }}
            accessibilityLabel={def.title}
          />
        )}

        {def.kind === 'number' && (
          <View style={styles.stepper}>
            <StepperButton
              palette={palette}
              icon="remove"
              label={`Decrease ${def.title}`}
              onPress={() => onChange(def.key, Number(value) - def.step)}
              disabled={Number(value) <= def.min}
            />
            <Text style={[styles.stepperValue, { color: palette.text }]}>
              {Number(value)}
              {def.unit ? ` ${def.unit}` : ''}
            </Text>
            <StepperButton
              palette={palette}
              icon="add"
              label={`Increase ${def.title}`}
              onPress={() => onChange(def.key, Number(value) + def.step)}
              disabled={Number(value) >= def.max}
            />
          </View>
        )}

        {def.kind === 'enum' && (
          <Pressable
            onPress={() => onEnumPress(def)}
            style={({ pressed }) => [
              styles.select,
              { backgroundColor: palette.bgSecondary, borderColor: palette.border },
              pressed && { backgroundColor: palette.surfacePressed },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${def.title}, current value ${def.choices.find((c) => currentEnumValue(def, value) === c.value)?.label ?? String(value)}`}
          >
            <Text style={[styles.selectText, { color: palette.text }]}>
              {def.choices.find((c) => c.value === currentEnumValue(def, value))?.label ??
                String(value)}
            </Text>
            <Ionicons name="chevron-down" size={14} color={palette.textSecondary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** tabSize is stored as a number but declared enum with string values. */
function currentEnumValue(def: Extract<SettingDef, { kind: 'enum' }>, value: unknown): string {
  return def.key === 'tabSize' ? String(value) : String(value ?? def.defaultValue);
}

function StepperButton({
  palette,
  icon,
  label,
  onPress,
  disabled,
}: {
  palette: Palette;
  icon: 'add' | 'remove';
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.stepperButton,
        { borderColor: palette.border, opacity: disabled ? 0.35 : 1 },
        pressed && { backgroundColor: palette.surfacePressed },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={16} color={palette.text} />
    </Pressable>
  );
}

/* ─── Enum picker modal ──────────────────────────────────────── */

function EnumPickerModal({
  palette,
  def,
  value,
  onSelect,
  onClose,
}: {
  palette: Palette;
  def: Extract<SettingDef, { kind: 'enum' }> | null;
  value: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={def != null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable
          style={[styles.modalCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          {def && (
            <>
              <Text style={[styles.modalTitle, { color: palette.text }]}>{def.title}</Text>
              <Text style={[styles.settingId, { color: palette.textSecondary }]}>{def.id}</Text>
              <View style={{ height: 10 }} />
              {def.choices.map((choice) => {
                const current = choice.value === value;
                return (
                  <Pressable
                    key={choice.value}
                    onPress={() => onSelect(choice.value)}
                    style={({ pressed }) => [
                      styles.modalChoice,
                      pressed && { backgroundColor: palette.surfacePressed },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: current }}
                  >
                    <Text
                      style={[
                        styles.modalChoiceText,
                        { color: current ? palette.tint : palette.text },
                        current && { fontWeight: '700' },
                      ]}
                    >
                      {choice.label}
                    </Text>
                    {current && <Ionicons name="checkmark" size={16} color={palette.tint} />}
                  </Pressable>
                );
              })}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ─── Generic section card (providers / project / about) ─────── */

function Section({
  palette,
  title,
  children,
}: {
  palette: Palette;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  searchInput: { flex: 1, fontSize: 14.5, paddingVertical: 8 },
  resultCount: { fontSize: 12, fontWeight: '600', marginLeft: 4, marginTop: -4 },
  section: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 2 },
  rowWrap: { position: 'relative', paddingBottom: 4 },
  modifiedBar: {
    position: 'absolute',
    left: -14,
    top: 4,
    bottom: 8,
    width: 2.5,
    borderRadius: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
  },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 14.5, fontWeight: '600' },
  rowHint: { fontSize: 12.5, lineHeight: 17 },
  settingId: { fontSize: 11, fontFamily: 'monospace' as never, marginTop: 1, opacity: 0.75 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepperButton: {
    borderWidth: 1,
    borderRadius: 8,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: { fontSize: 14, fontWeight: '600', minWidth: 34, textAlign: 'center' },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    maxWidth: 150,
  },
  selectText: { fontSize: 13, fontWeight: '600' },
  noResults: { alignItems: 'center', gap: 8, paddingVertical: 28 },
  noResultsText: { fontSize: 13.5 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 32,
  },
  modalCard: { borderWidth: 1, borderRadius: 14, padding: 16 },
  modalTitle: { fontSize: 16, fontWeight: '700' },
  modalChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  modalChoiceText: { fontSize: 14.5, fontWeight: '500' },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  dangerButtonText: { fontSize: 13.5, fontWeight: '600' },
  aboutText: { fontSize: 12.5, lineHeight: 19 },
});
