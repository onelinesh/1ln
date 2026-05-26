const KEYWORDS = new Set([
  "if", "then", "fi", "else", "elif",
  "for", "in", "do", "done", "while", "until",
  "case", "esac", "function", "return",
  "export", "local", "readonly", "unset",
  "echo", "printf", "read", "set", "cd",
  "cat", "true", "false",
]);

/**
 * Escape only the characters that are dangerous inside HTML element content.
 * We intentionally do NOT escape " or ' here so that string delimiters remain
 * matchable as single characters in the highlighter walk below.
 * The output is safe for insertion inside <pre>…</pre>.
 */
function escapeContent(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Returns HTML with shell syntax tokens wrapped in spans.
 * Input is escaped first; output is safe for direct insertion inside <pre>.
 *
 * Highlights, in order of precedence (so an earlier match wins):
 *   1. # line comments
 *   2. "double" and 'single' quoted strings
 *   3. shell keywords (whole-word match)
 */
export function highlightShell(code: string): string {
  const escaped = escapeContent(code);
  const out: string[] = [];
  let i = 0;
  while (i < escaped.length) {
    const ch = escaped[i];

    // Comment from # to end of line
    if (ch === "#" && (i === 0 || escaped[i - 1] === "\n" || /\s/.test(escaped[i - 1] ?? ""))) {
      const end = escaped.indexOf("\n", i);
      const stop = end === -1 ? escaped.length : end;
      out.push(`<span class="sh-comment">${escaped.slice(i, stop)}</span>`);
      i = stop;
      continue;
    }

    // Strings
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < escaped.length && escaped[j] !== quote) {
        if (escaped[j] === "\\" && j + 1 < escaped.length) { j += 2; } else { j++; }
      }
      const end = Math.min(j + 1, escaped.length);
      out.push(`<span class="sh-string">${escaped.slice(i, end)}</span>`);
      i = end;
      continue;
    }

    // Word — check keyword
    if (/[A-Za-z_]/.test(ch ?? "")) {
      let j = i + 1;
      while (j < escaped.length && /[A-Za-z0-9_]/.test(escaped[j] ?? "")) j++;
      const word = escaped.slice(i, j);
      const before = i > 0 ? escaped[i - 1] : "";
      const after = j < escaped.length ? escaped[j] : "";
      // Word boundary check — preceding/following char must not be word-y
      const prevOk = !before || !/[A-Za-z0-9_]/.test(before);
      const nextOk = !after || !/[A-Za-z0-9_]/.test(after);
      if (prevOk && nextOk && KEYWORDS.has(word)) {
        out.push(`<span class="sh-keyword">${word}</span>`);
      } else {
        out.push(word);
      }
      i = j;
      continue;
    }

    out.push(ch ?? "");
    i++;
  }
  return out.join("");
}
