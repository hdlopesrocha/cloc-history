export const KNOWN_COLORS = {
  'TypeScript': '#5b8cff',
  'Vue': '#3ddc97',
  'JavaScript': '#f4de5b',
  'CSS': '#b57bff',
  'SCSS': '#f472b6',
  'Less': '#a78bfa',
  'HTML': '#ff9e64',
  'JSON': '#9aa8b8',
  'JSON5': '#9aa8b8',
  'Markdown': '#6cc5ff',
  'Shell': '#a6e22e',
  'Bourne Shell': '#a6e22e',
  'Bourne Again Shell': '#a6e22e',
  'Python': '#4fc3c8',
  'SQL': '#f78c6c',
  'YAML': '#ff6b9d',
  'Go': '#22d3ee',
  'Rust': '#e58b6b',
  'Java': '#e0a85c',
  'C': '#89a4ff',
  'C++': '#f25f8b',
  'C#': '#73d789',
  'Ruby': '#f45b69',
  'PHP': '#8f9dff',
  'Swift': '#ff875f',
  'Kotlin': '#c084fc',
  'Scala': '#ff5c8a',
  'Dart': '#3ddbd9',
  'Lua': '#6c8cff',
  'Perl': '#79d4fd',
  'R': '#74c0fc',
  'TeX': '#a3b56d',
  'Dockerfile': '#61b0ff',
  'Makefile': '#b0c46a',
  'Protocol Buffers': '#d0a2ff',
  'Terraform': '#a78bfa',
  'Nix': '#8ab4f8',
  'Solidity': '#a8a8ff',
  'Objective-C': '#73a9ff',
  'Assembly': '#c5a46d',
  'Clojure': '#7ddb92',
  'Elixir': '#c39bff',
  'Haskell': '#a78bfa',
  'F#': '#63b3ed',
  'Zig': '#f6ad55',
  'XML': '#f4a261',
  'SVG': '#ffc46b',
};

export const FALLBACK_COLORS = [
  '#7dd3fc',
  '#f9a8d4',
  '#bef264',
  '#fdba74',
  '#c4b5fd',
  '#5eead4',
  '#fca5a5',
  '#93c5fd',
  '#fde68a',
  '#d8b4fe',
  '#86efac',
  '#f0abfc',
  '#a5b4fc',
  '#facc15',
  '#67e8f9',
  '#fb923c',
];

function hashName(name) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function generatedColor(name, usedColors = new Set()) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const hue = (hashName(name) * 47 + attempt * 29) % 360;
    const color = `hsl(${hue} 68% 67%)`;
    if (!usedColors.has(color)) return color;
  }
  return '#94a3b8';
}

export function chooseColor(name, usedColors) {
  const known = KNOWN_COLORS[name];
  if (known && !usedColors.has(known)) return known;

  const fallback = FALLBACK_COLORS.find((color) => !usedColors.has(color));
  if (fallback) return fallback;

  return generatedColor(name, usedColors);
}
