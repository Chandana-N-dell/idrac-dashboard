# AGENTS.md -- iDRAC Hardware Inventory Dashboard

Project conventions, development notes, and quick-reference for AI agents working on this codebase.

## Environment

- **Python**: 3.8+ required. Use system Python or a portable install.
- **OS**: Windows (also works on Linux/macOS)
- **Dependencies**: flask, requests, urllib3, openpyxl (listed in `requirements.txt`)

## Run Commands

```bash
cd idrac-dashboard

# Install dependencies
pip install -r requirements.txt

# Syntax check (fast, no server needed)
python -c "import py_compile; py_compile.compile('app.py', doraise=True); print('OK')"

# Start the server (debug mode, auto-reloads on file changes)
python app.py

# Server URL
# http://localhost:5000
```

## File Map

| File | Lines | Purpose |
|------|-------|---------|
| `app.py` | ~1280 | Flask backend: Redfish proxy, inventory parsers, BOM comparison, Excel parsing |
| `templates/index.html` | ~230 | Single-page HTML (login, dashboard, BOM upload, comparison results) |
| `static/css/style.css` | ~465 | Dark theme, responsive layout, comparison badges |
| `static/js/app.js` | ~720 | Frontend: fetch, render tables, search/sort/filter, BOM upload, comparison display |
| `requirements.txt` | 4 | flask, requests, urllib3, openpyxl |

## Key Backend Functions (app.py)

### Redfish / Inventory
- `_safe(data, *keys)` -- safely traverse nested dicts
- `_parse_system(data)` -- parse `/Systems/System.Embedded.1`
- `_parse_processors(data, base_url, session)` -- CPUs + GPUs from `/Processors`
- `_get_processor_slot(p)` -- slot from Dell OEM / Location / Socket / Id
- `_parse_memory(data)` -- DIMMs from `/Memory`
- `_parse_storage(data, base_url, session)` -- RAID controllers + drives
- `_extract_perc_part_number(sc)` -- PERC PN from multiple Dell OEM paths
- `_parse_network(data, base_url, session)` -- NICs + ports
- `_parse_power(data)` -- PSUs
- `_parse_fans(data)` -- fans from Thermal
- `_parse_gpu_pcie(data, base_url, session, known_gpu_serials)` -- PCIe GPUs (deduped)
- `_parse_firmware(data)` -- firmware inventory
- `fetch_inventory(host, username, password)` -- orchestrator, runs all parsers via ThreadPoolExecutor

### BOM Comparison
- `_normalize_pn(pn)` -- strip, uppercase, collapse whitespace
- `_pn_match_keys(pn_norm)` -- generate match keys (original, strip leading zeros, remove dashes, both)
- `_resolve_categories(comp_type_raw)` -- map user-friendly type names to inventory categories
- `_parse_excel(file_stream, filename)` -- parse uploaded Excel: find sheet, locate headers, extract rows
- `compare_inventory(excel_rows, inventory)` -- match Excel rows against inventory using dual PN + fuzzy matching

### Flask Routes
- `POST /api/inventory` -- fetch inventory from iDRAC
- `POST /api/export-csv` -- export inventory as CSV
- `POST /api/compare` -- upload Excel BOM, compare against inventory
- `POST /api/export-comparison-csv` -- export comparison results as CSV
- `GET /api/download-template` -- download sample BOM Excel template

## Key Design Decisions

### Part Number Matching
- Both "ASSY DPN" and "Part Number" columns from Excel are checked
- `_pn_match_keys()` generates 4 variants per PN: original, no leading zeros, no dashes, both
- Inventory index maps every variant to its inventory rows
- Excel PNs also expand to all variants; any overlap = match
- Example: inventory `0VJWVJ` -> keys `{0VJWVJ, VJWVJ}`, Excel `VJWVJ` -> keys `{VJWVJ}`, overlap on `VJWVJ`

### Excel Sheet Detection (priority order)
1. Sheet named "Lab Build Sheet" (case-insensitive)
2. Any sheet with an "ASSY DPN" or "Part Number" header in first 30 rows
3. Active sheet as last resort
4. Error if no sheet has either column

### Component Type in Comparison Results
- Shows inventory `name` field (Name/Model) from matched items, not the Excel component type
- Deduplicates names: if one name is a prefix/substring of another, only the shorter base name is kept
- Example: keeps "Broadcom BCM57412 NIC", drops "Broadcom BCM57412 NIC Port NIC.Slot.5-1"
- Falls back to Excel component type for NOT_FOUND rows

### Match Status vs Qty Status (separate columns)
- **Match Status**: only `MATCHED` or `NOT_FOUND` (was the part number found at all?)
- **Qty Status**: `QTY_MATCH`, `QTY_MISMATCH`, or `N/A` (does the count match?)
- When no expected qty in Excel: defaults to `QTY_MATCH` with detail "Detected N (no expected qty specified)"

## CSS Conventions
- CSS variables defined in `:root` (`--bg`, `--surface`, `--accent`, `--green`, `--red`, `--amber`)
- Dark theme throughout
- `.top-row` flex container: system info (left) + BOM upload (right)
- Comparison badge classes: `.cmp-matched`, `.cmp-not-found`, `.cmp-qty-match`, `.cmp-qty-mismatch`
- Row highlight classes: `.row-matched` (green left border), `.row-not-found` (red left border)

## Frontend Conventions (app.js)
- IIFE pattern `(function() { "use strict"; ... })();`
- All DOM refs cached at top
- State variables: `inventoryData`, `comparisonData`, sort/filter state
- Helper functions: `esc()` for HTML escaping, `statusBadge()`, `qtyStatusBadge()`, `catBadge()`
- Separate render pipelines for inventory table and comparison table
- Both support flat view and grouped view with toggle
