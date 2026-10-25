import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const page = (file: string) => fileURLToPath(new URL(file, import.meta.url));

export default defineConfig(({ command }) => ({
  // GitHub Pages では https://tomonoriyoshida.github.io/sound-sketch/ で公開する
  base: command === "build" ? "/sound-sketch/" : "/",
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      // Keyboard（keyboard.html）は公開しない。開発サーバーでは今までどおり開ける
      input: {
        main: page("./index.html"),
        ripples: page("./ripples.html"),
        phase: page("./phase.html"),
        loops: page("./loops.html"),
      },
    },
  },
}));
