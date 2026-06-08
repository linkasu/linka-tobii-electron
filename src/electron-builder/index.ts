import { dirname, join } from "path";

function packageRoot(): string {
  return join(dirname(__dirname), "..");
}

export function getTobiiExtraResources() {
  const root = packageRoot();
  return [
    {
      from: join(root, "tools", "tobiifree-helper"),
      to: "extraResources/bin/tobiifree-helper",
      filter: ["**/*"]
    },
    {
      from: join(root, "tools", "tobiifree-sdk"),
      to: "extraResources/bin/tobiifree-sdk",
      filter: ["**/*"]
    },
    {
      from: join(root, "node_modules", "usb"),
      to: "extraResources/bin/node_modules/usb",
      filter: ["**/*"]
    },
    {
      from: join(root, "node_modules", "node-gyp-build"),
      to: "extraResources/bin/node_modules/node-gyp-build",
      filter: ["**/*"]
    },
    {
      from: join(root, "extraResources", "bin"),
      to: "extraResources/bin",
      filter: ["EyeLog.exe", "*.dll", "*.config"]
    }
  ];
}

export function getTobiiAsarUnpackPatterns() {
  return [
    "node_modules/@linka/tobii-electron/native/tobiifree-native/**/*.node",
    "node_modules/@linka/tobii-electron/node_modules/@linka/tobiifree-native/**/*.node",
    "node_modules/@linka/tobiifree-native/**/*.node"
  ];
}
