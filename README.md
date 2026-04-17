# iDRAC Hardware Inventory Dashboard

A web-based dashboard that connects to Dell iDRAC via the Redfish API, fetches complete hardware inventory, displays it in a searchable/sortable table, supports BOM (Bill of Materials) comparison by uploading Excel files, and includes real-time system health monitoring with fan details.

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

## Team Collaboration & Network Access

### Access from Network IP

The dashboard is configured to run on all network interfaces, allowing team members to access it from their machines.

**Find your network IP:**
```powershell
ipconfig
```
Look for "IPv4 Address" (e.g., 192.168.1.100)

**Access URLs:**
- **Local**: `http://localhost:5000`
- **Network**: `http://YOUR_IP:5000` (e.g., `http://192.168.1.100:5000`)

**Firewall Configuration (if needed):**
```powershell
New-NetFirewallRule -DisplayName "iDRAC Dashboard" -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow
```

### Git Setup for Team Collaboration

The project uses Git for version control. Team members can collaborate by:

1. **Clone the repository:**
```powershell
git clone <repository-url>
cd idrac-dashboard
```

2. **Install dependencies:**
```powershell
pip install -r requirements.txt
pip install beautifulsoup4==4.12.3
```

3. **Run the server:**
```powershell
python app.py
```

4. **Git workflow for changes:**
```powershell
# Pull latest changes
git pull origin main

# Make changes to code

# Commit changes
git add .
git commit -m "Description of changes"

# Push to remote
git push origin main
```

**Important Notes:**
- Server must be running on the host machine for team access
- Team members must be on the same network
- Each team member needs their own Python environment
- iDRAC credentials are entered per session (not stored in code)
- Changes to code require restarting the server

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

### System Health Monitoring
- **Real-time health status**: Displays system health as Healthy, Warning, or Critical
- **Auto-refresh**: Health status updates every 30 seconds automatically
- **iDRAC-based**: Uses iDRAC's reported health status for accuracy
- **Immediate fetch**: Health status fetched immediately after login

### Fan Details
- **Fan tier classification**: Gold, Silver, or Platinum based on server model
- **Fan descriptions**: Fetched from iDRAC Hardware Inventory page
- **Speed monitoring**: Displays fan RPM in real-time
- **Auto-refresh**: Fan details update every 30 seconds
- **Tier badge**: Color-coded badge showing overall fan tier

**Fan Tier Classification:**
- **Platinum**: R750, R760, R7515, R7615, R840, R850, R960, R960XA
- **Gold**: R640, R650, R6515, R6525, R740, R7415, R7425
- **Silver**: All other models

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
- **Fan details table** -- Fan descriptions, RPM, and tier badge at top-middle
- **System health card** -- Real-time health status with auto-refresh at top-right
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
| POST | `/api/health` | Fetch system health metrics (accepts host/username/password) |
| POST | `/api/fans` | Fetch fan details from iDRAC Hardware Inventory (accepts host/username/password) |
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
