import { createAppContext } from "../app-context";
import { loadConfig } from "../config";

const run = async (): Promise<void> => {
  const ctx = await createAppContext(loadConfig());
  const result = await ctx.riskKeeper.runOnce();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result));
};

void run();
