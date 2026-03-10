import { cleanupE2EData } from "./cleanup";

export default async function globalTeardown() {
  if (process.env.E2E_CLEANUP === "0") {
    return;
  }

  await cleanupE2EData();
}
