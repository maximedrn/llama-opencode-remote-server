/** Hardware backends supported by this project. */
const HardwareBackends = {
  amd: "amd",
  cpu: "cpu",
  nvidia: "nvidia",
} as const;

/** Hardware backends and every host constraint attached to them. */
const Backends = {
  fallback: HardwareBackends.cpu,
  kernelVersionFile: "/proc/version",
  list: Object.values(HardwareBackends),
  messages: {
    amdNeedsLinux:
      "AMD ROCm containers require a Linux Docker host. Use --backend " +
      `${HardwareBackends.cpu} on Windows/macOS.`,
    amdNeedsNativeKernel:
      "AMD ROCm Docker is not supported by this project under WSL2. " +
      `Use a native Linux host or --backend ${HardwareBackends.cpu}.`,
    missingRocmDevice: (device: string): string =>
      `Missing ${device}; ROCm device access is not ready on the Linux host.`,
    nvidiaNotOnMacos:
      "NVIDIA CUDA containers are not available on macOS. " +
      `Use --backend ${HardwareBackends.cpu}.`,
    unsupported: (backend: string): string =>
      `Unsupported backend: ${backend}. Use ${HardwareBackends.cpu}, ` +
      `${HardwareBackends.nvidia}, or ${HardwareBackends.amd}.`,
  },
  /** Device nodes ROCm needs from the host. */
  rocmDevices: ["/dev/kfd", "/dev/dri"],
  /** `/proc/version` marker that identifies a WSL2 kernel. */
  wslMarker: "microsoft",
} as const;

export { Backends, HardwareBackends };
