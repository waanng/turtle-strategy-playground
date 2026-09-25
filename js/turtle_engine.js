/**
 * turtle_engine.js — 海龟法则策略引擎（纯 JavaScript）
 * 计算结果与 Python 版 turtle_engine.py 完全一致
 * 可在浏览器和 Node.js 中运行
 */

const TurtleEngine = (() => {
  'use strict';

  // ===========================================================================
  // 1. IndicatorCalculator — 唐奇安通道 + ATR
  // ===========================================================================

  function rollingMax(arr, period, shift = 1) {
    const result = new Array(arr.length).fill(null);
    const deque = []; // stores indices
    for (let i = 0; i < arr.length; i++) {
      while (deque.length && deque[0] <= i - period) deque.shift();
      while (deque.length && arr[deque[deque.length - 1]] <= arr[i]) deque.pop();
      deque.push(i);
      if (i >= period - 1) result[i] = arr[deque[0]];
    }
    if (shift) {
      for (let i = result.length - 1; i >= 1; i--) result[i] = result[i - 1];
      result[0] = null;
    }
    return result;
  }

  function rollingMin(arr, period, shift = 1) {
    const result = new Array(arr.length).fill(null);
    const deque = [];
    for (let i = 0; i < arr.length; i++) {
      while (deque.length && deque[0] <= i - period) deque.shift();
      while (deque.length && arr[deque[deque.length - 1]] >= arr[i]) deque.pop();
      deque.push(i);
      if (i >= period - 1) result[i] = arr[deque[0]];
    }
    if (shift) {
      for (let i = result.length - 1; i >= 1; i--) result[i] = result[i - 1];
      result[0] = null;
    }
    return result;
  }

  function calcTrueRange(data) {
    const tr = new Array(data.length).fill(null);
    for (let i = 1; i < data.length; i++) {
      const h = data[i].high, l = data[i].low, pc = data[i - 1].close;
      tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    }
    return tr;
  }

  function calcATR(data, period, shift = 1) {
    const tr = calcTrueRange(data);
    const atr = new Array(data.length).fill(null);
    // Wilder initial: simple mean of first `period` TR values
    if (data.length >= period) {
      let sum = 0, count = 0;
      for (let i = 0; i < period; i++) {
        if (tr[i] != null) { sum += tr[i]; count++; }
      }
      if (count > 0) atr[period - 1] = sum / count;
      // Wilder recursive
      for (let i = period; i < data.length; i++) {
        if (tr[i] != null && atr[i - 1] != null) {
          atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
        }
      }
    }
    if (shift) {
      for (let i = atr.length - 1; i >= 1; i--) atr[i] = atr[i - 1];
      atr[0] = null;
    }
    return atr;
  }

  function calcDonchianChannel(high, low, period, shift = 1) {
    return {
      upper: rollingMax(high, period, shift),
      lower: rollingMin(low, period, shift),
    };
  }

  // ===========================================================================
  // 2. SignalGenerator
  // ===========================================================================

  function generateSignals(data, params) {
    const { entry_period, exit_period, atr_period } = params;
    const n = data.length;

    const high = data.map(d => d.high);
    const low = data.map(d => d.low);
    const close = data.map(d => d.close);

    const atr = calcATR(data, atr_period, 1);
    const entryCh = calcDonchianChannel(high, low, entry_period, 1);
    const exitCh = calcDonchianChannel(high, low, exit_period, 1);

    const entrySignal = new Array(n).fill(0);
    const exitSignal = new Array(n).fill(0);

    for (let i = entry_period; i < n; i++) {
      if (close[i] != null && entryCh.upper[i] != null && close[i] > entryCh.upper[i]) {
        entrySignal[i] = 1;
      }
      if (close[i] != null && exitCh.lower[i] != null && close[i] < exitCh.lower[i]) {
        exitSignal[i] = 1;
      }
    }

    return {
      entrySignal, exitSignal, atr,
      entryUpper: entryCh.upper, entryLower: entryCh.lower,
      exitUpper: exitCh.upper, exitLower: exitCh.lower,
    };
  }

  // ===========================================================================
  // 3. PositionManager helpers
  // ===========================================================================

  function calcUnitSize(equity, atr, price, riskFraction, minLot) {
    if (atr <= 0 || price <= 0) return 0;
    const riskAmount = equity * riskFraction;
    let shares = Math.floor(riskAmount / (atr * price));
    if (shares < 1) shares = 1;
    if (minLot > 1) shares = Math.floor(shares / minLot) * minLot;
    return Math.max(shares, minLot > 1 ? minLot : 1);
  }

  function checkStopLoss(positions, currentPrice, stopMultiple) {
    const indices = [];
    for (let i = 0; i < positions.length; i++) {
      const stopPrice = positions[i].entryPrice - stopMultiple * positions[i].entryATR;
      if (currentPrice < stopPrice) indices.push(i);
    }
    return indices;
  }

  function checkAddUnit(positions, currentPrice, atr, addUnitStep, maxUnits) {
    if (positions.length >= maxUnits || positions.length === 0) return false;
    const lastPrice = positions[positions.length - 1].entryPrice;
    return currentPrice > lastPrice + addUnitStep * atr;
  }

  // ===========================================================================
  // 4. BacktestEngine
  // ===========================================================================

  function runBacktest(data, params) {
    const {
      entry_period = 20, exit_period = 10, atr_period = 20,
      add_unit_step = 0.5, max_units = 4, stop_multiple = 2.0,
      risk_fraction = 0.01, initial_capital = 100000,
      commission_rate = 0.0003, slippage = 0.0001,
    } = params;

    const signals = generateSignals(data, params);
    const n = data.length;
    const isA = (params.ts_code || '').includes('.SH') || (params.ts_code || '').includes('.SZ');
    const minLot = isA ? 100 : 1;

    let cash = initial_capital;
    const positions = []; // [{ unitId, entryDate, entryPrice, shares, entryATR }]
    const equityRecords = [];
    const tradeRecords = [];

    for (let i = entry_period; i < n; i++) {
      const row = data[i];
      const date = row.date;
      const o = row.open, c = row.close, a = signals.atr[i];
      const entrySig = signals.entrySignal[i];
      const exitSig = signals.exitSignal[i];

      if (o == null || c == null || a == null) continue;

      // ① Stop loss
      const stops = checkStopLoss(positions, c, stop_multiple);
      if (stops.length > 0) {
        for (let s = stops.length - 1; s >= 0; s--) {
          const idx = stops[s];
          const p = positions[idx];
          const execP = o * (1 - slippage);
          const gross = p.shares * execP;
          const comm = gross * commission_rate;
          cash += gross - comm;
          tradeRecords.push({
            entryDate: p.entryDate, exitDate: date,
            direction: 'LONG', entryPrice: p.entryPrice,
            exitPrice: execP, shares: p.shares,
            returnPct: (execP - p.entryPrice) / p.entryPrice,
            holdingDays: Math.round((new Date(date) - new Date(p.entryDate)) / 86400000),
            entryATR: p.entryATR, stopLossTriggered: true,
          });
          positions.splice(idx, 1);
        }
      }

      // ② Exit signal
      if (positions.length > 0 && exitSig) {
        for (const p of positions) {
          const execP = o * (1 - slippage);
          const gross = p.shares * execP;
          const comm = gross * commission_rate;
          cash += gross - comm;
          tradeRecords.push({
            entryDate: p.entryDate, exitDate: date,
            direction: 'LONG', entryPrice: p.entryPrice,
            exitPrice: execP, shares: p.shares,
            returnPct: (execP - p.entryPrice) / p.entryPrice,
            holdingDays: Math.round((new Date(date) - new Date(p.entryDate)) / 86400000),
            entryATR: p.entryATR, stopLossTriggered: false,
          });
        }
        positions.length = 0;
      }

      // ③ Entry signal
      if (positions.length === 0 && entrySig) {
        const equity = cash;
        const unitShares = calcUnitSize(equity, a, o, risk_fraction, minLot);
        if (unitShares > 0) {
          const execP = o * (1 + slippage);
          const cost = unitShares * execP * (1 + commission_rate);
          if (cost <= cash) {
            cash -= cost;
            positions.push({
              unitId: 1, entryDate: date,
              entryPrice: execP, shares: unitShares, entryATR: a,
            });
          }
        }
      }

      // ④ Add unit
      else if (positions.length > 0 && positions.length < max_units &&
               checkAddUnit(positions, c, a, add_unit_step, max_units)) {
        const equity = cash;
        const unitShares = calcUnitSize(equity, a, o, risk_fraction, minLot);
        if (unitShares > 0) {
          const execP = o * (1 + slippage);
          const cost = unitShares * execP * (1 + commission_rate);
          if (cost <= cash) {
            cash -= cost;
            positions.push({
              unitId: positions.length + 1, entryDate: date,
              entryPrice: execP, shares: unitShares, entryATR: a,
            });
          }
        }
      }

      // ⑤ Record equity
      let posValue = 0;
      for (const p of positions) posValue += p.shares * c;
      const total = cash + posValue;

      equityRecords.push({
        date, cash, positionValue: posValue,
        totalEquity: total, close: c, atr: a,
        numUnits: positions.length,
      });
    }

    return { equityRecords, tradeRecords, signals };
  }

  // ===========================================================================
  // 5. MetricsCalculator
  // ===========================================================================

  function maxDrawdown(equityArr) {
    let peak = -Infinity;
    let maxDD = 0, ddStart = 0, ddEnd = 0, peakIdx = 0;
    for (let i = 0; i < equityArr.length; i++) {
      if (equityArr[i] > peak) { peak = equityArr[i]; peakIdx = i; }
      const dd = (equityArr[i] - peak) / peak;
      if (dd < maxDD) { maxDD = dd; ddEnd = i; ddStart = peakIdx; }
    }
    return { maxDD, ddStart, ddEnd };
  }

  function computeMetrics(equityRecords, tradeRecords, initialCapital, rfr = 0.025) {
    const n = equityRecords.length;
    if (n === 0) return {};

    const equity = equityRecords.map(e => e.totalEquity);
    const final = equity[n - 1];
    const cumRet = (final - initialCapital) / initialCapital;
    const years = n / 252;
    const annRet = years > 0 ? Math.pow(1 + cumRet, 1 / years) - 1 : 0;

    // Daily returns
    const dailyR = [];
    for (let i = 1; i < n; i++) {
      if (equity[i - 1] > 0) dailyR.push((equity[i] - equity[i - 1]) / equity[i - 1]);
    }
    const meanR = dailyR.reduce((s, v) => s + v, 0) / dailyR.length;
    const variance = dailyR.reduce((s, v) => s + (v - meanR) ** 2, 0) / dailyR.length;
    const annVol = Math.sqrt(variance) * Math.sqrt(252);
    const excess = dailyR.map(r => r - rfr / 252);
    const excessMean = excess.reduce((s, v) => s + v, 0) / excess.length;
    const excessStd = Math.sqrt(excess.reduce((s, v) => s + (v - excessMean) ** 2, 0) / excess.length);
    const sharpe = excessStd > 0 ? excessMean / excessStd * Math.sqrt(252) : 0;

    const { maxDD } = maxDrawdown(equity);

    const nTrades = tradeRecords.length;
    let winRate = 0, plRatio = 0, avgHold = 0, stopCount = 0;
    if (nTrades > 0) {
      const wins = tradeRecords.filter(t => t.returnPct > 0);
      const losses = tradeRecords.filter(t => t.returnPct <= 0);
      winRate = wins.length / nTrades;
      const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.returnPct, 0) / wins.length : 0;
      const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.returnPct, 0) / losses.length : 0;
      plRatio = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0;
      avgHold = tradeRecords.reduce((s, t) => s + (t.holdingDays || 0), 0) / nTrades;
      stopCount = tradeRecords.filter(t => t.stopLossTriggered).length;
    }

    const avgUnits = equityRecords.reduce((s, e) => s + (e.numUnits || 0), 0) / n;
    const maxUnitsH = Math.max(...equityRecords.map(e => e.numUnits || 0));
    const benchRet = (equityRecords[n - 1].close - equityRecords[0].close) / equityRecords[0].close;

    // Average position percentage
    let avgPosPct = 0;
    if (equityRecords[0].positionValue != null) {
      avgPosPct = equityRecords.reduce((s, e) =>
        s + (e.totalEquity > 0 ? e.positionValue / e.totalEquity : 0), 0) / n;
    }

    return {
      cumulativeReturn: cumRet, annualizedReturn: annRet,
      annualizedVolatility: annVol, sharpeRatio: sharpe,
      maxDrawdown: maxDD, winRate, profitLossRatio: plRatio,
      totalTrades: nTrades, avgHoldingDays: avgHold,
      avgUnits, maxUnitsHeld: maxUnitsH, stopLossCount: stopCount,
      benchmarkReturn: benchRet, excessReturn: cumRet - benchRet,
      avgPositionPct: avgPosPct,
    };
  }

  // ===========================================================================
  // 6. Detail chart data export
  // ===========================================================================

  function exportDetailData(data, params, recentDays = 150) {
    const signals = generateSignals(data, params);
    const { equityRecords, tradeRecords } = runBacktest(data, params);
    const n = data.length;

    // Last N days
    const start = Math.max(0, n - recentDays);
    const slice = (arr) => arr.slice(start);

    const labels = slice(data.map(d => d.date));
    const close = slice(data.map(d => d.close));
    const entryUpper = slice(signals.entryUpper);
    const entryLower = slice(signals.entryLower);
    const exitUpper = slice(signals.exitUpper);
    const exitLower = slice(signals.exitLower);
    const atr = slice(signals.atr);

    // Collect signal points (last recentDays only)
    const entryPoints = [], exitPoints = [];
    for (let i = start; i < n; i++) {
      if (signals.entrySignal[i] === 1) {
        entryPoints.push({ date: data[i].date, price: data[i].close });
      }
      if (signals.exitSignal[i] === 1) {
        exitPoints.push({ date: data[i].date, price: data[i].close });
      }
    }

    // Add-unit and stop-loss points from trades
    const addPoints = [], stopPoints = [];
    // Group trades by entryDate to find add-unit days
    const entryDateCount = {};
    for (const t of tradeRecords) {
      entryDateCount[t.entryDate] = (entryDateCount[t.entryDate] || 0) + 1;
      if (t.stopLossTriggered) {
        stopPoints.push({ date: t.exitDate, price: t.exitPrice });
      }
    }
    for (const [date, count] of Object.entries(entryDateCount)) {
      if (count > 1 && date >= (data[start]?.date || '')) {
        const t = tradeRecords.find(tr => tr.entryDate === date);
        if (t) addPoints.push({ date, price: t.entryPrice });
      }
    }

    return {
      labels, close, entryUpper, entryLower, exitUpper, exitLower, atr,
      entryPoints, exitPoints, addPoints, stopPoints,
    };
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  return {
    calcTrueRange, calcATR, calcDonchianChannel,
    generateSignals, runBacktest, computeMetrics,
    exportDetailData, calcUnitSize,
  };
})();

// Node.js / module export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TurtleEngine;
}
