import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        vektora: {
          50: "#eef4ff",
          100: "#d9e6ff",
          400: "#5890ff",
          500: "#2463ff",
          600: "#1748d6",
          700: "#1239ad",
          800: "#0c2577",
          900: "#08194f",
          950: "#060b19",
        },
        finora: {
          bg: "#060b19",
          surface: "#0b132b",
          card: "#101a38",
          blueTop: "#2f73ff",
          blueMid: "#194fd1",
          blueDeep: "#09173a",
        },
      },
      borderRadius: {
        "3xl": "1.5rem",
        "4xl": "2rem",
      },
      boxShadow: {
        finora: "0 20px 50px -15px rgba(6, 15, 45, 0.7)",
        "finora-card": "0 12px 32px -8px rgba(18, 63, 180, 0.35)",
      },
    },
  },
  plugins: [],
};
export default config;

