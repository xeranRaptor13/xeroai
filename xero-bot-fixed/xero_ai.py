"""
XERO AI SOFTWARE — Dual Timeframe Manual Alert Bot + Live Web Dashboard
=========================================================================
Dashboard : http://localhost:8050

Strategy  : DUAL TIMEFRAME — AUTO TRADING via TELEGRAM ALERTS
──────────────────────────────────────────────────────────────────────────
HTF (2-min candles) — GATE:
  FIRE condition detected → Check LTF MAP position immediately
  If LTF MAP is NOT in the same band as HTF signal → DISCARD, no window
  If LTF MAP IS in the same band → Telegram alert sent, window opens

  BUY  signal → LTF MAP must be BELOW BB Lower at that moment
  SELL signal → LTF MAP must be ABOVE BB Upper at that moment

LTF (1-min candles) — TRIGGER:
  Only active during an open HTF confirmation window
  Same direction fires    → Telegram ENTRY alert sent (you enter manually)
  Opposite direction      → Ignored, window stays open
  HTF invalidates         → Window closed

FIRE condition (identical on HTF and LTF):
  BUY  : MAP and SIGNAL both exit below BB Lower, curl up, and re-enter
         the lower band from below (prev < BB Lower, curr > BB Lower, curr > prev)
  SELL : MAP and SIGNAL both exit above BB Upper, curl down, and re-enter
         the upper band from above (prev > BB Upper, curr < BB Upper, curr < prev)

Candle data: Deriv native OHLC stream via ticks_history + subscribe
  HTF granularity :  120 seconds (2 min)
  LTF granularity :   60 seconds (1 min)

Requirements:
    pip install websocket-client plotly dash dash-bootstrap-components requests kaleido
"""

import os
import sys
import websocket
import json
import time
import threading
import math
import requests
import io
from dotenv import load_dotenv

load_dotenv()  # reads variables from a local .env file into the environment
from collections import deque
from datetime import datetime

import plotly.graph_objects as go
import dash
from dash import dcc, html
from dash.dependencies import Input, Output
import dash_bootstrap_components as dbc

# ============================================================
# HELPERS
# ============================================================

def get_ts():
    return datetime.now().strftime("%H:%M:%S")

def get_dt():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

# ============================================================
# CONFIGURATION
# ============================================================

# All secrets below are loaded from a local .env file (see .env.example)
# — never hardcode real credentials directly in this file. .env is listed
# in .gitignore so it never gets committed by accident.
API_TOKEN  = os.getenv("DERIV_API_TOKEN")
APP_ID     = os.getenv("DERIV_APP_ID")
ACCOUNT_ID = os.getenv("DERIV_ACCOUNT_ID")
REST_BASE  = "https://api.derivws.com"

# ---- Telegram ----
TELEGRAM_TOKEN   = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

_REQUIRED_ENV_VARS = {
    "DERIV_API_TOKEN": API_TOKEN,
    "DERIV_APP_ID": APP_ID,
    "DERIV_ACCOUNT_ID": ACCOUNT_ID,
    "TELEGRAM_BOT_TOKEN": TELEGRAM_TOKEN,
    "TELEGRAM_CHAT_ID": TELEGRAM_CHAT_ID,
}
_missing = [name for name, value in _REQUIRED_ENV_VARS.items() if not value]
if _missing:
    print("Missing required environment variable(s): " + ", ".join(_missing))
    print("Create a .env file in this folder (see .env.example) with real values, then try again.")
    sys.exit(1)

# ---- Candle granularities ----
HTF_GRANULARITY = 120    # 2 minutes
LTF_GRANULARITY = 60     # 1 minute

# ---- MAP parameters (MQL4 DCE) ----
PERIOD1       = 34
PERIOD2       = 22
PERIOD3       = 18
PERIOD4       = 33
PERIOD5       = 29
PERIOD6       = 14
SIGNAL_PERIOD = 5

# ---- Internal Bollinger Bands on MAP ----
BB_PERIOD    = 89
BB_DEVIATION = 1.0

# ---- SuperTrend price ----
CCI_PERIOD = 50
ATR_PERIOD = 5

MIN_CANDLES       = max(PERIOD1, PERIOD2, PERIOD3, PERIOD4,
                        PERIOD5, PERIOD6, BB_PERIOD, CCI_PERIOD) + 30
PRICE_WINDOW_SIZE = MIN_CANDLES + 100
MAP_WINDOW_SIZE   = BB_PERIOD + SIGNAL_PERIOD + 50

# ---- History to preload ----
HISTORY_COUNT = 500

# ============================================================
# AUTO-TRADING CONFIGURATION
# ============================================================

BASE_STAKE      = 1
TAKE_PROFIT     = 0.30
STOP_LOSS       = 0.30
MAX_OPEN_TRADES = 10

SYMBOL_MULTIPLIER = {
    "R_10":    400,
    "R_25":    160,
    "R_50":    80,
    "R_75":    50,
    "R_100":   40,
    "1HZ10V":  400,
    "1HZ15V":  300,
    "1HZ25V":  160,
    "1HZ30V":  140,
    "1HZ50V":  80,
    "1HZ75V":  50,
    "1HZ90V":  45,
    "1HZ100V": 40,
    "JD10":    100,
    "JD25":    50,
    "JD50":    20,
    "JD75":    15,
    "JD100":   10,
    "stpRNG":  750,
    "stpRNG2": 400,
    "stpRNG3": 300,
    "stpRNG4": 200,
    "stpRNG5": 100,
}

# ============================================================
# SYMBOL LIST
# ============================================================

TRADING_SYMBOLS = [
    {"symbol": "R_10",    "name": "Volatility 10 Index"},
    {"symbol": "R_25",    "name": "Volatility 25 Index"},
    {"symbol": "R_50",    "name": "Volatility 50 Index"},
    {"symbol": "R_75",    "name": "Volatility 75 Index"},
    {"symbol": "R_100",   "name": "Volatility 100 Index"},
    {"symbol": "1HZ10V",  "name": "Volatility 10 (1s) Index"},
    {"symbol": "1HZ15V",  "name": "Volatility 15 (1s) Index"},
    {"symbol": "1HZ25V",  "name": "Volatility 25 (1s) Index"},
    {"symbol": "1HZ30V",  "name": "Volatility 30 (1s) Index"},
    {"symbol": "1HZ50V",  "name": "Volatility 50 (1s) Index"},
    {"symbol": "1HZ75V",  "name": "Volatility 75 (1s) Index"},
    {"symbol": "1HZ90V",  "name": "Volatility 90 (1s) Index"},
    {"symbol": "1HZ100V", "name": "Volatility 100 (1s) Index"},
    {"symbol": "JD10",    "name": "Jump 10 Index"},
    {"symbol": "JD25",    "name": "Jump 25 Index"},
    {"symbol": "JD50",    "name": "Jump 50 Index"},
    {"symbol": "JD75",    "name": "Jump 75 Index"},
    {"symbol": "JD100",   "name": "Jump 100 Index"},
    {"symbol": "stpRNG",  "name": "Step Range Index"},
    {"symbol": "stpRNG2", "name": "Step Range Index 2"},
    {"symbol": "stpRNG3", "name": "Step Range Index 3"},
    {"symbol": "stpRNG4", "name": "Step Range Index 4"},
    {"symbol": "stpRNG5", "name": "Step Range Index 5"},
]

# Runtime state
symbol_data        = {}
subscribed_symbols = set()
ws                 = None
running            = True
data_lock          = threading.Lock()

open_trades      = {}
open_trades_lock = threading.Lock()

dashboard_data = {
    'htf_candles': {},
    'ltf_candles': {},
    'alerts': [],
}

# ============================================================
# TELEGRAM
# ============================================================

def send_telegram(message: str):
    def _send():
        try:
            url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
            payload = {
                "chat_id":    TELEGRAM_CHAT_ID,
                "text":       message,
                "parse_mode": "HTML",
            }
            r = requests.post(url, json=payload, timeout=10)
            if r.status_code == 200:
                print(f"[{get_ts()}] Telegram sent ✓")
            else:
                print(f"[{get_ts()}] Telegram error: {r.text}")
        except Exception as e:
            print(f"[{get_ts()}] Telegram exception: {e}")

    threading.Thread(target=_send, daemon=True).start()


def send_telegram_photo(img_bytes: bytes, caption: str = ""):
    def _send():
        try:
            url  = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendPhoto"
            resp = requests.post(
                url,
                data={"chat_id": TELEGRAM_CHAT_ID, "caption": caption, "parse_mode": "HTML"},
                files={"photo": ("chart.png", img_bytes, "image/png")},
                timeout=30,
            )
            if resp.status_code == 200:
                print(f"[{get_ts()}] Telegram photo sent ✓")
            else:
                print(f"[{get_ts()}] Telegram photo error: {resp.text}")
        except Exception as e:
            print(f"[{get_ts()}] Telegram photo exception: {e}")

    threading.Thread(target=_send, daemon=True).start()


def build_signal_chart(symbol, data_key, label, direction, candle_win=60):
    try:
        from plotly.subplots import make_subplots

        chart_data = list(dashboard_data[data_key].get(symbol, []))
        if not chart_data:
            return None

        recent = chart_data[-candle_win:]
        gran   = HTF_GRANULARITY if data_key == 'htf_candles' else LTF_GRANULARITY
        fc     = forming_candle.get((symbol, gran))
        display_data = list(recent) + ([fc] if fc else [])

        arrow_color = '#00e676' if direction == 'BUY' else '#ff1744'

        fig = make_subplots(
            rows=2, cols=1,
            shared_xaxes=True,
            row_heights=[0.55, 0.45],
            vertical_spacing=0.08,
        )

        fig.add_trace(go.Candlestick(
            x=[d['time']  for d in display_data],
            open=[d['open']  for d in display_data],
            high=[d['high']  for d in display_data],
            low=[d['low']   for d in display_data],
            close=[d['close'] for d in display_data],
            name=label,
            increasing_line_color='#26a69a',
            decreasing_line_color='#ef5350',
        ), row=1, col=1)

        map_d  = [(d['time'], d['map'])    for d in recent if d.get('map')    is not None]
        bbu_d  = [(d['time'], d['bb_up'])  for d in recent if d.get('bb_up')  is not None]
        bbd_d  = [(d['time'], d['bb_dn'])  for d in recent if d.get('bb_dn')  is not None]
        sig_d  = [(d['time'], d['signal']) for d in recent if d.get('signal') is not None]

        if map_d:
            fig.add_trace(go.Scatter(
                x=[x[0] for x in map_d], y=[x[1] for x in map_d],
                mode='lines', name='MAP', line=dict(color='#ffd700', width=2)), row=2, col=1)
        if sig_d:
            fig.add_trace(go.Scatter(
                x=[x[0] for x in sig_d], y=[x[1] for x in sig_d],
                mode='lines', name='Signal',
                line=dict(color='#42a5f5', width=1, dash='dot')), row=2, col=1)
        if bbu_d:
            fig.add_trace(go.Scatter(
                x=[x[0] for x in bbu_d], y=[x[1] for x in bbu_d],
                mode='lines', name='IntBB Upper',
                line=dict(color='#26a69a', width=1, dash='dash')), row=2, col=1)
            fig.add_trace(go.Scatter(
                x=[x[0] for x in bbd_d], y=[x[1] for x in bbd_d],
                mode='lines', name='IntBB Lower',
                line=dict(color='#ef5350', width=1, dash='dash'),
                fill='tonexty', fillcolor='rgba(255,215,0,0.04)'), row=2, col=1)

        fig.add_hline(y=0, line=dict(color='rgba(255,255,255,0.15)',
                      width=1, dash='dash'), row=2, col=1)

        fig.add_annotation(
            text=f"{'▲ BUY' if direction == 'BUY' else '▼ SELL'}  SIGNAL",
            xref="x domain", yref="y domain",
            x=0.01, y=0.97, showarrow=False,
            font=dict(size=14, color=arrow_color, family="monospace"),
            bgcolor="rgba(0,0,0,0.85)",
            row=1, col=1,
        )

        name = get_symbol_name(symbol)
        fig.update_layout(
            title=dict(
                text=f"XERO AI  |  {name}  |  {label}  |  {get_dt()}",
                font=dict(size=12, color='#aaaaaa'),
                x=0.5,
            ),
            template='plotly_dark',
            height=700, width=1100,
            margin=dict(l=60, r=20, t=45, b=30),
            plot_bgcolor='#0d1117',
            paper_bgcolor='#080c10',
            showlegend=True,
            legend=dict(orientation='h', y=1.06, x=1,
                        xanchor='right', font=dict(size=9)),
        )
        fig.update_xaxes(gridcolor='#161e28', rangeslider_visible=False)
        fig.update_yaxes(gridcolor='#161e28')

        img_bytes = fig.to_image(format="png", engine="kaleido")
        return img_bytes

    except Exception as e:
        print(f"[{get_ts()}] Chart render error: {e}")
        return None


def send_signal_charts(symbol, direction, trigger_label):
    def _send():
        name  = get_symbol_name(symbol)
        arrow = "▲ BUY" if direction == 'BUY' else "▼ SELL"

        htf_img = build_signal_chart(symbol, 'htf_candles', '2-min', direction)
        if htf_img:
            send_telegram_photo(
                htf_img,
                caption=f"📊 <b>{arrow}  |  {name}</b>  |  2-min  |  {trigger_label}\n{get_dt()}"
            )
            time.sleep(1)

        ltf_img = build_signal_chart(symbol, 'ltf_candles', '1-min', direction)
        if ltf_img:
            send_telegram_photo(
                ltf_img,
                caption=f"📊 <b>{arrow}  |  {name}</b>  |  1-min  |  {trigger_label}\n{get_dt()}"
            )

    threading.Thread(target=_send, daemon=True).start()


def send_startup_chart():
    def _send():
        try:
            fig = go.Figure()

            lines = [
                "XERO AI SOFTWARE — LIVE",
                "",
                f"HTF  :  2-min candles  (GATE)",
                f"LTF  :  1-min candles  (TRIGGER)",
                f"Filter : LTF MAP must be in same band as HTF signal",
                f"  BUY  → LTF MAP below BB Lower",
                f"  SELL → LTF MAP above BB Upper",
                f"IntBB  :  period={BB_PERIOD}, dev={BB_DEVIATION}",
                f"Symbols  :  {len(TRADING_SYMBOLS)}",
                "",
                f"Started  :  {get_dt()}",
                "",
                "Monitoring all symbols — alerts will follow",
            ]

            for i, line in enumerate(lines):
                color  = '#00e5ff' if i == 0 else ('#ffd700' if line.startswith("Started") else '#cccccc')
                size   = 20 if i == 0 else 13
                fig.add_annotation(
                    text=line,
                    xref="paper", yref="paper",
                    x=0.5, y=1.0 - i * 0.070,
                    showarrow=False,
                    font=dict(size=size, color=color, family="monospace"),
                    xanchor="center", yanchor="top",
                )

            fig.update_layout(
                width=700, height=480,
                plot_bgcolor='#080c10',
                paper_bgcolor='#080c10',
                margin=dict(l=20, r=20, t=20, b=20),
                xaxis=dict(visible=False),
                yaxis=dict(visible=False),
            )

            img_bytes = fig.to_image(format="png", engine="kaleido")
            send_telegram_photo(img_bytes, caption="🚀 <b>XERO AI SOFTWARE — SYSTEM ONLINE</b>")
            print(f"[{get_ts()}] Startup chart sent to Telegram ✓")

        except Exception as e:
            print(f"[{get_ts()}] Startup chart error: {e}")

    threading.Thread(target=_send, daemon=True).start()


# ============================================================
# AUTO-TRADING — PLACE & TRACK TRADES
# ============================================================

def _count_open_trades():
    with open_trades_lock:
        return len(open_trades)


def place_trade(symbol, direction):
    def _place():
        global ws
        name = get_symbol_name(symbol)

        count = _count_open_trades()
        if count >= MAX_OPEN_TRADES:
            msg = (f"⚠️ <b>TRADE SKIPPED — MAX TRADES REACHED</b>\n"
                   f"Symbol     : {name}\n"
                   f"Direction  : {direction}\n"
                   f"Open trades: {count}/{MAX_OPEN_TRADES}\n"
                   f"Time       : {get_dt()}")
            send_telegram(msg)
            print(f"[{get_ts()}] [{symbol}] Trade skipped — "
                  f"max {MAX_OPEN_TRADES} open trades reached")
            return

        multiplier    = SYMBOL_MULTIPLIER.get(symbol, 1)
        contract_type = "MULTUP" if direction == "BUY" else "MULTDOWN"

        request = {
            "buy": 1,
            "price": BASE_STAKE,
            "parameters": {
                "contract_type": contract_type,
                "symbol":        symbol,
                "amount":        BASE_STAKE,
                "basis":         "stake",
                "multiplier":    multiplier,
                "limit_order": {
                    "take_profit": TAKE_PROFIT,
                    "stop_loss":   STOP_LOSS,
                },
            },
        }

        try:
            if ws:
                ws.send(json.dumps(request))
                print(f"[{get_ts()}] [{symbol}] 🚀 Trade request sent — "
                      f"{contract_type}  x{multiplier}  stake=${BASE_STAKE}")
            else:
                print(f"[{get_ts()}] [{symbol}] Trade failed — WebSocket not connected")
        except Exception as e:
            print(f"[{get_ts()}] [{symbol}] Trade send error: {e}")

    threading.Thread(target=_place, daemon=True).start()


def alert_trade_opened(symbol, direction, contract_id, buy_price, multiplier):
    name  = get_symbol_name(symbol)
    arrow = "▲ BUY  (MULTUP)" if direction == "BUY" else "▼ SELL (MULTDOWN)"
    msg = (
        f"🚀 <b>XERO TRADE OPENED</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"Pair        : <b>{name}</b>\n"
        f"Symbol      : {symbol}\n"
        f"Direction   : <b>{arrow}</b>\n"
        f"Contract ID : {contract_id}\n"
        f"Stake       : ${BASE_STAKE}\n"
        f"Multiplier  : x{multiplier}\n"
        f"Take Profit : ${TAKE_PROFIT}\n"
        f"Stop Loss   : ${STOP_LOSS}\n"
        f"Buy Price   : ${buy_price}\n"
        f"Time        : {get_dt()}\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"<i>Trade is live — TP/SL active</i>"
    )
    send_telegram(msg)
    _log_alert(symbol, "🚀 TRADE OPEN", direction,
               f"Contract {contract_id} opened x{multiplier}")


def alert_trade_closed(symbol, direction, contract_id, profit, reason):
    name   = get_symbol_name(symbol)
    emoji  = "✅" if profit >= 0 else "🔴"
    result = f"+${profit:.2f}" if profit >= 0 else f"-${abs(profit):.2f}"
    msg = (
        f"{emoji} <b>XERO TRADE CLOSED</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"Pair        : <b>{name}</b>\n"
        f"Symbol      : {symbol}\n"
        f"Direction   : {direction}\n"
        f"Contract ID : {contract_id}\n"
        f"Result      : <b>{result}</b>\n"
        f"Closed by   : {reason}\n"
        f"Time        : {get_dt()}\n"
        f"━━━━━━━━━━━━━━━━━━━━"
    )
    send_telegram(msg)
    _log_alert(symbol, f"{emoji} TRADE CLOSED", direction,
               f"Contract {contract_id} → {result} ({reason})")


def _log_alert(symbol, alert_type, direction, message):
    dashboard_data['alerts'].insert(0, {
        'time':       get_dt(),
        'symbol':     symbol,
        'type':       alert_type,
        'direction':  direction,
        'message':    message,
    })
    if len(dashboard_data['alerts']) > 100:
        dashboard_data['alerts'].pop()


def alert_htf_signal(symbol, name, direction, ltf_map, ltf_bb_up, ltf_bb_dn):
    emoji  = "🔔"
    arrow  = "▲ BUY" if direction == 'BUY' else "▼ SELL"
    band   = f"below BB Lower ({ltf_bb_dn:.4f})" if direction == 'BUY' else f"above BB Upper ({ltf_bb_up:.4f})"
    msg = (
        f"{emoji} <b>XERO SIGNAL ALERT</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"Pair      : <b>{name}</b>\n"
        f"Symbol    : {symbol}\n"
        f"Direction : <b>{arrow}</b>\n"
        f"Timeframe : HTF 2-min\n"
        f"LTF MAP   : {ltf_map:.4f} ({band}) ✅\n"
        f"Status    : ⏳ Waiting for LTF crossover\n"
        f"Time      : {get_dt()}\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"<i>LTF MAP confirmed in correct band — watching for crossover</i>"
    )
    send_telegram(msg)
    _log_alert(symbol, "HTF SIGNAL", direction,
               f"HTF {direction} fired — LTF MAP in correct band — window open")


def alert_htf_discarded(symbol, name, direction, ltf_map, ltf_bb_up, ltf_bb_dn):
    arrow    = "▲ BUY" if direction == 'BUY' else "▼ SELL"
    required = f"below BB Lower ({ltf_bb_dn:.4f})" if direction == 'BUY' else f"above BB Upper ({ltf_bb_up:.4f})"
    actual   = f"{ltf_map:.4f}"
    msg = (
        f"⚠️ <b>XERO SIGNAL DISCARDED</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"Pair      : <b>{name}</b>\n"
        f"Symbol    : {symbol}\n"
        f"HTF Signal: <b>{arrow}</b>\n"
        f"Reason    : LTF MAP not in correct band\n"
        f"LTF MAP   : {actual}\n"
        f"Required  : {required}\n"
        f"BB Upper  : {ltf_bb_up:.4f}\n"
        f"BB Lower  : {ltf_bb_dn:.4f}\n"
        f"Time      : {get_dt()}\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"<i>Signal ignored — waiting for next valid HTF setup</i>"
    )
    send_telegram(msg)
    _log_alert(symbol, "⚠️ DISCARDED", direction,
               f"HTF {direction} fired but LTF MAP not in correct band")


def alert_ltf_confirmed(symbol, name, direction, htf_time):
    emoji = "✅"
    arrow = "▲ BUY  — OPEN LONG" if direction == 'BUY' else "▼ SELL — OPEN SHORT"
    elapsed_secs     = time.time() - htf_time
    elapsed_mins     = int(elapsed_secs // 60)
    elapsed_secs_rem = int(elapsed_secs % 60)
    msg = (
        f"{emoji} <b>XERO ENTRY ALERT — ENTER NOW</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"Pair      : <b>{name}</b>\n"
        f"Symbol    : {symbol}\n"
        f"Direction : <b>{arrow}</b>\n"
        f"Action    : 🚀 <b>OPEN POSITION MANUALLY</b>\n"
        f"HTF fired : {datetime.fromtimestamp(htf_time).strftime('%H:%M:%S')}\n"
        f"LTF confirmed: {get_ts()}\n"
        f"Time in window: {elapsed_mins}m {elapsed_secs_rem}s\n"
        f"Time      : {get_dt()}\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"<i>Enter your position now on {name}</i>"
    )
    send_telegram(msg)
    _log_alert(symbol, "✅ ENTRY", direction, f"LTF confirmed {direction} — ENTER NOW")


def alert_cancelled(symbol, name, htf_direction, ltf_direction):
    msg = (
        f"⛔ <b>XERO SIGNAL CANCELLED</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"Pair      : <b>{name}</b>\n"
        f"Symbol    : {symbol}\n"
        f"HTF signal: {htf_direction}\n"
        f"Cancelled by: Opposite HTF {ltf_direction} signal\n"
        f"Time      : {get_dt()}\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"<i>Wait for a fresh HTF setup</i>"
    )
    send_telegram(msg)
    _log_alert(symbol, "⛔ CANCELLED", htf_direction,
               f"Cancelled by opposite HTF {ltf_direction}")


def alert_window_invalidated(symbol, name, direction, reason):
    opposite  = "SELL" if direction == 'BUY' else "BUY"
    band_desc = "BB Upper (overbought)" if direction == 'BUY' else "BB Lower (oversold)"
    dot_color = "🔴 Pink dot" if direction == 'BUY' else "🔵 Blue dot"
    msg = (
        f"🚫 <b>XERO WINDOW INVALIDATED</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"Pair        : <b>{name}</b>\n"
        f"Symbol      : {symbol}\n"
        f"Was waiting : {direction} confirmation\n"
        f"Reason      : MAP + Signal both crossed {band_desc}\n"
        f"             {dot_color} appeared on HTF\n"
        f"Implication : {direction} setup exhausted — {opposite} side forming\n"
        f"Time        : {get_dt()}\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"<i>Window closed — wait for a fresh HTF setup</i>"
    )
    send_telegram(msg)
    _log_alert(symbol, "🚫 INVALIDATED", direction, reason)

# ============================================================
# SYMBOL STATE
# ============================================================

def get_symbol_name(symbol):
    for s in TRADING_SYMBOLS:
        if s['symbol'] == symbol:
            return s['name']
    return symbol


def _make_tf_state():
    return {
        'candle_count':   0,
        'last_epoch':     None,

        'close_prices': deque(maxlen=PRICE_WINDOW_SIZE),
        'map_window':   deque(maxlen=MAP_WINDOW_SIZE),

        'prev_map':   None,
        'prev_bb_up': None,
        'prev_bb_dn': None,
        'prev_sig':   None,
        'prev_close': None,

        'warming_up': True,

        'last_map':        None,
        'last_sig':        None,
        'last_bb_up':      None,
        'last_bb_dn':      None,
    }


def _make_symbol_state():
    return {
        'htf': _make_tf_state(),
        'ltf': _make_tf_state(),

        'window_open':      False,
        'window_direction': None,
        'htf_fired_at':     None,

        'active_contract_id': None,
        'last_trade_won':     None,
        'trade_count':        0,
    }


def init_symbol(symbol):
    if symbol not in symbol_data:
        symbol_data[symbol] = _make_symbol_state()
        dashboard_data['htf_candles'][symbol] = deque(maxlen=200)
        dashboard_data['ltf_candles'][symbol] = deque(maxlen=300)
        print(f"[{get_ts()}] Initialised [{symbol}]")

# ============================================================
# INDICATOR MATH
# ============================================================

def ic_tma(prices_list, period):
    n = len(prices_list)
    if n < period:
        return None
    sumw  = period + 1
    total = sumw * prices_list[-1]
    for j in range(1, period):
        k    = period - j
        sumw += k
        idx  = n - 1 - j
        total += k * (prices_list[idx] if idx >= 0 else prices_list[0])
    return total / sumw


def compute_map(prices_list):
    a1 = ic_tma(prices_list, PERIOD2)
    a2 = ic_tma(prices_list, PERIOD1)
    a3 = ic_tma(prices_list, PERIOD4)
    a4 = ic_tma(prices_list, PERIOD3)
    a5 = ic_tma(prices_list, PERIOD6)
    a6 = ic_tma(prices_list, PERIOD5)
    if None in (a1, a2, a3, a4, a5, a6):
        return None
    return (a1 - a2) + (a3 - a4) + (a5 - a6)


def calc_sma(dq, period):
    lst = list(dq)
    if len(lst) < period:
        return None
    return sum(lst[-period:]) / period


def calc_bb(values_list, period, deviation):
    lst = list(values_list)
    if len(lst) < period:
        return None, None
    seg      = lst[-period:]
    mean     = sum(seg) / period
    variance = sum((x - mean) ** 2 for x in seg) / period
    std      = math.sqrt(variance)
    return mean + deviation * std, mean - deviation * std


# ============================================================
# CORE FIRE CONDITION
# ============================================================

def _process_candle(tf, candle, symbol, label, dashboard_key, ts):
    """
    Process one closed OHLC candle.
    Returns 'BUY', 'SELL', or None.

    Fire condition requires BOTH the MAP line and the SIGNAL line to
    exit the band, curl back, and re-enter it (exit-then-re-enter),
    at the same band, before a signal is considered valid:

    BUY  (both must hold):
      MAP    : prev_map < prev_bb_dn  AND  map_val > bb_dn  AND  map_val > prev_map
      SIGNAL : prev_sig < prev_bb_dn  AND  sig_val > bb_dn  AND  sig_val > prev_sig

    SELL (both must hold):
      MAP    : prev_map > prev_bb_up  AND  map_val < bb_up  AND  map_val < prev_map
      SIGNAL : prev_sig > prev_bb_up  AND  sig_val < bb_up  AND  sig_val < prev_sig
    """
    close_price = float(candle['close'])
    tf['close_prices'].append(close_price)
    close_list = list(tf['close_prices'])

    map_val = compute_map(close_list) if len(close_list) >= PERIOD1 else None

    if map_val is not None:
        tf['map_window'].append(map_val)
        mlen     = len(tf['map_window'])
        sig_val  = calc_sma(tf['map_window'], SIGNAL_PERIOD) if mlen >= SIGNAL_PERIOD else None
        bb_up, bb_dn = (
            calc_bb(tf['map_window'], BB_PERIOD, BB_DEVIATION)
            if mlen >= BB_PERIOD else (None, None)
        )
    else:
        sig_val = bb_up = bb_dn = None

    tf['last_map']   = map_val
    tf['last_sig']   = sig_val
    tf['last_bb_up'] = bb_up
    tf['last_bb_dn'] = bb_dn

    if map_val is not None and tf['candle_count'] % 5 == 0:
        print(f"   [{symbol}] {label} MAP={map_val:.3f}  "
              f"BB_up={bb_up:.3f}  BB_dn={bb_dn:.3f}"
              if bb_up else
              f"   [{symbol}] {label} MAP={map_val:.3f}  BB=warming")

    all_ready = None not in (map_val, sig_val, bb_up, bb_dn)
    if all_ready and tf['warming_up']:
        tf['warming_up'] = False
        print(f"[{get_ts()}] [{symbol}] {label} READY — {tf['candle_count']} candles")
    elif tf['candle_count'] % 10 == 0 and tf['warming_up']:
        print(f"[{get_ts()}] [{symbol}] {label} warming  "
              f"candles:{tf['candle_count']}/{MIN_CANDLES}")

    dashboard_data[dashboard_key][symbol].append({
        'time':   ts,
        'open':   float(candle['open']),
        'high':   float(candle['high']),
        'low':    float(candle['low']),
        'close':  float(candle['close']),
        'map':    map_val,
        'signal': sig_val,
        'bb_up':  bb_up,
        'bb_dn':  bb_dn,
    })

    prev_map   = tf['prev_map']
    prev_bb_up = tf['prev_bb_up']
    prev_bb_dn = tf['prev_bb_dn']
    prev_sig   = tf['prev_sig']

    if map_val is not None:
        tf['prev_map']   = map_val
        tf['prev_bb_up'] = bb_up
        tf['prev_bb_dn'] = bb_dn
    if sig_val is not None:
        tf['prev_sig'] = sig_val
    tf['prev_close'] = close_price

    if tf['warming_up']:
        return None
    if None in (map_val, sig_val, bb_up, bb_dn, prev_map, prev_bb_up, prev_bb_dn, prev_sig):
        return None

    # ── BUY FIRE — MAP and SIGNAL both exit below BB Lower, curl up, re-enter ──
    map_buy_reentry = (map_val > prev_map and prev_map < prev_bb_dn and map_val > bb_dn)
    sig_buy_reentry = (sig_val > prev_sig and prev_sig < prev_bb_dn and sig_val > bb_dn)
    if map_buy_reentry and sig_buy_reentry:
        print(f"   [{symbol}] {label} ▲ BUY  FIRE  "
              f"MAP={map_val:.4f}  SIG={sig_val:.4f}  BB_dn={bb_dn:.4f}")
        return 'BUY'

    # ── SELL FIRE — MAP and SIGNAL both exit above BB Upper, curl down, re-enter ──
    map_sell_reentry = (map_val < prev_map and prev_map > prev_bb_up and map_val < bb_up)
    sig_sell_reentry = (sig_val < prev_sig and prev_sig > prev_bb_up and sig_val < bb_up)
    if map_sell_reentry and sig_sell_reentry:
        print(f"   [{symbol}] {label} ▼ SELL FIRE  "
              f"MAP={map_val:.4f}  SIG={sig_val:.4f}  BB_up={bb_up:.4f}")
        return 'SELL'

    return None

# ============================================================
# WINDOW HELPERS
# ============================================================

def _close_window(sd):
    sd['window_open']         = False
    sd['window_direction']    = None
    sd['htf_fired_at']        = None
    sd['active_contract_id']  = None
    sd['last_trade_won']      = None
    sd['trade_count']         = 0


# ============================================================
# CANDLE CLOSE HANDLER
# ============================================================

def on_candle_closed(symbol, granularity, candle):
    if symbol not in symbol_data:
        return

    sd   = symbol_data[symbol]
    name = get_symbol_name(symbol)
    now  = time.time()
    ts   = datetime.fromtimestamp(int(candle.get('epoch', now)))

    # ── HTF 2-min ─────────────────────────────────────────────────────
    if granularity == HTF_GRANULARITY:
        tf  = sd['htf']
        tf['candle_count'] += 1
        prev_sig_snapshot = tf.get('prev_sig')
        sig = _process_candle(tf, candle, symbol, 'HTF', 'htf_candles', ts)

        # Invalidation check while window is open
        if sd['window_open'] and not tf['warming_up']:
            direction = sd['window_direction']
            map_val   = tf.get('last_map')
            sig_val   = tf.get('last_sig')
            bb_up     = tf.get('last_bb_up')
            bb_dn     = tf.get('last_bb_dn')

            if None not in (map_val, sig_val, bb_up, bb_dn, prev_sig_snapshot):
                invalidated = False
                reason      = ""

                if direction == 'BUY':
                    # Rule 1: MAP AND Signal both crossed ABOVE BB Upper
                    if (prev_sig_snapshot <= bb_up and
                        sig_val           >  bb_up and
                        map_val           >  bb_up):
                        invalidated = True
                        reason = (f"MAP={map_val:.4f} & Signal={sig_val:.4f} "
                                  f"both crossed ABOVE BB Upper={bb_up:.4f} "
                                  f"— BUY exhausted 🔴 pink dot")
                    # Rule 2: MAP broke back BELOW BB Lower
                    if not invalidated and map_val < bb_dn:
                        invalidated = True
                        reason = (f"MAP={map_val:.4f} broke back BELOW "
                                  f"BB Lower={bb_dn:.4f} — BUY setup failed")

                elif direction == 'SELL':
                    # Rule 1: MAP AND Signal both crossed BELOW BB Lower
                    if (prev_sig_snapshot >= bb_dn and
                        sig_val           <  bb_dn and
                        map_val           <  bb_dn):
                        invalidated = True
                        reason = (f"MAP={map_val:.4f} & Signal={sig_val:.4f} "
                                  f"both crossed BELOW BB Lower={bb_dn:.4f} "
                                  f"— SELL exhausted 🔵 blue dot")
                    # Rule 2: MAP broke back ABOVE BB Upper
                    if not invalidated and map_val > bb_up:
                        invalidated = True
                        reason = (f"MAP={map_val:.4f} broke back ABOVE "
                                  f"BB Upper={bb_up:.4f} — SELL setup failed")

                if invalidated:
                    print(f"\n[{get_ts()}] [{symbol}] 🚫 HTF WINDOW INVALIDATED — {reason}")
                    alert_window_invalidated(symbol, name, direction, reason)
                    send_signal_charts(symbol, direction, "🚫 WINDOW INVALIDATED")
                    _close_window(sd)
                    return

        if sig and not tf['warming_up']:
            if not sd['window_open']:

                # ══════════════════════════════════════════════════════
                # NEW FILTER: Check LTF MAP position before opening window
                # BUY  → LTF MAP must be BELOW BB Lower
                # SELL → LTF MAP must be ABOVE BB Upper
                # If not in correct band → discard signal immediately
                # ══════════════════════════════════════════════════════
                ltf_tf    = sd['ltf']
                ltf_map   = ltf_tf.get('last_map')
                ltf_bb_up = ltf_tf.get('last_bb_up')
                ltf_bb_dn = ltf_tf.get('last_bb_dn')
                ltf_ready = (
                    not ltf_tf.get('warming_up', True) and
                    None not in (ltf_map, ltf_bb_up, ltf_bb_dn)
                )

                if not ltf_ready:
                    print(f"[{get_ts()}] [{symbol}] ⚠️ HTF {sig} — LTF not ready yet, discarding")
                    return

                if sig == 'BUY':
                    ltf_valid = ltf_map < ltf_bb_dn
                else:
                    ltf_valid = ltf_map > ltf_bb_up

                if not ltf_valid:
                    # LTF MAP not in the correct band — discard
                    print(f"[{get_ts()}] [{symbol}] ⚠️ HTF {sig} DISCARDED — "
                          f"LTF MAP={ltf_map:.4f} not in correct band "
                          f"(BB_up={ltf_bb_up:.4f}  BB_dn={ltf_bb_dn:.4f})")
                    alert_htf_discarded(symbol, name, sig, ltf_map, ltf_bb_up, ltf_bb_dn)
                    return

                # ── LTF MAP confirmed in correct band — open window ──
                sd['window_open']      = True
                sd['window_direction'] = sig
                sd['htf_fired_at']     = now
                print(f"[{get_ts()}] [{symbol}] ◉ HTF {sig} — Window OPEN "
                      f"(LTF MAP={ltf_map:.4f} confirmed {'below BB Lower' if sig == 'BUY' else 'above BB Upper'})")
                alert_htf_signal(symbol, name, sig, ltf_map, ltf_bb_up, ltf_bb_dn)
                send_signal_charts(symbol, sig, "HTF GATE FIRED ✅ LTF MAP CONFIRMED")

            else:
                if sig == sd['window_direction']:
                    print(f"[{get_ts()}] [{symbol}] HTF {sig} — window refreshed")
                else:
                    old_dir = sd['window_direction']
                    print(f"[{get_ts()}] [{symbol}] HTF opposite — window CANCELLED")
                    alert_cancelled(symbol, name, old_dir, sig)
                    _close_window(sd)

    # ── LTF 1-min ─────────────────────────────────────────────────────
    elif granularity == LTF_GRANULARITY:
        tf  = sd['ltf']
        tf['candle_count'] += 1
        sig = _process_candle(tf, candle, symbol, 'LTF', 'ltf_candles', ts)

        if sig and not tf['warming_up']:
            if sd['window_open']:
                if sig == sd['window_direction']:
                    direction      = sd['window_direction']
                    htf_time       = sd['htf_fired_at'] or now
                    active_id      = sd.get('active_contract_id')
                    last_trade_won = sd.get('last_trade_won')
                    trade_count    = sd.get('trade_count', 0)
                    trade_is_open  = active_id is not None
                    can_place      = (
                        not trade_is_open and
                        (last_trade_won is None or last_trade_won is False)
                    )

                    if can_place:
                        trade_num = trade_count + 1
                        label     = "ENTRY" if trade_num == 1 else f"RECOVERY #{trade_num-1}"
                        print(f"\n[{get_ts()}] [{symbol}] ✅ LTF {label} {direction}")
                        alert_ltf_confirmed(symbol, name, direction, htf_time)
                        send_signal_charts(symbol, direction,
                                           f"✅ LTF {label} — TRADE PLACED")
                        place_trade(symbol, direction)
                        sd['trade_count'] = trade_num
                    elif trade_is_open:
                        print(f"[{get_ts()}] [{symbol}] LTF {direction} — "
                              f"trade open, waiting for result")
                else:
                    # Opposite LTF — ignore, window stays open
                    print(f"[{get_ts()}] [{symbol}] LTF opposite ({sig}) — "
                          f"ignored, window stays open")

# ============================================================
# WEBSOCKET — OHLC STREAM HANDLER
# ============================================================

last_candle_epoch = {}
forming_candle    = {}
last_forming_ohlc = {}

def on_message(ws_app, message):
    global running
    try:
        data     = json.loads(message)
        msg_type = data.get("msg_type")
    except Exception:
        return

    # ── Authorization ─────────────────────────────────────────────────
    if msg_type == "authorize":
        if "error" in data:
            print(f"[{get_ts()}] Auth failed: {data['error']['message']}")
            ws_app.close()
        else:
            print(f"[{get_ts()}] Authorised — subscribing to "
                  f"{len(TRADING_SYMBOLS)} symbols × 2 timeframes")
            for i, cfg in enumerate(TRADING_SYMBOLS):
                _subscribe_ohlc(cfg['symbol'], HTF_GRANULARITY)
                time.sleep(0.3)
                _subscribe_ohlc(cfg['symbol'], LTF_GRANULARITY)
                time.sleep(0.3)

    # ── Historical candles (initial batch) ────────────────────────────
    elif msg_type == "candles":
        if "error" in data:
            print(f"[{get_ts()}] Candles error: {data['error']}")
            return
        candles     = data.get("candles", [])
        echo        = data.get("echo_req", {})
        symbol      = echo.get("ticks_history")
        granularity = int(echo.get("granularity", 0))

        if not symbol or not candles:
            return

        with data_lock:
            init_symbol(symbol)
            sd  = symbol_data[symbol]
            tf  = sd['htf'] if granularity == HTF_GRANULARITY else sd['ltf']
            lbl = 'HTF' if granularity == HTF_GRANULARITY else 'LTF'
            dk  = 'htf_candles' if granularity == HTF_GRANULARITY else 'ltf_candles'

            print(f"[{get_ts()}] [{symbol}] {lbl} loaded {len(candles)} historical candles")

            for i, candle in enumerate(candles[:-1]):
                tf['candle_count'] += 1
                ts_c = datetime.fromtimestamp(int(candle['epoch']))
                _process_candle(tf, candle, symbol, lbl + '-HIST', dk, ts_c)
                db_list = dashboard_data[dk][symbol]
                if not db_list or db_list[-1]['time'] != ts_c:
                    db_list.append({
                        'time':   ts_c,
                        'open':   float(candle['open']),
                        'high':   float(candle['high']),
                        'low':    float(candle['low']),
                        'close':  float(candle['close']),
                        'map':    tf['last_map'],
                        'signal': tf['last_sig'],
                        'bb_up':  tf['last_bb_up'],
                        'bb_dn':  tf['last_bb_dn'],
                    })

            last_candle_epoch[(symbol, granularity)] = int(candles[-1]['epoch'])

    # ── Trade buy response ────────────────────────────────────────────
    elif msg_type == "buy":
        if "error" in data:
            err = data['error'].get('message', 'Unknown error')
            print(f"[{get_ts()}] Buy error: {err}")
            send_telegram(f"⚠️ <b>TRADE ERROR</b>\n{err}\nTime: {get_dt()}")
            return

        buy_data      = data.get("buy", {})
        contract_id   = buy_data.get("contract_id")
        buy_price     = buy_data.get("buy_price", BASE_STAKE)
        symbol        = buy_data.get("underlying_symbol", "")
        longcode      = buy_data.get("longcode", "")
        direction     = "BUY" if "MULTUP" in longcode.upper() else "SELL"
        multiplier    = SYMBOL_MULTIPLIER.get(symbol, 1)

        with open_trades_lock:
            open_trades[contract_id] = {
                'symbol':     symbol,
                'direction':  direction,
                'buy_price':  buy_price,
                'multiplier': multiplier,
                'opened_at':  get_dt(),
            }

        print(f"[{get_ts()}] [{symbol}] ✅ Trade OPENED — "
              f"contract_id={contract_id}  buy_price=${buy_price}")
        alert_trade_opened(symbol, direction, contract_id, buy_price, multiplier)

        with data_lock:
            if symbol in symbol_data:
                symbol_data[symbol]['active_contract_id'] = contract_id

        try:
            ws_app.send(json.dumps({
                "proposal_open_contract": 1,
                "contract_id": contract_id,
                "subscribe":   1,
            }))
        except Exception as e:
            print(f"[{get_ts()}] POC subscribe error: {e}")

    # ── Contract update (TP/SL hit, expiry, manual close) ────────────
    elif msg_type == "proposal_open_contract":
        if "error" in data:
            return
        poc     = data.get("proposal_open_contract", {})
        if not poc:
            return
        is_sold = poc.get("is_sold", 0)
        status  = poc.get("status", "")

        if is_sold or status in ("sold", "won", "lost"):
            contract_id = poc.get("contract_id")
            with open_trades_lock:
                trade = open_trades.pop(contract_id, None)

            if trade:
                sell_price = float(poc.get("sell_price", 0))
                buy_price  = float(trade.get("buy_price", BASE_STAKE))
                profit     = round(sell_price - buy_price, 2)
                symbol     = trade['symbol']
                direction  = trade['direction']
                trade_won  = profit > 0

                if profit >= TAKE_PROFIT:
                    reason = "Take Profit hit ✅"
                elif profit <= -STOP_LOSS:
                    reason = "Stop Loss hit 🛑"
                else:
                    reason    = f"Closed (status={status})"
                    trade_won = profit >= 0

                print(f"[{get_ts()}] [{symbol}] Trade CLOSED — "
                      f"contract={contract_id}  profit=${profit}  won={trade_won}")
                alert_trade_closed(symbol, direction, contract_id, profit, reason)

                with data_lock:
                    sd = symbol_data.get(symbol)
                    if sd:
                        sd['active_contract_id'] = None
                        sd['last_trade_won']     = trade_won

                        if trade_won:
                            print(f"[{get_ts()}] [{symbol}] 🏆 Trade WON — "
                                  f"closing HTF window, waiting for next setup")
                            send_telegram(
                                f"🏆 <b>XERO PROFIT SECURED</b>\n"
                                f"━━━━━━━━━━━━━━━━━━━━\n"
                                f"Symbol  : {get_symbol_name(symbol)}\n"
                                f"Profit  : +${profit:.2f}\n"
                                f"Trades  : {sd.get('trade_count', 1)} in this window\n"
                                f"Action  : HTF window closed — awaiting next setup\n"
                                f"Time    : {get_dt()}\n"
                                f"━━━━━━━━━━━━━━━━━━━━"
                            )
                            _close_window(sd)
                        else:
                            print(f"[{get_ts()}] [{symbol}] 📉 Trade LOST — "
                                  f"window stays open, awaiting recovery LTF signal")
                            send_telegram(
                                f"📉 <b>XERO TRADE LOST — RECOVERY MODE</b>\n"
                                f"━━━━━━━━━━━━━━━━━━━━\n"
                                f"Symbol  : {get_symbol_name(symbol)}\n"
                                f"Loss    : -${abs(profit):.2f}\n"
                                f"Trades  : {sd.get('trade_count', 1)} in this window\n"
                                f"Action  : Watching for next LTF signal to recover\n"
                                f"Time    : {get_dt()}\n"
                                f"━━━━━━━━━━━━━━━━━━━━"
                            )

    # ── Live OHLC update ──────────────────────────────────────────────
    elif msg_type == "ohlc":
        if "error" in data:
            return
        ohlc        = data.get("ohlc", {})
        symbol      = ohlc.get("symbol")
        granularity = int(ohlc.get("granularity", 0))
        epoch       = int(ohlc.get("open_time", ohlc.get("epoch", 0)))

        if not symbol:
            return

        with data_lock:
            init_symbol(symbol)
            key     = (symbol, granularity)
            prev_ep = last_candle_epoch.get(key)

            if prev_ep is None:
                last_candle_epoch[key] = epoch

            last_forming_ohlc[key] = {
                'open':  ohlc.get('open'),
                'high':  ohlc.get('high'),
                'low':   ohlc.get('low'),
                'close': ohlc.get('close'),
                'epoch': epoch,
            }

            if epoch != prev_ep and prev_ep is not None:
                prev_ohlc     = last_forming_ohlc.get((symbol, granularity), {})
                closed_candle = {
                    'open':  prev_ohlc.get('open',  ohlc.get('open')),
                    'high':  prev_ohlc.get('high',  ohlc.get('high')),
                    'low':   prev_ohlc.get('low',   ohlc.get('low')),
                    'close': prev_ohlc.get('close', ohlc.get('close')),
                    'epoch': prev_ep,
                }
                last_candle_epoch[key] = epoch
                last_forming_ohlc[key] = {
                    'open':  ohlc.get('open'),
                    'high':  ohlc.get('high'),
                    'low':   ohlc.get('low'),
                    'close': ohlc.get('close'),
                    'epoch': epoch,
                }
                on_candle_closed(symbol, granularity, closed_candle)

            forming_candle[key] = {
                'time':   datetime.fromtimestamp(epoch),
                'open':   float(ohlc.get('open',  0)),
                'high':   float(ohlc.get('high',  0)),
                'low':    float(ohlc.get('low',   0)),
                'close':  float(ohlc.get('close', 0)),
                'map':    None,
                'signal': None,
                'bb_up':  None,
                'bb_dn':  None,
            }


def on_error(ws_app, error):
    print(f"[{get_ts()}] WebSocket error: {error}")


def on_open(ws_app):
    global symbol_data, subscribed_symbols, last_candle_epoch

    print(f"[{get_ts()}] WebSocket connected and authenticated via OTP")
    symbol_data.clear()
    subscribed_symbols.clear()
    last_candle_epoch.clear()
    forming_candle.clear()
    last_forming_ohlc.clear()
    dashboard_data['htf_candles'].clear()
    dashboard_data['ltf_candles'].clear()
    with open_trades_lock:
        open_trades.clear()

    # OTP auth — already authenticated via URL, go straight to subscribing
    print(f"[{get_ts()}] Subscribing to {len(TRADING_SYMBOLS)} symbols x 2 timeframes")
    for cfg in TRADING_SYMBOLS:
        _subscribe_ohlc(cfg['symbol'], HTF_GRANULARITY)
        time.sleep(0.3)
        _subscribe_ohlc(cfg['symbol'], LTF_GRANULARITY)
        time.sleep(0.3)


def on_close(ws_app, code, msg):
    global running, subscribed_symbols
    print(f"[{get_ts()}] WebSocket closed: {code} {msg}")
    subscribed_symbols.clear()
    if running:
        print(f"[{get_ts()}] Reconnecting in 5s...")
        time.sleep(5)
        _start_ws_thread()


def _subscribe_ohlc(symbol, granularity):
    key = (symbol, granularity)
    if key in subscribed_symbols:
        return
    subscribed_symbols.add(key)
    lbl = 'HTF' if granularity == HTF_GRANULARITY else 'LTF'
    try:
        ws.send(json.dumps({
            "ticks_history":     symbol,
            "adjust_start_time": 1,
            "count":             HISTORY_COUNT,
            "end":               "latest",
            "granularity":       granularity,
            "start":             1,
            "style":             "candles",
            "subscribe":         1,
        }))
        print(f"[{get_ts()}] Subscribed {lbl} [{symbol}] gran={granularity}s")
    except Exception as e:
        print(f"[{get_ts()}] Subscribe error [{symbol}] {lbl}: {e}")
        subscribed_symbols.discard(key)

# ============================================================
# THREADS
# ============================================================

def _get_account_id():
    """
    Step 1 — Get the Options account ID from Deriv REST API.
    First tries GET /accounts to find existing account.
    If none found, creates a demo account via POST /accounts.
    """
    headers = {
        "Authorization": f"Bearer {API_TOKEN}",
        "Deriv-App-ID":  APP_ID,
        "Content-Type":  "application/json",
    }
    # Try GET first — list existing accounts
    try:
        print(f"[{get_ts()}] Fetching accounts from Deriv...")
        resp = requests.get(
            f"{REST_BASE}/trading/v1/options/accounts",
            headers=headers, timeout=15
        )
        print(f"[{get_ts()}] Accounts GET status: {resp.status_code}")
        print(f"[{get_ts()}] Accounts GET body: {resp.text[:500]}")
        if resp.status_code == 200:
            data     = resp.json()
            print(f"[{get_ts()}] Full accounts response: {json.dumps(data)[:800]}")
            accounts = data.get("data", data) if isinstance(data, dict) else data
            if not isinstance(accounts, list):
                accounts = [accounts]
            # Prefer demo account
            for acct in accounts:
                atype   = (acct.get("account_type") or
                           acct.get("type") or "").lower()
                acct_id = acct.get("id") or acct.get("account_id")
                if acct_id and "demo" in atype:
                    print(f"[{get_ts()}] Found DEMO account ID: {acct_id}")
                    return acct_id
            # Fallback — take first account
            for acct in accounts:
                acct_id = acct.get("id") or acct.get("account_id")
                if acct_id:
                    print(f"[{get_ts()}] Found account ID: {acct_id} (type={acct.get('account_type','?')})")
                    return acct_id
    except Exception as e:
        print(f"[{get_ts()}] Accounts GET exception: {e}")

    # If no account found — create a demo account
    try:
        print(f"[{get_ts()}] No account found — creating demo account...")
        resp = requests.post(
            f"{REST_BASE}/trading/v1/options/accounts",
            headers=headers,
            json={"currency": "USD", "group": "row", "account_type": "demo"},
            timeout=15
        )
        print(f"[{get_ts()}] Create account status: {resp.status_code}")
        print(f"[{get_ts()}] Create account body: {resp.text[:500]}")
        if resp.status_code in (200, 201):
            data    = resp.json()
            acct    = data.get("data", data)
            acct_id = acct.get("id") or acct.get("account_id")
            if acct_id:
                print(f"[{get_ts()}] Created demo account ID: {acct_id}")
                return acct_id
    except Exception as e:
        print(f"[{get_ts()}] Create account exception: {e}")

    return None


def _get_otp_ws_url():
    """
    Step 2 — Use account ID to get an authenticated WebSocket URL via OTP.
    """
    acct_id = _get_account_id()
    if not acct_id:
        print(f"[{get_ts()}] Could not retrieve account ID")
        return None

    headers = {
        "Authorization": f"Bearer {API_TOKEN}",
        "Deriv-App-ID":  APP_ID,
        "Content-Type":  "application/json",
    }
    try:
        print(f"[{get_ts()}] Requesting OTP for account {acct_id}...")
        resp = requests.post(
            f"{REST_BASE}/trading/v1/options/accounts/{acct_id}/otp",
            headers=headers, timeout=15
        )
        print(f"[{get_ts()}] OTP response status: {resp.status_code}")
        print(f"[{get_ts()}] OTP response body: {resp.text[:300]}")
        if resp.status_code == 200:
            data   = resp.json()
            ws_url = (data.get("data", {}).get("url") or
                      data.get("url") or
                      data.get("data", {}).get("websocket_url"))
            if ws_url:
                print(f"[{get_ts()}] OTP WebSocket URL obtained ✓  {ws_url[:60]}...")
                return ws_url
            else:
                print(f"[{get_ts()}] OTP response missing URL: {data}")
        else:
            print(f"[{get_ts()}] OTP request failed: {resp.status_code} {resp.text}")
    except Exception as e:
        print(f"[{get_ts()}] OTP request exception: {e}")
    return None


def _run_ws():
    global ws
    ws_url = _get_otp_ws_url()
    if not ws_url:
        print(f"[{get_ts()}] Could not get OTP URL — retrying in 10s...")
        time.sleep(10)
        _start_ws_thread()
        return

    ws = websocket.WebSocketApp(
        ws_url,
        on_open=on_open, on_message=on_message,
        on_error=on_error, on_close=on_close,
    )
    ws.run_forever(ping_interval=30, ping_timeout=10)


def _start_ws_thread():
    threading.Thread(target=_run_ws, daemon=True).start()

# ============================================================
# DASH DASHBOARD
# ============================================================

app = dash.Dash(__name__, external_stylesheets=[dbc.themes.DARKLY])

app.layout = dbc.Container([

    dbc.Row(dbc.Col(html.H1(
        "XERO AI SOFTWARE  ·  DUAL TIMEFRAME  ·  HTF=2min  LTF=1min",
        className="text-center text-primary mb-1",
        style={"fontSize": "1.4rem", "letterSpacing": "2px"}))),

    dbc.Row(dbc.Col(html.H6(
        f"HTF GATE  |  LTF TRIGGER  |  "
        f"Filter: LTF MAP must be in same band as HTF signal  |  "
        f"IntBB({BB_PERIOD},{BB_DEVIATION}) on MAP",
        className="text-center text-secondary mb-2",
        style={"fontSize": "0.75rem"}))),

    dbc.Row(dbc.Col(html.H4(id='live-time',
                            className="text-center text-warning mb-3"))),

    dbc.Row(dbc.Col(html.Div(id='map-readout', className="mb-2"))),
    dbc.Row(dbc.Col(html.Div(id='window-banner', className="mb-3"))),

    dbc.Row([
        dbc.Col([
            html.Label("Symbol:", className="text-white fw-bold"),
            dcc.Dropdown(
                id='sym-dd',
                options=[{'label': s['name'], 'value': s['symbol']}
                         for s in TRADING_SYMBOLS],
                value=TRADING_SYMBOLS[0]['symbol'],
                className="mb-2",
            ),
        ], width=6),
        dbc.Col([
            html.Label("Candles to display:", className="text-white fw-bold"),
            dcc.Slider(id='candle-window', min=10, max=150, step=10, value=60,
                       marks={i: str(i) for i in range(10, 151, 30)}),
        ], width=6),
    ], className="mb-2"),

    dbc.Row(dbc.Col([
        html.H5("HTF — 2-min Candles  (GATE)",
                className="text-info mt-2 mb-1 text-center"),
        dcc.Graph(id='htf-chart', style={'height': '700px'}),
    ])),

    dbc.Row(dbc.Col([
        html.H5("LTF — 1-min Candles  (TRIGGER)",
                className="text-warning mt-2 mb-1 text-center"),
        dcc.Graph(id='ltf-chart', style={'height': '700px'}),
    ])),

    dbc.Row(dbc.Col([
        html.H5("Telegram Alert Log", className="text-white mt-3 mb-2"),
        html.Div(id='alert-log'),
    ])),

    dbc.Row(dbc.Col([
        html.H5("Symbol Status", className="text-white mt-3 mb-2"),
        html.Div(id='sym-table'),
    ])),

    dcc.Interval(id='interval', interval=2000, n_intervals=0),

], fluid=True, style={'backgroundColor': '#080c10', 'padding': '12px'})

# ============================================================
# CHART BUILDER
# ============================================================

def _build_chart(sel_sym, candle_win, data_key, label):
    from plotly.subplots import make_subplots

    chart_data = list(dashboard_data[data_key].get(sel_sym, []))
    sd         = symbol_data.get(sel_sym, {})

    fig = make_subplots(
        rows=2, cols=1,
        shared_xaxes=True,
        row_heights=[0.50, 0.50],
        vertical_spacing=0.12,
        subplot_titles=('', ''),
    )

    fc = None
    if chart_data:
        recent   = chart_data[-candle_win:]
        gran_key = HTF_GRANULARITY if data_key == 'htf_candles' else LTF_GRANULARITY
        fc       = forming_candle.get((sel_sym, gran_key))
        display_data = list(recent) + ([fc] if fc else [])

        fig.add_trace(go.Candlestick(
            x=[d['time']  for d in display_data],
            open=[d['open']  for d in display_data],
            high=[d['high']  for d in display_data],
            low=[d['low']   for d in display_data],
            close=[d['close'] for d in display_data],
            name=label,
            increasing_line_color='#26a69a',
            decreasing_line_color='#ef5350',
        ), row=1, col=1)

        map_data   = [(d['time'], d['map'])    for d in recent if d.get('map')    is not None]
        sig_data   = [(d['time'], d['signal']) for d in recent if d.get('signal') is not None]
        bb_up_data = [(d['time'], d['bb_up'])  for d in recent if d.get('bb_up')  is not None]
        bb_dn_data = [(d['time'], d['bb_dn'])  for d in recent if d.get('bb_dn')  is not None]

        if map_data:
            fig.add_trace(go.Scatter(
                x=[x[0] for x in map_data], y=[x[1] for x in map_data],
                mode='lines', name='MAP',
                line=dict(color='#ffd700', width=2)),
                row=2, col=1)

        if sig_data:
            fig.add_trace(go.Scatter(
                x=[x[0] for x in sig_data], y=[x[1] for x in sig_data],
                mode='lines', name='Signal',
                line=dict(color='#42a5f5', width=1, dash='dot')),
                row=2, col=1)

        if bb_up_data:
            fig.add_trace(go.Scatter(
                x=[x[0] for x in bb_up_data], y=[x[1] for x in bb_up_data],
                mode='lines', name=f'IntBB Upper ({BB_PERIOD},{BB_DEVIATION})',
                line=dict(color='#26a69a', width=1, dash='dash')),
                row=2, col=1)
            fig.add_trace(go.Scatter(
                x=[x[0] for x in bb_dn_data], y=[x[1] for x in bb_dn_data],
                mode='lines', name=f'IntBB Lower ({BB_PERIOD},{BB_DEVIATION})',
                line=dict(color='#ef5350', width=1, dash='dash'),
                fill='tonexty', fillcolor='rgba(255,215,0,0.04)'),
                row=2, col=1)

        fig.add_hline(y=0, line=dict(color='rgba(255,255,255,0.15)',
                      width=1, dash='dash'), row=2, col=1)

        if data_key == 'htf_candles' and sd.get('window_open'):
            direction = sd.get('window_direction', '')
            col       = '#00e676' if direction == 'BUY' else '#ff1744'
            fig.add_annotation(
                text=f"◉ Window OPEN — {direction}  (valid until HTF invalidates)",
                xref="x domain", yref="y domain",
                x=0.01, y=0.97, showarrow=False,
                font=dict(size=12, color=col),
                bgcolor="rgba(0,0,0,0.8)",
                row=1, col=1,
            )
    else:
        tf_key = 'htf' if data_key == 'htf_candles' else 'ltf'
        tf_sd  = sd.get(tf_key, {})
        cc     = tf_sd.get('candle_count', 0)
        fig.add_annotation(
            text=f"Loading {label} candles... {cc}/{MIN_CANDLES}",
            xref="paper", yref="paper",
            x=0.5, y=0.5, showarrow=False,
            font=dict(size=14, color="orange"))

    fig.update_layout(
        template='plotly_dark',
        hovermode='x unified',
        height=700,
        margin=dict(l=60, r=20, t=20, b=30),
        plot_bgcolor='#0d1117',
        paper_bgcolor='#080c10',
        showlegend=True,
        legend=dict(orientation='h', y=1.04, x=1,
                    xanchor='right', font=dict(size=10)),
    )
    fig.update_xaxes(gridcolor='#161e28', rangeslider_visible=False)
    fig.update_yaxes(gridcolor='#161e28')

    map_vals   = [d['map']   for d in chart_data if d.get('map')   is not None]
    bb_up_vals = [d['bb_up'] for d in chart_data if d.get('bb_up') is not None]
    bb_dn_vals = [d['bb_dn'] for d in chart_data if d.get('bb_dn') is not None]
    all_ind_vals = map_vals + bb_up_vals + bb_dn_vals
    if all_ind_vals:
        ind_min = min(all_ind_vals)
        ind_max = max(all_ind_vals)
        ind_rng = ind_max - ind_min if ind_max != ind_min else 1.0
        ind_pad = ind_rng * 0.80
        fig.update_yaxes(
            range=[ind_min - ind_pad, ind_max + ind_pad],
            autorange=False,
            row=2, col=1
        )

    all_times = [d['time'] for d in chart_data[-candle_win:] if d.get('time') is not None]
    if fc:
        all_times = all_times + [fc['time']]
    if len(all_times) >= 2:
        import pandas as pd
        t_min       = min(all_times)
        t_max       = max(all_times)
        total_span  = (t_max - t_min).total_seconds()
        x_pad_secs  = total_span * 0.03
        x_start     = t_min - pd.Timedelta(seconds=x_pad_secs)
        x_end       = t_max + pd.Timedelta(seconds=x_pad_secs * 4)
        fig.update_xaxes(range=[x_start, x_end])

    return fig

# ============================================================
# CALLBACKS
# ============================================================

@app.callback(
    [Output('live-time',    'children'),
     Output('map-readout',  'children'),
     Output('window-banner','children'),
     Output('alert-log',    'children'),
     Output('sym-table',    'children')],
    [Input('interval', 'n_intervals'),
     Input('sym-dd',   'value')],
)
def refresh_stats(n, sel_sym):
    sd     = symbol_data.get(sel_sym, {})
    htf_tf = sd.get('htf', {})
    ltf_tf = sd.get('ltf', {})
    htf_map = htf_tf.get('last_map')
    ltf_map = ltf_tf.get('last_map')
    htf_bbu = htf_tf.get('last_bb_up')
    htf_bbd = htf_tf.get('last_bb_dn')
    ltf_bbu = ltf_tf.get('last_bb_up')
    ltf_bbd = ltf_tf.get('last_bb_dn')

    # LTF band position indicator
    if ltf_map is not None and ltf_bbu is not None and ltf_bbd is not None:
        if ltf_map < ltf_bbd:
            ltf_pos = "🔵 BELOW BB Lower"
            ltf_cls = "text-success"
        elif ltf_map > ltf_bbu:
            ltf_pos = "🔴 ABOVE BB Upper"
            ltf_cls = "text-danger"
        else:
            ltf_pos = "⚪ Inside bands"
            ltf_cls = "text-secondary"
    else:
        ltf_pos = "loading"
        ltf_cls = "text-secondary"

    map_readout = html.Div([
        html.Span("LIVE INDICATOR VALUES:  ", className="text-white fw-bold me-3"),
        html.Span(f"HTF MAP: {htf_map:.3f}" if htf_map is not None else "HTF MAP: loading",
                  className="text-warning me-3", style={"fontSize": "0.85rem"}),
        html.Span(f"HTF BB↑: {htf_bbu:.3f}  BB↓: {htf_bbd:.3f}" if htf_bbu else "HTF BB: loading",
                  className="text-info me-3", style={"fontSize": "0.85rem"}),
        html.Span("|", className="text-secondary me-3"),
        html.Span(f"LTF MAP: {ltf_map:.3f}" if ltf_map is not None else "LTF MAP: loading",
                  className="text-warning me-3", style={"fontSize": "0.85rem"}),
        html.Span(f"LTF BB↑: {ltf_bbu:.3f}  BB↓: {ltf_bbd:.3f}" if ltf_bbu else "LTF BB: loading",
                  className="text-info me-3", style={"fontSize": "0.85rem"}),
        html.Span(f"LTF Position: {ltf_pos}",
                  className=f"{ltf_cls} fw-bold", style={"fontSize": "0.85rem"}),
    ], className="d-flex align-items-center flex-wrap p-2 mb-2",
       style={"backgroundColor": "#0d1117", "borderRadius": "6px",
              "border": "1px solid #1e3a5f"})

    open_trade_count = _count_open_trades()
    if sd.get('window_open'):
        direction = sd.get('window_direction', '')
        col       = "success" if direction == 'BUY' else "danger"
        banner_content = [
            dbc.Badge(f"◉ HTF {direction} ARMED",
                      color=col, className="me-2 fs-5 px-3 py-2"),
            html.Span("Waiting for LTF crossover — window valid until HTF invalidates",
                      className="text-white ms-2"),
        ]
    else:
        banner_content = [
            dbc.Badge("No active window — monitoring HTF for setup",
                      color="secondary", className="fs-6 px-3 py-2"),
        ]
    banner_content.append(
        dbc.Badge(f"📊 Open Trades: {open_trade_count}/{MAX_OPEN_TRADES}",
                  color="info" if open_trade_count < MAX_OPEN_TRADES else "danger",
                  className="ms-3 fs-6 px-3 py-2")
    )
    window_banner = html.Div(
        banner_content,
        className="d-flex align-items-center flex-wrap p-2",
        style={"backgroundColor": "#0d1117", "borderRadius": "8px",
               "border": "1px solid #1e2d40"}
    )

    alerts = dashboard_data['alerts'][:20]
    if alerts:
        type_colors = {
            "HTF SIGNAL":      "warning",
            "⚠️ DISCARDED":   "secondary",
            "✅ ENTRY":        "success",
            "⛔ CANCELLED":    "danger",
            "🚫 INVALIDATED":  "danger",
            "🚀 TRADE OPEN":   "info",
            "✅ TRADE CLOSED": "success",
            "🔴 TRADE CLOSED": "danger",
        }
        rows = []
        for a in alerts:
            badge_color = type_colors.get(a['type'], "secondary")
            rows.append(html.Tr([
                html.Td(a['time'],   className="text-secondary", style={"fontSize": "0.8rem"}),
                html.Td(a['symbol'], className="text-white fw-bold"),
                html.Td(dbc.Badge(a['type'], color=badge_color)),
                html.Td(a['direction'],
                        className="text-success" if a['direction'] == 'BUY' else "text-danger"),
                html.Td(a['message'], className="text-secondary",
                        style={"fontSize": "0.78rem"}),
            ]))
        alert_log = dbc.Table(
            [html.Thead(html.Tr([
                html.Th("Time"), html.Th("Symbol"),
                html.Th("Type"), html.Th("Direction"), html.Th("Detail"),
            ]))] + [html.Tbody(rows)],
            bordered=True, color="dark", hover=True, size='sm',
            className="table-dark",
        )
    else:
        alert_log = html.P("No alerts yet — waiting for HTF signals.",
                           className="text-secondary")

    rows = []
    for cfg in TRADING_SYMBOLS:
        s_sd  = symbol_data.get(cfg['symbol'], {})
        htf_s = s_sd.get('htf', {})
        ltf_s = s_sd.get('ltf', {})

        htf_ready = not htf_s.get('warming_up', True)
        ltf_ready = not ltf_s.get('warming_up', True)
        htf_cc    = htf_s.get('candle_count', 0)
        ltf_cc    = ltf_s.get('candle_count', 0)

        # LTF band position for each symbol
        s_ltf_map = ltf_s.get('last_map')
        s_ltf_bbu = ltf_s.get('last_bb_up')
        s_ltf_bbd = ltf_s.get('last_bb_dn')
        if s_ltf_map is not None and s_ltf_bbu is not None and s_ltf_bbd is not None:
            if s_ltf_map < s_ltf_bbd:
                band_str = "🔵 Below Lower"
                band_cls = "text-success"
            elif s_ltf_map > s_ltf_bbu:
                band_str = "🔴 Above Upper"
                band_cls = "text-danger"
            else:
                band_str = "⚪ Inside"
                band_cls = "text-secondary"
        else:
            band_str = "—"
            band_cls = "text-secondary"

        if htf_ready and ltf_ready:
            badge = dbc.Badge("READY", color="success")
        else:
            htf_pct = min(100, int(htf_cc / MIN_CANDLES * 100))
            ltf_pct = min(100, int(ltf_cc / MIN_CANDLES * 100))
            badge   = dbc.Badge(f"LOADING H:{htf_pct}% L:{ltf_pct}%",
                                color="warning", style={"fontSize": "0.65rem"})

        win_str = f"◉ {s_sd['window_direction']} OPEN" if s_sd.get('window_open') else "—"
        win_cls = "text-warning" if s_sd.get('window_open') else "text-secondary"

        rows.append(html.Tr([
            html.Td(cfg['symbol'], className="text-white fw-bold"),
            html.Td(cfg['name'],   className="text-secondary",
                    style={"fontSize": "0.8rem"}),
            html.Td(f"H:{htf_cc} / L:{ltf_cc}",
                    className="text-info", style={"fontSize": "0.8rem"}),
            html.Td(html.Span(band_str, className=band_cls),
                    style={"fontSize": "0.8rem"}),
            html.Td(win_str, className=win_cls),
            html.Td(badge),
        ]))

    sym_table = dbc.Table(
        [html.Thead(html.Tr([
            html.Th("Symbol"), html.Th("Name"),
            html.Th("Candles (H/L)"), html.Th("LTF MAP Position"),
            html.Th("Window"), html.Th("Status"),
        ]))] + [html.Tbody(rows)],
        bordered=True, color="dark", hover=True, striped=True, size='sm',
        className="table-dark",
    )

    return (
        f"  {datetime.now().strftime('%Y-%m-%d  %H:%M:%S')}",
        map_readout,
        window_banner,
        alert_log,
        sym_table,
    )


@app.callback(Output('htf-chart', 'figure'),
              [Input('interval', 'n_intervals'),
               Input('sym-dd', 'value'),
               Input('candle-window', 'value')])
def refresh_htf(n, sel_sym, cw):
    return _build_chart(sel_sym, cw, 'htf_candles', 'HTF 2min')


@app.callback(Output('ltf-chart', 'figure'),
              [Input('interval', 'n_intervals'),
               Input('sym-dd', 'value'),
               Input('candle-window', 'value')])
def refresh_ltf(n, sel_sym, cw):
    return _build_chart(sel_sym, cw, 'ltf_candles', 'LTF 1min')


def run_dashboard():
    print(f"\n{'='*70}")
    print(f"[{get_ts()}] Dashboard -> http://localhost:8050")
    print(f"{'='*70}\n")
    app.run(debug=False, host='0.0.0.0', port=8050)

# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":
    print("\n" + "="*70)
    print("XERO AI SOFTWARE — DUAL TIMEFRAME AUTO TRADING BOT")
    print("="*70)
    print(f"  HTF candle     : 2 minutes  (granularity={HTF_GRANULARITY}s) — GATE")
    print(f"  LTF candle     : 1 minute   (granularity={LTF_GRANULARITY}s) — TRIGGER")
    print(f"  Window         : Open until HTF invalidates (no timer)")
    print(f"  BB on MAP      : period={BB_PERIOD}, dev={BB_DEVIATION}")
    print(f"  History load   : {HISTORY_COUNT} candles per timeframe per symbol")
    print(f"  Symbols        : {len(TRADING_SYMBOLS)}")
    print(f"  Telegram       : Chat ID {TELEGRAM_CHAT_ID}")
    print("="*70)
    print()
    print("  ── FIRE condition (HTF and LTF) ──")
    print("    BUY  : MAP & SIGNAL exit below BB Lower, curl up, re-enter")
    print("    SELL : MAP & SIGNAL exit above BB Upper, curl down, re-enter")
    print()
    print("  ── NEW FILTER — LTF MAP BAND CHECK ──")
    print("    When HTF fires BUY  → LTF MAP must be BELOW BB Lower")
    print("    When HTF fires SELL → LTF MAP must be ABOVE BB Upper")
    print("    If not in correct band → signal DISCARDED immediately")
    print()
    print("  ── FLOW ──")
    print("    1. HTF fires   → Check LTF MAP band position")
    print("    2. LTF MAP in correct band → window opens, Telegram alert")
    print("    3. LTF MAP NOT in correct band → signal discarded, no window")
    print("    4. LTF fires same direction → ENTRY alert — enter manually")
    print("    5. HTF invalidates → window closed")
    print("="*70 + "\n")

    send_telegram(
        f"🚀 <b>XERO AI SOFTWARE STARTED</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"HTF : 2-min candles (GATE)\n"
        f"LTF : 1-min candles (TRIGGER)\n"
        f"Filter : LTF MAP must be in same band as HTF signal\n"
        f"  BUY  → LTF MAP below BB Lower\n"
        f"  SELL → LTF MAP above BB Upper\n"
        f"Window : Open until HTF invalidates\n"
        f"Symbols : {len(TRADING_SYMBOLS)}\n"
        f"Time : {get_dt()}\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"<i>Only high-quality dual-confirmed signals will fire</i>"
    )
    send_startup_chart()

    _start_ws_thread()
    threading.Thread(target=run_dashboard, daemon=True).start()
    time.sleep(2)
    print(f"[{get_ts()}] System live — open http://localhost:8050")

    hb = 0
    try:
        while running:
            time.sleep(30)
            hb += 1
            if hb % 4 == 0:
                ready_htf = sum(1 for st in symbol_data.values()
                                if not st.get('htf', {}).get('warming_up', True))
                ready_ltf = sum(1 for st in symbol_data.values()
                                if not st.get('ltf', {}).get('warming_up', True))
                windows   = sum(1 for st in symbol_data.values()
                                if st.get('window_open'))
                print(f"\n[{get_ts()}] Heartbeat  "
                      f"HTF-ready:{ready_htf}/{len(TRADING_SYMBOLS)}  "
                      f"LTF-ready:{ready_ltf}/{len(TRADING_SYMBOLS)}  "
                      f"Windows-open:{windows}  "
                      f"Open-trades:{_count_open_trades()}/{MAX_OPEN_TRADES}")
    except KeyboardInterrupt:
        print(f"\n[{get_ts()}] Stopped by user")
        running = False
        if ws:
            ws.close()

    print(f"\n[{get_ts()}] Shutdown complete")
