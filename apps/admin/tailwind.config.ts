import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Direct brand-token access
        purple: {
          50: "var(--p-50)",
          100: "var(--p-100)",
          200: "var(--p-200)",
          400: "var(--p-400)",
          600: "var(--p-600)",
          800: "var(--p-800)",
        },
        teal: {
          50: "var(--t-50)",
          100: "var(--t-100)",
          400: "var(--t-400)",
          600: "var(--t-600)",
          800: "var(--t-800)",
        },
        warm: {
          50: "var(--n-50)",
          100: "var(--n-100)",
          200: "var(--n-200)",
          400: "var(--n-400)",
          600: "var(--n-600)",
          800: "var(--n-800)",
          900: "var(--n-900)",
        },
        // Semantic aliases used across the dashboard
        background: "var(--background)",
        "background-warm": "var(--background-warm)",
        foreground: "var(--foreground)",
        "foreground-muted": "var(--foreground-muted)",
        "foreground-subtle": "var(--foreground-subtle)",
        surface: "var(--surface)",
        "surface-muted": "var(--surface-muted)",
        border: "var(--border)",
        brand: {
          DEFAULT: "var(--brand)",
          hover: "var(--brand-hover)",
          soft: "var(--brand-soft)",
          muted: "var(--brand-muted)",
          light: "var(--brand-soft)",
          dark: "var(--p-800)",
        },
        success: {
          DEFAULT: "var(--success)",
          soft: "var(--success-soft)",
          border: "var(--success-border)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          soft: "var(--warning-soft)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          soft: "var(--danger-soft)",
        },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(26, 22, 64, 0.04), 0 8px 24px rgba(26, 22, 64, 0.04)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
