/**
 * Settings tab — editor preferences (theme, font size, vim, auto-save),
 * project actions, and the placeholder for Phase 4 provider management.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePalette, type Palette } from '@/src/constants/theme';
import { ProviderList } from '@/src/components/settings/ProviderList';
import { useProjectStore } from '@/src/store/projectStore';
import { useSettingsStore, type ThemeMode } from '@/src/store/settingsStore';

export default function SettingsScreen() {
  const palette = usePalette();

  const themeMode = useSettingsStore((s) => s.themeMode);
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);
  const vimEnabled = useSettingsStore((s) => s.vimEnabled);
  const autoSave = useSettingsStore((s) => s.autoSave);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
  const setEditorFontSize = useSettingsStore((s) => s.setEditorFontSize);
  const setVimEnabled = useSettingsStore((s) => s.setVimEnabled);
  const setAutoSave = useSettingsStore((s) => s.setAutoSave);

  const projectName = useProjectStore((s) => s.projectName);
  const closeProject = useProjectStore((s) => s.closeProject);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.bg }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: palette.bgSecondary, borderColor: palette.border }]}>
        <Ionicons name="settings-outline" size={18} color={palette.tint} />
        <Text style={[styles.headerTitle, { color: palette.text }]}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Appearance */}
        <Section palette={palette} title="Appearance">
          <Text style={[styles.rowLabel, { color: palette.text }]}>Theme</Text>
          <View style={styles.segmented}>
            {(['system', 'light', 'dark'] as ThemeMode[]).map((mode) => {
              const selected = themeMode === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => setThemeMode(mode)}
                  style={[
                    styles.segment,
                    { borderColor: palette.border },
                    selected && { backgroundColor: palette.tint, borderColor: palette.tint },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      { color: selected ? palette.onTint : palette.textSecondary },
                    ]}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        {/* Editor */}
        <Section palette={palette} title="Editor">
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: palette.text }]}>Font size</Text>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => setEditorFontSize(editorFontSize - 1)}
                style={({ pressed }) => [
                  styles.stepperButton,
                  { borderColor: palette.border },
                  pressed && { backgroundColor: palette.surfacePressed },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Decrease font size"
              >
                <Ionicons name="remove" size={16} color={palette.text} />
              </Pressable>
              <Text style={[styles.stepperValue, { color: palette.text }]}>{editorFontSize}</Text>
              <Pressable
                onPress={() => setEditorFontSize(editorFontSize + 1)}
                style={({ pressed }) => [
                  styles.stepperButton,
                  { borderColor: palette.border },
                  pressed && { backgroundColor: palette.surfacePressed },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Increase font size"
              >
                <Ionicons name="add" size={16} color={palette.text} />
              </Pressable>
            </View>
          </View>

          <SettingSwitch
            palette={palette}
            label="Vim keybindings"
            hint="Modal editing inside the CodeMirror surface."
            value={vimEnabled}
            onValueChange={setVimEnabled}
          />
          <SettingSwitch
            palette={palette}
            label="Auto-save"
            hint="Save ~1s after you stop typing. Ctrl/Cmd+S always saves."
            value={autoSave}
            onValueChange={setAutoSave}
          />
        </Section>

        {/* AI providers (Phase 4) */}
        <Section palette={palette} title="AI providers">
          <ProviderList palette={palette} />
        </Section>

        {/* Project */}
        {projectName && (
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
        <Section palette={palette} title="About">
          <Text style={[styles.aboutText, { color: palette.textSecondary }]}>
            CodeForge Mobile v0.3.0 — editor + Forge agent + providers.{'\n'}
            See PRD.md / agent.md / master_prompt.md in the repo for the full plan.
          </Text>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

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
      <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function SettingSwitch({
  palette,
  label,
  hint,
  value,
  onValueChange,
}: {
  palette: Palette;
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: palette.text }]}>{label}</Text>
        {hint && <Text style={[styles.rowHint, { color: palette.textSecondary }]}>{hint}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: palette.surfacePressed, true: palette.tint }}
      />
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
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  section: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 14.5, fontWeight: '500' },
  rowHint: { fontSize: 12, lineHeight: 16 },
  segmented: { flexDirection: 'row', gap: 8 },
  segment: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  segmentText: { fontSize: 13.5, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepperButton: {
    borderWidth: 1,
    borderRadius: 8,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: { fontSize: 15, fontWeight: '600', minWidth: 24, textAlign: 'center' },
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
