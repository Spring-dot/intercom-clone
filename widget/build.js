require("dotenv/config");
const path = require("node:path");
const esbuild = require("esbuild");

const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY ?? "";
const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? "";

if (!pusherKey || !pusherCluster) {
  console.warn(
    "[build:widget] NEXT_PUBLIC_PUSHER_KEY / NEXT_PUBLIC_PUSHER_CLUSTER are not set in .env -- " +
      "the built widget.js will load but won't receive real-time messages until you rebuild with real values."
  );
}

esbuild
  .build({
    entryPoints: [path.join(__dirname, "src/index.ts")],
    outfile: path.join(__dirname, "../public/widget.js"),
    bundle: true,
    minify: true,
    format: "iife",
    platform: "browser",
    target: ["es2018"],
    define: {
      __PUSHER_KEY__: JSON.stringify(pusherKey),
      __PUSHER_CLUSTER__: JSON.stringify(pusherCluster),
    },
  })
  .then(() => {
    console.log("[build:widget] built public/widget.js");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
