// biome-ignore lint/correctness/noNodejsModules: neither Effect nor Bun exposes the platform name, so this is the only Node import of the codebase.
import process from "node:process";
import { Host } from "@app/host/host.constants.ts";
import type { HostThreads } from "@app/host/host.interface.ts";

const currentPlatform = (): NodeJS.Platform => process.platform;

/** Bun implements the Web `navigator`, so no Node import is needed here. */
const logicalCores = (): number => navigator.hardwareConcurrency;

const currentThreads = (): HostThreads => ({
  batch: Math.max(Host.minimumThreads, logicalCores()),
  generation: Math.max(
    Host.minimumThreads,
    Math.floor(logicalCores() / Host.threadDivisor),
  ),
});

export { currentPlatform, currentThreads };
