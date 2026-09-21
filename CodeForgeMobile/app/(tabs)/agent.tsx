/**
 * Agent tab — Phase 3 will build the Forge chat here.
 * For now: an honest placeholder that documents what is coming and how the
 * security model will work (BYO keys, keychain storage, tool approvals).
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePalette } from '@/src/constants/theme';

const ROADMAP: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: 'chatbubbles-outline',
    title: 'Streaming chat',
    body: 'Token-by-token responses from your chosen model, with markdown rendering.',
  },
  {
    icon: 'construct-outline',
    title: 'File tools with approvals',
    body: 'Forge reads files and proposes edits. Every change shows a diff — nothing applies without your tap.',
  },
  {
    icon: 'key-outline',
    title: 'Bring your own keys',
    body: 'OpenAI, Anthropic, Google, Groq, or any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM). Keys live in the OS keychain and only ever leave the device to the provider you configured.',
  },
];

export default function AgentScreen() {
  const palette = usePalette();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.bg }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: palette.bgSecondary, borderColor: palette.border }]}>
        <Ionicons name="sparkles" size={18} color={palette.tint} />
        <Text style={[styles.headerTitle, { color: palette.text }]}>Forge Agent</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.badge, { borderColor: palette.tint }]}>
          <Text style={[styles.badgeText, { color: palette.tint }]}>Coming in Phase 3</Text>
        </View>
        <Text style={[styles.title, { color: palette.text }]}>
          Your AI pair programmer, in your pocket.
        </Text>
        <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
          The agent will see the file you have open, your selection, and the project tree — then
          help you explain, fix, refactor, and write code.
        </Text>

        {ROADMAP.map((item) => (
          <View
            key={item.title}
            style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
          >
            <View style={styles.cardHeader}>
              <Ionicons name={item.icon} size={18} color={palette.tint} />
              <Text style={[styles.cardTitle, { color: palette.text }]}>{item.title}</Text>
            </View>
            <Text style={[styles.cardBody, { color: palette.textSecondary }]}>{item.body}</Text>
          </View>
        ))}

        <Text style={[styles.footnote, { color: palette.textSecondary }]}>
          Provider setup arrives in Phase 4 (Settings → Providers). Until then, the editor is fully
          functional offline.
        </Text>
      </ScrollView>

      {/* Disabled composer preview */}
      <View style={[styles.composer, { backgroundColor: palette.bgSecondary, borderColor: palette.border }]}>
        <View style={[styles.composerInput, { backgroundColor: palette.inputBg, borderColor: palette.border }]}>
          <Text style={[styles.composerPlaceholder, { color: palette.textSecondary }]}>
            Ask Forge about your code…
          </Text>
        </View>
        <View style={[styles.sendButton, { backgroundColor: palette.surfacePressed }]}>
          <Ionicons name="arrow-up" size={18} color={palette.textSecondary} />
        </View>
      </View>
    </SafeAreaView>
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
  content: { padding: 20, gap: 12, paddingBottom: 32 },
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  subtitle: { fontSize: 13.5, lineHeight: 20, marginBottom: 8 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 6 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  cardBody: { fontSize: 13, lineHeight: 19 },
  footnote: { fontSize: 12, lineHeight: 18, marginTop: 6, textAlign: 'center' },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  composerInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  composerPlaceholder: { fontSize: 14 },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
