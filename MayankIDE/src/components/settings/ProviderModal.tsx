/**
 * Add / edit an AI provider (Phase 4). Keys go to the OS keychain (web:
 * session memory) — never to AsyncStorage. Models are fetched from the
 * endpoint (/models) when possible, else entered manually.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { Palette } from '@/src/constants/theme';
import { isInsecureEndpoint, PROVIDER_PRESETS } from '@/src/lib/ai/presets';
import { createProviderClient } from '@/src/lib/ai/providers';
import { useProviderRegistry } from '@/src/lib/ai/registry';
import type { AIProviderConfig, AIModel, ProviderType, CompatibilityMode } from '@/src/lib/ai/types';
import { setApiKey } from '@/src/lib/storage/keychain';
import { useSettingsStore } from '@/src/store/settingsStore';

interface ProviderModalProps {
  visible: boolean;
  palette: Palette;
  /** When set, the modal edits this provider. */
  editProvider?: AIProviderConfig | null;
  onClose: () => void;
}

const TYPE_ORDER: ProviderType[] = ['openai', 'anthropic', 'google', 'groq', 'custom'];

export function ProviderModal({ visible, palette, editProvider, onClose }: ProviderModalProps) {
  const addProvider = useProviderRegistry((s) => s.addProvider);
  const updateProvider = useProviderRegistry((s) => s.updateProvider);

  const [type, setType] = useState<ProviderType>('openai');
  const [name, setName] = useState('');
  const [baseURL, setBaseURL] = useState('');
  const [apiKey, setApiKeyInput] = useState('');
  const [modelsText, setModelsText] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [fetchedModels, setFetchedModels] = useState<AIModel[] | null>(null);
  const [status, setStatus] = useState<{ kind: 'info' | 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [compatibility, setCompatibility] = useState<CompatibilityMode>('openai');

  const preset = PROVIDER_PRESETS[type];
  const isEdit = !!editProvider;

  // (Re)initialize the form when opening.
  useEffect(() => {
    if (!visible) return;
    setStatus(null);
    setFetchedModels(null);
    setApiKeyInput('');
    if (editProvider) {
      setType(editProvider.type);
      setName(editProvider.name);
      setBaseURL(editProvider.baseURL);
      setDefaultModel(editProvider.defaultModel ?? '');
      setModelsText(editProvider.models.map((m) => m.id).join(', '));
      setCompatibility(editProvider.compatibility ?? 'openai');
    } else {
      setType('openai');
      const p = PROVIDER_PRESETS.openai;
      setName(p.label);
      setBaseURL(p.defaultBaseURL);
      setModelsText(p.defaultModels.map((m) => m.id).join(', '));
      setDefaultModel(p.defaultModels[0]?.id ?? '');
      setCompatibility('openai');
    }
  }, [visible, editProvider]);

  const applyPreset = (next: ProviderType) => {
    setType(next);
    const p = PROVIDER_PRESETS[next];
    setStatus(null);
    setFetchedModels(null);
    if (!isEdit) {
      setName(p.label);
      setBaseURL(p.defaultBaseURL);
      setModelsText(p.defaultModels.map((m) => m.id).join(', '));
      setDefaultModel(p.defaultModels[0]?.id ?? '');
    }
  };

  /** Config as currently entered (id/ephemeral fields are placeholders). */
  const draftConfig = useMemo<AIProviderConfig>(
    () => ({
      id: editProvider?.id ?? 'draft',
      name: name.trim() || preset.label,
      type,
      baseURL: baseURL.trim(),
      compatibility: type === 'custom' ? compatibility : undefined,
      models: [],
      createdAt: editProvider?.createdAt ?? Date.now(),
    }),
    [editProvider, name, type, baseURL, preset.label, compatibility],
  );

  const keyForRequest = (): string | null => (apiKey.trim().length > 0 ? apiKey.trim() : null);

  const handleFetchModels = async () => {
    setBusy(true);
    setStatus({ kind: 'info', text: 'Contacting endpoint…' });
    try {
      const client = createProviderClient(draftConfig);
      const models = await client.listModels(keyForRequest());
      if (models.length === 0) {
        setStatus({ kind: 'info', text: 'Endpoint answered but returned no models — enter ids manually.' });
        setFetchedModels(null);
      } else {
        setFetchedModels(models);
        setModelsText(models.map((m) => m.id).join(', '));
        if (!models.some((m) => m.id === defaultModel)) {
          setDefaultModel(models[0].id);
        }
        setStatus({ kind: 'ok', text: `Found ${models.length} models.` });
      }
    } catch (err) {
      setStatus({
        kind: 'error',
        text: `Couldn't fetch models: ${err instanceof Error ? err.message : String(err)}`,
      });
      setFetchedModels(null);
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !baseURL.trim()) {
      setStatus({ kind: 'error', text: 'Name and base URL are required.' });
      return;
    }
    if (preset.requiresKey && !isEdit && apiKey.trim().length === 0) {
      setStatus({ kind: 'error', text: `${preset.label} requires an API key.` });
      return;
    }
    const models: AIModel[] =
      fetchedModels ??
      modelsText
        .split(/[,\n]/)
        .map((id) => id.trim())
        .filter(Boolean)
        .map((id) => ({ id }));
    if (models.length === 0) {
      setStatus({ kind: 'error', text: 'Add at least one model (fetch them or type ids).' });
      return;
    }

    setBusy(true);
    try {
      let providerId: string;
      if (isEdit && editProvider) {
        providerId = editProvider.id;
        updateProvider(providerId, {
          name: name.trim(),
          baseURL: baseURL.trim(),
          compatibility: type === 'custom' ? compatibility : undefined,
          models,
          defaultModel: models.some((m) => m.id === defaultModel) ? defaultModel : models[0].id,
        });
      } else {
        providerId = addProvider({
          name: name.trim(),
          type,
          baseURL: baseURL.trim(),
          compatibility: type === 'custom' ? compatibility : undefined,
          models,
          defaultModel: models.some((m) => m.id === defaultModel) ? defaultModel : models[0].id,
        }).id;
      }
      // Store the key only when one was typed (never overwrite with blank).
      // Biometric gating (PRD 3.2) applies when the user enabled it in
      // Settings → Security.
      if (apiKey.trim().length > 0) {
        await setApiKey(
          providerId,
          apiKey.trim(),
          useSettingsStore.getState().biometricKeyGate,
        );
      }
      setStatus({ kind: 'ok', text: 'Saved.' });
      setTimeout(onClose, 350);
    } catch (err) {
      setStatus({
        kind: 'error',
        text: `Save failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = [
    styles.input,
    { backgroundColor: palette.inputBg, borderColor: palette.border, color: palette.text },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: palette.bg, borderColor: palette.border }]}>
          <View style={[styles.sheetHeader, { borderColor: palette.border }]}>
            <Text style={[styles.sheetTitle, { color: palette.text }]}>
              {isEdit ? `Edit ${editProvider?.name}` : 'Add provider'}
            </Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={palette.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            {/* Type picker (locked in edit mode) */}
            <Text style={[styles.label, { color: palette.textSecondary }]}>TYPE</Text>
            <View style={styles.typeRow}>
              {TYPE_ORDER.map((t) => {
                const selected = t === type;
                return (
                  <Pressable
                    key={t}
                    onPress={() => applyPreset(t)}
                    disabled={isEdit}
                    style={[
                      styles.typeChip,
                      { borderColor: palette.border },
                      selected && { backgroundColor: palette.tint, borderColor: palette.tint },
                      isEdit && !selected && { opacity: 0.4 },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={[
                        styles.typeChipText,
                        { color: selected ? palette.onTint : palette.text },
                      ]}
                    >
                      {PROVIDER_PRESETS[t].label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Name */}
            <Text style={[styles.label, { color: palette.textSecondary }]}>NAME</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="My provider"
              placeholderTextColor={palette.textSecondary}
              style={inputStyle}
              autoCapitalize="words"
            />

            {/* Base URL */}
            <Text style={[styles.label, { color: palette.textSecondary }]}>BASE URL</Text>
            <TextInput
              value={baseURL}
              onChangeText={setBaseURL}
              placeholder={preset.defaultBaseURL}
              placeholderTextColor={palette.textSecondary}
              style={[inputStyle, styles.monoInput]}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={type === 'custom' || isEdit}
            />
            {type !== 'custom' && !isEdit && (
              <Text style={[styles.hint, { color: palette.textSecondary }]}>
                Standard endpoint — edit after creation if you use a proxy.
              </Text>
            )}
            {isInsecureEndpoint(baseURL) && (
              <View style={styles.warnRow}>
                <Ionicons name="warning-outline" size={14} color={palette.warning} />
                <Text style={[styles.warnText, { color: palette.warning }]}>
                  http:// sends your key unencrypted — only use for local/trusted networks.
                </Text>
              </View>
            )}

            {/* Compatibility mode (custom endpoints only) */}
            {type === 'custom' && (
              <>
                <Text style={[styles.label, { color: palette.textSecondary }]}>
                  COMPATIBILITY MODE
                </Text>
                <View style={styles.typeRow}>
                  {(
                    [
                      ['openai', 'OpenAI Compatible'],
                      ['anthropic', 'Anthropic Messages'],
                      ['open-response', 'Open Response'],
                    ] as [CompatibilityMode, string][]
                  ).map(([mode, label]) => {
                    const selected = mode === compatibility;
                    return (
                      <Pressable
                        key={mode}
                        onPress={() => setCompatibility(mode)}
                        style={[
                          styles.typeChip,
                          { borderColor: palette.border },
                          selected && { backgroundColor: palette.tint, borderColor: palette.tint },
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                      >
                        <Text
                          style={[
                            styles.typeChipText,
                            { color: selected ? palette.onTint : palette.text },
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={[styles.hint, { color: palette.textSecondary }]}>
                  Which API dialect this endpoint speaks: OpenAI Chat Completions, Anthropic
                  Messages, or the OpenAI Responses API.
                </Text>
              </>
            )}

            {/* API key */}
            <Text style={[styles.label, { color: palette.textSecondary }]}>
              API KEY {preset.requiresKey ? '(required)' : '(optional)'}
            </Text>
            <View
              style={[
                styles.keyRow,
                { backgroundColor: palette.inputBg, borderColor: palette.border },
              ]}
            >
              <TextInput
                value={apiKey}
                onChangeText={setApiKeyInput}
                placeholder={
                  isEdit ? '••••••••  (leave blank to keep current)' : preset.keyHint
                }
                placeholderTextColor={palette.textSecondary}
                style={[styles.keyInput, { color: palette.text }]}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showKey}
              />
              <Pressable
                onPress={() => setShowKey((v) => !v)}
                hitSlop={8}
                style={styles.keyToggle}
                accessibilityRole="button"
                accessibilityLabel={showKey ? 'Hide API key' : 'Show API key'}
              >
                <Ionicons
                  name={showKey ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={palette.textSecondary}
                />
              </Pressable>
            </View>
            <Text style={[styles.hint, { color: palette.textSecondary }]}>
              Stored only in the OS keychain
              {/* Web build keeps keys in session memory instead */}
              ; never sent anywhere except this provider.
            </Text>

            {/* Models */}
            <View style={styles.modelsHeaderRow}>
              <Text style={[styles.label, { color: palette.textSecondary }]}>MODELS</Text>
              <Pressable
                onPress={() => void handleFetchModels()}
                disabled={busy}
                style={({ pressed }) => [
                  styles.fetchButton,
                  { borderColor: palette.tint },
                  (pressed || busy) && { opacity: 0.7 },
                ]}
                accessibilityRole="button"
              >
                {busy ? (
                  <ActivityIndicator size="small" color={palette.tint} />
                ) : (
                  <>
                    <Ionicons name="cloud-download-outline" size={13} color={palette.tint} />
                    <Text style={[styles.fetchButtonText, { color: palette.tint }]}>
                      Fetch from endpoint
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
            <TextInput
              value={modelsText}
              onChangeText={(v) => {
                setModelsText(v);
                setFetchedModels(null);
              }}
              placeholder="model-id-1, model-id-2, …"
              placeholderTextColor={palette.textSecondary}
              style={[inputStyle, styles.monoInput, styles.modelsInput]}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
            />

            {/* Default model */}
            <Text style={[styles.label, { color: palette.textSecondary }]}>DEFAULT MODEL</Text>
            <TextInput
              value={defaultModel}
              onChangeText={setDefaultModel}
              placeholder="model id used by default"
              placeholderTextColor={palette.textSecondary}
              style={[inputStyle, styles.monoInput]}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {/* Status */}
            {status && (
              <View
                style={[
                  styles.statusBox,
                  {
                    borderColor:
                      status.kind === 'error'
                        ? palette.danger
                        : status.kind === 'ok'
                          ? palette.success
                          : palette.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color:
                      status.kind === 'error'
                        ? palette.danger
                        : status.kind === 'ok'
                          ? palette.success
                          : palette.textSecondary,
                    fontSize: 12.5,
                    lineHeight: 18,
                  }}
                >
                  {status.text}
                </Text>
              </View>
            )}

            {/* Save */}
            <Pressable
              onPress={() => void handleSave()}
              disabled={busy}
              style={({ pressed }) => [
                styles.saveButton,
                { backgroundColor: palette.tint },
                (pressed || busy) && { opacity: 0.8 },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.saveButtonText, { color: palette.onTint }]}>
                {isEdit ? 'Save changes' : 'Add provider'}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    maxHeight: '92%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: { fontSize: 16, fontWeight: '700' },
  form: { padding: 18, gap: 4, paddingBottom: 40 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.7, marginTop: 12, marginBottom: 6 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  typeChipText: { fontSize: 13, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  monoInput: { fontFamily: 'monospace' as never, fontSize: 13 },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingRight: 6,
  },
  keyInput: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  keyToggle: { padding: 6 },
  modelsInput: { minHeight: 64, textAlignVertical: 'top' },
  hint: { fontSize: 11.5, marginTop: 4, lineHeight: 16 },
  warnRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 6 },
  warnText: { fontSize: 11.5, flex: 1, lineHeight: 16 },
  modelsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fetchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  fetchButtonText: { fontSize: 11.5, fontWeight: '700' },
  statusBox: { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 14 },
  saveButton: {
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 13,
    marginTop: 18,
  },
  saveButtonText: { fontSize: 15, fontWeight: '700' },
});
