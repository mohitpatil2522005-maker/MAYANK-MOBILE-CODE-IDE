/**
 * Horizontal tab strip of open files (above the editor).
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Palette } from '@/src/constants/theme';

export interface EditorTabItem {
  uri: string;
  name: string;
  dirty: boolean;
}

interface EditorTabsProps {
  tabs: EditorTabItem[];
  activeUri: string | null;
  palette: Palette;
  onSelect: (uri: string) => void;
  onClose: (uri: string) => void;
}

export function EditorTabs({ tabs, activeUri, palette, onSelect, onClose }: EditorTabsProps) {
  if (tabs.length === 0) return null;
  return (
    <View style={[styles.strip, { backgroundColor: palette.bgSecondary, borderColor: palette.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {tabs.map((tab) => {
          const active = tab.uri === activeUri;
          return (
            <Pressable
              key={tab.uri}
              onPress={() => onSelect(tab.uri)}
              style={[
                styles.tab,
                { borderColor: palette.border },
                active
                  ? { backgroundColor: palette.editorBg, borderTopColor: palette.tint, borderTopWidth: 2 }
                  : { backgroundColor: palette.bgSecondary, borderTopWidth: 2, borderTopColor: 'transparent' },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              {tab.dirty && <View style={[styles.dot, { backgroundColor: palette.warning }]} />}
              <Text
                numberOfLines={1}
                style={[styles.name, { color: active ? palette.text : palette.textSecondary }]}
              >
                {tab.name}
              </Text>
              <Pressable
                onPress={() => onClose(tab.uri)}
                hitSlop={8}
                style={styles.close}
                accessibilityRole="button"
                accessibilityLabel={`Close ${tab.name}`}
              >
                <Ionicons name="close" size={14} color={palette.textSecondary} />
              </Pressable>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { borderBottomWidth: StyleSheet.hairlineWidth },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 8,
    paddingLeft: 12,
    paddingRight: 6,
    borderRightWidth: StyleSheet.hairlineWidth,
    maxWidth: 200,
  },
  dot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  name: { fontSize: 12.5, flexShrink: 1 },
  close: { marginLeft: 6, padding: 2 },
});
