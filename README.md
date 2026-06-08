# @linka/tobii-electron

Shared Electron Tobii integration for LINKa apps.

## Exports

- `@linka/tobii-electron/main` - Electron main-process trackers and `BackWatch`.
- `@linka/tobii-electron/renderer` - renderer `PageWatcher` for DOM eye targets.
- `@linka/tobii-electron/electron-builder` - helper functions for `electron-builder` resources.
- `@linka/tobii-electron/types` - shared public types.

## Packaging

Consumers must include package helper resources in `electron-builder.extraResources` and unpack native addon files when needed. Use `getTobiiExtraResources()` and `getTobiiAsarUnpackPatterns()` from `@linka/tobii-electron/electron-builder`.
