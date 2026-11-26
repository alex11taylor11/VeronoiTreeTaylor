# VeronoiTreeTaylor

A single-page tool for quickly making colourful, circular Voronoi treegraphs.

- **Left half:** a table with up to 3 levels (Level 1 · Level 2 · Level 3) and a Value.
- **Right half:** the circular Voronoi treegraph, drawn when you press **Generate**.

## Use it

Open `index.html` in a browser (double-click it). No build step or internet connection is needed: the libraries live in `lib/`.

- Leave Level 2 / Level 3 blank for shallower branches. A blank value counts as 1.
- Paste rows straight from Excel / Google Sheets into any cell (tab-separated columns fill across).
- `Enter` moves down a row; `Ctrl/Cmd + Enter` generates.
- **New layout** reshuffles the cell arrangement for the same data.
- Pick a palette and label style, toggle values, then **Download SVG / PNG**.
- Your table is saved in the browser automatically.

Built with [d3](https://d3js.org) and [d3-voronoi-treemap](https://github.com/Kcnarf/d3-voronoi-treemap).
