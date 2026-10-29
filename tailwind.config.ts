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
        brand: {
          50: "#f0f6fe",
          100: "#dbe8fd",
          500: "#2563eb",
          600: "#1d4ed8",
          700: "#1e40af",
          800: "#1e3a8a",
          900: "#172554",
        },
        audit: {
          verified: "#10b981", // Emerald
          warning: "#f59e0b",  // Amber
          danger: "#ef4444",   // Red
          pending: "#64748b",  // Slate
        }
      },
      minHeight: {
        touch: "48px",
      },
      minWidth: {
        touch: "48px",
      }
    },
  },
  plugins: [],
};
export default config;

