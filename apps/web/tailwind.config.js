/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        network: {
          bg: "#0B0F19",
          panel: "#111827",
          border: "#1F2937",
          accent: "#3B82F6",
          cisco: "#00BCEB",
          mikrotik: "#D1282F",
          terminal: "#0D1117",
        }
      }
    },
  },
  plugins: [],
}
