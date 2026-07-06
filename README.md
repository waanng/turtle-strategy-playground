# 🐢 海龟法则 · 交互式回测 Playground

自由调整海龟法则所有参数，浏览器内实时回测。

## 功能

- **可调参数**：入场/退出通道、ATR周期、加仓步长、最大单位、止损倍数、风险预算
- **3 个预设**：🐢经典海龟 / 🐇短线快进 / 🐘长线稳健
- **5 个标的**：中芯国际A、比亚迪A、长江电力A、中芯国际HK、比亚迪HK
- **时段选择**：3年/1年/6月/3月
- **实时回测**：参数调整后 <100ms 出结果
- **三线净值对比**：策略 vs 满仓买入持有 vs 等仓位买入持有
- **信号图**：唐奇安通道 + ▲▼◆✕ 买卖点标记
- **交易明细表**：可排序

## 技术

- 纯前端，零后端
- `turtle_engine.js`：JS 版海龟策略引擎（与 Python 版结果一致）
- Chart.js 4.x
- 数据：GitHub Actions 每日 yfinance 拉取原始 OHLCV

## 地址

🔗 https://waanng.github.io/turtle-strategy-playground/

📊 每日监控看板：https://waanng.github.io/turtle-strategy-dashboard/
