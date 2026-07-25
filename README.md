# Quicksheet

A lightweight, fast-opening spreadsheet widget built with Tauri and vanilla TypeScript. Meant for quick scratch calculations — paste a list, sum it, done — without waiting for Excel to load.

## Features

- Dynamic grid with a hand-written formula engine: `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `ROUND`, `IF`, `SUMIF`, `COUNTIF`, arithmetic, comparisons, cell refs and ranges.
- Paste tab-separated data straight from real Excel.
- Formula bar, zoom (Ctrl+scroll / Ctrl+±/0), column/row resize with double-click autofit.
- Drag-fill (fill handle) that adjusts relative references like Excel.
- Click/drag range selection, whole-row/column selection via headers, Ctrl+C copies to the system clipboard.
- Configurable global keyboard shortcut to show/hide the window, system tray icon.

## Development

```
npm install
npm run tauri dev
```

## Build

```
npm run tauri build
```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
