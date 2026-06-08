# @linkasu/tobii-electron

Shared Electron Tobii integration for LINKa apps.

## Exports

- `@linkasu/tobii-electron/main` - Electron main-process trackers and `BackWatch`.
- `@linkasu/tobii-electron/renderer` - renderer `PageWatcher` for DOM eye targets.
- `@linkasu/tobii-electron/electron-builder` - helper functions for `electron-builder` resources.
- `@linkasu/tobii-electron/types` - shared public types.

## Packaging

Consumers must include package helper resources in `electron-builder.extraResources` and unpack native addon files when needed. Use `getTobiiExtraResources()` and `getTobiiAsarUnpackPatterns()` from `@linkasu/tobii-electron/electron-builder`.
