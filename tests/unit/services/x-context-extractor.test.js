/**
 * Unit tests — x-context-extractor.js
 */

import {
  isXHost,
  isXReplyInput,
  isXComposeInput,
  extractTweetContext
} from '../../../src/services/x-context-extractor.js';

describe('x-context-extractor', () => {
  describe('isXHost()', () => {
    it('matches x.com and twitter.com', () => {
      expect(isXHost('x.com')).toBe(true);
      expect(isXHost('www.x.com')).toBe(true);
      expect(isXHost('twitter.com')).toBe(true);
      expect(isXHost('mobile.twitter.com')).toBe(true);
    });

    it('rejects unrelated hosts', () => {
      expect(isXHost('google.com')).toBe(false);
      expect(isXHost('notx.com')).toBe(false);
    });
  });

  describe('isXReplyInput()', () => {
    it('detects tweet textarea test ids', () => {
      const el = document.createElement('div');
      el.setAttribute('data-testid', 'tweetTextarea_0');
      expect(isXReplyInput(el, 'x.com')).toBe(true);
    });

    it('returns false off X hosts', () => {
      const el = document.createElement('div');
      el.setAttribute('data-testid', 'tweetTextarea_0');
      expect(isXReplyInput(el, 'example.com')).toBe(false);
    });
  });

  describe('extractTweetContext()', () => {
    function buildTweetDoc({ postText, author = 'Alice', handle = '@alice', parentText = '' }) {
      document.body.innerHTML = `
        <div id="compose">
          <article data-testid="tweet">
            <div data-testid="User-Name">${author}\n${handle}</div>
            <div data-testid="tweetText">${postText}</div>
          </article>
          <div data-testid="tweetTextarea_0_label">
            <div data-testid="tweetTextarea_0">
              <div role="textbox" contenteditable="true" id="reply-box"></div>
            </div>
          </div>
        </div>
      `;

      if (parentText) {
        const parent = document.createElement('article');
        parent.setAttribute('data-testid', 'tweet');
        parent.innerHTML = `
          <div data-testid="User-Name">Bob\n@bob</div>
          <div data-testid="tweetText">${parentText}</div>
        `;
        document.getElementById('compose').insertBefore(parent, document.querySelector('article'));
      }

      return document.getElementById('reply-box');
    }

    it('extracts post text and author above the reply box', () => {
      const replyInput = buildTweetDoc({
        postText: 'This is the post to reply to.',
        author: 'Carol',
        handle: '@carol'
      });

      const ctx = extractTweetContext(replyInput, document);

      expect(ctx).not.toBeNull();
      expect(ctx.text).toBe('This is the post to reply to.');
      expect(ctx.author).toBe('Carol');
      expect(ctx.handle).toBe('@carol');
    });

    it('returns null when no target post is found', () => {
      document.body.innerHTML = `
        <div data-testid="tweetTextarea_0">
          <div role="textbox" contenteditable="true" id="reply-box"></div>
        </div>
      `;
      const replyInput = document.getElementById('reply-box');
      expect(extractTweetContext(replyInput, document)).toBeNull();
    });

    it('truncates long post text to 500 chars', () => {
      const longText = 'a'.repeat(600);
      const replyInput = buildTweetDoc({ postText: longText });
      const ctx = extractTweetContext(replyInput, document);
      expect(ctx.text.length).toBe(500);
    });

    it('extracts tweet from status URL when reply input is missing', () => {
      document.body.innerHTML = `
        <article>
          <a href="/user/status/12345">link</a>
          <div data-testid="tweetText">Status page tweet</div>
        </article>
      `;
      const doc = {
        body: document.body,
        querySelector: (...args) => document.querySelector(...args),
        location: { href: 'https://x.com/user/status/12345' }
      };

      const ctx = extractTweetContext(null, doc);
      expect(ctx?.text).toBe('Status page tweet');
    });
  });

  describe('isXComposeInput()', () => {
    it('detects compose textarea on X', () => {
      const el = document.createElement('div');
      el.setAttribute('data-testid', 'tweetTextarea_0');
      expect(isXComposeInput(el, 'x.com')).toBe(true);
    });
  });
});
