import { createApp } from "./app.js";
import { getBackendEnv } from "./env.js";

const env = getBackendEnv();
const app = createApp({ env });

app.listen(env.PORT, () =>
  console.log(
    JSON.stringify({
      time: new Date().toISOString(),
      level: "info",
      message: `Server running on port ${env.PORT}`,
    }),
  ),
);
