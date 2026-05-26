export function cssTokens(): string {
  return `
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/IBMPlexMono-Regular.woff2') format('woff2');
}
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('/fonts/IBMPlexMono-Bold.woff2') format('woff2');
}
:root {
  --bg: #0d0d0d;
  --surface: #181818;
  --border: #232323;
  --text: #e8e1d8;
  --text-secondary: #8a8a8a;
  --text-muted: #5a5a5a;
  --accent: #f5a623;
  --accent-hover: #ffbb4d;
  --danger: #e85d4d;
  --font: 'IBM Plex Mono', ui-monospace, SF Mono, Menlo, Consolas, monospace;
  color-scheme: dark;
}
`.trim();
}
