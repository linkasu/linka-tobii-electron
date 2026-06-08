import { dirname, join } from "path";
import { createRequire } from "module";

const requireFromPackage = createRequire(__filename);

function packageRoot(): string {
  return join(dirname(__dirname), "..");
}

function dependencyRoot(name: string): string {
  return dirname(requireFromPackage.resolve(`${name}/package.json`, {
    paths: [packageRoot(), process.cwd()]
  }));
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
      from: dependencyRoot("usb"),
      to: "extraResources/bin/node_modules/usb",
      filter: ["**/*"]
    },
    {
      from: dependencyRoot("node-gyp-build"),
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
    "node_modules/@linkasu/tobii-electron/native/tobiifree-native/**/*.node",
    "node_modules/@linkasu/tobii-electron/node_modules/@linka/tobiifree-native/**/*.node",
    "node_modules/@linka/tobiifree-native/**/*.node"
  ];
}
