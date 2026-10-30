import type { Config } from "tailwindcss";

// ACNABIN "Calm System" theme: Forest, Mint, Ivory, Stone.
// Existing utility classes (brand-*, slate-*, blue-*, cream) are remapped here,
// so every screen picks up the palette without per-file edits.
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ["Cambria", "var(--font-display)", "Georgia", "serif"],
      },
      colors: {
        cream: {
          DEFAULT: "#FAF9F4", // Ivory
          card: "#F4F2EA",
        },
        navy: {
          DEFAULT: "#0F5132", // Forest
          dark: "#0B3E26",
          light: "#EEF6F0",
        },
        teal: {
          DEFAULT: "#2A6E49",
          dark: "#166040",
          light: "#EEF6F0",
        },
        mint: {
          DEFAULT: "#B7D9C1",
          light: "#DCEBE1",
        },
        brand: {
          50: "#EEF6F0",
          100: "#DCEBE1",
          200: "#B7D9C1", // Mint
          300: "#8FC3A0",
          400: "#4E8F66",
          500: "#2A6E49",
          600: "#166040",
          700: "#0F5132", // Forest
          800: "#0B3E26",
          900: "#072B1A",
        },
        blue: {
          50: "#EEF6F0", 100: "#DCEBE1", 200: "#B7D9C1", 300: "#8FC3A0",
          400: "#4E8F66", 500: "#2A6E49", 600: "#166040", 700: "#0F5132",
          800: "#0B3E26", 900: "#072B1A",
        },
        indigo: {
          50: "#EEF6F0", 100: "#DCEBE1", 200: "#B7D9C1", 300: "#8FC3A0",
          400: "#4E8F66", 500: "#2A6E49", 600: "#166040", 700: "#0F5132",
          800: "#0B3E26", 900: "#072B1A",
        },
        slate: {
          50: "#FAF9F4",
          100: "#F3F1EA",
          200: "#E8E5DB",
          300: "#D6D3C8", // Stone
          400: "#A8A598",
          500: "#78756A",
          600: "#57554B",
          700: "#3E3D36",
          800: "#2A2A25",
          900: "#17201A",
        },
        audit: {
          verified: "#166534",
          warning: "#92400E",
          danger: "#991B1B",
          pending: "#78756A",
        },
      },
      borderRadius: {
        lg: "12px",
        xl: "16px",
        "2xl": "20px",
        "3xl": "28px",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(23, 32, 26, 0.04), 0 4px 14px rgba(23, 32, 26, 0.06)",
        float: "0 6px 24px rgba(23, 32, 26, 0.14)",
      },
      minHeight: {
        touch: "48px",
      },
      minWidth: {
        touch: "48px",
      },
    },
  },
  plugins: [],
};
export default config;
