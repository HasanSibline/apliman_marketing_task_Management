/**
 * Runtime brand theming.
 *
 * The Tailwind `primary` palette is wired to CSS custom properties
 * (--color-primary-50 … --color-primary-950) that hold "R G B" channels.
 * This lets a company's `primaryColor` flow through the ENTIRE app shell
 * (buttons, links, active nav, rings, gradients) — not just the login page —
 * without touching any component. If no company color is set, the defaults in
 * index.css keep the original blue, so behavior/appearance is unchanged.
 *
 * This module is presentation-only: it sets CSS variables. No app logic.
 */

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

// Target lightness per step (0–1). Preserves the company hue/saturation while
// producing a coherent tint→shade ramp similar to Tailwind's default scale.
const STEP_LIGHTNESS: Record<number, number> = {
  50: 0.975,
  100: 0.94,
  200: 0.86,
  300: 0.75,
  400: 0.63,
  500: 0.55,
  600: 0.47,
  700: 0.39,
  800: 0.31,
  900: 0.25,
  950: 0.16,
};

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/** Build an 11-step "R G B" channel scale from a single hex color. */
export function buildScale(hex: string): Record<number, string> | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [h, s] = rgbToHsl(...rgb);
  // Keep a reasonable minimum saturation so very muted brand colors still read.
  const sat = Math.max(s, 0.35);
  const scale: Record<number, string> = {};
  for (const step of STEPS) {
    const [r, g, b] = hslToRgb(h, sat, STEP_LIGHTNESS[step]);
    scale[step] = `${r} ${g} ${b}`;
  }
  return scale;
}

/**
 * Apply a company's brand color to the document as CSS variables.
 * Pass a falsy value to reset to the default (blue) theme.
 */
export function applyBrandColor(hex?: string | null): void {
  const root = document.documentElement;
  if (!hex) {
    for (const step of STEPS) root.style.removeProperty(`--color-primary-${step}`);
    return;
  }
  const scale = buildScale(hex);
  if (!scale) return;
  for (const step of STEPS) {
    root.style.setProperty(`--color-primary-${step}`, scale[step]);
  }
}
