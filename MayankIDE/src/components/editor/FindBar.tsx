/**
 * In-editor Find & Replace bar — VS Code style.
 * Toggleable from the command palette ("Find in file", Cmd/Ctrl+F).
 *
 * - "find" is delegated to the editor surface (WebView postMessage or web
 *   CodeMirror commands). The bar itself just drives the inputs.
 * - "replace" goes through a dry-run summary sheet (per §4.2 of the
 *   masterprompt: replace-all guarded by a diff-summary confirmation).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Palette } from '@/src/constants/theme';
import { tapLight } from '@/src/lib/haptics';
import { findAll, type FindOptions } from '@/src/lib/editor/find';

export interface FindBarProps {
  palette: Palette;
  visible: boolean;
  /** Active file's text — used for the in-bar result counter. */
  document: string;
  onClose: () => void;
  /** Forwarded to the editor: query text + options. */
  onQuery: (query: string, options: FindOptions) => void;
  onNext: () => void;
  onPrev: () => void;
  onReplace: (replacement: string) => void;
  onReplaceAll: (replacement: string) => void;
}

export function FindBar({
  palette,
  visible,
  document,
  onClose,
  onQuery,
  onNext,
  onPrev,
  onReplace,
  onReplaceAll,
}: FindBarProps) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [options, setOptions] = useState<FindOptions>({
    regex: false,
    caseSensitive: false,
    wholeWord: false,
  });
  const [matchIndex, setMatchIndex] = useState(-1);
  const [showReplace, setShowReplace] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const replaceRef = useRef<TextInput>(null);

  // Auto-focus the query input when the bar opens; auto-clear when it closes.
  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
    setQuery('');
    setReplacement('');
    setMatchIndex(-1);
    onQuery('', options);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Recompute the match count for the in-bar counter (the editor still drives
  // the actual selection — this is just a label).
  useEffect(() => {
    const { matches, error } = findAll(document, query, options);
    if (error) {
      setMatchIndex(-1);
      return;
    }
    setMatchIndex(matches.length === 0 ? -1 : Math.min(matchIndex < 0 ? 0 : matchIndex, matches.length - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, options.regex, options.caseSensitive, options.wholeWord, document]);

  if (!visible) return null;

  const toggleOption = (key: keyof FindOptions) => {
    const next = { ...options, [key]: !options[key] };
    setOptions(next);
    onQuery(query, next);
  };

  const onChangeQuery = (next: string) => {
    setQuery(next);
    onQuery(next, options);
  };

  const totalMatches = findAll(document, query, options).matches.filter((m) => m.from !== -1).length;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: palette.bgSecondary, borderBottomColor: palette.border },
      ]}
      accessibilityLabel="Find and replace"
    >
      <View style={styles.row}>
        <Ionicons name="search" size={14} color={palette.textSecondary} />
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={onChangeQuery}
          placeholder="Find"
          placeholderTextColor={palette.textSecondary}
          style={[styles.input, { color: palette.text }]}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Find query"
        />
        <Text style={[styles.counter, { color: palette.textSecondary }]}>
          {totalMatches === 0 ? '0' : `${matchIndex + 1}/${totalMatches}`}
        </Text>
        <Pressable
          onPress={() => {
            tapLight();
            onPrev();
            setMatchIndex((i) => (i <= 0 ? totalMatches - 1 : i - 1));
          }}
          disabled={totalMatches === 0}
          style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: palette.surfacePressed }]}
          accessibilityLabel="Previous match"
        >
          <Ionicons
            name="chevron-up"
            size={16}
            color={totalMatches === 0 ? palette.textSecondary : palette.text}
          />
        </Pressable>
        <Pressable
          onPress={() => {
            tapLight();
            onNext();
            setMatchIndex((i) => (i + 1) % Math.max(totalMatches, 1));
          }}
          disabled={totalMatches === 0}
          style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: palette.surfacePressed }]}
          accessibilityLabel="Next match"
        >
          <Ionicons
            name="chevron-down"
            size={16}
            color={totalMatches === 0 ? palette.textSecondary : palette.text}
          />
        </Pressable>
        <Toggle palette={palette} label="Aa" active={options.caseSensitive} onPress={() => toggleOption('caseSensitive')} accessibilityLabel="Case sensitive" />
        <Toggle palette={palette} label="ab" active={options.wholeWord} onPress={() => toggleOption('wholeWord')} accessibilityLabel="Whole word" />
        <Toggle palette={palette} label=".*" active={options.regex} onPress={() => toggleOption('regex')} accessibilityLabel="Regular expression" />
        <Pressable
          onPress={() => {
            tapLight();
            setShowReplace((s) => !s);
            if (!showReplace) setTimeout(() => replaceRef.current?.focus(), 60);
          }}
          style={({ pressed }) => [
            styles.iconBtn,
            pressed && { backgroundColor: palette.surfacePressed },
            showReplace && { backgroundColor: palette.tint + '2a' },
          ]}
          accessibilityLabel="Toggle replace"
        >
          <Ionicons name="swap-vertical" size={16} color={palette.text} />
        </Pressable>
        <Pressable
          onPress={() => {
            tapLight();
            onClose();
          }}
          style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: palette.surfacePressed }]}
          accessibilityLabel="Close find bar"
        >
          <Ionicons name="close" size={16} color={palette.text} />
        </Pressable>
      </View>

      {showReplace && (
        <View style={styles.row}>
          <Ionicons name="swap-vertical" size={14} color={palette.textSecondary} />
          <TextInput
            ref={replaceRef}
            value={replacement}
            onChangeText={setReplacement}
            placeholder="Replace with"
            placeholderTextColor={palette.textSecondary}
            style={[styles.input, { color: palette.text }]}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Replacement text"
          />
          <Pressable
            onPress={() => {
              tapLight();
              onReplace(replacement);
            }}
            disabled={totalMatches === 0}
            style={({ pressed }) => [
              styles.smallBtn,
              { borderColor: palette.border, backgroundColor: palette.bg },
              pressed && { backgroundColor: palette.surfacePressed },
            ]}
            accessibilityLabel="Replace current match"
          >
            <Text style={[styles.smallBtnText, { color: palette.text }]}>Replace</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              tapLight();
              onReplaceAll(replacement);
            }}
            disabled={totalMatches === 0}
            style={({ pressed }) => [
              styles.smallBtn,
              { borderColor: palette.border, backgroundColor: palette.bg },
              pressed && { backgroundColor: palette.surfacePressed },
            ]}
            accessibilityLabel="Replace all matches"
          >
            <Text style={[styles.smallBtnText, { color: palette.text }]}>All</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function Toggle({
  palette,
  label,
  active,
  onPress,
  accessibilityLabel,
}: {
  palette: Palette;
  label: string;
  active: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={() => {
        tapLight();
        onPress();
      }}
      style={({ pressed }) => [
        styles.toggle,
        {
          borderColor: active ? palette.tint : palette.border,
          backgroundColor: active ? palette.tint + '2a' : 'transparent',
        },
        pressed && { backgroundColor: palette.surfacePressed },
      ]}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={[styles.toggleText, { color: active ? palette.tint : palette.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: {
    flex: 1,
    fontSize: 13,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  counter: { fontSize: 11, minWidth: 36, textAlign: 'right' },
  iconBtn: { padding: 5, borderRadius: 6 },
  toggle: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  toggleText: { fontSize: 11, fontWeight: '600' },
  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  smallBtnText: { fontSize: 11.5, fontWeight: '600' },
});
