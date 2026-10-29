"""
Chronological portfolio ledger.

Single source of truth for replaying a portfolio's history. Both the
current P/L totals and the daily performance series are built on it, so
the two can never disagree.

Rules:
  - Cost basis uses the **average cost** method.
  - Cash is tracked with the *pocket / safe* model:
      buy      → paid from the safe first, the remainder from the pocket
      sell     → proceeds go into the safe
      dividend → net cash goes into the safe
    ``pocket`` is therefore the money that came from outside the portfolio.
  - A cash dividend is credited on its **ex-date** to the shares held at
    the end of the previous day. Dividends of a day are applied *before*
    that day's trades: shares bought on the ex-date do not receive it,
    shares sold on the ex-date still do. Crediting on the ex-date keeps the
    total value continuous, because that is the day the price drops.

This module is pure (no DB, no network) so it can be unit-tested directly.
"""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Iterable, Literal

ZERO = Decimal(0)


@dataclass(frozen=True)
class LedgerTransaction:
    date: date
    ticker: str
    operation: Literal["buy", "sell"]
    quantity: Decimal
    price: Decimal


@dataclass(frozen=True)
class DividendEvent:
    ex_date: date
    ticker: str
    gross_per_share: Decimal
    withholding_rate: Decimal

    @property
    def net_per_share(self) -> Decimal:
        return self.gross_per_share * (1 - self.withholding_rate)


@dataclass(frozen=True)
class DividendReceipt:
    ex_date: date
    ticker: str
    quantity: Decimal
    gross_per_share: Decimal
    withholding_rate: Decimal
    gross_amount: Decimal
    net_amount: Decimal


@dataclass
class TickerPosition:
    quantity: Decimal = ZERO
    cost_basis: Decimal = ZERO
    realized_pl: Decimal = ZERO
    sold_value: Decimal = ZERO
    sold_cost: Decimal = ZERO
    dividend_income: Decimal = ZERO

    @property
    def avg_cost(self) -> Decimal:
        return self.cost_basis / self.quantity if self.quantity > 0 else ZERO


@dataclass
class Ledger:
    positions: dict[str, TickerPosition] = field(default_factory=dict)
    pocket: Decimal = ZERO
    safe: Decimal = ZERO
    dividend_receipts: list[DividendReceipt] = field(default_factory=list)

    # -- events ------------------------------------------------------

    def apply_transaction(self, txn: LedgerTransaction) -> None:
        position = self.positions.setdefault(txn.ticker, TickerPosition())
        amount = txn.quantity * txn.price

        if txn.operation == "buy":
            position.quantity += txn.quantity
            position.cost_basis += amount

            from_safe = min(self.safe, amount)
            self.safe -= from_safe
            self.pocket += amount - from_safe
            return

        if position.quantity > 0:
            avg_cost = position.avg_cost
            sell_cost = txn.quantity * avg_cost
            position.realized_pl += txn.quantity * (txn.price - avg_cost)
            position.sold_value += amount
            position.sold_cost += sell_cost
            position.quantity -= txn.quantity
            position.cost_basis -= sell_cost
            if position.quantity <= 0:
                position.quantity = ZERO
                position.cost_basis = ZERO

        self.safe += amount

    def apply_dividend(self, event: DividendEvent) -> DividendReceipt | None:
        position = self.positions.get(event.ticker)
        if position is None or position.quantity <= 0:
            return None

        gross_amount = position.quantity * event.gross_per_share
        net_amount = position.quantity * event.net_per_share
        receipt = DividendReceipt(
            ex_date=event.ex_date,
            ticker=event.ticker,
            quantity=position.quantity,
            gross_per_share=event.gross_per_share,
            withholding_rate=event.withholding_rate,
            gross_amount=gross_amount,
            net_amount=net_amount,
        )

        position.dividend_income += net_amount
        self.safe += net_amount
        self.dividend_receipts.append(receipt)
        return receipt

    def apply_day(
        self,
        dividends: Iterable[DividendEvent],
        transactions: Iterable[LedgerTransaction],
    ) -> None:
        """Apply one calendar day: dividends first, then trades in order."""
        for event in dividends:
            self.apply_dividend(event)
        for txn in transactions:
            self.apply_transaction(txn)

    # -- aggregates --------------------------------------------------

    @property
    def realized_total(self) -> Decimal:
        return sum((p.realized_pl for p in self.positions.values()), ZERO)

    @property
    def dividend_total(self) -> Decimal:
        return sum((p.dividend_income for p in self.positions.values()), ZERO)

    def unrealized_total(self, closes: dict[str, Decimal]) -> Decimal:
        """Unrealized P/L of open positions that have a known close."""
        total = ZERO
        for ticker, position in self.positions.items():
            close = closes.get(ticker)
            if position.quantity <= 0 or close is None:
                continue
            total += position.quantity * (close - position.avg_cost)
        return total


def group_by_date(
    transactions: Iterable[LedgerTransaction],
    dividends: Iterable[DividendEvent],
) -> dict[date, tuple[list[DividendEvent], list[LedgerTransaction]]]:
    """Bucket events by calendar day, keeping the input order within a day."""
    days: dict[date, tuple[list[DividendEvent], list[LedgerTransaction]]] = {}
    for event in dividends:
        days.setdefault(event.ex_date, ([], []))[0].append(event)
    for txn in transactions:
        days.setdefault(txn.date, ([], []))[1].append(txn)
    return days


def replay(
    transactions: Iterable[LedgerTransaction],
    dividends: Iterable[DividendEvent],
) -> Ledger:
    """Replay every event chronologically and return the final ledger."""
    ledger = Ledger()
    days = group_by_date(transactions, dividends)
    for day in sorted(days):
        day_dividends, day_transactions = days[day]
        ledger.apply_day(day_dividends, day_transactions)
    return ledger
