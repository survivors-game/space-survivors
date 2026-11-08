import { defineConfig } from "nitro";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export default defineConfig({
  hooks: {
    async compiled(nitro) {
      // Wrangler requires the Durable Object class on the actual Worker entrypoint.
      const workerEntry = join(nitro.options.output.serverDir, "index.mjs");
      const contents = await readFile(workerEntry, "utf8");
      await writeFile(
        workerEntry,
        `${contents}\nexport { ChatRoom, BossHelpRoom } from "./_ssr/ssr.mjs";\n`,
        "utf8",
      );
    },
  },
});
