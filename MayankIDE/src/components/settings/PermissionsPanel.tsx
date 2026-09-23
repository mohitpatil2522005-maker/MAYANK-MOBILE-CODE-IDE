/**
 * Agent Permissions panel (Slice 3, §9.3b of the masterprompt).
 *
 * Shows the active rule list (with add/remove) and the recent audit log.
 * The audit log never contains file contents or secrets (§9.3b).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Palette } from '@/src/constants/theme';
import {
  DEFAULT_PERMISSION_RULES,
  usePermissionStore,
  type PermAction,
  type PermissionRule,
} from '@/src/store/permissionStore';

const ACTIONS: PermAction[] = [
  'read_file',
  'write_file',
  'delete_file',
  'command',
  'read_url',
];

const DECISIONS: Array<PermissionRule['decision']> = ['allow', 'ask', 'deny'];

export function PermissionsPanel({ palette }: { palette: Palette }) {
  const rules = usePermissionStore((s) => s.rules);
  const audit = usePermissionStore((s) => s.audit);
  const addRule = usePermissionStore((s) => s.addRule);
  const removeRule = usePermissionStore((s) => s.removeRule);
  const clearAudit = usePermissionStore((s) => s.clearAudit);

  const [action, setAction] = useState<PermAction>('write_file');
  const [target, setTarget] = useState('*');
  const [decision, setDecision] = useState<PermissionRule['decision']>('ask');

  const effectiveRules: PermissionRule[] =
    rules.length > 0 ? rules : DEFAULT_PERMISSION_RULES;

  const add = () => {
    addRule({ action, target: target.trim() || '*', decision, scope: 'project' });
    setTarget('*');
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: palette.text }]}>Agent Permissions</Text>
        <Pressable
          onPress={clearAudit}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Clear audit log"
        >
          <Text style={[styles.clear, { color: palette.textSecondary }]}>Clear log</Text>
        </Pressable>
      </View>
      <Text style={[styles.sub, { color: palette.textSecondary }]}>
        Rules decide allow / ask / deny for each agent tool. Precedence: deny → ask → allow.
        Unconfigured actions default to ask.
      </Text>

      {/* Add-rule builder */}
      <View style={[styles.builder, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <View style={styles.builderRow}>
          <SelectChip
            palette={palette}
            value={action}
            options={ACTIONS.map((a) => ({ value: a, label: a }))}
            onChange={(v) => setAction(v as PermAction)}
          />
          <TextInput
            value={target}
            onChangeText={setTarget}
            placeholder="target (path / command / *)"
            placeholderTextColor={palette.textSecondary}
            style={[styles.targetInput, { color: palette.text, borderColor: palette.border }]}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Rule target"
          />
        </View>
        <View style={styles.builderRow}>
          <SelectChip
            palette={palette}
            value={decision}
            options={DECISIONS.map((d) => ({ value: d, label: d }))}
            onChange={(d) => setDecision(d as PermissionRule['decision'])}
          />
          <Pressable
            onPress={add}
            style={({ pressed }) => [
              styles.addBtn,
              { backgroundColor: palette.tint },
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Add permission rule"
          >
            <Ionicons name="add" size={16} color={palette.onTint} />
            <Text style={[styles.addBtnText, { color: palette.onTint }]}>Add rule</Text>
          </Pressable>
        </View>
      </View>

      {/* Active rules */}
      <Text style={[styles.sectionLabel, { color: palette.textSecondary }]}>
        Active rules ({effectiveRules.length})
      </Text>
      <View style={styles.ruleList}>
        {effectiveRules.map((r, i) => (
          <View
            key={`${r.action}-${r.target}-${i}`}
            style={[styles.ruleRow, { borderColor: palette.border, backgroundColor: palette.bg }]}
          >
            <View style={styles.ruleChipRow}>
              <Chip text={r.decision} color={decisionColor(r.decision, palette)} />
              <Text style={[styles.ruleAction, { color: palette.text }]} numberOfLines={1}>
                {r.action}
              </Text>
              <Text style={[styles.ruleTarget, { color: palette.textSecondary }]} numberOfLines={1}>
                {r.target}
              </Text>
            </View>
            {rules.length > 0 && (
              <Pressable
                onPress={() => removeRule(i)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Remove rule"
              >
                <Ionicons name="close-circle-outline" size={16} color={palette.danger} />
              </Pressable>
            )}
          </View>
        ))}
        {effectiveRules.length === 0 && (
          <Text style={{ color: palette.textSecondary, fontSize: 12 }}>No rules yet.</Text>
        )}
      </View>

      {/* Audit log */}
      <View style={styles.auditHeader}>
        <Text style={[styles.sectionLabel, { color: palette.textSecondary }]}>
          Audit log ({audit.length})
        </Text>
      </View>
      <ScrollView
        style={styles.auditScroll}
        contentContainerStyle={styles.auditInner}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        {audit.length === 0 ? (
          <Text style={{ color: palette.textSecondary, fontSize: 12 }}>
            No decisions recorded yet. Approve or reject an agent edit to see an entry.
          </Text>
        ) : (
          [...audit].reverse().map((a) => (
            <View
              key={a.id}
              style={[styles.auditRow, { borderColor: palette.border, backgroundColor: palette.bg }]}
            >
              <Chip text={a.decision} color={decisionColor(a.decision, palette)} />
              <Text style={[styles.auditMain, { color: palette.text }]} numberOfLines={1}>
                {a.action} {a.target}
              </Text>
              <Text style={[styles.auditMeta, { color: palette.textSecondary }]} numberOfLines={1}>
                {new Date(a.ts).toLocaleTimeString()} · {a.ruleMatched}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function decisionColor(d: string, palette: Palette): string {
  if (d === 'allow') return palette.success;
  if (d === 'deny') return palette.danger;
  return palette.warning;
}

function Chip({ text, color }: { text: string; color: string }) {
  return (
    <View style={[chipStyles.box, { borderColor: color }]}>
      <Text style={[chipStyles.text, { color }]}>{text}</Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  text: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase' },
});

function SelectChip({
  palette,
  value,
  options,
  onChange,
}: {
  palette: Palette;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => [
              styles.chip,
              {
                borderColor: active ? palette.tint : palette.border,
                backgroundColor: active ? palette.tint + '2a' : 'transparent',
              },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={o.label}
          >
            <Text style={[styles.chipText, { color: active ? palette.tint : palette.textSecondary }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 8 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 15, fontWeight: '700' },
  clear: { fontSize: 11 },
  sub: { fontSize: 11.5, lineHeight: 16 },
  builder: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  builderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  targetInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  addBtnText: { fontSize: 12, fontWeight: '700' },
  sectionLabel: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  ruleList: { gap: 6 },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  ruleChipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  ruleAction: { fontSize: 12, fontWeight: '600', maxWidth: 110 },
  ruleTarget: { fontSize: 11, flexShrink: 1, fontFamily: 'monospace' as never },
  auditHeader: { marginTop: 6 },
  auditScroll: { maxHeight: 240 },
  auditInner: { gap: 6 },
  auditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  auditMain: { fontSize: 12, flex: 1, fontFamily: 'monospace' as never },
  auditMeta: { fontSize: 10.5, maxWidth: 150 },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontSize: 11, fontWeight: '600' },
});
