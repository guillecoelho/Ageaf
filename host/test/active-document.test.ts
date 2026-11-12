import assert from 'node:assert/strict';
import test from 'node:test';

import {
  forgetActiveDocuments,
  getActiveDocument,
  prepareActiveDocumentBlock,
  rememberActiveDocument,
} from '../src/context/activeDocument.js';

const body = Array.from({ length: 200 }, (_, i) => `Line ${i} of the paper.`).join('\n');

test('active document: full once, then unchanged note, diff, and full after forget', () => {
  const key = 'claude:conv-1';
  const doc = { path: 'main.tex', content: body };

  const first = prepareActiveDocumentBlock(key, doc);
  assert.match(first, /<<<AGEAF_ACTIVE_DOCUMENT>>>/);
  assert.ok(first.includes('Line 199'));

  // Not remembered (turn failed) -> still full next time.
  assert.match(prepareActiveDocumentBlock(key, doc), /<<<AGEAF_ACTIVE_DOCUMENT>>>/);
  rememberActiveDocument(key, doc);

  const same = prepareActiveDocumentBlock(key, doc);
  assert.match(same, /Unchanged/);
  assert.ok(!same.includes('Line 199'));

  const edited = { path: 'main.tex', content: body.replace('Line 100 of', 'Line 100 (edited) of') };
  const diff = prepareActiveDocumentBlock(key, edited);
  assert.match(diff, /```diff/);
  assert.ok(diff.includes('+Line 100 (edited) of the paper.'));
  assert.ok(!diff.includes('Line 199'));
  rememberActiveDocument(key, edited);

  const rewritten = prepareActiveDocumentBlock(key, { path: 'main.tex', content: 'totally new' });
  assert.match(rewritten, /<<<AGEAF_ACTIVE_DOCUMENT>>>/);

  forgetActiveDocuments(key);
  assert.match(prepareActiveDocumentBlock(key, edited), /<<<AGEAF_ACTIVE_DOCUMENT>>>/);

  // Other file in the same conversation is sent in full.
  assert.match(
    prepareActiveDocumentBlock(key, { path: 'intro.tex', content: 'x' }),
    /<<<AGEAF_ACTIVE_DOCUMENT>>>/
  );
});

test('getActiveDocument validates shape', () => {
  assert.equal(getActiveDocument(null), null);
  assert.equal(getActiveDocument({ activeDocument: { path: '', content: 'x' } }), null);
  assert.deepEqual(getActiveDocument({ activeDocument: { path: ' main.tex ', content: '' } }), {
    path: 'main.tex',
    content: '',
  });
});
