window.__ModuleLoader__.load({
	id: "@lmber/dsh-token-usage-stats",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		let react = require("react");
		react = __toESM(react, 1);
		const R = react.default;
		const h = R.createElement;

		/** Whole millisecond day offline from the epoch; DST-safe by construction. */
		const DAY_MS = 24 * 3600 * 1000;

		/** Local YYYY-MM (for month-grain bucket labels). */
		function formatMonth(ts) {
			const d = new Date(ts);
			const pad = (n) => String(n).padStart(2, "0");
			return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
		}

		/** Local YYYY-MM of a Date. */
		function ymOf(d) {
			const pad = (n) => String(n).padStart(2, "0");
			return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
		}

		/** Number formatting that tolerates a missing field (renders "0"). */
		function num(value) {
			return typeof value === "number" ? value.toLocaleString() : "0";
		}

		/** Milliseconds presented as seconds (2 decimals), tolerating absence. */
		function secs(value) {
			return typeof value === "number" && Number.isFinite(value)
				? Math.round((value / 1000) * 100) / 100
				: null;
		}

		/** Compact number label for chart axes: 1.2k / 850k / 3.4M. */
		function compact(value) {
			const n = typeof value === "number" ? value : 0;
			if (n < 1000) return String(n);
			const units = ["k", "M", "B", "T"];
			let scaled = n;
			let unit = "";
			for (const u of units) {
				if (scaled < 1000) break;
				scaled /= 1000;
				unit = u;
			}
			return (scaled >= 10 ? scaled.toFixed(0) : scaled.toFixed(1)) + unit;
		}

		/** Axis label: compact for large values, at most one decimal below 1000. */
		function formatAxis(value) {
			const n = typeof value === "number" ? value : 0;
			if (n >= 1000) return compact(n);
			if (Number.isInteger(n)) return String(n);
			return String(Math.round(n * 10) / 10);
		}

		/** A soft 12-color palette: muted, medium-light tones with no harsh
		 * saturated red or yellow — readable on both light and dark themes. */
		const PALETTE = [
			"#7C9DE0", // soft blue
			"#5FB6AC", // soft teal
			"#8FBE7F", // soft green
			"#6FA8C4", // soft steel blue
			"#A695D1", // soft purple
			"#D9A0B8", // soft rose
			"#7FB3D9", // soft sky blue
			"#A8B98A", // soft moss
			"#B9A9D6", // soft lavender
			"#7CC4B4", // soft mint
			"#D8B98F", // soft apricot (instead of yellow)
			"#8FA6C9"  // soft periwinkle
		];

		/** Palette color for a 0-based index (wraps). */
		function colorOf(index) {
			return { background: PALETTE[index % PALETTE.length] };
		}

		/** Host routes. */
		const STATS_ENDPOINT = "/api/token-usage-stats";
		const SERIES_ENDPOINT = "/api/token-usage-stats/series";
		const SERIES_BY_MODEL_ENDPOINT = "/api/token-usage-stats/series-by-model";
		const META_ENDPOINT = "/api/token-usage-stats/meta";
		const CONFIG_ENDPOINT = "/api/token-usage-stats/config";

		/** Named summary ranges shown as segmented buttons. */
		const RANGES = [
			{ id: "day", label: "今日" },
			{ id: "yesterday", label: "昨天" },
			{ id: "day-before", label: "前天" },
			{ id: "week", label: "本周" },
			{ id: "month", label: "本月" },
			{ id: "all", label: "全部" }
		];

		/** Cordis injection: the settings section slot. */
		const inject = ["slots"];

		/** Register this settings page into the settings section on load. */
		function apply(ctx) {
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "token-usage-stats",
				label: "Token 使用统计"
			}, TokenUsageSettingsPage));
		}

		const CARD = {
			padding: "16px 18px",
			borderRadius: "12px",
			minWidth: 0,
			color: "var(--dsw-alias-label-primary)",
			background: "var(--dsw-alias-bg-layer-2)"
		};
		const CARD_LABEL = { fontSize: "12px", opacity: 0.72, marginBottom: "4px" };
		const CARD_VALUE = { fontSize: "21px", fontWeight: 650, overflowWrap: "anywhere" };
		const CELL = { padding: "9px 10px", borderBottom: "1px solid var(--dsw-alias-border-l1)" };
		const HEAD = { padding: "9px 10px", borderBottom: "2px solid var(--dsw-alias-border-l2)", fontWeight: 600 };
		const TH = { ...HEAD, textAlign: "left" };
		const TH_R = { ...HEAD, textAlign: "right", whiteSpace: "nowrap" };
		const TD = { ...CELL, overflowWrap: "anywhere" };
		const TD_R = { ...CELL, textAlign: "right", whiteSpace: "nowrap" };
		const PANEL = {
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: "12px",
			padding: "14px 16px",
			marginBottom: "16px",
			background: "var(--dsw-alias-bg-layer-1)"
		};
		const PANEL_TITLE = { margin: "0 0 10px", fontSize: "14px" };
		const PANEL_DESC = { fontSize: "12px", opacity: 0.7, marginBottom: "8px" };

		/** Render a horizontal labeled row for curve/pie legends: color chip + text. */
		function LegendItem(color, label, value) {
			return h("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" } },
				h("span", { style: { ...color, width: "10px", height: "10px", borderRadius: "2px", flex: "none" } }),
				h("span", { style: { flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, label),
				h("span", { style: { color: "var(--dsw-alias-label-secondary)", whiteSpace: "nowrap" } }, value)
			);
		}

		/** One SVG vertical bar chart of token totals by time bucket, with idle
		 * (zero) buckets rendered as a faint baseline so skipped days stay visible. */
		function BarChart(buckets, formatLabel, labelEvery) {
			const W = 600, H = 210, PAD_L = 42, PAD_B = 22, PAD_T = 12, GAP = 4;
			if (buckets.length === 0) {
				return h("div", { style: { padding: "18px", opacity: 0.6 } }, "暂无数据");
			}
			const maxV = Math.max(...buckets.map(b => b.tokens), 1);
			const innerW = W - PAD_L - 8;
			const slot = (innerW - GAP * (buckets.length - 1)) / buckets.length;
			const barW = Math.max(6, slot * 0.62);
			const bars = buckets.map((b, i) => {
				const x = PAD_L + i * (slot + GAP) + (slot - barW) / 2;
				if (b.tokens <= 0) {
					// Idle day: a 1px baseline dot at the axis so the calendar
					// position exists without pretending usage happened.
					return h("g", { key: i },
						h("title", null, `${formatLabel(b, i)}：无记录`),
						h("rect", {
							x: String(x), y: String(H - PAD_B - 1),
							width: String(barW), height: "1",
							fill: "var(--dsw-alias-border-l2)"
						})
					);
				}
				const hgt = Math.max(2, (b.tokens / maxV) * (H - PAD_T - PAD_B));
				const y = H - PAD_B - hgt;
				return h("g", { key: i },
					h("title", null, `${formatLabel(b, i)}：${compact(b.tokens)} tokens${b.calls != null ? `（${compact(b.calls)} 次调用）` : ""}`),
					h("rect", {
						x: String(x), y: String(y),
						width: String(barW), height: String(hgt),
						rx: "2",
						// Total consumption is one series: a single constant color.
						fill: PALETTE[0],
						opacity: "0.9"
					})
				);
			});
			const grid = [0, 1, 2, 3].map(i => {
				const val = maxV * (i / 3);
				const y = H - PAD_B - (val / maxV) * (H - PAD_T - PAD_B);
				return h("g", { key: i },
					h("line", { x1: String(PAD_L), y1: String(y), x2: String(W - 8), y2: String(y), stroke: "var(--dsw-alias-border-l1)", strokeWidth: "1" }),
					h("text", { x: String(PAD_L - 6), y: String(y + 4), fontSize: "10", fill: "var(--dsw-alias-label-tertiary)", textAnchor: "end" }, formatAxis(val))
				);
			});
			const step = labelEvery == null ? 1 : labelEvery;
			const xLabels = buckets.map((b, i) => {
				if (i % step !== 0) return null;
				const cx = PAD_L + i * (slot + GAP) + slot / 2;
				return h("text", {
					key: i,
					x: String(cx),
					y: String(H - 6),
					fontSize: "10",
					fill: "var(--dsw-alias-label-tertiary)",
					textAnchor: "middle"
				}, formatLabel(b, i));
			});
			return h("svg", { viewBox: `0 0 ${W} ${H}`, style: { width: "100%", height: "auto", maxHeight: "160px" } },
				...grid, ...bars, ...xLabels);
		}

		/** One stacked-bar chart over a shared window; each series is a model. */
		function MultiBarChart(buckets, series, formatLabel, labelEvery) {
			const W = 600, H = 210, PAD_L = 42, PAD_B = 22, PAD_T = 12, GAP = 4;
			if (buckets.length === 0 || series.length === 0) {
				return h("div", { style: { padding: "18px", opacity: 0.6 } }, "暂无数据");
			}
			const totals = buckets.map((b, i) => series.reduce((sum, s) => sum + (s.buckets[i]?.tokens ?? 0), 0));
			const maxV = Math.max(...totals, 1);
			const innerW = W - PAD_L - 8;
			const slot = (innerW - GAP * (buckets.length - 1)) / buckets.length;
			const barW = Math.max(6, slot * 0.62);
			const bars = buckets.map((b, i) => {
				const x = PAD_L + i * (slot + GAP) + (slot - barW) / 2;
				const total = totals[i];
				// Idle day: skip the slot entirely (no bar, no baseline), so
				// history stays visible without painting zero-length columns.
				if (total <= 0) return null;
				const pieces = [];
				let y = H - PAD_B;
				series.forEach((s, si) => {
					const value = s.buckets[i]?.tokens ?? 0;
					if (value <= 0) return;
					const hgt = Math.max(2, (value / maxV) * (H - PAD_T - PAD_B));
					y -= hgt;
					pieces.push(h("rect", {
						key: si,
						x: String(x), y: String(y),
						width: String(barW), height: String(hgt),
						fill: PALETTE[si % PALETTE.length],
						opacity: "0.92"
					}));
				});
				const tip = series.map(s => `${s.model}：${compact(s.buckets[i]?.tokens ?? 0)}`).join("，");
				return h("g", { key: i },
					h("title", null, `${formatLabel(b, i)}（合计 ${compact(total)} tokens）：${tip}`),
					...pieces
				);
			});
			const grid = [0, 1, 2, 3].map(i => {
				const val = maxV * (i / 3);
				const y = H - PAD_B - (val / maxV) * (H - PAD_T - PAD_B);
				return h("g", { key: i },
					h("line", { x1: String(PAD_L), y1: String(y), x2: String(W - 8), y2: String(y), stroke: "var(--dsw-alias-border-l1)", strokeWidth: "1" }),
					h("text", { x: String(PAD_L - 6), y: String(y + 4), fontSize: "10", fill: "var(--dsw-alias-label-tertiary)", textAnchor: "end" }, formatAxis(val))
				);
			});
			const step = labelEvery == null ? 1 : labelEvery;
			const xLabels = buckets.map((b, i) => {
				if (i % step !== 0) return null;
				const cx = PAD_L + i * (slot + GAP) + slot / 2;
				return h("text", {
					key: i, x: String(cx), y: String(H - 6),
					fontSize: "10", fill: "var(--dsw-alias-label-tertiary)", textAnchor: "middle"
				}, formatLabel(b, i));
			});
			return h("svg", { viewBox: `0 0 ${W} ${H}`, style: { width: "100%", height: "auto", maxHeight: "160px" } },
				...grid, ...bars, ...xLabels);
		}

		/** One SVG bar chart of average output speed (tok/s) per time bucket.
		 * Buckets without speed data (legacy rows) render a faint baseline. */
		function SpeedTrendChart(buckets, formatLabel, labelEvery) {
			const W = 600, H = 210, PAD_L = 42, PAD_B = 22, PAD_T = 12, GAP = 4;
			if (buckets.length === 0) {
				return h("div", { style: { padding: "18px", opacity: 0.6 } }, "暂无数据");
			}
			const values = buckets.map(b => b.avgTokensPerSec);
			const maxV = Math.max(...values.filter(v => typeof v === "number"), 1);
			const innerW = W - PAD_L - 8;
			const slot = (innerW - GAP * (buckets.length - 1)) / buckets.length;
			const barW = Math.max(6, slot * 0.62);
			const bars = buckets.map((b, i) => {
				const x = PAD_L + i * (slot + GAP) + (slot - barW) / 2;
				const value = b.avgTokensPerSec;
				if (typeof value !== "number") {
					return h("g", { key: i },
						h("title", null, `${formatLabel(b, i)}：无速度数据`),
						h("rect", {
							x: String(x), y: String(H - PAD_B - 1),
							width: String(barW), height: "1",
							fill: "var(--dsw-alias-border-l2)"
						})
					);
				}
				const hgt = Math.max(2, (value / maxV) * (H - PAD_T - PAD_B));
				const y = H - PAD_B - hgt;
				return h("g", { key: i },
					h("title", null, `${formatLabel(b, i)}：${num(value)} tok/s${b.calls != null && b.calls > 0 ? `（${compact(b.calls)} 次调用）` : ""}`),
					h("rect", {
						x: String(x), y: String(y),
						width: String(barW), height: String(hgt),
						rx: "2",
						fill: PALETTE[3 % PALETTE.length],
						opacity: "0.9"
					})
				);
			});
			const grid = [0, 1, 2, 3].map(i => {
				const val = maxV * (i / 3);
				const y = H - PAD_B - (val / maxV) * (H - PAD_T - PAD_B);
				return h("g", { key: i },
					h("line", { x1: String(PAD_L), y1: String(y), x2: String(W - 8), y2: String(y), stroke: "var(--dsw-alias-border-l1)", strokeWidth: "1" }),
					h("text", { x: String(PAD_L - 6), y: String(y + 4), fontSize: "10", fill: "var(--dsw-alias-label-tertiary)", textAnchor: "end" }, formatAxis(val))
				);
			});
			const step = labelEvery == null ? 1 : labelEvery;
			const xLabels = buckets.map((b, i) => {
				if (i % step !== 0) return null;
				const cx = PAD_L + i * (slot + GAP) + slot / 2;
				return h("text", {
					key: i, x: String(cx), y: String(H - 6),
					fontSize: "10", fill: "var(--dsw-alias-label-tertiary)", textAnchor: "middle"
				}, formatLabel(b, i));
			});
			return h("svg", { viewBox: `0 0 ${W} ${H}`, style: { width: "100%", height: "auto", maxHeight: "160px" } },
				...grid, ...bars, ...xLabels);
		}

		/** Model speed leaderboard: output speed, first-token latency and mean
		 * duration per model, ranked by output speed descending. Models without
		 * any speed data sort last and show "—". */
		function SpeedRankTable(byModel) {
			const rows = [...(byModel ?? [])].sort((a, b) => {
				const sa = a.avgOutputTokensPerSec, sb = b.avgOutputTokensPerSec;
				if (sa === sb) return 0;
				if (sa === undefined) return 1;
				if (sb === undefined) return -1;
				return sb - sa;
			});
			const dash = (value) => value === null || value === undefined ? "—" : value;
			// Model cells truncate with an ellipsis instead of breaking per letter;
			// hover shows the full provider/model name. Number cells drop the unit
			// (the header carries it) so they fit narrow panels.
			const MODEL_TD = { ...CELL, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
			const rowHtml = rows.length === 0
				? [h("tr", { key: "empty" }, h("td", { colSpan: 5, style: { textAlign: "center", padding: "20px", opacity: 0.6 } }, "暂无数据"))]
				: rows.map((item, idx) => h("tr", { key: idx },
					h("td", { style: MODEL_TD, title: item.model },
						h("div", { style: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0 } },
							h("span", { style: { ...colorOf(idx), width: "9px", height: "9px", borderRadius: "2px", flex: "none" } }),
							h("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, item.model)
						)
					),
					h("td", { style: TD_R }, dash(item.avgOutputTokensPerSec === undefined ? null : num(item.avgOutputTokensPerSec))),
					h("td", { style: TD_R }, dash(secs(item.avgFirstTokenMs))),
					h("td", { style: TD_R }, dash(secs(item.avgDurationMs))),
					h("td", { style: TD_R }, num(item.calls))
				));
			return h("table", {
				style: {
					width: "100%", tableLayout: "fixed", borderCollapse: "collapse",
					marginBottom: "24px", fontSize: "13px", overflow: "hidden"
				}
			},
				h("colgroup", null,
					h("col", { style: { width: "42%" } }),
					h("col", { style: { width: "8em" } }),
					h("col", { style: { width: "8em" } }),
					h("col", { style: { width: "8em" } }),
					h("col", { style: { width: "6em" } })
				),
				h("thead", null, h("tr", null,
					h("th", { style: TH }, "模型"),
					h("th", { style: TH_R }, "输出速度 (tok/s)"),
					h("th", { style: TH_R }, "首字延迟 (s)"),
					h("th", { style: TH_R }, "平均耗时 (s)"),
					h("th", { style: TH_R }, "调用次数")
				)),
				h("tbody", null, ...rowHtml)
			);
		}

		/** One SVG pie chart of the top sliceCount models by token share + others. */
		function renderPie(byModel, sliceCount) {
			const ordered = [...(byModel ?? [])].sort((a, b) => b.totalTokens - a.totalTokens);
			if (ordered.length === 0) {
				return h("div", { style: { padding: "18px", opacity: 0.6 } }, "暂无数据");
			}
			const top = ordered.slice(0, sliceCount);
			const topSum = top.reduce((s, m) => s + (m.totalTokens ?? 0), 0);
			const total = ordered.reduce((s, m) => s + (m.totalTokens ?? 0), 0);
			const others = total - topSum;
			const R2 = 52, CX = 63, CY = 56;
			let angle = -90;
			const slices = [];
			const push = (value, color, tip) => {
				if (value <= 0) return;
				const frac = value / total;
				const a1 = angle;
				const a2 = angle + frac * 360;
				angle = a2;
				slices.push({ a1, a2, color, tip });
			};
			top.forEach((m, i) => push(m.totalTokens, PALETTE[i % PALETTE.length], m.model));
			if (others > 0) push(others, "var(--dsw-alias-label-tertiary)", "others");
			const pctOf = (value) => (total > 0 ? Math.round((value / total) * 100) : 0);
			const arc = (a) => ((a * Math.PI) / 180);
			const parts = slices.map((s, i) => {
				const delta = s.a2 - s.a1;
				const tipText = s.tip === "others"
					? `其他模型：${pctOf(others)}%（${compact(others)} tokens）`
					: `${s.tip}：${pctOf(total ? (top.find(m => m.model === s.tip)?.totalTokens ?? 0) : 0)}%（${compact(total ? (top.find(m => m.model === s.tip)?.totalTokens ?? 0) : 0)} tokens）`;
				if (delta >= 359.99) {
					return h("g", { key: i },
						h("title", null, tipText),
						h("circle", { cx: String(CX), cy: String(CY), r: String(R2), fill: s.color })
					);
				}
				const x1 = CX + R2 * Math.cos(arc(s.a1));
				const y1 = CY + R2 * Math.sin(arc(s.a1));
				const x2 = CX + R2 * Math.cos(arc(s.a2));
				const y2 = CY + R2 * Math.sin(arc(s.a2));
				return h("g", { key: i },
					h("title", null, tipText),
					h("path", {
						d: `M ${CX} ${CY} L ${x1} ${y1} A ${R2} ${R2} 0 ${delta > 180 ? 1 : 0} 1 ${x2} ${y2} Z`,
						fill: s.color
					})
				);
			});
			const legend = top.map((m, i) => LegendItem(
				{ background: PALETTE[i % PALETTE.length] },
				`${m.model}（${pctOf(m.totalTokens)}%）`,
				compact(m.totalTokens)
			));
			if (others > 0) legend.push(LegendItem({ background: "var(--dsw-alias-label-tertiary)" }, `其他模型（${pctOf(others)}%）`, compact(others)));
			return h("div", { style: { display: "flex", gap: "12px", alignItems: "flex-start" } },
				h("svg", { viewBox: "0 0 126 112", style: { width: "126px", height: "112px", flex: "none" } }, ...parts),
				h("div", { style: { flex: "1", minWidth: "0", fontSize: "12px" } }, ...legend)
			);
		}

		/** One statistics table over rows keyed by `labelKey`. */
		function StatsTable(labelHeader, labelKey, rows, extraCells) {
			const headCells = [labelHeader, "调用次数", "Token 数"];
			let rowsRendered;
			if (rows.length === 0) {
				rowsRendered = [h("tr", { key: "empty" }, h("td", {
					colSpan: 3 + (extraCells == null ? 0 : extraCells.length),
					style: { textAlign: "center", padding: "20px", opacity: 0.6 }
				}, "暂无数据"))];
			} else {
				rowsRendered = rows.map((item, idx) => h("tr", { key: idx },
					h("td", { style: { ...CELL, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, title: String(item[labelKey] ?? "") },
						h("div", { style: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0 } },
							h("span", { style: { ...colorOf(idx), width: "9px", height: "9px", borderRadius: "2px", flex: "none" } }),
							h("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, item[labelKey])
						)
					),
					h("td", { style: TD_R }, num(item.calls)),
					h("td", { style: TD_R }, compact(item.totalTokens)),
					...(extraCells == null ? [] : extraCells.map((cell, ci) => h("td", { key: ci, style: TD_R }, cell(item, idx))))
				));
			}
			return h("table", {
				style: {
					width: "100%",
					tableLayout: "fixed",
					borderCollapse: "collapse",
					marginBottom: "24px",
					fontSize: "13px"
				}
			},
				h("colgroup", null,
					h("col", { style: { width: "auto" } }),
					h("col", { style: { width: "6.5em" } }),
					h("col", { style: { width: "9em" } }),
					...(extraCells == null ? [] : [h("col", { style: { width: "9em" } })])
				),
				h("thead", null, h("tr", null, headCells.map((label, i) => h("th", { key: i, style: i === 0 ? TH : TH_R }, label)))),
				h("tbody", null, ...rowsRendered)
			);
		}

		/** Local 00:00:00 of the day containing `ts`, in epoch ms. */
		function dayStartMs(ts) {
			const d = new Date(ts);
			d.setHours(0, 0, 0, 0);
			return d.getTime();
		}

		/** Natural-calendar heatmap for one month: cells are the month's real days,
		 * laid out Monday-first exactly like a wall calendar, so dates stay
		 * continuous and no fixed-day offset can drift across DST or month ends.
		 * @param year - display year.
		 * @param month - zero-based display month.
		 * @param tokensByDay - map of local-day-start ms -> tokens.
		 * @param onPrev / onNext - month navigation handlers.
		 */
		function MonthHeatmap(year, month, tokensByDay, onPrev, onNext) {
			const daysInMonth = new Date(year, month + 1, 0).getDate();
			const firstMondayIndex = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first weekday of the 1st
			const maxV = Math.max(...Array.from({ length: daysInMonth }, (_, day) => {
				const ts = new Date(year, month, day + 1).getTime();
				return tokensByDay.get(dayStartMs(ts)) ?? 0;
			}), 1);

			const CELL = 18, GAP = 3, PAD = 6, HEADER_H = 16;
			const parts = [];
			for (let day = 1; day <= daysInMonth; day++) {
				const ts = new Date(year, month, day).getTime();
				const tokens = tokensByDay.get(dayStartMs(ts)) ?? 0;
				const offset = firstMondayIndex + day - 1;
				const col = offset % 7;
				const row = Math.floor(offset / 7);
				const x = PAD + col * (CELL + GAP);
				const y = PAD + HEADER_H + row * (CELL + GAP);
				const frac = tokens > 0 ? Math.sqrt(tokens / maxV) : 0;
				const alpha = tokens > 0 ? 0.25 + 0.75 * frac : 0;
				const fill = tokens > 0
					? `hsla(222, 48%, 62%, ${alpha.toFixed(2)})`
					: "var(--dsw-alias-bg-layer-3)";
				parts.push(h("g", { key: day },
					h("rect", {
						x: String(x), y: String(y),
						width: String(CELL), height: String(CELL),
						rx: "4",
						fill,
						stroke: "var(--dsw-alias-border-l1)"
					}),
					h("title", null, `${month + 1}/${day}：${tokens === 0 ? "无记录" : compact(tokens) + " tokens"}`)
				));
			}
			// Weekday header row sits above each column: Monday..Sunday, one label
			// per column, aligned with the calendar grid below it.
			const dayNames = ["一", "二", "三", "四", "五", "六", "日"];
			const labels = dayNames.map((name, i) => {
				const cx = PAD + i * (CELL + GAP) + CELL / 2;
				return h("text", { key: "l" + i, x: String(cx), y: String(PAD + HEADER_H - 5), fontSize: "9", fill: "var(--dsw-alias-label-tertiary)", textAnchor: "middle" }, name);
			});
			const weeks = Math.ceil((firstMondayIndex + daysInMonth) / 7);
			const WCH = PAD + HEADER_H + weeks * (CELL + GAP) + PAD;
			const WCM = PAD + 7 * (CELL + GAP) + PAD;
			const navButton = (key, label, onClick) => h("button", {
				key, type: "button", onClick,
				style: {
					padding: "3px 10px", borderRadius: "6px", cursor: "pointer",
					border: "1px solid var(--dsw-alias-border-l2)",
					background: "transparent", color: "inherit",
					fontFamily: "inherit", fontSize: "12px"
				}
			}, label);
			return h("div", null,
				h("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", fontSize: "13px" } },
					navButton("prev", "◀", () => onPrev()),
					h("span", { style: { fontWeight: 600 } }, `${year} 年 ${month + 1} 月`),
					navButton("next", "▶", () => onNext()),
					h("span", { style: { marginLeft: "auto", opacity: 0.7, fontSize: "12px" } }, "颜色越深，当天消耗越多")
				),
				h("svg", { viewBox: `0 0 ${WCM} ${WCH}`, style: { width: "100%", height: "auto", maxHeight: "130px", display: "block" } },
					...labels, ...parts)
			);
		}

		/** The configured sync metadata, or null while loading. */
		function SyncStatusBar(meta) {
			if (meta === null) return null;
			const sync = meta.sync;
			const pieces = [];
			const statusStyle = { display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", fontSize: "12px", padding: "8px 14px", borderRadius: "10px", border: "1px solid var(--dsw-alias-border-l2)", marginBottom: "16px", color: "var(--dsw-alias-label-secondary)" };
			pieces.push(h("span", { key: "device", style: { whiteSpace: "nowrap" } }, `设备：${meta.deviceName || meta.deviceId || "本机"}`));
			if (sync.enabled) {
				pieces.push(h("span", { key: "remote", style: { whiteSpace: "nowrap" } }, `远程：${sync.remoteUrl}`));
				pieces.push(h("span", { key: "pending", style: { whiteSpace: "nowrap" } },
					sync.pendingCount > 0 ? `待同步：${sync.pendingCount} 条` : "已同步"));
				if (sync.lastSyncAt != null) {
					pieces.push(h("span", { key: "last", style: { whiteSpace: "nowrap" } }, `上次同步：${new Date(sync.lastSyncAt).toLocaleString()}`));
				}
				if (sync.lastError != null) {
					pieces.push(h("span", { key: "error", style: { color: "var(--dsw-alias-state-error-primary)", whiteSpace: "nowrap" } }, `同步失败：${sync.lastError}`));
				}
			} else {
				pieces.push(h("span", { key: "off" }, "未配置远程同步（设置 remoteUrl 即可启用）"));
			}
			return h("div", { style: statusStyle }, ...pieces);
		}

		/** The settings page component. */
		function TokenUsageSettingsPage() {
			// Range model: "named" (day/yesterday/.../all), or "month" ("YYYY-MM").
			const [rangeKind, setRangeKind] = R.useState("named");
			const [rangeId, setRangeId] = R.useState("all");
			const [rangeMonth, setRangeMonth] = R.useState(() => ymOf(new Date()));
			const [customFrom, setCustomFrom] = R.useState("");
			const [customTo, setCustomTo] = R.useState("");
			// Data source: "local" or "remote" (only enabled when remoteUrl configured).
			const [source, setSource] = R.useState("local");
			const [summary, setSummary] = R.useState(null);
			const [loading, setLoading] = R.useState(false);
			const [error, setError] = R.useState(null);
			// Bar-chart granularity and series.
			const [granularity, setGranularity] = R.useState("day");
			const [series, setSeries] = R.useState(null);
			// Per-model trend series (same granularity as the total bar chart).
			const [modelSeries, setModelSeries] = R.useState(null);
			// Heatmap state: displayed month plus daily tokens for a wide window.
			const [heatYear, setHeatYear] = R.useState(() => new Date().getFullYear());
			const [heatMonth, setHeatMonth] = R.useState(() => new Date().getMonth());
			const [heatDaily, setHeatDaily] = R.useState(null);
			// Sync/device metadata.
			const [meta, setMeta] = R.useState(null);
			// Remote-sync configuration form state.
			const [config, setConfig] = R.useState(null);
			const [remoteUrlInput, setRemoteUrlInput] = R.useState("");
			const [remoteTokenInput, setRemoteTokenInput] = R.useState("");
			const [savingConfig, setSavingConfig] = R.useState(false);
			const [configMsg, setConfigMsg] = R.useState(null);

			const rangeParam = () => {
				if (rangeKind === "month") return `range=${encodeURIComponent(rangeMonth)}`;
				if (rangeKind === "custom") {
					const params = new URLSearchParams();
					if (customFrom) params.set("from", customFrom);
					if (customTo) params.set("to", customTo);
					return params.toString();
				}
				return `range=${rangeId}`;
			};

			const withSource = (base) => `${base}${base.length > 0 ? "&" : "?"}source=${source}`;

			const loadSummary = R.useCallback(async () => {
				setLoading(true);
				setError(null);
				try {
					const response = await fetch(`${STATS_ENDPOINT}?${withSource(rangeParam())}`, { headers: { accept: "application/json" } });
					if (!response.ok) throw new Error("读取统计数据失败：HTTP " + response.status);
					setSummary(await response.json());
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				} finally {
					setLoading(false);
				}
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, [rangeKind, rangeId, rangeMonth, customFrom, customTo, source]);

			const loadSeries = R.useCallback(async (grain) => {
				try {
					const url = `${SERIES_ENDPOINT}?${withSource(`granularity=${encodeURIComponent(grain)}&limit=${grain === "month" ? 14 : 30}`)}`;
					const response = await fetch(url, { headers: { accept: "application/json" } });
					if (!response.ok) throw new Error("读取图表数据失败：HTTP " + response.status);
					setSeries(await response.json());
				} catch (err) {
					setSeries(null);
				}
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, [source]);

			const loadModelSeries = R.useCallback(async (grain) => {
				try {
					const url = `${SERIES_BY_MODEL_ENDPOINT}?${withSource(`granularity=${encodeURIComponent(grain)}&limit=${grain === "month" ? 14 : 30}`)}`;
					const response = await fetch(url, { headers: { accept: "application/json" } });
					if (!response.ok) throw new Error("读取模型趋势失败：HTTP " + response.status);
					const data = await response.json();
					// Only models that actually produced tokens in the newest bucket
					// are shown; models idle throughout the window would render as
					// full rows of zero bars. Fall back to all when the newest
					// bucket is entirely idle (e.g. nothing recorded yet today).
					const all = data.series ?? [];
					// Show every model that has ever produced tokens in the window
					// (history stays visible); the chart skips zero bars so idle
					// periods are not painted as empty columns.
					const top = all.slice(0, 6);
					const rest = all.slice(6);
					if (rest.length > 0 && data.buckets != null) {
						const merged = data.buckets.map((b, i) => ({
							tokens: rest.reduce((sum, s) => sum + (s.buckets[i]?.tokens ?? 0), 0),
							calls: rest.reduce((sum, s) => sum + (s.buckets[i]?.calls ?? 0), 0)
						}));
						top.push({
							model: "其他模型",
							totalTokens: rest.reduce((sum, s) => sum + s.totalTokens, 0),
							buckets: merged.map((m, i) => ({ ...data.buckets[i], ...m }))
						});
					}
					setModelSeries({ ...data, series: top });
				} catch (err) {
					setModelSeries(null);
				}
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, [source]);

			const loadHeatmap = R.useCallback(async () => {
				try {
					// 62 days always covers a displayed month plus padding; the host
					// window is contiguous so idle days come back as zero buckets.
					const url = `${SERIES_ENDPOINT}?${withSource("granularity=day&limit=62")}`;
					const response = await fetch(url, { headers: { accept: "application/json" } });
					if (!response.ok) throw new Error("读取热力图失败：HTTP " + response.status);
					const data = await response.json();
					const byDay = new Map();
					for (const b of data.buckets ?? []) byDay.set(dayStartMs(b.ts), b.tokens ?? 0);
					setHeatDaily(byDay);
				} catch (err) {
					setHeatDaily(null);
				}
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, [source]);

			const loadMeta = R.useCallback(async () => {
				try {
					const response = await fetch(META_ENDPOINT, { headers: { accept: "application/json" } });
					if (!response.ok) return;
					setMeta(await response.json());
				} catch (err) {
					setMeta(null);
				}
			}, []);

			const loadConfig = R.useCallback(async () => {
				try {
					const response = await fetch(CONFIG_ENDPOINT, { headers: { accept: "application/json" } });
					if (!response.ok) return;
					const data = await response.json();
					setConfig(data);
					setRemoteUrlInput(data.remoteUrl ?? "");
				} catch (err) {
					setConfig(null);
				}
			}, []);

			const saveConfig = R.useCallback(async () => {
				setSavingConfig(true);
				setConfigMsg(null);
				try {
					const body = { remoteUrl: remoteUrlInput.trim() };
					// An empty token input keeps the saved token unchanged.
					if (remoteTokenInput.length > 0) body.remoteToken = remoteTokenInput;
					const response = await fetch(CONFIG_ENDPOINT, {
						method: "PUT",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(body),
					});
					const data = await response.json();
					if (!response.ok) throw new Error(data.error ?? "HTTP " + response.status);
					setConfig(data);
					setRemoteTokenInput("");
					setConfigMsg("已保存；远程同步会在下一个同步周期生效");
					void loadMeta();
				} catch (err) {
					setConfigMsg("保存失败：" + (err instanceof Error ? err.message : String(err)));
				} finally {
					setSavingConfig(false);
				}
			}, [remoteUrlInput, remoteTokenInput, loadMeta]);

			R.useEffect(() => { void loadSummary(); }, [loadSummary]);
			R.useEffect(() => { void loadSeries(granularity); }, [loadSeries, granularity]);
			R.useEffect(() => { void loadModelSeries(granularity); }, [loadModelSeries, granularity]);
			R.useEffect(() => { void loadHeatmap(); }, [loadHeatmap]);
			R.useEffect(() => { void loadMeta(); }, [loadMeta]);
			R.useEffect(() => { void loadConfig(); }, [loadConfig]);

			const button = (key, label, active, onClick, disabled) => h("button", {
				key, type: "button", onClick, disabled: disabled === true || loading,
				style: {
					padding: "5px 12px", borderRadius: "6px",
					cursor: (disabled === true || loading) ? "default" : "pointer",
					border: "1px solid var(--dsw-alias-border-l2)",
					background: active ? "var(--dsw-alias-interactive-bg-active)" : "transparent",
					color: active ? "var(--dsw-alias-brand-text)" : "inherit",
					fontFamily: "inherit", fontSize: "13px",
					fontWeight: active ? 600 : 400,
					opacity: (disabled === true || loading) ? 0.6 : 1
				}
			}, label);

			const header = h("div", { style: { display: "flex", flexDirection: "column", gap: "10px", marginBottom: "18px" } },
				h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" } },
					h("h2", { style: { margin: 0, fontSize: "17px" } }, "Token 使用统计"),
					h("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
						...RANGES.map(item => button(item.id, item.label, rangeKind === "named" && item.id === rangeId, () => { setRangeKind("named"); setRangeId(item.id); })),
						button("month", "按月", rangeKind === "month", () => { setRangeKind("month"); }),
						button("custom", "自定义", rangeKind === "custom", () => { setRangeKind("custom"); })
					)
				),
				rangeKind === "month" && h("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", flexWrap: "wrap" } },
					h("label", { style: { display: "flex", alignItems: "center", gap: "6px" } },
						h("span", null, "选择月份:"),
						h("input", {
							type: "month",
							value: rangeMonth,
							onChange: (e) => { const v = e.target.value; if (v) setRangeMonth(v); },
							style: {
								padding: "4px 8px", border: "1px solid var(--dsw-alias-border-l2)",
								borderRadius: "4px", fontSize: "13px"
							}
						})
					),
					h("button", {
						type: "button",
						onClick: () => {
							const [y, m] = rangeMonth.split("-").map(Number);
							const prev = new Date(y, m - 2, 1);
							setRangeMonth(ymOf(prev));
						},
						style: {
							padding: "4px 10px", borderRadius: "4px",
							cursor: "pointer", border: "1px solid var(--dsw-alias-border-l2)",
							background: "transparent", color: "inherit", fontFamily: "inherit", fontSize: "13px"
						}
					}, "上一月"),
					h("button", {
						type: "button",
						onClick: () => {
							const [y, m] = rangeMonth.split("-").map(Number);
							const next = new Date(y, m, 1);
							setRangeMonth(ymOf(next));
						},
						style: {
							padding: "4px 10px", borderRadius: "4px",
							cursor: "pointer", border: "1px solid var(--dsw-alias-border-l2)",
							background: "transparent", color: "inherit", fontFamily: "inherit", fontSize: "13px"
						}
					}, "下一月")
				),
				rangeKind === "custom" && h("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", flexWrap: "wrap" } },
					h("label", { style: { display: "flex", alignItems: "center", gap: "6px" } },
						h("span", null, "起始日期:"),
						h("input", {
							type: "date", value: customFrom,
							onChange: (e) => setCustomFrom(e.target.value),
							style: { padding: "4px 8px", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "4px", fontSize: "13px" }
						})
					),
					h("label", { style: { display: "flex", alignItems: "center", gap: "6px" } },
						h("span", null, "结束日期:"),
						h("input", {
							type: "date", value: customTo,
							onChange: (e) => setCustomTo(e.target.value),
							style: { padding: "4px 8px", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "4px", fontSize: "13px" }
						})
					),
					h("button", {
						type: "button",
						onClick: () => { void loadSummary(); },
						disabled: loading || (!customFrom && !customTo),
						style: {
							padding: "4px 12px", borderRadius: "4px", fontSize: "13px",
							cursor: (loading || (!customFrom && !customTo)) ? "default" : "pointer",
							border: "1px solid var(--dsw-alias-border-l2)", background: "transparent",
							color: "inherit", fontFamily: "inherit",
							opacity: (loading || (!customFrom && !customTo)) ? 0.6 : 1
						}
					}, "查询")
				),
				// Data-source toggle (only meaningful when remote sync is configured).
				meta !== null && meta.sync.enabled && h("div", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" } },
					h("span", { style: { opacity: 0.7 } }, "数据来源:"),
					button("src-local", "本机", source === "local", () => { setSource("local"); }),
					button("src-remote", "远程汇总", source === "remote", () => { setSource("remote"); })
				)
			);

			let body;
			if (error !== null) {
				body = h("div", { style: { padding: "20px", color: "var(--dsw-alias-state-error-primary)" } }, "错误：" + error);
			} else if (summary === null) {
				body = h("div", { style: { padding: "20px", opacity: 0.6 } }, "正在加载 Token 使用统计…");
			} else {
				const card = (label, value, sub) => h("div", { style: CARD },
					h("div", { style: CARD_LABEL }, label),
					h("div", { style: CARD_VALUE }, value),
					sub == null ? null : h("div", { style: { fontSize: "11px", opacity: 0.6, marginTop: "2px" } }, sub)
				);

				// Bucket label for the bar chart: 今日/昨日, "MM-DD", or "YYYY-MM".
				const formatBucket = (b, i) => {
					if (granularity === "month") return formatMonth(b.ts);
					const d = new Date(b.ts);
					const nowDay = new Date();
					nowDay.setHours(0, 0, 0, 0);
					const diff = Math.round((nowDay.getTime() - d.getTime()) / DAY_MS);
					if (diff === 0) return "今日";
					if (diff === 1) return "昨日";
					const pad = (n) => String(n).padStart(2, "0");
					return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
				};
				const labelEvery = granularity === "month" ? 1 : 5;

				const chartReady = series !== null && series.granularity === granularity;
				const modelChartReady = modelSeries !== null && modelSeries.granularity === granularity;

				const chartPanel = h("div", { style: PANEL },
					h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", marginBottom: "10px" } },
						h("h3", { style: { margin: 0, fontSize: "14px" } }, "Token 消耗趋势"),
						h("div", { style: { display: "flex", gap: "6px" } },
							button("g-day", "按天", granularity === "day", () => { setGranularity("day"); }),
							button("g-month", "按月", granularity === "month", () => { setGranularity("month"); })
						)
					),
					h("div", { style: PANEL_DESC }, granularity === "day"
						? "最近 30 天每日消耗；无记录的日子显示为基线。悬停查看精确数值。"
						: "最近 14 个月每月消耗；悬停查看精确数值。"),
					chartReady
						? BarChart(series.buckets, formatBucket, labelEvery)
						: h("div", { style: { padding: "18px", opacity: 0.6 } }, "正在加载图表…")
				);

				const speedTrendPanel = h("div", { style: PANEL },
					h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", marginBottom: "10px" } },
						h("h3", { style: { margin: 0, fontSize: "14px" } }, "输出速度趋势"),
						h("div", { style: { display: "flex", gap: "6px" } },
							button("sp-day", "按天", granularity === "day", () => { setGranularity("day"); }),
							button("sp-month", "按月", granularity === "month", () => { setGranularity("month"); })
						)
					),
					h("div", { style: PANEL_DESC }, `${granularity === "day" ? "每天" : "每月"}的平均输出速度（tok/s），用于比较不同日期的快慢；无速度数据的时间段显示为基线。`),
					chartReady
						? SpeedTrendChart(series.buckets, formatBucket, labelEvery)
						: h("div", { style: { padding: "18px", opacity: 0.6 } }, "正在加载速度趋势…")
				);

				const modelPanel = h("div", { style: PANEL },
					h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", marginBottom: "10px" } },
						h("h3", { style: { margin: 0, fontSize: "14px" } }, "各模型每日用量"),
						h("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
							(modelSeries == null ? [] : modelSeries.series).map((s, i) => LegendItem(
								{ background: PALETTE[i % PALETTE.length] },
								s.model.split("/").slice(-1)[0],
								compact(s.totalTokens)
							))
						)
					),
					h("div", { style: PANEL_DESC }, "按模型堆叠展示每日/每月消耗；悬停查看各模型精确数值。"),
					modelChartReady && modelSeries.series.length > 0
						? MultiBarChart(modelSeries.buckets, modelSeries.series, formatBucket, labelEvery)
						: h("div", { style: { padding: "18px", opacity: 0.6 } }, "正在加载模型趋势…")
				);

				const heatYearNow = heatYear;
				const heatMonthNow = heatMonth;
				const heatmapPanel = h("div", { style: PANEL },
					h("h3", { style: PANEL_TITLE }, "使用热度月历"),
					h("div", { style: PANEL_DESC }, "按自然月历展示每日 token 消耗；可切换月份。"),
					heatDaily === null
						? h("div", { style: { padding: "18px", opacity: 0.6 } }, "正在加载热力图…")
						: MonthHeatmap(heatYearNow, heatMonthNow, heatDaily,
							() => {
								const prev = new Date(heatYearNow, heatMonthNow - 1, 1);
								setHeatYear(prev.getFullYear());
								setHeatMonth(prev.getMonth());
							},
							() => {
								const next = new Date(heatYearNow, heatMonthNow + 1, 1);
								setHeatYear(next.getFullYear());
								setHeatMonth(next.getMonth());
							})
				);

				const pie = renderPie(summary.byModel ?? [], 10);
				const piePanel = h("div", { style: PANEL },
					h("h3", { style: PANEL_TITLE }, "模型用量占比 Top 10"),
					pie
				);

				const speedRankPanel = h("div", { style: PANEL },
					h("h3", { style: PANEL_TITLE }, "模型输出速度排名"),
					h("div", { style: PANEL_DESC }, "按平均输出速度（tok/s）从快到慢排序；首字延迟与平均耗时越低越快。旧记录无速度数据，显示为 —。"),
					SpeedRankTable(summary.byModel ?? [])
				);

				body = h("div", { style: { minWidth: 0 } },
					h("div", {
						style: {
							display: "grid",
							gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
							gap: "12px",
							marginBottom: "24px"
						}
					},
						card("总调用次数", compact(summary.totalCalls)),
						card("总 Token 数", compact(summary.totalTokens)),
						card("输入", compact(summary.inputTokens)),
						card("输出", compact(summary.outputTokens)),
						card("缓存命中", compact(summary.cacheReadTokens)),
						card("缓存写入", compact(summary.cacheWriteTokens)),
						card("平均输出速度", summary.avgOutputTokensPerSec == null ? "—" : `${num(summary.avgOutputTokensPerSec)} tok/s`,
							summary.avgOutputTokensPerSec == null ? "新记录起统计" : null),
						card("平均首字延迟", summary.avgFirstTokenMs == null ? "—" : `${secs(summary.avgFirstTokenMs)} s`,
							summary.avgFirstTokenMs == null ? "新记录起统计" : null),
						card("平均单次耗时", summary.avgDurationMs == null ? "—" : `${secs(summary.avgDurationMs)} s`,
							summary.avgDurationMs == null ? "新记录起统计" : null)
					),
					chartPanel,
					speedTrendPanel,
					modelPanel,
					heatmapPanel,
					piePanel,
					speedRankPanel,
					h("h3", { style: { margin: "0 0 10px", fontSize: "14px" } }, "按提供商统计"),
					StatsTable("提供商", "provider", (summary.byProvider ?? []).slice(0, 10))
				);
			}

			const inputStyle = {
				padding: "6px 10px",
				border: "1px solid var(--dsw-alias-border-l2)",
				borderRadius: "6px",
				fontSize: "13px",
				fontFamily: "inherit",
				color: "inherit",
				background: "var(--dsw-alias-bg-layer-1)",
				flex: "1",
				minWidth: "200px"
			};
			const configDirty = config !== null
				&& (remoteUrlInput.trim() !== (config.remoteUrl ?? "")
					|| remoteTokenInput.length > 0);
			const remoteConfigPanel = h("div", { style: PANEL },
				h("h3", { style: PANEL_TITLE }, "远程同步配置"),
				h("div", { style: PANEL_DESC }, "配置远程聚合服务地址后，账本会增量同步到远程并按设备隔离存储；多台设备可以共享一个远程汇总。留空地址并保存可停用远程（数据仍保留在本机）。"),
				h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
					h("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } },
						h("label", { style: { width: "76px", fontSize: "13px", whiteSpace: "nowrap" } }, "服务地址"),
						h("input", {
							type: "text",
							value: remoteUrlInput,
							onChange: (e) => setRemoteUrlInput(e.target.value),
							placeholder: "https://stats.example.com",
							style: inputStyle
						})
					),
					h("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } },
						h("label", { style: { width: "76px", fontSize: "13px", whiteSpace: "nowrap" } }, "Token"),
						h("input", {
							type: "password",
							value: remoteTokenInput,
							onChange: (e) => setRemoteTokenInput(e.target.value),
							placeholder: config !== null && config.remoteTokenSet
								? "已保存（输入新值以替换，留空保持不变）"
								: "可选：远程服务鉴权 token",
							style: inputStyle
						})
					),
					h("div", { style: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" } },
						h("button", {
							type: "button",
							onClick: () => { void saveConfig(); },
							disabled: savingConfig || !configDirty,
							style: {
								padding: "6px 16px", borderRadius: "6px", fontSize: "13px",
								cursor: (savingConfig || !configDirty) ? "default" : "pointer",
								border: "1px solid var(--dsw-alias-border-l2)",
								background: (savingConfig || !configDirty) ? "transparent" : "var(--dsw-alias-interactive-bg-active)",
								color: (savingConfig || !configDirty) ? "inherit" : "var(--dsw-alias-brand-text)",
								fontFamily: "inherit",
								fontWeight: (savingConfig || !configDirty) ? 400 : 600,
								opacity: (savingConfig || !configDirty) ? 0.6 : 1
							}
						}, savingConfig ? "保存中…" : "保存配置"),
						configMsg === null ? null : h("span", { style: { fontSize: "12px", opacity: 0.8 } }, configMsg)
					)
				)
			);

			return h("div", {
				style: {
					padding: "16px 20px",
					fontFamily: "inherit",
					minWidth: 0,
					maxWidth: "100%",
					boxSizing: "border-box"
				}
			},
				SyncStatusBar(meta),
				header,
				body,
				remoteConfigPanel
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});