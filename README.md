# iDRAC Hardware Inventory Dashboard

A web-based dashboard that connects to Dell iDRAC via the Redfish API, fetches complete hardware inventory, displays it in a searchable/sortable table, and supports BOM (Bill of Materials) comparison by uploading Excel files.

## Quick Start

### Prerequisites
- **Python 3.8+** installed and available in PATH (`python` or `python3`)
- Or use a portable Python -- just replace `python` below with the full path to your `python.exe`

### Setup & Run

```bash
cd idrac-dashboard

# Install dependencies
pip install -r requirements.txt

# Run the server
python app.py
```

Then open **http://localhost:5000** in your browser.

---

## Architecture Overview

```
 Browser (HTML/CSS/JS)
    |
    |  POST /api/inventory  { host, username, password }
    v
 Flask Backend (app.py)
    |
    |  HTTPS + Basic Auth  (self-signed certs accepted)
    v
 Dell iDRAC  (Redfish API v1)
```

- **The browser never talks directly to iDRAC.** Flask acts as a secure proxy.
- **Credentials live only in memory** for the duration of the HTTP request, then are discarded.
- **Parallel fetching**: the backend queries ~9 Redfish endpoints concurrently using `ThreadPoolExecutor`.

---

## Project Structure

```
idrac-dashboard/
├── app.py                  # Flask backend (~1280 lines) – Redfish proxy, inventory parsers, BOM comparison
├── requirements.txt        # Python dependencies: flask, requests, urllib3, openpyxl
├── templates/
│   └── index.html          # Single-page HTML template
├── static/
│   ├── css/
│   │   └── style.css       # Dark-theme responsive stylesheet
│   └── js/
│       └── app.js          # Client-side logic (fetch, render, sort, search, export, BOM comparison)
├── README.md               # This file
└── AGENTS.md               # Project conventions and development notes
```

---

## Redfish API Endpoints

| # | Endpoint | Purpose |
|---|----------|---------|
| 1 | `/redfish/v1/Systems/System.Embedded.1` | System model, service tag, BIOS version, memory/CPU summary |
| 2 | `/redfish/v1/Systems/System.Embedded.1/Processors` | CPU details (model, cores, threads, speed) |
| 3 | `/redfish/v1/Systems/System.Embedded.1/Memory` | DIMM details (size, speed, slot, part number) |
| 4 | `/redfish/v1/Systems/System.Embedded.1/Storage` | RAID/HBA controllers + physical drives |
| 5 | `/redfish/v1/Chassis/System.Embedded.1/NetworkAdapters` | NIC adapters and ports |
| 6 | `/redfish/v1/Chassis/System.Embedded.1/Power` | Power supplies |
| 7 | `/redfish/v1/Chassis/System.Embedded.1/Thermal` | Fans |
| 8 | `/redfish/v1/Systems/System.Embedded.1/PCIeDevices` | GPUs, accelerators, and other PCIe devices |
| 9 | `/redfish/v1/UpdateService/FirmwareInventory` | Firmware versions for all components |

---

## Features

### Hardware Inventory
- **Full hardware inventory**: System, CPUs, GPUs, Memory, Storage (controllers + drives), NICs, PSUs, Fans, PCIe devices, Firmware
- **GPU detection**: Identifies GPUs via ProcessorType, keywords, and Video Id; categorized as "Accelerator"
- **GPU deduplication**: PCIe GPU fetch skips GPUs already captured from `/Processors`
- **PERC part numbers**: Searches multiple Dell OEM paths for RAID controller part numbers
- **Firmware versions** per component from UpdateService
- **Self-signed certificate handling** (HTTPS verification disabled for iDRAC)

### Inventory Table
| Column | Description |
|--------|-------------|
| Category | Component group (System, Processor, Memory, etc.) |
| Type | Sub-type (CPU, DDR5, SSD, NIC, etc.) |
| Name / Model | Human-readable identifier |
| Slot / Location | Physical location |
| Quantity | Count |
| Serial Number | Component serial |
| Part Number | Dell/vendor part number |
| Firmware | Firmware/BIOS/microcode version |
| Status | Health status (OK/Warning/Critical) |

### UI/UX
- **Sortable columns** -- click any header to sort ascending/descending
- **Full-text search** -- filters across all fields in real time
- **Category filter** dropdown
- **Grouped view** -- toggle to group components by category with collapsible sections
- **Color-coded status badges** -- OK (green), Warning (amber), Critical (red)
- **Category badges** -- color-coded chips per category
- **System info table** -- Model, Service Tag, BIOS, Memory, CPU at top-left
- **CSV export** -- exports the current filtered view
- **Dark theme** responsive design

### BOM Comparison
- **Upload Excel (.xlsx)** with expected part numbers to compare against live inventory
- **Dual part number matching**: checks both "ASSY DPN" and "Part Number" columns from Excel
- **Smart sheet detection**: prefers "Lab Build Sheet" tab, falls back to scanning all sheets for a PN header
- **Fuzzy PN matching**: strips leading zeros and dashes (`0VJWVJ` matches `VJWVJ`)
- **Component type from inventory**: shows the inventory Name/Model (deduplicated) instead of Excel type
- **Name deduplication**: if one name is a prefix of another, only the shorter base name is shown

### Comparison Table
| Column | Description |
|--------|-------------|
| Component Type | Name/Model from system inventory (or Excel type if not found) |
| ASSY DPN | ASSY DPN value from Excel |
| Part Number | Part Number value from Excel |
| System Part Number(s) | Matched part numbers from live inventory |
| Match Status | MATCHED or NOT_FOUND |
| Detected Qty | Number of matching inventory items |
| Expected Qty | Quantity from Excel (if provided) |
| Qty Status | QTY_MATCH (green) or QTY_MISMATCH (amber) |
| Detail | Explanation of mismatches |

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/inventory` | Fetch inventory from iDRAC (accepts host/username/password) |
| POST | `/api/export-csv` | Export inventory as CSV |
| POST | `/api/compare` | Upload Excel BOM + inventory JSON, returns comparison results |
| POST | `/api/export-comparison-csv` | Export comparison results as CSV |
| GET | `/api/download-template` | Download sample BOM Excel template |

---

## Excel BOM Format

The Excel file should have:
- A sheet named **"Lab Build Sheet"** (preferred) -- or any sheet with a recognizable header
- A header row (within first 30 rows) containing at least one of:
  - **ASSY DPN** (or ASSY_DPN, ASSYDPN)
  - **Part Number** (or Part_Number, Part No, Part#, PN)
- Optional companion columns: **Component Type**, **Quantity**, **Slot**, **Description**

Both ASSY DPN and Part Number are checked against inventory. A match on either is sufficient.

### Part Number Matching Logic
1. Case-insensitive comparison
2. Leading zeros stripped: `0VJWVJ` matches `VJWVJ`
3. Hyphens/dashes removed: `PH-001M0D` matches `PH001M0D`
4. Combined: leading zeros + dashes both stripped

---

## Error Handling

| Scenario | Backend Response | Frontend Behavior |
|----------|-----------------|-------------------|
| iDRAC unreachable | 502 + `UNREACHABLE` code | Red error box on login form |
| Auth failure | 401 + `AUTH_FAILED` code | Red error box on login form |
| Partial data missing | 200 with `warnings[]` | Yellow warnings box below table |
| Invalid form input | 400 | Inline validation message |
| No PN column in Excel | 400 | Error message listing available sheets |
| No data rows in Excel | 400 | Error message with header row info |
