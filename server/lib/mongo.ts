import mongoose from "mongoose";

let connectionPromise: Promise<typeof mongoose> | undefined;

export async function ensureLegacyMongoConnection(uri: string): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  connectionPromise ??= mongoose.connect(uri).catch((error: unknown) => {
    connectionPromise = undefined;
    throw error;
  });
  await connectionPromise;
}
