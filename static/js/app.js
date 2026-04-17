/**
 * iDRAC Hardware Inventory Dashboard – Frontend Logic
 * ====================================================
 * Handles: login flow, inventory fetch, table rendering,
 * search, sort, filter, category grouping, and CSV export.
 */

(function () {
    "use strict";

    // ── DOM refs ──────────────────────────────────────────────────────
    const loginSection     = document.getElementById("login-section");
    const loadingSection   = document.getElementById("loading-section");
    const dashboardSection = document.getElementById("dashboard-section");
    const sidebar          = document.querySelector(".sidebar");
    const loginForm        = document.getElementById("login-form");
    const loginError       = document.getElementById("login-error");
    const btnConnect       = document.getElementById("btn-connect");
    const btnText          = btnConnect.querySelector(".btn-text");
    const btnSpinner       = btnConnect.querySelector(".btn-spinner");
    const loadingStatus    = document.getElementById("loading-status");
    const connBadge        = document.getElementById("connection-badge");
    const summaryBody      = document.getElementById("summary-body");
    const searchInput      = document.getElementById("search-input");
    const filterCategory   = document.getElementById("filter-category");
    const tableContainer   = document.getElementById("table-container");
    const groupedContainer = document.getElementById("grouped-container");
    const inventoryBody    = document.getElementById("inventory-body");
    const btnToggleGroup   = document.getElementById("btn-toggle-group");
    const btnExportCsv     = document.getElementById("btn-export-csv");
    const btnDisconnect    = document.getElementById("btn-disconnect");
    const warningsBox      = document.getElementById("warnings-box");
    const pageInterfaceComparison = document.getElementById("page-interface-comparison");
    const btnRunInterfaceComparison = document.getElementById("btn-run-interface-comparison");
    const interfaceCmpSection = document.getElementById("interface-comparison-section");
    const interfaceCmpSummary = document.getElementById("interface-cmp-summary");
    const interfaceCmpBody = document.getElementById("interface-cmp-body");
    const interfaceCmpError = document.getElementById("interface-comparison-error");

    // ── Category → CSS class mapping ─────────────────────────────────
    const CAT_CLASS = {
        "System":             "cat-system",
        "Processor":          "cat-processor",
        "Memory":             "cat-memory",
        "Storage Controller": "cat-storage",
        "Storage Drive":      "cat-storage",
        "Network Adapter":    "cat-network",
        "Network Port":       "cat-network",
        "Network":            "cat-network",
        "Power Supply":       "cat-power",
        "Fan":                "cat-fan",
        "Accelerator":        "cat-accelerator",
        "GPU / Accelerator":  "cat-accelerator",
        "PCIe Device":        "cat-pcie",
        "Firmware":           "cat-firmware",
    };

    // ── State ─────────────────────────────────────────────────────────
    let inventoryData = [];   // full array of row objects from server
    let sortCol       = "";
    let sortDir       = "asc";
    let isGrouped     = false;
    let healthRefreshInterval = null;  // auto-refresh interval for health

    // ── Utility ───────────────────────────────────────────────────────
    function show(el)  { el.classList.remove("hidden"); }
    function hide(el)  { el.classList.add("hidden"); }
    function esc(s)    { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

    function statusHtml(val) {
        if (!val || val === "N/A") return '<span class="status-na">N/A</span>';
        const v = String(val).toLowerCase();
        if (v === "ok" || v === "healthy")            return '<span class="status-ok">OK</span>';
        if (v === "warning" || v === "degraded")      return '<span class="status-warning">Warning</span>';
        if (v === "critical" || v === "error")         return '<span class="status-error">Critical</span>';
        return `<span class="status-na">${esc(val)}</span>`;
    }

    function catBadge(cat) {
        const cls = CAT_CLASS[cat] || "";
        return `<span class="cat-badge ${cls}">${esc(cat)}</span>`;
    }

    // ── Login & Fetch ─────────────────────────────────────────────────
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        hide(loginError);

        const host     = document.getElementById("host").value.trim();
        const username = document.getElementById("username").value.trim();
        const password = document.getElementById("password").value;

        if (!host || !username || !password) {
            loginError.textContent = "All fields are required.";
            show(loginError);
            return;
        }

        // UI → loading
        btnConnect.disabled = true;
        hide(btnText);
        show(btnSpinner);
        hide(loginSection);
        show(loadingSection);
        loadingStatus.textContent = "Connecting to iDRAC and querying Redfish endpoints...";
        connBadge.className = "badge badge-idle";
        connBadge.textContent = "Connecting...";

        try {
            const resp = await fetch("/api/inventory", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ host, username, password }),
            });

            const data = await resp.json();

            if (!resp.ok) {
                throw { status: resp.status, message: data.error || "Unknown error", code: data.code };
            }

            inventoryData = data.inventory || [];
            renderDashboard(data);

            // Auto-fetch health status after successful login
            fetchHealthMetrics(true);

        } catch (err) {
            hide(loadingSection);
            sidebar.classList.remove("visible");
            // Clear health auto-refresh
            if (healthRefreshInterval) {
                clearInterval(healthRefreshInterval);
                healthRefreshInterval = null;
            }
            show(loginSection);

            let msg = "An unexpected error occurred.";
            if (err.code === "UNREACHABLE") {
                msg = err.message || "Cannot reach iDRAC. Check the IP address.";
            } else if (err.code === "AUTH_FAILED" || err.status === 401) {
                msg = err.message || "Authentication failed. Check credentials.";
            } else if (err.message) {
                msg = err.message;
            }
            loginError.textContent = msg;
            show(loginError);
            connBadge.className = "badge badge-error";
            connBadge.textContent = "Error";
        } finally {
            btnConnect.disabled = false;
            show(btnText);
            hide(btnSpinner);
        }
    });

    // ── Render Dashboard ──────────────────────────────────────────────
    function renderDashboard(data) {
        hide(loadingSection);
        show(dashboardSection);
        sidebar.classList.add("visible");
        connBadge.className = "badge badge-ok";
        connBadge.textContent = "Connected";

        // System info table (left-aligned)
        const s = data.summary || {};
        const rows = [
            { label: "Model",           value: s.model },
            { label: "Service Tag",     value: s.serviceTag },
            { label: "Serial Number",   value: s.serialNumber },
            { label: "BIOS Version",    value: s.biosVersion },
            { label: "Power State",     value: s.powerState },
            { label: "Total Memory",    value: s.totalMemoryGiB ? `${s.totalMemoryGiB} GiB` : "N/A" },
            { label: "Processor",       value: s.processorModel },
            { label: "CPU Count",       value: s.processorCount },
            { label: "Components",      value: s.totalComponents },
        ];
        summaryBody.innerHTML = rows.map(r =>
            `<tr><td class="si-label">${esc(r.label)}</td><td class="si-value">${esc(String(r.value ?? "N/A"))}</td></tr>`
        ).join("");

        // Populate category filter
        const cats = [...new Set(inventoryData.map(r => r.category))].sort();
        filterCategory.innerHTML = '<option value="">All Categories</option>' +
            cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");

        // Warnings
        if (s.warnings && s.warnings.length) {
            warningsBox.innerHTML = `<h4>Warnings</h4><ul>${s.warnings.map(w => `<li>${esc(w)}</li>`).join("")}</ul>`;
            show(warningsBox);
        } else {
            hide(warningsBox);
        }

        renderView();

        fetchHealthMetrics(true);

        // Fetch fan details from component inventory
        fetchFanDetailsFromComponentInventory();
    }

    // ── Filtering & Sorting ───────────────────────────────────────────
    function getFiltered() {
        const q   = searchInput.value.toLowerCase().trim();
        const cat = filterCategory.value;

        let rows = inventoryData;
        if (cat) rows = rows.filter(r => r.category === cat);
        if (q)   rows = rows.filter(r =>
            Object.values(r).some(v => typeof v === "string" && v.toLowerCase().includes(q)) ||
            String(r.quantity).includes(q)
        );

        if (sortCol) {
            rows = [...rows].sort((a, b) => {
                let va = a[sortCol] ?? "";
                let vb = b[sortCol] ?? "";
                if (sortCol === "quantity") { va = Number(va) || 0; vb = Number(vb) || 0; }
                else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
                if (va < vb) return sortDir === "asc" ? -1 : 1;
                if (va > vb) return sortDir === "asc" ? 1 : -1;
                return 0;
            });
        }
        return rows;
    }

    // ── Render Table (flat) ───────────────────────────────────────────
    function renderTable(rows) {
        if (!rows.length) {
            inventoryBody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted);">No matching components found.</td></tr>';
            return;
        }
        inventoryBody.innerHTML = rows.map(r => {
            // Add fan tier badge for Fan category
            const fanTier = r.category === "Fan" && r.extra && r.extra.FanTier
                ? `<span class="fan-tier-badge tier-${r.extra.FanTier.toLowerCase()}">${esc(r.extra.FanTier)}</span>`
                : "";
            const nameWithTier = fanTier ? `${fanTier} ${esc(r.name)}` : esc(r.name);

            // Add fan RPM information for Fan category
            let fanInfo = "";
            if (r.category === "Fan" && r.extra) {
                const rpm = r.extra.ReadingRPM;
                if (rpm && rpm !== "N/A" && r.type !== "Debug Info") {
                    fanInfo = `<br><small class="fan-rpm">${rpm} ${r.extra.ReadingUnits || "RPM"}</small>`;
                }
                // Show debug info for debug entries
                if (r.type === "Debug Info" && r.extra.ThermalPath) {
                    fanInfo = `<br><small class="debug-info">Path: ${r.extra.ThermalPath}</small>`;
                    if (r.extra.AvailableKeys) {
                        fanInfo += `<br><small class="debug-info">Keys: ${r.extra.AvailableKeys.join(", ")}</small>`;
                    }
                }
            }

            return `<tr>
            <td>${catBadge(r.category)}</td>
            <td>${esc(r.type)}</td>
            <td>${nameWithTier}${fanInfo}</td>
            <td>${esc(r.slot)}</td>
            <td>${esc(String(r.quantity))}</td>
            <td>${esc(r.serial)}</td>
            <td>${esc(r.part_number)}</td>
            <td>${esc(r.firmware)}</td>
            <td>${statusHtml(r.status)}</td>
        </tr>`;
        }).join("");
    }

    // ── Render Grouped View ───────────────────────────────────────────
    function renderGrouped(rows) {
        const groups = {};
        rows.forEach(r => {
            if (!groups[r.category]) groups[r.category] = [];
            groups[r.category].push(r);
        });

        const cats = Object.keys(groups).sort();
        groupedContainer.innerHTML = cats.map(cat => {
            const items = groups[cat];
            const cls = CAT_CLASS[cat] || "";
            return `
            <div class="group-section">
                <div class="group-header" data-group="${esc(cat)}">
                    <h4><span class="cat-badge ${cls}">${esc(cat)}</span> <span class="group-count">${items.length}</span></h4>
                    <svg class="group-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
                <div class="group-body">
                    <table>
                        <thead><tr>
                            <th>Type</th><th>Name / Model</th><th>Slot</th><th>Qty</th>
                            <th>Serial</th><th>Part Number</th><th>Firmware</th><th>Status</th>
                        </tr></thead>
                        <tbody>
                            ${items.map(r => {
                                // Add fan tier badge for Fan category
                                const fanTier = r.category === "Fan" && r.extra && r.extra.FanTier
                                    ? `<span class="fan-tier-badge tier-${r.extra.FanTier.toLowerCase()}">${esc(r.extra.FanTier)}</span>`
                                    : "";
                                const nameWithTier = fanTier ? `${fanTier} ${esc(r.name)}` : esc(r.name);

                                return `<tr>
                                <td>${esc(r.type)}</td>
                                <td>${nameWithTier}</td>
                                <td>${esc(r.slot)}</td>
                                <td>${esc(String(r.quantity))}</td>
                                <td>${esc(r.serial)}</td>
                                <td>${esc(r.part_number)}</td>
                                <td>${esc(r.firmware)}</td>
                                <td>${statusHtml(r.status)}</td>
                            </tr>`;
                            }).join("")}
                        </tbody>
                    </table>
                </div>
            </div>`;
        }).join("");

        // Bind toggle
        groupedContainer.querySelectorAll(".group-header").forEach(hdr => {
            hdr.addEventListener("click", () => {
                const body = hdr.nextElementSibling;
                const chevron = hdr.querySelector(".group-chevron");
                body.classList.toggle("open");
                chevron.classList.toggle("open");
            });
        });
    }

    function renderView() {
        const rows = getFiltered();
        if (isGrouped) {
            hide(tableContainer);
            show(groupedContainer);
            renderGrouped(rows);
        } else {
            show(tableContainer);
            hide(groupedContainer);
            renderTable(rows);
        }
    }

    // ── Sort headers ──────────────────────────────────────────────────
    document.querySelectorAll("#inventory-table th.sortable").forEach(th => {
        th.addEventListener("click", () => {
            const col = th.dataset.col;
            if (sortCol === col) {
                sortDir = sortDir === "asc" ? "desc" : "asc";
            } else {
                sortCol = col;
                sortDir = "asc";
            }
            // Update arrows
            document.querySelectorAll(".sort-arrow").forEach(s => s.textContent = "");
            th.querySelector(".sort-arrow").textContent = sortDir === "asc" ? " \u25B2" : " \u25BC";
            renderView();
        });
    });

    // ── Search & Filter ───────────────────────────────────────────────
    searchInput.addEventListener("input", renderView);
    filterCategory.addEventListener("change", renderView);

    // ── Toggle Group ──────────────────────────────────────────────────
    btnToggleGroup.addEventListener("click", () => {
        isGrouped = !isGrouped;
        btnToggleGroup.classList.toggle("btn-primary", isGrouped);
        btnToggleGroup.classList.toggle("btn-outline", !isGrouped);
        renderView();
    });

    // ── Export CSV ────────────────────────────────────────────────────
    btnExportCsv.addEventListener("click", async () => {
        const rows = getFiltered();
        if (!rows.length) { alert("No data to export."); return; }

        try {
            const resp = await fetch("/api/export-csv", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ inventory: rows }),
            });
            if (!resp.ok) throw new Error("Export failed");
            const blob = await resp.blob();
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement("a");
            a.href = url;
            a.download = "idrac_inventory.csv";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) {
            // Fallback: client-side CSV
            const header = "Category,Type,Name,Slot,Quantity,Serial,Part Number,Firmware,Status\n";
            const csv = header + rows.map(r =>
                [r.category, r.type, r.name, r.slot, r.quantity, r.serial, r.part_number, r.firmware, r.status]
                    .map(v => `"${String(v ?? "").replace(/"/g, '""')}"`)
                    .join(",")
            ).join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement("a");
            a.href = url;
            a.download = "idrac_inventory.csv";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        }
    });

    // ── Disconnect ────────────────────────────────────────────────────
    btnDisconnect.addEventListener("click", () => {
        inventoryData = [];
        sortCol = "";
        sortDir = "asc";
        isGrouped = false;

        // Clear health auto-refresh
        if (healthRefreshInterval) {
            clearInterval(healthRefreshInterval);
            healthRefreshInterval = null;
        }

        hide(dashboardSection);
        hide(loadingSection);
        sidebar.classList.remove("visible");
        show(loginSection);
        hide(loginError);

        // Clear credentials from form
        document.getElementById("host").value = "";
        document.getElementById("username").value = "";
        document.getElementById("password").value = "";

        connBadge.className = "badge badge-idle";
        connBadge.textContent = "Not Connected";

        summaryBody.innerHTML = "";
        inventoryBody.innerHTML = "";
        groupedContainer.innerHTML = "";
        hide(warningsBox);

        // Reset BOM section
        bomFileInput.value = "";
        bomFileName.textContent = "Choose Excel file\u2026";
        bomFileLabel.classList.remove("has-file");
        btnCompare.disabled = true;
        hide(bomError);
        hide(comparisonSection);
        cmpSummaryEl.innerHTML = "";
        cmpBody.innerHTML = "";
        cmpGrouped.innerHTML = "";

        // Reset group button
        btnToggleGroup.classList.remove("btn-primary");
        btnToggleGroup.classList.add("btn-outline");
        btnCmpGroup.classList.remove("btn-primary");
        btnCmpGroup.classList.add("btn-outline");
    });


    // ==================================================================
    // BOM / Excel Comparison Logic
    // ==================================================================

    const bomFileInput      = document.getElementById("bom-file");
    const bomFileName       = document.getElementById("bom-file-name");
    const bomFileLabel      = document.querySelector(".file-label");
    const btnCompare        = document.getElementById("btn-compare");
    const btnCompareText    = btnCompare.querySelector(".btn-text");
    const btnCompareSpinner = btnCompare.querySelector(".btn-spinner");
    const bomError          = document.getElementById("bom-error");
    const comparisonSection = document.getElementById("comparison-section");
    const cmpSummaryEl      = document.getElementById("cmp-summary");
    const cmpSearch         = document.getElementById("cmp-search");
    const cmpFilterStatus   = document.getElementById("cmp-filter-status");
    const cmpTableContainer = document.getElementById("cmp-table-container");
    const cmpBody           = document.getElementById("cmp-body");
    const cmpGrouped        = document.getElementById("cmp-grouped");
    const btnCmpGroup       = document.getElementById("btn-cmp-group");
    const btnCmpCsv         = document.getElementById("btn-cmp-csv");

    let comparisonData = [];
    let cmpSortCol     = "";
    let cmpSortDir     = "asc";
    let cmpIsGrouped   = false;

    // ── File input handling ───────────────────────────────────────────
    bomFileInput.addEventListener("change", () => {
        const file = bomFileInput.files[0];
        if (file) {
            bomFileName.textContent = file.name;
            bomFileLabel.classList.add("has-file");
            btnCompare.disabled = false;
            hide(bomError);
        } else {
            bomFileName.textContent = "Choose Excel file\u2026";
            bomFileLabel.classList.remove("has-file");
            btnCompare.disabled = true;
        }
    });

    // ── Compare button ────────────────────────────────────────────────
    btnCompare.addEventListener("click", async () => {
        hide(bomError);

        const file = bomFileInput.files[0];
        if (!file) {
            bomError.textContent = "Please select an Excel file first.";
            show(bomError);
            return;
        }
        if (!inventoryData.length) {
            bomError.textContent = "No inventory data available. Fetch inventory from iDRAC first.";
            show(bomError);
            return;
        }

        // UI → loading
        btnCompare.disabled = true;
        hide(btnCompareText);
        show(btnCompareSpinner);

        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("inventory", JSON.stringify(inventoryData));

            const resp = await fetch("/api/compare", {
                method: "POST",
                body: formData,
            });

            const data = await resp.json();
            if (!resp.ok) throw { message: data.error || "Comparison failed" };

            comparisonData = data.results || [];
            renderComparison(data.summary);

        } catch (err) {
            bomError.textContent = err.message || "An error occurred during comparison.";
            show(bomError);
        } finally {
            btnCompare.disabled = !bomFileInput.files[0];
            show(btnCompareText);
            hide(btnCompareSpinner);
        }
    });

    // ── Render comparison ─────────────────────────────────────────────
    function renderComparison(summary) {
        show(comparisonSection);

        // Summary counters
        const s = summary || {};
        cmpSummaryEl.innerHTML = `
            <div class="cmp-counter cmp-total"><span class="cmp-num">${s.total || 0}</span><span class="cmp-label">Total</span></div>
            <div class="cmp-counter cmp-match"><span class="cmp-num">${s.matched || 0}</span><span class="cmp-label">Matched</span></div>
            <div class="cmp-counter cmp-missing"><span class="cmp-num">${s.not_found || 0}</span><span class="cmp-label">Not Found</span></div>
            <div class="cmp-counter cmp-qok"><span class="cmp-num">${s.qty_match || 0}</span><span class="cmp-label">Qty Match</span></div>
            <div class="cmp-counter cmp-qwarn"><span class="cmp-num">${s.qty_mismatch || 0}</span><span class="cmp-label">Qty Mismatch</span></div>
        `;

        renderCmpView();
    }

    function statusBadge(status) {
        if (status === "MATCHED")   return '<span class="cmp-status cmp-matched">Matched</span>';
        if (status === "NOT_FOUND") return '<span class="cmp-status cmp-not-found">Not Found</span>';
        return esc(status);
    }

    function qtyStatusBadge(qs) {
        if (qs === "QTY_MATCH")    return '<span class="cmp-status cmp-qty-match">Qty Match</span>';
        if (qs === "QTY_MISMATCH") return '<span class="cmp-status cmp-qty-mismatch">Qty Mismatch</span>';
        return '<span class="status-na">N/A</span>';
    }

    function rowClass(status) {
        if (status === "MATCHED")   return "row-matched";
        if (status === "NOT_FOUND") return "row-not-found";
        return "";
    }

    // ── Filter / sort comparison results ──────────────────────────────
    function getCmpFiltered() {
        const q   = cmpSearch.value.toLowerCase().trim();
        const st  = cmpFilterStatus.value;

        let rows = comparisonData;
        if (st) rows = rows.filter(r => r.match_status === st);
        if (q)  rows = rows.filter(r =>
            [r.component_type, r.assy_dpn, r.part_number, (r.detected_parts||[]).join(" "), r.detail, r.description]
                .some(v => (v || "").toLowerCase().includes(q))
        );

        if (cmpSortCol) {
            rows = [...rows].sort((a, b) => {
                let va = a[cmpSortCol] ?? "";
                let vb = b[cmpSortCol] ?? "";
                if (["detected_qty", "expected_qty"].includes(cmpSortCol)) {
                    va = Number(va) || 0; vb = Number(vb) || 0;
                } else if (cmpSortCol === "detected_parts") {
                    va = (Array.isArray(va) ? va.join(", ") : String(va)).toLowerCase();
                    vb = (Array.isArray(vb) ? vb.join(", ") : String(vb)).toLowerCase();
                } else {
                    va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
                }
                if (va < vb) return cmpSortDir === "asc" ? -1 : 1;
                if (va > vb) return cmpSortDir === "asc" ? 1 : -1;
                return 0;
            });
        }
        return rows;
    }

    function renderCmpTable(rows) {
        if (!rows.length) {
            cmpBody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted);">No matching results.</td></tr>';
            return;
        }
        cmpBody.innerHTML = rows.map(r => {
            const parts = Array.isArray(r.detected_parts) ? r.detected_parts.join(", ") : (r.detected_parts || "");
            const expQ  = r.expected_qty != null ? String(r.expected_qty) : "N/A";
            return `<tr class="${rowClass(r.match_status)}">
                <td>${esc(r.component_type)}</td>
                <td>${esc(r.assy_dpn || "")}</td>
                <td>${esc(r.part_number || "")}</td>
                <td>${esc(parts) || '<span class="status-na">--</span>'}</td>
                <td>${statusBadge(r.match_status)}</td>
                <td>${esc(String(r.detected_qty))}</td>
                <td>${esc(expQ)}</td>
                <td>${qtyStatusBadge(r.qty_status)}</td>
                <td>${esc(r.detail)}</td>
            </tr>`;
        }).join("");
    }

    function renderCmpGrouped(rows) {
        const groups = {};
        rows.forEach(r => {
            const key = r.component_type || "Other";
            if (!groups[key]) groups[key] = [];
            groups[key].push(r);
        });

        const keys = Object.keys(groups).sort();
        cmpGrouped.innerHTML = keys.map(key => {
            const items = groups[key];
            const mCount = items.filter(r => r.match_status === "MATCHED").length;
            const nfCount = items.filter(r => r.match_status === "NOT_FOUND").length;
            const tag = nfCount ? "cmp-not-found" : "cmp-matched";
            return `
            <div class="group-section">
                <div class="group-header" data-group="${esc(key)}">
                    <h4>
                        <span>${esc(key)}</span>
                        <span class="group-count">${items.length}</span>
                        <span class="cmp-status ${tag}" style="margin-left:6px">${mCount}/${items.length} matched</span>
                    </h4>
                    <svg class="group-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
                <div class="group-body">
                    <table>
                        <thead><tr>
                            <th>ASSY DPN</th><th>Part#</th><th>System Part#</th><th>Status</th>
                            <th>Det. Qty</th><th>Exp. Qty</th><th>Qty Status</th><th>Detail</th>
                        </tr></thead>
                        <tbody>
                            ${items.map(r => {
                                const parts = Array.isArray(r.detected_parts) ? r.detected_parts.join(", ") : "";
                                const expQ  = r.expected_qty != null ? String(r.expected_qty) : "N/A";
                                return `<tr class="${rowClass(r.match_status)}">
                                    <td>${esc(r.assy_dpn || "")}</td>
                                    <td>${esc(r.part_number || "")}</td>
                                    <td>${esc(parts) || '--'}</td>
                                    <td>${statusBadge(r.match_status)}</td>
                                    <td>${esc(String(r.detected_qty))}</td>
                                    <td>${esc(expQ)}</td>
                                    <td>${qtyStatusBadge(r.qty_status)}</td>
                                    <td>${esc(r.detail)}</td>
                                </tr>`;
                            }).join("")}
                        </tbody>
                    </table>
                </div>
            </div>`;
        }).join("");

        cmpGrouped.querySelectorAll(".group-header").forEach(hdr => {
            hdr.addEventListener("click", () => {
                hdr.nextElementSibling.classList.toggle("open");
                hdr.querySelector(".group-chevron").classList.toggle("open");
            });
        });
    }

    function renderCmpView() {
        const rows = getCmpFiltered();
        if (cmpIsGrouped) {
            hide(cmpTableContainer);
            show(cmpGrouped);
            renderCmpGrouped(rows);
        } else {
            show(cmpTableContainer);
            hide(cmpGrouped);
            renderCmpTable(rows);
        }
    }

    // ── Sort headers for comparison table ─────────────────────────────
    document.querySelectorAll("#cmp-table th.cmp-sortable").forEach(th => {
        th.addEventListener("click", () => {
            const col = th.dataset.col;
            if (cmpSortCol === col) { cmpSortDir = cmpSortDir === "asc" ? "desc" : "asc"; }
            else { cmpSortCol = col; cmpSortDir = "asc"; }
            document.querySelectorAll(".cmp-sort-arrow").forEach(s => s.textContent = "");
            th.querySelector(".cmp-sort-arrow").textContent = cmpSortDir === "asc" ? " \u25B2" : " \u25BC";
            renderCmpView();
        });
    });

    // ── Search / filter for comparison ────────────────────────────────
    cmpSearch.addEventListener("input", renderCmpView);
    cmpFilterStatus.addEventListener("change", renderCmpView);

    // ── Toggle group for comparison ───────────────────────────────────
    btnCmpGroup.addEventListener("click", () => {
        cmpIsGrouped = !cmpIsGrouped;
        btnCmpGroup.classList.toggle("btn-primary", cmpIsGrouped);
        btnCmpGroup.classList.toggle("btn-outline", !cmpIsGrouped);
        renderCmpView();
    });

    // ── Export comparison CSV ─────────────────────────────────────────
    btnCmpCsv.addEventListener("click", async () => {
        const rows = getCmpFiltered();
        if (!rows.length) { alert("No comparison data to export."); return; }

        try {
            const resp = await fetch("/api/export-comparison-csv", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ results: rows }),
            });
            if (!resp.ok) throw new Error("Export failed");
            const blob = await resp.blob();
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement("a");
            a.href = url;
            a.download = "bom_comparison_results.csv";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) {
            // Fallback: client-side CSV
            const header = "Component Type,ASSY DPN,Part Number,Detected Part(s),Match Status,Detected Qty,Expected Qty,Qty Status,Detail\n";
            const csvStr = header + rows.map(r =>
                [r.component_type, r.assy_dpn || "", r.part_number || "", (r.detected_parts||[]).join("; "),
                 r.match_status, r.detected_qty, r.expected_qty ?? "", r.qty_status || "", r.detail]
                    .map(v => `"${String(v ?? "").replace(/"/g, '""')}"`)
                    .join(",")
            ).join("\n");
            const blob = new Blob([csvStr], { type: "text/csv" });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement("a");
            a.href = url;
            a.download = "bom_comparison_results.csv";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        }
    });

    // ── Page Navigation ────────────────────────────────────────────────
    const navItems = document.querySelectorAll(".nav-item");
    const pageInventory = document.getElementById("page-inventory");
    const pageBom = document.getElementById("page-bom");
    const pageLogs = document.getElementById("page-logs");

    function switchPage(pageName) {
        // Update nav items
        navItems.forEach(item => {
            if (item.dataset.page === pageName) {
                item.classList.add("active");
            } else {
                item.classList.remove("active");
            }
        });

        // Show/hide page sections
        hide(pageInventory);
        hide(pageBom);
        hide(pageLogs);

        // Clear health auto-refresh when leaving inventory page
        if (healthRefreshInterval) {
            clearInterval(healthRefreshInterval);
            healthRefreshInterval = null;
        }

        if (pageName === "inventory") {
            show(pageInventory);
            fetchHealthMetrics();  // Auto-fetch health when on inventory page
            fetchFanDetailsFromComponentInventory();  // Fetch fan details from component inventory
            // Start auto-refresh every 30 seconds
            healthRefreshInterval = setInterval(() => {
                fetchHealthMetrics(true);  // true = auto-refresh (no spinner)
                fetchFanDetailsFromComponentInventory();  // Refresh fan details from component inventory
            }, 30000);
        } else if (pageName === "bom") {
            show(pageBom);
        } else if (pageName === "logs") {
            show(pageLogs);
        } else if (pageName === "interface-comparison") {
            show(pageInterfaceComparison);
        }
    }

    navItems.forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const pageName = item.dataset.page;
            switchPage(pageName);
        });
    });

    // ── LC Logs Functionality ───────────────────────────────────────────
    const btnFetchLogs = document.getElementById("btn-fetch-logs");
    const logsBody = document.getElementById("logs-body");
    const logsError = document.getElementById("logs-error");

    btnFetchLogs.addEventListener("click", async () => {
        const btnText = btnFetchLogs.querySelector(".btn-text");
        const btnSpinner = btnFetchLogs.querySelector(".btn-spinner");

        hide(logsError);
        btnFetchLogs.disabled = true;
        hide(btnText);
        show(btnSpinner);

        try {
            const resp = await fetch("/api/lc-logs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    host: document.getElementById("host").value.trim(),
                    username: document.getElementById("username").value.trim(),
                    password: document.getElementById("password").value,
                }),
            });

            if (!resp.ok) {
                const err = await resp.json();
                let errorMessage = err.error || "Failed to fetch logs";
                
                // Add available log services information if provided
                if (err.available_logs && err.available_logs.length > 0) {
                    errorMessage += `\n\nAvailable log services: ${err.available_logs.join(", ")}`;
                }
                
                throw new Error(errorMessage);
            }

            const data = await resp.json();
            
            // Display debug information if available
            if (data.debug_info) {
                console.log("LC Logs Debug Info:", data.debug_info);
                if (data.logs.length === 0) {
                    logsError.textContent = `No logs found. Endpoint used: ${data.debug_info.endpoint_used}`;
                    show(logsError);
                    return;
                }
            }
            
            renderLogs(data.logs);
        } catch (e) {
            logsError.textContent = e.message || "Failed to fetch LC logs. Please try again.";
            show(logsError);
        } finally {
            btnFetchLogs.disabled = false;
            hide(btnSpinner);
            show(btnText);
        }
    });

    function renderLogs(logs) {
        if (!logs || logs.length === 0) {
            logsBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No logs found</td></tr>';
            return;
        }

        logsBody.innerHTML = logs.map(log => {
            const severityClass = log.severity ? log.severity.toLowerCase() : "info";
            const severityBadge = `<span class="log-severity ${severityClass}">${esc(log.severity || "INFO")}</span>`;
            const created = log.created || "N/A";
            const message = log.message || "N/A";
            const source = log.source || "N/A";

            return `
                <tr>
                    <td>${esc(created)}</td>
                    <td>${severityBadge}</td>
                    <td>${esc(message)}</td>
                    <td>${esc(source)}</td>
                </tr>
            `;
        }).join("");
    }

    // ── Server Health Functionality ───────────────────────────────────────
    const healthStatusIcon = document.getElementById("health-status-icon");
    const healthStatusValue = document.getElementById("health-status-value");

    function fetchHealthMetrics(isAutoRefresh = false) {
        fetch("/api/health", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                host: document.getElementById("host").value.trim(),
                username: document.getElementById("username").value.trim(),
                password: document.getElementById("password").value,
            }),
        })
        .then(resp => resp.json())
        .then(data => {
            if (data.error) {
                throw new Error(data.error);
            }
            updateHealthStatusDisplay(data.health_status);
        })
        .catch(e => {
            // Silent fail for auto-refresh, no error display needed
            if (!isAutoRefresh) {
                console.error("Failed to fetch health metrics:", e);
            }
        });
    }

    function updateHealthStatusDisplay(healthStatus) {
        // Determine status display
        let status = "healthy";
        let statusText = "Healthy";

        if (healthStatus === "Critical") {
            status = "critical";
            statusText = "Critical";
        } else if (healthStatus === "Warning") {
            status = "warning";
            statusText = "Warning";
        }

        // Update status display
        healthStatusValue.textContent = statusText;
        healthStatusIcon.className = "health-status-icon " + status;
        healthStatusValue.className = "health-status-value " + status;
    }

    // ── Interface Comparison Functionality ──────────────────────────────────
    btnRunInterfaceComparison.addEventListener("click", async () => {
        hide(interfaceCmpError);
        const btnText = btnRunInterfaceComparison.querySelector(".btn-text");
        const btnSpinner = btnRunInterfaceComparison.querySelector(".btn-spinner");

        btnRunInterfaceComparison.disabled = true;
        hide(btnText);
        show(btnSpinner);

        try {
            const resp = await fetch("/api/inventory-comparison", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    host: document.getElementById("host").value.trim(),
                    username: document.getElementById("username").value.trim(),
                    password: document.getElementById("password").value,
                }),
            });

            const data = await resp.json();

            if (!resp.ok) {
                throw new Error(data.error || "Comparison failed");
            }

            renderInterfaceComparison(data);
        } catch (err) {
            interfaceCmpError.textContent = err.message;
            show(interfaceCmpError);
        } finally {
            btnRunInterfaceComparison.disabled = false;
            show(btnText);
            hide(btnSpinner);
        }
    });

    function renderInterfaceComparison(data) {
        show(interfaceCmpSection);

        const summary = data.summary || {};
        interfaceCmpSummary.innerHTML = `
            <div class="summary-item">
                <span class="summary-label">Redfish:</span>
                <span class="summary-value">${summary.redfish_count || 0}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">racadm:</span>
                <span class="summary-value">${summary.racadm_count || 0}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">IPMI:</span>
                <span class="summary-value">${summary.ipmi_count || 0}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Total Compared:</span>
                <span class="summary-value">${summary.total_compared || 0}</span>
            </div>
        `;

        const comparison = data.comparison || {};
        const results = Object.values(comparison);

        if (results.length === 0) {
            interfaceCmpBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">No comparison results available.</td></tr>';
            return;
        }

        interfaceCmpBody.innerHTML = results.map(item => {
            const statusClass = getStatusClass(item.status);
            const redfishInfo = item.redfish ? `${item.redfish.device_description || 'N/A'}` : 'N/A';
            const racadmInfo = item.racadm ? `${item.racadm.device_description || 'N/A'}` : 'N/A';
            const ipmiInfo = item.ipmi ? `${item.ipmi.device_description || 'N/A'}` : 'N/A';

            return `
            <tr>
                <td>${esc(item.component_type)}</td>
                <td>${esc(item.part_number)}</td>
                <td>${esc(redfishInfo)}</td>
                <td>${esc(racadmInfo)}</td>
                <td>${esc(ipmiInfo)}</td>
                <td><span class="status-badge ${statusClass}">${esc(item.status)}</span></td>
            </tr>
        `;
        }).join("");
    }

    function getStatusClass(status) {
        switch(status) {
            case "match":
                return "status-ok";
            case "missing_redfish":
            case "missing_racadm":
            case "missing_ipmi":
                return "status-warning";
            case "description_mismatch":
                return "status-error";
            default:
                return "status-na";
        }
    }

    // ── Fan Details Functionality ──────────────────────────────────────────
    function fetchFanDetailsFromComponentInventory() {
        fetch("/api/fans", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                host: document.getElementById("host").value.trim(),
                username: document.getElementById("username").value.trim(),
                password: document.getElementById("password").value,
            }),
        })
        .then(resp => resp.json())
        .then(data => {
            if (data.error) {
                throw new Error(data.error);
            }
            renderFanDetails(data.fans, data.system_model);
        })
        .catch(e => {
            console.error("Failed to fetch fan details:", e);
            renderFanDetails([], "");
        });
    }

    function renderFanDetails(fans, systemModel) {
        // Determine overall fan tier from the first fan (all fans have same tier)
        const overallTier = fans.length > 0 && fans[0].tier
            ? fans[0].tier
            : "Unknown";

        // Update the tier badge in the header
        const fanTierBadge = document.getElementById("fan-tier-badge");
        if (fanTierBadge) {
            fanTierBadge.textContent = overallTier;
            fanTierBadge.className = `fan-tier-badge tier-${overallTier.toLowerCase()}`;
        }

        // Render fan table
        const fanBody = document.getElementById("fan-body");
        if (!fans || fans.length === 0) {
            fanBody.innerHTML = '<tr><td colspan="2" style="text-align:center;padding:20px;color:var(--text-muted);">No fan data available.</td></tr>';
            return;
        }

        fanBody.innerHTML = fans.map((fan, index) => {
            const rpm = fan.speed || "N/A";
            const description = fan.description || fan.name || `Fan ${index}`;
            return `
            <tr>
                <td>${esc(description)}</td>
                <td>${rpm} RPM</td>
            </tr>
        `}).join("");
    }

})();
