/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Pure black and custom dark grays for the extension feel
        pitch: "#000000",
        dark: {
          900: "#050505",
          800: "#111111",
          700: "#1A1A1A",
        },
      },
    },
  },
  plugins: [],
};
