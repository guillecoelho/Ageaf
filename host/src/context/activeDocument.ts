import { createPatch } from 'diff';

export type ActiveDocument = { path: string; content: string };

// What the model has already seen, per conversation and file path.
// ponytail: in-memory map, lost on host restart (the next turn just resends full docs).
const seen = new Map<string, Map<string, string>>();

// A diff larger than this fraction of the document is not worth it; resend in full.
const MAX_DIFF_RATIO = 0.5;

export function getActiveDocument(context: unknown): ActiveDocument | null {
  if (!context || typeof context !== 'object') return null;
  const raw = (context as { activeDocument?: unknown }).activeDocument;
  if (!raw || typeof raw !== 'object') return null;
  const { path, content } = raw as { path?: unknown; content?: unknown };
  if (typeof path !== 'string' || !path.trim() || typeof content !== 'string') return null;
  return { path: path.trim(), content };
}

const EDIT_HINT =
  'To edit it, emit an `ageaf-patch` block with { "kind":"replaceRangeInFile", "filePath":"<path>", "expectedOldText":"<exact current text>", "text":"<new text>" }.';

function fullBlock(doc: ActiveDocument) {
  return [
    `[Active Overleaf document: ${doc.path}]`,
    'Full current contents of the file open in the editor. Later turns only send diffs; treat this as the latest version unless a diff follows.',
    EDIT_HINT,
    '<<<AGEAF_ACTIVE_DOCUMENT>>>',
    doc.content,
    '<<<AGEAF_ACTIVE_DOCUMENT_END>>>',
  ].join('\n');
}

/**
 * Prompt block for the active document. First turn (or after compaction): full file.
 * Later: a unified diff against what the model saw, or a one-line note when unchanged.
 * Call rememberActiveDocument() once the turn succeeded.
 */
export function prepareActiveDocumentBlock(
  conversationKey: string | undefined,
  doc: ActiveDocument | null
): string {
  if (!doc) return '';
  const previous = conversationKey ? seen.get(conversationKey)?.get(doc.path) : undefined;
  if (previous === undefined) return fullBlock(doc);
  if (previous === doc.content) {
    return `[Active Overleaf document: ${doc.path}] Unchanged since its full contents were sent earlier in this conversation. ${EDIT_HINT}`;
  }

  const patch = createPatch(doc.path, previous, doc.content, '', '', { context: 2 });
  if (patch.length > doc.content.length * MAX_DIFF_RATIO) return fullBlock(doc);
  return [
    `[Active Overleaf document changed: ${doc.path}]`,
    'The user edited the file since it was last sent. Apply this unified diff to your copy:',
    '```diff',
    patch,
    '```',
    EDIT_HINT,
  ].join('\n');
}

export function rememberActiveDocument(conversationKey: string | undefined, doc: ActiveDocument | null) {
  if (!conversationKey || !doc) return;
  const files = seen.get(conversationKey) ?? new Map<string, string>();
  files.set(doc.path, doc.content);
  seen.set(conversationKey, files);
}

/** Forget what the model saw, e.g. after compaction summarized the document away. */
export function forgetActiveDocuments(conversationKey: string | undefined) {
  if (conversationKey) seen.delete(conversationKey);
}
