import type { Config } from "tailwindcss";

/**
 * Warm-editorial design system.
 *
 * Every semantic color resolves to a CSS variable defined in app/globals.css,
 * so the light and dark variants share one set of utility classes
 * (e.g. `bg-card`, `text-ink`, `border-hairline`, `text-clay`).
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./config/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        card: "var(--card)",
        elevated: "var(--elevated)",
        ink: "var(--text)",
        muted: "var(--muted)",
        hairline: "var(--hairline)",
        clay: {
          DEFAULT: "var(--clay)",
          soft: "var(--clay-soft)",
        },
        sage: {
          DEFAULT: "var(--sage)",
          soft: "var(--sage-soft)",
        },
        amber: {
          DEFAULT: "var(--amber)",
          soft: "var(--amber-soft)",
        },
      },
      borderRadius: {
        DEFAULT: "12px",
        lg: "12px",
        xl: "16px",
        "2xl": "20px",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        serif: [
          "ui-serif",
          "Georgia",
          "Cambria",
          "Times New Roman",
          "Times",
          "serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(43, 39, 36, 0.04), 0 1px 1px rgba(43, 39, 36, 0.03)",
        lift: "0 6px 24px -8px rgba(43, 39, 36, 0.14)",
      },
      maxWidth: {
        shell: "1200px",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pulse_soft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out both",
        "pulse-soft": "pulse_soft 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
