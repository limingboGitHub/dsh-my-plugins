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

		/** Host route serving the aggregated ledger summary as JSON. */
		const STATS_ENDPOINT = "/api/token-usage-stats";

		const inject = ["slots"];

		function apply(ctx) {
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "token-usage-stats",
				label: "Token 使用统计"
			}, TokenUsageSettingsPage));
		}

		/** Format an integer with thousands separators, tolerating absent values. */
		function num(value) {
			return typeof value === "number" ? value.toLocaleString() : "0";
		}

		/** Selectable reporting windows, in the order they appear. */
		const RANGES = [
			{ id: "day", label: "今日" },
			{ id: "week", label: "本周" },
			{ id: "month", label: "本月" },
			{ id: "all", label: "全部" }
		];

		const CARD = {
			padding: "12px 14px",
			border: "1px solid var(--dsw-color-border, #ddd)",
			borderRadius: "8px",
			minWidth: 0
		};
		const CARD_LABEL = { fontSize: "12px", opacity: 0.7, marginBottom: "4px" };
		// Long digit runs are the overflow source; wrap instead of widening the page.
		const CARD_VALUE = { fontSize: "20px", fontWeight: 600, overflowWrap: "anywhere" };
		const CELL = { padding: "8px 10px", borderBottom: "1px solid var(--dsw-color-border-subtle, #eee)" };
		const HEAD = { padding: "8px 10px", borderBottom: "2px solid var(--dsw-color-border, #ddd)", fontWeight: 600 };
		const TH = { ...HEAD, textAlign: "left" };
		const TH_R = { ...HEAD, textAlign: "right", whiteSpace: "nowrap" };
		const TD = { ...CELL, overflowWrap: "anywhere" };
		const TD_R = { ...CELL, textAlign: "right", whiteSpace: "nowrap" };

		/** One statistics table over rows keyed by `labelKey`. */
		function StatsTable(labelHeader, labelKey, rows) {
			const body = rows.length > 0
				? rows.map((item, idx) => h("tr", { key: idx },
					h("td", { style: TD }, item[labelKey]),
					h("td", { style: TD_R }, num(item.calls)),
					h("td", { style: TD_R }, num(item.totalTokens))
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

		function TokenUsageSettingsPage() {
			const [summary, setSummary] = R.useState(null);
			const [loading, setLoading] = R.useState(true);
			const [error, setError] = R.useState(null);
			const [range, setRange] = R.useState("all");
			const [customFrom, setCustomFrom] = R.useState("");
			const [customTo, setCustomTo] = R.useState("");

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

			// Fetch on open and whenever the named range changes.
			R.useEffect(() => {
				if (range !== "custom") void load(range);
			}, [load, range]);

			const button = (key, label, active, onClick) => h("button", {
				key,
				type: "button",
				onClick,
				disabled: loading,
				style: {
					padding: "5px 12px",
					borderRadius: "6px",
					cursor: loading ? "default" : "pointer",
					border: "1px solid var(--dsw-color-border, #ddd)",
					background: active ? "var(--dsw-color-fill-active, rgba(127,127,127,.18))" : "transparent",
					color: "inherit",
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
						button("custom", "自定义", range === "custom", () => { setRange("custom"); }),
						button("refresh", loading ? "刷新中…" : "刷新", false, () => {
							void load(range, customFrom, customTo);
						})
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
								border: "1px solid var(--dsw-color-border, #ddd)",
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
								border: "1px solid var(--dsw-color-border, #ddd)",
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
							border: "1px solid var(--dsw-color-border, #ddd)",
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
				body = h("div", { style: { padding: "20px", color: "var(--dsw-color-danger, #d33)" } }, "错误：" + error);
			} else if (summary === null) {
				body = h("div", { style: { padding: "20px", opacity: 0.6 } }, "正在加载 Token 使用统计…");
			} else {
				const card = (label, value) => h("div", { style: CARD },
					h("div", { style: CARD_LABEL }, label),
					h("div", { style: CARD_VALUE }, value)
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
						card("总调用次数", num(summary.totalCalls)),
						card("总 Token 数", num(summary.totalTokens)),
						card("输入", num(summary.inputTokens)),
						card("输出", num(summary.outputTokens)),
						card("缓存命中", num(summary.cacheReadTokens)),
						card("缓存写入", num(summary.cacheWriteTokens))
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
