import { defineConfig } from "nitro";

export default defineConfig({
  cloudflare: {
    wrangler: {
      d1_databases: [
        {
          binding: "DB",
          database_name: "space-survivors-db",
          database_id: "8864837b-152c-46d0-87d1-c705940be3fe",
        },
      ],
    },
  },
});
