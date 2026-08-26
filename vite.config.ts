import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(() => {
  if (process.env.VITE_HOUSEHOLD_PASSWORD) {
    throw new Error(
      "Do not set VITE_HOUSEHOLD_PASSWORD. That prefix ships the secret in the browser bundle. Use HOUSEHOLD_PASSWORD in .env.local instead.",
    );
  }
  return {
    plugins: [react(), tailwindcss()],
  };
});
