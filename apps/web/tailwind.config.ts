import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f2933",
        paper: "#f7f7f2",
        moss: "#556b2f",
        coral: "#b75b45",
        steel: "#3e6f7c"
      }
    }
  },
  plugins: []
} satisfies Config;
