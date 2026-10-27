import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FEEDBACK_BOARD, STATUS_BOARD } from '../../public/js/ui/siteBoards.js';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the lobby feedback group is retired: no group number and no copy action', () => {
  const feedback = source('../../public/js/ui/lobbyFeedback.js');
  assert.match(feedback, /t\('反馈群：已跑路'\)/);
  assert.doesNotMatch(feedback, /243859707|copyText|copyFeedbackGroup|onClick|href=|window\.open|2225664821|net\.request|localStorage/);
  const en = JSON.parse(source('../../public/i18n/en.json'));
  assert.ok(Object.hasOwn(en, '反馈群：已跑路'));
});

test('feedback remains visible outside optional announcements', () => {
  const lobby = source('../../public/js/screens/lobby.js');
  assert.match(lobby, /<div class="hub-contact"><div class="hub-contact__row"><\$\{LobbyFeedback\} \/><\$\{SiteBoards\} \/><\/div>/);
  const css = source('../../public/css/screens/lobby.css');
  assert.match(css, /\.lobby-feedback \{[^}]*min-height: 40px/);
});

test('the feedback board and the status page are same-origin links that open in a new tab', () => {
  assert.equal(FEEDBACK_BOARD, '/feedback/');
  assert.equal(STATUS_BOARD, '/monitor/');
  const boards = source('../../public/js/ui/siteBoards.js');
  assert.equal(boards.match(/<a class="btn btn--secondary btn--sm hub-board(?: hub-board--status)?" href=\$\{(FEEDBACK_BOARD|STATUS_BOARD)\} target="_blank" rel="noopener"/g).length, 2);
  assert.doesNotMatch(boards, /https?:|window\.open|net\.request|localStorage/);
  const en = JSON.parse(source('../../public/i18n/en.json'));
  for (const key of boards.match(/t\('[^']+'\)/g).map(call => call.slice(3, -2))) assert.ok(Object.hasOwn(en, key), key);
  assert.match(source('../../public/css/screens/lobby.css'), /\.hub-board \{[^}]*min-height: 40px/);
});
