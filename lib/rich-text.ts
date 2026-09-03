// Question labels: newlines and auto-detected links.
//
// A question label is plain text in the database and stays that way. Officers
// asked for two things it could not do -- put a prompt on more than one line,
// and make a social URL tappable at the door -- and the cheapest correct answer
// to both is to keep storing plain text and interpret it at RENDER time.
//
// Deliberately NOT a markup language. This module never produces HTML and is
// never fed to dangerouslySetInnerHTML: it returns a list of typed segments
// that the caller renders as ordinary React elements, so a label containing
// `<script>` or `<img onerror=...>` is displayed as those literal characters
// and can never execute. Officers are semi-trusted (they can already edit the
// meeting), but a check-in page is public and shared, so a stored-XSS path from
// the officer console into every attendee's browser is not a risk worth taking
// for link formatting.
//
// Newlines survive because the renderer sets `whitespace-pre-line`; splitting
// them into segments here would duplicate what CSS already does correctly.

/** A run of plain text, or a URL that should render as a link. */
export type TextSegment =
  | { type: "text"; value: string }
  | { type: "link"; value: string; href: string };

// http/https URLs and bare www. hosts. Kept intentionally narrow:
//
//   - Only these two shapes are linkified. A scheme-less "instagram.com/ufacm"
//     is left as text because the same pattern matches ordinary prose ("email
//     me at 3 p.m.") and false links are worse than missing ones.
//   - Other schemes (javascript:, data:, file:) are not matched at all, so the
//     href below can never carry one. That is the security-relevant half of
//     this regex and the reason it is a whitelist rather than a blacklist.
//
// The trailing class excludes the characters that end a sentence rather than
// belong to a URL, so "see https://ufacm.org." links the URL and not the
// period. `)` is deliberately ALLOWED to end a match even though `.,;:!?` are
// not: a URL may legitimately contain balanced parens
// (…/ACM_(disambiguation)), and the match cannot be extended after the fact --
// only trimmed. So the greedy form is matched here and the unbalanced trailing
// parens are given back below.
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?\]}]/gi;

/**
 * Split label text into renderable segments.
 *
 * Returns a single text segment when there is nothing to link, which is the
 * common case -- most labels are just a question.
 */
export function parseRichText(input: string): TextSegment[] {
  if (!input) return [];

  const segments: TextSegment[] = [];
  let lastIndex = 0;

  // The regex is stateful (/g); reset in case a previous call threw mid-scan.
  URL_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = URL_PATTERN.exec(input)) !== null) {
    const raw = match[0];

    // A URL inside parentheses -- "(see https://ufacm.org)" -- otherwise
    // swallows the closing paren. Give back any trailing parens the URL does
    // not open itself, which keeps Wikipedia-style links (…_(disambiguation))
    // intact while fixing the common case.
    let url = raw;
    while (
      url.endsWith(")") &&
      countChar(url, ")") > countChar(url, "(")
    ) {
      url = url.slice(0, -1);
    }

    const start = match.index;
    if (start > lastIndex) {
      segments.push({ type: "text", value: input.slice(lastIndex, start) });
    }

    segments.push({
      type: "link",
      value: url,
      // A bare www. host has no scheme, and an href without one is resolved
      // relative to the current page -- "www.instagram.com/ufacm" would
      // navigate to /[orgSlug]/checkin/www.instagram.com/ufacm.
      href: url.toLowerCase().startsWith("www.") ? `https://${url}` : url,
    });

    lastIndex = start + url.length;
    // The match may have been longer than the URL we kept (trailing parens);
    // rewind so those characters are re-scanned as text.
    URL_PATTERN.lastIndex = lastIndex;
  }

  if (lastIndex < input.length) {
    segments.push({ type: "text", value: input.slice(lastIndex) });
  }

  return segments;
}

/** True when the text contains anything that will render as a link. */
export function hasLinks(input: string): boolean {
  return parseRichText(input).some((s) => s.type === "link");
}

function countChar(s: string, char: string): number {
  let n = 0;
  for (const c of s) if (c === char) n++;
  return n;
}
