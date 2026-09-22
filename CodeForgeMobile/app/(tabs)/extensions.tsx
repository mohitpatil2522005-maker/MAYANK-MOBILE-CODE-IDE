/**
 * Extensions tab (Phase 2) — a marketplace-style browser for bundled
 * extensions. v1 ships VS Code theme extensions that recolor the editor
 * (both native WebView and web builds) via the shared theme engine.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePalette, type Palette } from '@/src/constants/theme';
import { BUNDLED_THEMES, type ThemeExtension } from '@/src/lib/extensions/themes';
import { tapLight, notifySuccess } from '@/src/lib/haptics';
import { useExtensionStore } from '@/src/store/extensionStore';

export default function ExtensionsScreen() {
  const palette = usePalette();
  const [query, setQuery] = useState('');

  const activeThemeId = useExtensionStore((s) => s.activeThemeId);
  const installedIds = useExtensionStore((s) => s.installedIds);
  const installExtension = useExtensionStore((s) => s.installExtension);
  const uninstallExtension = useExtensionStore((s) => s.uninstallExtension);
  const setActiveTheme = useExtensionStore((s) => s.setActiveTheme);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return BUNDLED_THEMES;
    return BUNDLED_THEMES.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.publisher.toLowerCase().includes(q),
    );
  }, [query]);

  const installed = filtered.filter((t) => installedIds.includes(t.id));
  const discover = filtered.filter((t) => !installedIds.includes(t.id));
  const defaultActive = activeThemeId === null;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.bg }]} edges={['top']}>
      <View
        style={[styles.header, { backgroundColor: palette.bgSecondary, borderColor: palette.border }]}
      >
        <Ionicons name="extension-puzzle-outline" size={18} color={palette.tint} />
        <Text style={[styles.headerTitle, { color: palette.text }]}>Extensions</Text>
        <View style={styles.headerSpacer} />
        <Text style={[styles.headerMeta, { color: palette.textSecondary }]}>
          {installedIds.length} installed
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.searchBox, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Ionicons name="search" size={15} color={palette.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search extensions"
            placeholderTextColor={palette.textSecondary}
            style={[styles.searchInput, { color: palette.text }]}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search extensions"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={16} color={palette.textSecondary} />
            </Pressable>
          )}
        </View>

        {/* Built-in default pseudo-extension */}
        <Text style={[styles.groupLabel, { color: palette.textSecondary }]}>INSTALLED</Text>
        <DefaultThemeCard
          palette={palette}
          active={defaultActive}
          onEnable={() => {
            tapLight();
            setActiveTheme(null);
          }}
        />
        {installed.map((ext) => (
          <ThemeCard
            key={ext.id}
            palette={palette}
            ext={ext}
            installed
            active={activeThemeId === ext.id}
            onInstall={() => undefined}
            onUninstall={() => {
              tapLight();
              uninstallExtension(ext.id);
            }}
            onEnable={() => {
              notifySuccess();
              setActiveTheme(ext.id);
            }}
          />
        ))}
        {installed.length === 0 && !query && (
          <Text style={[styles.emptyGroup, { color: palette.textSecondary }]}>
            Theme extensions you install appear here.
          </Text>
        )}

        {discover.length > 0 && (
          <>
            <Text style={[styles.groupLabel, { color: palette.textSecondary }]}>
              FEATURED · THEMES
            </Text>
            {discover.map((ext) => (
              <ThemeCard
                key={ext.id}
                palette={palette}
                ext={ext}
                installed={false}
                active={false}
                onInstall={() => {
                  tapLight();
                  installExtension(ext.id);
                }}
                onUninstall={() => undefined}
                onEnable={() => {
                  notifySuccess();
                  setActiveTheme(ext.id);
                }}
              />
            ))}
          </>
        )}

        <Text style={[styles.footerNote, { color: palette.textSecondary }]}>
          Theme extensions recolor the editor surface on every platform. Language packs,
          snippets and MCP tools land in later milestones — see PRD.md.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function DefaultThemeCard({
  palette,
  active,
  onEnable,
}: {
  palette: Palette;
  active: boolean;
  onEnable: () => void;
}) {
  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <View style={styles.cardTop}>
        <View style={[styles.icon, { backgroundColor: palette.bgSecondary }]}>
          <Ionicons name="color-palette-outline" size={20} color={palette.tint} />
        </View>
        <View style={styles.cardMain}>
          <View style={styles.nameLine}>
            <Text style={[styles.name, { color: palette.text }]}>Editor Default</Text>
            <Badge palette={palette} label="core" tone="neutral" />
          </View>
          <Text style={[styles.desc, { color: palette.textSecondary }]}>
            One Dark when the app is dark, a light legacy theme otherwise. Always available.
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <EnableButton palette={palette} active={active} onEnable={onEnable} label="Enabled" />
      </View>
    </View>
  );
}

function ThemeCard({
  palette,
  ext,
  installed,
  active,
  onInstall,
  onUninstall,
  onEnable,
}: {
  palette: Palette;
  ext: ThemeExtension;
  installed: boolean;
  active: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onEnable: () => void;
}) {
  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <View style={styles.cardTop}>
        <View
          style={[
            styles.icon,
            { backgroundColor: ext.theme.colors?.['editor.background'] ?? palette.bgSecondary },
          ]}
        >
          <View style={styles.swatchColumn}>
            {ext.swatches.slice(0, 3).map((s) => (
              <View key={s} style={[styles.swatch, { backgroundColor: s }]} />
            ))}
          </View>
        </View>
        <View style={styles.cardMain}>
          <View style={styles.nameLine}>
            <Text style={[styles.name, { color: palette.text }]}>{ext.name}</Text>
            <Badge
              palette={palette}
              label={ext.theme.type === 'light' ? 'light' : 'dark'}
              tone={ext.theme.type === 'light' ? 'light' : 'dark'}
            />
            <Badge palette={palette} label="theme" tone="neutral" />
          </View>
          <Text style={[styles.meta, { color: palette.textSecondary }]}>
            {ext.publisher} · v{ext.version}
          </Text>
          <Text style={[styles.desc, { color: palette.textSecondary }]}>{ext.description}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        {installed ? (
          <>
            <EnableButton palette={palette} active={active} onEnable={onEnable} />
            <Pressable
              onPress={onUninstall}
              style={({ pressed }) => [
                styles.ghostButton,
                { borderColor: palette.border },
                pressed && { backgroundColor: palette.surfacePressed },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.ghostButtonText, { color: palette.textSecondary }]}>
                Uninstall
              </Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={onInstall}
            style={({ pressed }) => [
              styles.installButton,
              { backgroundColor: palette.tint },
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Install ${ext.name}`}
          >
            <Ionicons name="cloud-download-outline" size={14} color={palette.onTint} />
            <Text style={[styles.installButtonText, { color: palette.onTint }]}>Install</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function EnableButton({
  palette,
  active,
  onEnable,
  label,
}: {
  palette: Palette;
  active: boolean;
  onEnable: () => void;
  label?: string;
}) {
  return (
    <Pressable
      onPress={active ? undefined : onEnable}
      disabled={active}
      style={({ pressed }) => [
        styles.installButton,
        active
          ? { backgroundColor: palette.bgSecondary, borderWidth: 1, borderColor: palette.success }
          : { backgroundColor: palette.tint },
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      {active ? (
        <>
          <Ionicons name="checkmark-circle" size={14} color={palette.success} />
          <Text style={[styles.installButtonText, { color: palette.success }]}>
            {label ?? 'Enabled'}
          </Text>
        </>
      ) : (
        <Text style={[styles.installButtonText, { color: palette.onTint }]}>Enable</Text>
      )}
    </Pressable>
  );
}

function Badge({ palette, label, tone }: { palette: Palette; label: string; tone: 'dark' | 'light' | 'neutral' }) {
  const bg =
    tone === 'dark' ? '#1f2430' : tone === 'light' ? '#e8e9ec' : palette.bgSecondary;
  const fg = tone === 'dark' ? '#cdd3e0' : tone === 'light' ? '#454a52' : palette.textSecondary;
  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: palette.border }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
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
  headerSpacer: { flex: 1 },
  headerMeta: { fontSize: 12, fontWeight: '600' },
  content: { padding: 16, gap: 10, paddingBottom: 32 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 6,
  },
  searchInput: { flex: 1, fontSize: 14.5, paddingVertical: 8 },
  groupLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: 6 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  cardTop: { flexDirection: 'row', gap: 12 },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  swatchColumn: { flexDirection: 'row', gap: 3 },
  swatch: { width: 9, height: 26, borderRadius: 3 },
  cardMain: { flex: 1, gap: 2 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 11.5 },
  desc: { fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  badge: { paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 5, borderWidth: StyleSheet.hairlineWidth },
  badgeText: { fontSize: 9.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  actions: { flexDirection: 'row', gap: 8 },
  installButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  installButtonText: { fontSize: 12.5, fontWeight: '700' },
  ghostButton: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  ghostButtonText: { fontSize: 12.5, fontWeight: '600' },
  emptyGroup: { fontSize: 12.5, paddingVertical: 8 },
  footerNote: { fontSize: 11.5, lineHeight: 16, marginTop: 10 },
});
