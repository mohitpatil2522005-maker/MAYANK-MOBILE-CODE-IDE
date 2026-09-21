/**
 * Recursive project file tree. Directories expand/collapse with local state;
 * everything under it is rendered eagerly (the scan already ran at pick time).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Palette } from '@/src/constants/theme';
import type { FileNode } from '@/src/lib/fs/types';

interface FileTreeProps {
  nodes: FileNode[];
  activeUri: string | null;
  palette: Palette;
  onFilePress: (node: FileNode) => void;
}

const INDENT = 14;

export function FileTree({ nodes, activeUri, palette, onFilePress }: FileTreeProps) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator
      keyboardShouldPersistTaps="handled"
    >
      {nodes.map((node) => (
        <TreeNode
          key={node.uri}
          node={node}
          depth={0}
          activeUri={activeUri}
          palette={palette}
          onFilePress={onFilePress}
        />
      ))}
    </ScrollView>
  );
}

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  activeUri: string | null;
  palette: Palette;
  onFilePress: (node: FileNode) => void;
}

function TreeNode({ node, depth, activeUri, palette, onFilePress }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isActive = node.uri === activeUri;

  if (node.type === 'directory') {
    return (
      <View>
        <Pressable
          onPress={() => setExpanded((e) => !e)}
          style={({ pressed }) => [
            styles.row,
            { paddingLeft: depth * INDENT + 8 },
            pressed && { backgroundColor: palette.surfacePressed },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} folder ${node.name}`}
        >
          <Ionicons
            name={expanded ? 'chevron-down' : 'chevron-forward'}
            size={13}
            color={palette.textSecondary}
            style={styles.chevron}
          />
          <Ionicons
            name={expanded ? 'folder-open-outline' : 'folder-outline'}
            size={16}
            color={palette.tint}
            style={styles.icon}
          />
          <Text numberOfLines={1} style={[styles.label, { color: palette.text }]}>
            {node.name}
          </Text>
        </Pressable>
        {expanded &&
          node.children?.map((child) => (
            <TreeNode
              key={child.uri}
              node={child}
              depth={depth + 1}
              activeUri={activeUri}
              palette={palette}
              onFilePress={onFilePress}
            />
          ))}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => !node.truncated && onFilePress(node)}
      disabled={node.truncated}
      style={({ pressed }) => [
        styles.row,
        { paddingLeft: depth * INDENT + 8 + 19 },
        isActive && { backgroundColor: palette.surfacePressed },
        pressed && !isActive && { backgroundColor: palette.surfacePressed },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open file ${node.name}`}
    >
      <Ionicons
        name="document-text-outline"
        size={15}
        color={isActive ? palette.tint : palette.textSecondary}
        style={styles.icon}
      />
      <Text
        numberOfLines={1}
        style={[
          styles.label,
          { color: node.truncated ? palette.warning : isActive ? palette.tint : palette.text },
        ]}
      >
        {node.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingRight: 8,
    borderRadius: 4,
  },
  chevron: { width: 16 },
  icon: { marginRight: 6 },
  label: { fontSize: 13, flexShrink: 1 },
});
