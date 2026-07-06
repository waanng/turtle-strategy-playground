#!/usr/bin/env python3
"""
GitHub Actions 用：yfinance 拉取 5 只股票原始 OHLCV → raw_{code}.json
不做任何指标计算，纯原始数据
"""
import yfinance as yf
import json
import os
import sys
from datetime import datetime, timezone, timedelta

STOCKS = {
    '688981.SH': {'yf': '688981.SS', 'name': '中芯国际A', 'market': 'A股'},
    '002594.SZ': {'yf': '002594.SZ', 'name': '比亚迪A', 'market': 'A股'},
    '600900.SH': {'yf': '600900.SS', 'name': '长江电力A', 'market': 'A股'},
    '0981.HK':   {'yf': '0981.HK', 'name': '中芯国际HK', 'market': '港股'},
    '1211.HK':   {'yf': '1211.HK', 'name': '比亚迪HK', 'market': '港股'},
}

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dist', 'data')
os.makedirs(OUTPUT_DIR, exist_ok=True)

def main():
    tz = timezone(timedelta(hours=8))
    print(f"[{datetime.now(tz):%Y-%m-%d %H:%M:%S}] 开始拉取原始数据...")

    for ts_code, info in STOCKS.items():
        yf_code = info['yf']
        print(f"  {ts_code} ({yf_code})...", end=' ', flush=True)

        try:
            ticker = yf.Ticker(yf_code)
            df = ticker.history(period='3y', auto_adjust=True)
            if df.empty:
                print(f"✗ 无数据")
                continue

            df = df.reset_index()
            records = []
            for _, row in df.iterrows():
                records.append({
                    'date': str(row['Date'])[:10],
                    'open': round(float(row['Open']), 2),
                    'high': round(float(row['High']), 2),
                    'low': round(float(row['Low']), 2),
                    'close': round(float(row['Close']), 2),
                    'volume': int(row['Volume']),
                })

            output = {
                'ts_code': ts_code,
                'name': info['name'],
                'market': info['market'],
                'data': records,
            }

            out_path = os.path.join(OUTPUT_DIR, f'raw_{ts_code}.json')
            with open(out_path, 'w', encoding='utf-8') as f:
                json.dump(output, f, ensure_ascii=False)
            print(f"✓ {len(records)} 行 → {out_path}")

        except Exception as e:
            print(f"✗ {e}")

    print(f"[{datetime.now(tz):%Y-%m-%d %H:%M:%S}] 完成")

if __name__ == '__main__':
    main()
