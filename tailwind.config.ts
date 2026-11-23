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
          500: "#1e5aff",
          600: "#1748d6",
          700: "#1239ad",
          900: "#0a2a8f",
          950: "#061a5c",
        },
      },
      borderRadius: { "4xl": "2rem" },
    },
  },
  plugins: [],
};
export default config;
