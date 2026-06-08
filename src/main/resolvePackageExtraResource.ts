import { app } from "electron";
import { dirname, join } from "path";

export function resolvePackageExtraResource(...segments: string[]): string {
  if (!app.isPackaged) {
    const packageRoot = join(dirname(__dirname), "..");
    const [first, second, ...rest] = segments;
    if (first === "bin" && second === "tobiifree-helper") {
      return join(packageRoot, "tools", "tobiifree-helper", ...rest);
    }
    if (first === "bin" && second === "tobiifree-sdk") {
      return join(packageRoot, "tools", "tobiifree-sdk", ...rest);
    }
    if (first === "bin" && second === "node_modules") {
      return join(packageRoot, "node_modules", ...rest);
    }
    return join(packageRoot, "extraResources", ...segments);
  }

  const basePath = join(process.resourcesPath, "extraResources");

  return join(basePath, ...segments);
}
