import { Host } from "@app/cli/system/host/host.constants.ts";
import type { HostApi } from "@app/cli/system/host/host.interface.ts";
import {
  currentPlatform,
  currentThreads,
} from "@app/cli/system/host/host.utils.ts";
import { Config, Effect } from "effect";

/** `HOME`, then `USERPROFILE`, then the current directory. */
const homeConfig: Config.Config<string> = Config.string(Host.homeVariable).pipe(
  Config.orElse(
    (): Config.Config<string> => Config.string(Host.homeVariableWindows),
  ),
  Config.withDefault(Host.homeFallback),
);

class HostService extends Effect.Service<HostService>()("HostService", {
  sync: (): HostApi => {
    const platform: NodeJS.Platform = currentPlatform();
    return {
      homeDirectory: Effect.orDie(homeConfig),
      isPlatform: (candidate: string): boolean => candidate === platform,
      platform,
      threads: currentThreads(),
    };
  },
}) {}

export { HostService };
