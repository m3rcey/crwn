import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderNumbersEmail, NUMBERS_CTA_LABEL } from './numbersEmail';

const RESULT = 'https://thecrwn.app/tools/worth/result/TOKEN123';
const WATCH = 'https://thecrwn.app/watch/vsl-calculator?tool=worth&result=TOKEN123';
const POSTER = 'https://thecrwn.app/vsl/vsl-calculator.webp';
const video = { watchUrl: WATCH, posterUrl: POSTER, title: 'Why your number is what it is', minutes: 16 };

const render = (over: Partial<Parameters<typeof renderNumbersEmail>[0]> = {}) =>
  renderNumbersEmail({ firstName: 'Dre', toolName: 'fanbase worth calculator', resultUrl: RESULT, video, ...over });

describe('numbers email (founder ask 2026-10-03: the link, with the VSL right under it)', () => {
  it('puts the video DIRECTLY under the link, with nothing between them', () => {
    const { html } = render();
    const link = html.indexOf(`href="${RESULT}"`);
    const buttonEnd = html.indexOf('</table>', link) + '</table>'.length;
    const videoStart = html.lastIndexOf('<a ', html.indexOf(`href="${WATCH.replace(/&/g, '&amp;')}"`));
    expect(link).toBeGreaterThan(-1);
    expect(videoStart).toBeGreaterThan(buttonEnd);
    // Between the end of the button and the video's own anchor there is only the video's wrapper.
    expect(html.slice(buttonEnd, videoStart).replace(/<table[^>]*><tr><td>/, '').trim()).toBe('');
    expect(html).toContain(`src="${POSTER}"`);
  });

  it('keeps the link at the top: only the greeting and one line come before it', () => {
    const { html } = render();
    const before = html.slice(0, html.indexOf(`href="${RESULT}"`));
    expect((before.match(/<p /g) ?? []).length).toBe(2);
    expect(html).toContain(NUMBERS_CTA_LABEL);
  });

  it('plain text carries the same order: link line, then the video line', () => {
    const lines = render().text.split('\n\n');
    const i = lines.findIndex((l) => l.includes(RESULT));
    expect(i).toBeGreaterThan(-1);
    expect(lines[i + 1]).toContain(WATCH);
  });

  it('renders no video at all when the VSL is not hosted', () => {
    const { html, text } = render({ video: null });
    expect(html).not.toContain('<img');
    expect(text).not.toContain('watch');
    expect(html).toContain(`href="${RESULT}"`);
  });

  it('never quotes a number, and uses no em or en dashes', () => {
    const { html, text, subject } = render();
    for (const s of [html, text, subject]) {
      expect(s).not.toMatch(/[–—]/);
      expect(s).not.toMatch(/\$\d/);
    }
  });

  it('escapes a self-entered name and falls back when there is none', () => {
    expect(render({ firstName: '<b>x</b>' }).html).not.toContain('<b>x</b>');
    const anon = render({ firstName: null, toolName: null });
    expect(anon.subject).toBe('Your numbers from CRWN');
    expect(anon.text.startsWith('Hey,')).toBe(true);
  });
});

describe('numbers email server: a refusal never costs the lead their link', () => {
  const src = readFileSync(join(__dirname, 'numbersEmailServer.ts'), 'utf-8');

  it('asks every refusal reason BEFORE rotating the token', () => {
    const ask = src.indexOf('await emailBlockedReason(');
    const rotate = src.indexOf('await rotateResultToken(');
    expect(ask).toBeGreaterThan(-1);
    expect(rotate).toBeGreaterThan(ask);
  });

  it('derives the recipient from the result row, never from the caller', () => {
    expect(src).toMatch(/export async function sendNumbersEmail\(resultId: string\)/);
    expect(src).toContain('await loadIdentity(identityId)');
  });
});
