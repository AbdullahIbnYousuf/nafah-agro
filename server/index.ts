import mongoose from "mongoose";
import { createApp } from "./app.js";
import { getBackendEnv } from "./env.js";

const env = getBackendEnv();
const app = createApp({ env });

mongoose
  .connect(env.MONGO_URI)
  .then(() => {
    console.log(
      JSON.stringify({
        time: new Date().toISOString(),
        level: "info",
        message: "Legacy MongoDB connected",
      }),
    );
    app.listen(env.PORT, () =>
      console.log(
        JSON.stringify({
          time: new Date().toISOString(),
          level: "info",
          message: `Server running on port ${env.PORT}`,
        }),
      ),
    );
  })
  .catch((error: unknown) => {
    console.error(
      JSON.stringify({
        time: new Date().toISOString(),
        level: "fatal",
        message: "MongoDB connection error",
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    process.exit(1);
  });
