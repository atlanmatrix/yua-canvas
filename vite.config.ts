import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { canvasPwa } from "./scripts/pwa";
export default defineConfig({ plugins: [react(), canvasPwa()] });
