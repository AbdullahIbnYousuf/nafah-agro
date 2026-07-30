import { createApp } from "./server/app.js";
import { getBackendEnv } from "./server/env.js";

const app = createApp({ env: getBackendEnv() });

export default app;
