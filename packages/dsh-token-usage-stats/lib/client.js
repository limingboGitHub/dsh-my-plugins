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

		/** Local YYYY-MM (for month-grain bucket labels). */
		function formatMonth(ts) {
			const d = new Date(ts);
			const pad = (n) => String(n).padStart(2, "0");
			return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
		}

		/** Number formatting that tolerates a missing field (renders "0"). */
		function num(value) {
			return typeof value === "number" ? value.toLocaleString() : "0";
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

		/** Host route serving the aggregated ledger summary as JSON. */
		const STATS_ENDPOINT = "/api/token-usage-stats";

		/** Host route serving the bucketed time series feeding both bar charts. */
		const SERIES_ENDPOINT = "/api/token-usage-stats/series";

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

		/** A stable, theme-aware palette for bars and pie slices (CSS-variable based). */
		const CHART_COLORS = [
			"var(--dsw-static-deepseek-500, rgb(65, 118, 230))",
			"var(--dsw-static-blue-500, rgb(59, 130, 246))",
			"var(--dsw-static-green-500, rgb(34, 197, 94))",
			"var(--dsw-static-amber-500, rgb(245, 158, 11))",
			"var(--dsw-static-red-500, rgb(239, 68, 68))",
			"var(--dsw-static-deepseek-400, rgb(103, 158, 254))",
			"var(--dsw-static-blue-400, rgb(96, 165, 250))",
			"var(--dsw-static-green-400, rgb(78, 209, 126))",
			"var(--dsw-static-amber-400, rgb(247, 173, 49))",
			"var(--dsw-static-red-400, rgb(242, 90, 90))"
		];

		const CARD = {
			padding: "16px 18px",
			borderRadius: "12px",
			minWidth: 0,
			color: "var(--dsw-alias-label-primary)",
			// A faint amber/red tint keeps cards from feeling flat while remaining readable in both themes.
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
		const ROW_ACCENT = {
			width: "6px",
			borderRadius: "2px",
			marginRight: "8px",
			flex: "none",
			background: "var(--dsw-static-deepseek-500, rgb(65, 118, 230))"
		};

		/** Palette color for a 0-based index: a wrapper object lets the style sheet
		 * consume the palette entry directly (CSS variables stay unresolved until paint). */
		function colorOf(index) {
			const color = CHART_COLORS[index % CHART_COLORS.length];
			return { background: color };
		}

		/** Render a horizontal labeled row for curve/pie legends: color chip + text. */
		function LegendItem(color, label, value) {
			return h("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" } },
				h("span", { style: { ...color, width: "10px", height: "10px", borderRadius: "2px", flex: "none" } }),
				h("span", { style: { flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, label),
				h("span", { style: { color: "var(--dsw-alias-label-secondary)", whiteSpace: "nowrap" } }, value)
			);
		}

		/** One SVG vertical bar chart of token totals by time bucket. */
		function BarChart(buckets, formatLabel) {
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
				const hgt = Math.max(2, (b.tokens / maxV) * (H - PAD_T - PAD_B));
				const y = H - PAD_B - hgt;
				// A native SVG <title> gives an in-browser hover bubble with the
				// exact numbers; no custom tooltip wiring is needed in the shell.
				return h("g", { key: i },
					h("title", null, `${formatLabel(b, i)}：${compact(b.tokens)} tokens${b.calls != null ? `（${compact(b.calls)} 次调用）` : ""}`),
					h("rect", {
						x: String(x),
						y: String(y),
						width: String(barW),
						height: String(hgt),
						rx: "2",
						fill: CHART_COLORS[i % 3],
						opacity: "0.9"
					})
				);
			});
			// y-axis gridlines with compact labels.
			const grid = [0, 1, 2, 3].map(i => {
				const val = maxV * (i / 3);
				const y = H - PAD_B - (val / maxV) * (H - PAD_T - PAD_B);
				return h("g", { key: i },
					h("line", { x1: String(PAD_L), y1: String(y), x2: String(W - 8), y2: String(y), stroke: "var(--dsw-alias-border-l1)", strokeWidth: "1" }),
					h("text", { x: String(PAD_L - 6), y: String(y + 4), fontSize: "10", fill: "var(--dsw-alias-label-tertiary)", textAnchor: "end" }, compact(val))
				);
			});
			const xLabels = buckets.map((b, i) => {
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
			// radius 52 => center (63,56); legend sits to the right.
			const R2 = 52, CX = 63, CY = 56;
			let angle = -90;
			const slices = [];
			const push = (value, color, tip) => {
				if (value <= 0) return;
				const frac = value / total;
				const a1 = angle;
				const a2 = angle + frac * 360;
				angle = a2;
				slices.push({ a1, a2, color, tip, label: tip });
			};
			top.forEach((m, i) => push(m.totalTokens, CHART_COLORS[i % CHART_COLORS.length], m.model));
			if (others > 0) push(others, "var(--dsw-alias-label-tertiary)", "others");
			const arc = (a) => ((a * Math.PI) / 180);
			const parts = slices.map((s, i) => {
				// A 360° slice has coincident start/end points, which no arc
				// command can represent; render it as a plain full circle.
				const delta = s.a2 - s.a1;
				const tipText = s.tip === "others"
					? `其他模型：${compact(others)} tokens`
					: `${s.label}：${compact(top.find(m => m.model === s.tip)?.totalTokens ?? 0)} tokens`;
				if (delta >= 359.99) {
					return h("g", { key: i },
						h("title", null, tipText),
						h("circle", {
							cx: String(CX),
							cy: String(CY),
							r: String(R2),
							fill: s.color
						})
					);
				}
				const x1 = CX + R2 * Math.cos(arc(s.a1));
				const y1 = CY + R2 * Math.sin(arc(s.a1));
				const x2 = CX + R2 * Math.cos(arc(s.a2));
				const y2 = CY + R2 * Math.sin(arc(s.a2));
				// SVG arc segments (`A rx ry x-axis-rotation large-arc-flag sweep-flag x y`).
				// Angles increase clockwise in screen space (y-down), so sweep-flag 1
				// draws each wedge through the short arc to its trailing edge; the
				// large-arc flag is set only when a single slice spans > 180°.
				return h("g", { key: i },
					h("title", null, tipText),
					h("path", {
						d: `M ${CX} ${CY} L ${x1} ${y1} A ${R2} ${R2} 0 ${delta > 180 ? 1 : 0} 1 ${x2} ${y2} Z`,
						fill: s.color
					})
				);
			});
			// Legend to the right.
			const legend = top.map((m, i) => LegendItem(
				{ background: CHART_COLORS[i % CHART_COLORS.length] },
				m.model,
				compact(m.totalTokens)
			));
			if (others > 0) legend.push(LegendItem({ background: "var(--dsw-alias-label-tertiary)" }, "其他模型", compact(others)));
			return h("div", { style: { display: "flex", gap: "12px", alignItems: "flex-start" } },
				h("svg", { viewBox: "0 0 126 112", style: { width: "126px", height: "112px", flex: "none" } }, ...parts),
				h("div", { style: { flex: "1", minWidth: "0", fontSize: "12px" } }, ...legend)
			);
		}

		/** One statistics table over rows keyed by `labelKey`. */
		function StatsTable(labelHeader, labelKey, rows) {
			const body = rows.length > 0
				? rows.map((item, idx) => h("tr", { key: idx },
					h("td", { style: TD },
						h("div", { style: { display: "flex", alignItems: "center", gap: "6px" } },
							h("span", { style: { ...colorOf(idx), width: "9px", height: "9px", borderRadius: "2px", flex: "none" } }),
							h("span", { className: "dsh-token-truncate" }, item[labelKey])
						)
					),
					h("td", { style: TD_R }, num(item.calls)),
					h("td", { style: TD_R }, compact(item.totalTokens))
				))
				: [h("tr", { key: "empty" }, h("td", {
					colSpan: 3,
					style: { textAlign: "center", padding: "20px", opacity: 0.6 }
				}, "暂无数据"))];

			return h("table", {
				style: {
					width: "100%",
					// Fixed layout keeps the name column from being widened by long ids.
					tableLayout: "fixed",
					borderCollapse: "collapse",
					marginBottom: "24px",
					fontSize: "13px"
				}
			},
				h("colgroup", null,
					h("col", { style: { width: "auto" } }),
					h("col", { style: { width: "6.5em" } }),
					h("col", { style: { width: "9em" } })
				),
				h("thead", null, h("tr", null,
					h("th", { style: TH }, labelHeader),
					h("th", { style: TH_R }, "调用次数"),
					h("th", { style: TH_R }, "Token 数")
				)),
				h("tbody", null, ...body)
			);
		}

		/** Local 00:00:00 of the day containing `ts`, in epoch ms. */
		function dayStartMs(ts) {
			const d = new Date(ts);
			d.setHours(0, 0, 0, 0);
			return d.getTime();
		}

		/** One SVG month-grid calendar heatmap colored by daily token intensity.
		 * The window is the newest 30 buckets; cells not present in the window
		 * (recent days with no activity) fall back to an "empty" color.
		 * @param buckets - newest-first `day` buckets from the series endpoint.
		 */
		function Heatmap(buckets) {
			// Anchor the 30-cell grid on the most recent local day regardless of
			// whether a bucket was recorded for it (sparse ledger until today).
			const byDay = new Map();
			for (const b of buckets ?? []) byDay.set(dayStartMs(b.ts), b.tokens ?? 0);
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const cells = [];
			for (let ago = 29; ago >= 0; ago--) {
				const d = new Date(today.getTime() - ago * 86400000);
				d.setHours(0, 0, 0, 0);
				cells.push({ ts: d.getTime(), tokens: byDay.get(d.getTime()) ?? 0 });
			}
			const maxV = Math.max(...cells.map(c => c.tokens), 1);

			// 7 rows (weekdays top-to-bottom, Monday first) x 5 columns renders 30 days.
			const COLS = 5, ROWS = 7, CELL = 18, GAP = 3, PAD = 6;
			const dayLabel = (ts) => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()}`; };
			const parts = [];
			const order = [6, 0, 1, 2, 3, 4, 5]; // weekday -> row, Monday first
			for (let i = 0; i < 30; i++) {
				const cell = cells[i];
				const col = Math.floor(i / ROWS);
				const row = order[new Date(cell.ts).getDay()];
				const x = PAD + col * (CELL + GAP);
				const y = PAD + row * (CELL + GAP);
				const frac = cell.tokens > 0 ? Math.sqrt(cell.tokens / maxV) : 0;
				// A dark-to-visible ramping through the deepseek accent makes empty
				// cells read as background while busy cells step up in intensity.
				const alpha = cell.tokens > 0 ? 0.25 + 0.75 * frac : 0;
				const fill = cell.tokens > 0
					? `rgba(90, 120, 255, ${alpha.toFixed(2)})`
					: "var(--dsw-alias-bg-layer-3)";
				parts.push(h("g", { key: i },
					h("rect", {
						x: String(x), y: String(y),
						width: String(CELL), height: String(CELL),
						rx: "4",
						fill,
						stroke: "var(--dsw-alias-border-l1)"
					}),
					h("title", null, `${dayLabel(cell.ts)}：${cell.tokens === 0 ? "无记录" : compact(cell.tokens) + " tokens"}`)
				));
			}
			// Weekday header labels down the left column.
			const dayNames = ["一", "二", "三", "四", "五", "六", "日"];
			const labels = dayNames.map((name, i) => {
				const my = PAD + order[i] * (CELL + GAP) + CELL / 2;
				return h("text", { key: "l" + i, x: String(PAD + 4), y: String(my + 4), fontSize: "9", fill: "var(--dsw-alias-label-tertiary)", textAnchor: "middle" }, name);
			});
			const WCH = PAD + ROWS * (CELL + GAP) + PAD;
			const WCM = PAD + COLS * (CELL + GAP) + PAD;
			return h("div", null,
				h("svg", { viewBox: `0 0 ${WCM} ${WCH}`, style: { width: "100%", height: "auto", maxHeight: "120px", display: "block" } },
					...labels, ...parts),
				h("div", { style: { display: "flex", alignItems: "center", gap: "6px", marginTop: "6px", fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } },
					h("span", null, "低"),
					h("span", { style: { width: "12px", height: "12px", borderRadius: "3px", background: "var(--dsw-alias-bg-layer-3)" } }),
					h("span", { style: { fontSize: "16px", lineHeight: "12px", color: "var(--dsw-static-blue-500, rgb(59,130,246))" } }, "▲"),
					h("span", null, "高"),
					h("span", { style: { marginLeft: "auto", opacity: 0.7 } }, "近 30 天每日使用量")
				)
			);
		}

		// Weekday header labels; factored so the grid width stays correct.
		function TokenUsageSettingsPage() {
			const [summary, setSummary] = R.useState(null);
			const [loading, setLoading] = R.useState(true);
			const [error, setError] = R.useState(null);
			const [range, setRange] = R.useState("all");
			const [customFrom, setCustomFrom] = R.useState("");
			const [customTo, setCustomTo] = R.useState("");
			// Bar-chart granularity: "day" shows per-day bars, "month" per-month.
			const [granularity, setGranularity] = R.useState("day");
			// Series buckets for the bar chart (or null while loading / on error).
			const [series, setSeries] = R.useState(null);
			// Daily buckets for the last-30-days heatmap (or null while loading).
			const [heatFile, setHeatFile] = R.useState(null);

			const load = R.useCallback(async (which, from, to) => {
				setLoading(true);
				setError(null);
				try {
					let url = STATS_ENDPOINT;
					if (which === "custom") {
						const params = new URLSearchParams();
						if (from) params.set("from", from);
						if (to) params.set("to", to);
						url += "?" + params.toString();
					} else {
						url += "?range=" + which;
					}
					const response = await fetch(url, { headers: { accept: "application/json" } });
					if (!response.ok) throw new Error("读取统计数据失败：HTTP " + response.status);
					setSummary(await response.json());
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				} finally {
					setLoading(false);
				}
			}, []);

			// Fetch the time series for the current bar granularity. Length after
			// the cap is dropped by the host (series/limit), so a scaled bucket
			// will not drift in UI when the ledger holds more history.
			const loadSeries = R.useCallback(async (grain) => {
				setError(null);
				try {
					const url = SERIES_ENDPOINT + "?granularity=" + encodeURIComponent(grain) + "&limit=14";
					const response = await fetch(url, { headers: { accept: "application/json" } });
					if (!response.ok) throw new Error("读取图表数据失败：HTTP " + response.status);
					setSeries(await response.json());
				} catch (err) {
					setSeries(null);
				}
			}, []);

			// Fetch daily buckets for the last-30-days heatmap (30 always fits the
			// newest-window cap and matches the heatmap's fixed window).
			const loadHeatmap = R.useCallback(async () => {
				try {
					const url = SERIES_ENDPOINT + "?granularity=day&limit=30";
					const response = await fetch(url, { headers: { accept: "application/json" } });
					if (!response.ok) throw new Error("读取热力图失败：HTTP " + response.status);
					setHeatFile(await response.json());
				} catch (err) {
					setHeatFile(null);
				}
			}, []);

			// Fetch on open and whenever the named range changes.
			R.useEffect(() => {
				if (range !== "custom") void load(range);
			}, [load, range]);

			// Refetch the bar series whenever its granularity changes.
			R.useEffect(() => {
				void loadSeries(granularity);
			}, [loadSeries, granularity]);

			// Fetch the heatmap once on open.
			R.useEffect(() => {
				void loadHeatmap();
			}, [loadHeatmap]);

			const button = (key, label, active, onClick) => h("button", {
				key,
				type: "button",
				onClick,
				disabled: loading,
				style: {
					padding: "5px 12px",
					borderRadius: "6px",
					cursor: loading ? "default" : "pointer",
					border: "1px solid var(--dsw-alias-border-l2)",
					background: active ? "var(--dsw-alias-interactive-bg-active)" : "transparent",
					color: active ? "var(--dsw-alias-brand-text)" : "inherit",
					// Individual longhands only: a `font` shorthand here would
					// override the size and weight set alongside it.
					fontFamily: "inherit",
					fontSize: "13px",
					fontWeight: active ? 600 : 400,
					opacity: loading ? 0.6 : 1
				}
			}, label);

			const header = h("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: "10px",
					marginBottom: "18px"
				}
			},
				h("div", {
					style: {
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: "12px",
						flexWrap: "wrap"
					}
				},
					h("h2", { style: { margin: 0, fontSize: "17px" } }, "Token 使用统计"),
					h("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
						...RANGES.map(item => button(
							item.id,
							item.label,
							item.id === range,
							() => { setRange(item.id); }
						)),
						button("custom", "自定义", range === "custom", () => { setRange("custom"); })
					)
				),
				// Custom date picker row; only visible when range === "custom"
				range === "custom" && h("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: "8px",
						fontSize: "13px",
						flexWrap: "wrap"
					}
				},
					h("label", { style: { display: "flex", alignItems: "center", gap: "6px" } },
						h("span", null, "起始日期:"),
						h("input", {
							type: "date",
							value: customFrom,
							onChange: (e) => setCustomFrom(e.target.value),
							style: {
								padding: "4px 8px",
								border: "1px solid var(--dsw-alias-border-l2)",
								borderRadius: "4px",
								fontSize: "13px"
							}
						})
					),
					h("label", { style: { display: "flex", alignItems: "center", gap: "6px" } },
						h("span", null, "结束日期:"),
						h("input", {
							type: "date",
							value: customTo,
							onChange: (e) => setCustomTo(e.target.value),
							style: {
								padding: "4px 8px",
								border: "1px solid var(--dsw-alias-border-l2)",
								borderRadius: "4px",
								fontSize: "13px"
							}
						})
					),
					h("button", {
						type: "button",
						onClick: () => { void load("custom", customFrom, customTo); },
						disabled: loading || (!customFrom && !customTo),
						style: {
							padding: "4px 12px",
							borderRadius: "4px",
							fontSize: "13px",
							cursor: (loading || (!customFrom && !customTo)) ? "default" : "pointer",
							border: "1px solid var(--dsw-alias-border-l2)",
							background: "transparent",
							color: "inherit",
							fontFamily: "inherit",
							opacity: (loading || (!customFrom && !customTo)) ? 0.6 : 1
						}
					}, "查询")
				)
			);

			let body;
			if (error !== null) {
				body = h("div", { style: { padding: "20px", color: "var(--dsw-alias-state-error-primary)" } }, "错误：" + error);
			} else if (summary === null) {
				body = h("div", { style: { padding: "20px", opacity: 0.6 } }, "正在加载 Token 使用统计…");
			} else {
				const card = (label, value) => h("div", { style: CARD },
					h("div", { style: CARD_LABEL }, label),
					h("div", { style: CARD_VALUE }, value)
				);

				// Bucket label for the bar chart: 今日/昨日, "MM-DD", or "YYYY-MM".
				const formatBucket = (b, i) => {
					if (granularity === "month") return formatMonth(b.ts);
					const d = new Date(b.ts);
					const nowDay = new Date();
					nowDay.setHours(0, 0, 0, 0);
					const diff = Math.round((nowDay.getTime() - d.getTime()) / 86400000);
					if (diff === 0) return "今日";
					if (diff === 1) return "昨日";
					const pad = (n) => String(n).padStart(2, "0");
					return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
				};

				// Pie is derived client-side from the ranked per-model list: the
				// top 10 models plus an "其他模型" aggregate for the remainder.
				const pie = renderPie(summary.byModel ?? [], 10);

				// Only render the bar chart once the loaded series matches the
				// selected granularity. While the new grain's fetch is in flight
				// series still holds the previous grain's buckets; without this
				// gate the stale bars (e.g. 12 day-bars while switching to 按月)
				// would render first and then visibly swap to the month bars.
				const chartReady = series !== null && series.granularity === granularity
					&& (granularity === "day" ? summary !== null : true);

				const chartPanel = (title, desc) => h("div", {
					style: {
						border: "1px solid var(--dsw-alias-border-l2)",
						borderRadius: "12px",
						padding: "14px 16px",
						marginBottom: "16px",
						// Dark variants of the deepseek accent keep the header tinted
						// while the chart itself stays on the neutral panel.
						background: "var(--dsw-alias-bg-layer-1)"
					}
				},
					h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", marginBottom: "10px" } },
						h("h3", { style: { margin: 0, fontSize: "14px" } }, title),
						h("div", { style: { display: "flex", gap: "6px" } },
							button("g-day", "按天", granularity === "day", () => { setGranularity("day"); }),
							button("g-month", "按月", granularity === "month", () => { setGranularity("month"); })
						)
					),
					h("div", { style: { fontSize: "12px", opacity: 0.7, marginBottom: "8px" } }, desc),
					chartReady
						? BarChart(series.buckets, formatBucket)
						: h("div", { style: { padding: "18px", opacity: 0.6 } }, "正在加载图表…")
				);

				body = h("div", { style: { minWidth: 0 } },
					h("div", {
						// auto-fit collapses to fewer columns in a narrow panel
						// instead of forcing the page wider than its container.
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
						card("缓存写入", compact(summary.cacheWriteTokens))
					),
					chartPanel("Token 消耗趋势", granularity === "day"
						? "最近 14 天每日消耗；悬停查看精确数值。"
						: "最近 14 个月每月消耗；悬停查看精确数值。"),
					h("div", {
						style: {
							border: "1px solid var(--dsw-alias-border-l2)",
							borderRadius: "12px",
							padding: "14px 16px",
							marginBottom: "16px"
						}
					},
						h("h3", { style: { margin: "0 0 10px", fontSize: "14px" } }, "近 30 天使用热度"),
						h("div", { style: { fontSize: "12px", opacity: 0.7, marginBottom: "8px" } }, "按天着色，颜色越深表示当天 token 消耗越多；悬停查看精确数值。"),
						heatFile === null
							? h("div", { style: { padding: "18px", opacity: 0.6 } }, "正在加载热力图…")
							: Heatmap(heatFile?.buckets ?? [])
					),
					h("div", {
						style: {
							border: "1px solid var(--dsw-alias-border-l2)",
							borderRadius: "12px",
							padding: "14px 16px",
							marginBottom: "16px"
						}
					},
						h("h3", { style: { margin: "0 0 10px", fontSize: "14px" } }, "模型用量占比 Top 10"),
						pie
					),
					h("h3", { style: { margin: "0 0 10px", fontSize: "14px" } }, "按提供商统计"),
					StatsTable("提供商", "provider", summary.byProvider ?? []),
					h("h3", { style: { margin: "0 0 10px", fontSize: "14px" } }, "按模型统计"),
					StatsTable("模型", "model", summary.byModel ?? [])
				);
			}

			return h("div", {
				// The section is a flex/grid child; min-width:0 lets it shrink so
				// the settings pane never grows a horizontal scrollbar.
				style: {
					padding: "16px 20px",
					fontFamily: "inherit",
					minWidth: 0,
					maxWidth: "100%",
					boxSizing: "border-box"
				}
			}, header, body);
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
