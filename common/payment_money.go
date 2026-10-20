package common

import (
	"errors"
	"math"

	"github.com/shopspring/decimal"
)

// OfficialPaymentCents rounds a quoted CNY amount to fen, with an explicit
// per-order cap of CNY 1,000,000 before any conversion to an integer.
func OfficialPaymentCents(amount float64) (int64, error) {
	if math.IsNaN(amount) || math.IsInf(amount, 0) {
		return 0, errors.New("invalid payment amount")
	}
	return OfficialPaymentDecimalCents(decimal.NewFromFloat(amount))
}

func OfficialPaymentDecimalCents(amount decimal.Decimal) (int64, error) {
	cents := amount.Round(2).Shift(2)
	if cents.LessThan(decimal.NewFromInt(1)) || cents.GreaterThan(decimal.NewFromInt(100_000_000)) {
		return 0, errors.New("payment amount is outside the supported range")
	}
	return cents.IntPart(), nil
}
