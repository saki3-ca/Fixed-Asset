import type { Config } from "tailwindcss";

// ACNABIN classic theme (shared with the ACNABIN Task Tracker).
// `slate` is remapped to the tracker's warm neutrals and `brand` to its maroon,
// so existing utility classes pick up the classic look.
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ["var(--font-playfair)", "Playfair Display", "Georgia", "serif"],
      },
      colors: {
        cream: {
          DEFAULT: "#EDE7DE",
          card: "#FAF7F2",
        },
        navy: {
          DEFAULT: "#1B2A6B",
          dark: "#121D4D",
          light: "#EBEFFE",
        },
        teal: {
          DEFAULT: "#1D8C8C",
          dark: "#156E6E",
          light: "#E6F5F5",
        },
        brand: {
          50: "#F9E8EA",
          100: "#F3D0D4",
          200: "#E5A3AA",
          400: "#B8434F",
          500: "#A32836",
          600: "#9C1A27",
          700: "#8B1420",
          800: "#6E0F19",
          900: "#4A0A11",
        },
        // Legacy blue/indigo utilities follow the classic maroon/navy accents.
        blue: {
          50: "#F9E8EA", 100: "#F3D0D4", 200: "#EBC3C7", 300: "#E5A3AA",
          400: "#B8434F", 500: "#A32836", 600: "#8B1420", 700: "#8B1420",
          800: "#6E0F19", 900: "#4A0A11",
        },
        indigo: {
          50: "#EBEFFE", 100: "#D6DDFB", 200: "#B3BEF5", 300: "#8E9CEC",
          400: "#5F70D6", 500: "#3C4EB0", 600: "#2B3B8C", 700: "#1B2A6B",
          800: "#121D4D", 900: "#0C1436",
        },
        slate: {
          50: "#FAF7F2",
          100: "#F5F3EF",
          200: "#EAE3D9",
          300: "#D8CFC3",
          400: "#A39A8F",
          500: "#877E75",
          600: "#5A544E",
          700: "#3D3935",
          800: "#2E2A27",
          900: "#221F1D",
        },
        audit: {
          verified: "#166534",
          warning: "#92400E",
          danger: "#991B1B",
          pending: "#877E75",
        },
      },
      borderRadius: {
        xl: "8px",
        "2xl": "10px",
        "3xl": "16px",
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
