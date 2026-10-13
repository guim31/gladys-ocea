// -----------------------------------------------------------------------------
// Every text shown to the user exists in English, French, German and Spanish:
// the manifest, the container's messages and names, the widget content.
// German says "du", never the polite "Sie"/"Ihr"; Spanish says "usted".
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { LANGUAGES, TEXTS, t, tAll } from '../src/i18n.js';
import { buildWidgetContent } from '../src/widgets.js';
import { parseConsumptions } from '../src/ocea/parse.js';
import { recordReading } from '../src/history.js';
import { fixture } from './helpers/fake-ocea.js';

const manifest = JSON.parse(
  readFileSync(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const POLITE_GERMAN = /\b(Sie|Ihr|Ihre|Ihrem|Ihren|Ihrer|Ihres|Ihnen)\b/;
const INFORMAL_SPANISH = /\b(tú|tu|tus|ti|contigo)\b/i;

// Every multi-language object of the manifest, with its path.
function multiLanguageTexts(node, path = 'manifest') {
  if (Array.isArray(node)) {
    return node.flatMap((item, i) => multiLanguageTexts(item, `${path}[${i}]`));
  }
  if (!node || typeof node !== 'object') {
    return [];
  }
  if (typeof node.en === 'string') {
    return [{ path, text: node }];
  }
  return Object.entries(node).flatMap(([key, value]) =>
    multiLanguageTexts(value, `${path}.${key}`),
  );
}

function checkText(path, text, maxLength = Infinity) {
  for (const language of LANGUAGES) {
    const value = text[language];
    assert.equal(typeof value, 'string', `${path}.${language} is missing`);
    assert.ok(value.trim().length > 0, `${path}.${language} is empty`);
    assert.ok(value.length <= maxLength, `${path}.${language} is longer than ${maxLength}`);
  }
  assert.deepEqual(Object.keys(text).sort(), [...LANGUAGES].sort(), `${path}: unexpected language`);
  assert.doesNotMatch(text.de, POLITE_GERMAN, `${path}.de uses the polite form`);
  assert.doesNotMatch(text.es, INFORMAL_SPANISH, `${path}.es uses "tú"`);
}

test('every manifest text exists in the four languages', () => {
  const texts = multiLanguageTexts(manifest);
  assert.ok(texts.length >= 15);
  for (const { path, text } of texts) {
    checkText(path, text);
  }
});

test('the manifest texts fit the store and core limits', () => {
  checkText('description', manifest.description, 100);
  for (const text of Object.values(manifest.description)) {
    assert.ok(text.length >= 10);
  }
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  for (const widget of manifest.widgets) {
    checkText(`widgets.${widget.key}.label`, widget.label, 30);
    for (const label of Object.values(widget.label)) {
      assert.ok(label.length >= 3);
    }
    checkText(`widgets.${widget.key}.description`, widget.description, 100);
  }
  for (const field of manifest.config_schema.filter((f) => f.type === 'section')) {
    checkText(`config_schema.${field.key}.description`, field.description, 1000);
  }
});

test('the container texts exist in the four languages', () => {
  for (const [key, text] of Object.entries(TEXTS)) {
    checkText(`TEXTS.${key}`, text, 300);
  }
  // Placeholders are the same in every language.
  for (const [key, text] of Object.entries(TEXTS)) {
    const names = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const language of LANGUAGES) {
      assert.deepEqual(
        names(text[language]),
        names(text.en),
        `TEXTS.${key}.${language} placeholders`,
      );
    }
  }
  assert.deepEqual(Object.keys(tAll('action_ok', { dwellings: 1, meters: 2 })), LANGUAGES);
  assert.equal(
    t('action_ok', 'xx', { dwellings: 1, meters: 2 }),
    t('action_ok', 'en', { dwellings: 1, meters: 2 }),
  );
});

test('the widget content is localized and fits the vocabulary in every language', () => {
  const gladys = createFakeGladys();
  const id = 'dwelling-1';
  const readings = parseConsumptions([
    ...fixture('consos-cetc.json'),
    { fluide: 'RepartiteurFraisChauffage', valeur: '1234', unite: 'unités' },
  ]);
  const at = new Date('2026-10-13T08:00:00Z');
  const history = Object.fromEntries(
    readings.map((reading) => [reading.key, recordReading(undefined, reading.value, at, 'UTC')]),
  );
  const state = { dwellings: { [id]: { id, readings, history } } };
  for (const language of LANGUAGES) {
    const content = buildWidgetContent(
      gladys,
      state,
      { settings: { dwelling: gladys.externalIds('dwelling', id).device }, language },
      { timeZone: 'UTC', now: at },
    );
    assert.deepEqual(validateWidgetContent(content), [], language);
    for (const component of content.components) {
      for (const field of ['text', 'label', 'unit']) {
        if (typeof component[field] === 'string') {
          assert.ok(component[field].length > 0);
        }
      }
      if (language === 'de' && typeof component.text === 'string') {
        assert.doesNotMatch(component.text, POLITE_GERMAN);
      }
    }
  }
});

test('the documentation exists in the four languages, with the same sections', () => {
  const headings = (language) => {
    const text = readFileSync(new URL(`../docs/${language}.md`, import.meta.url), 'utf8');
    return { text, levels: [...text.matchAll(/^(#{1,6}) /gm)].map((m) => m[1].length) };
  };
  const reference = headings('fr');
  assert.ok(reference.levels.length >= 5);
  for (const language of LANGUAGES) {
    const { text, levels } = headings(language);
    assert.ok(text.length >= 300, `docs/${language}.md is too short`);
    assert.deepEqual(levels, reference.levels, `docs/${language}.md: not the sections of fr.md`);
  }
  // Same tables and lists too: one line per row or item.
  const shape = (text) => [...text.matchAll(/^(\||- |\d+\. )/gm)].length;
  for (const language of LANGUAGES) {
    assert.equal(
      shape(headings(language).text),
      shape(reference.text),
      `docs/${language}.md shape`,
    );
  }
  assert.doesNotMatch(headings('de').text, POLITE_GERMAN, 'docs/de.md uses the polite form');
  assert.doesNotMatch(headings('es').text, INFORMAL_SPANISH, 'docs/es.md uses "tú"');
});
