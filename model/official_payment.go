package model

import (
	"errors"
	"fmt"

	"github.com/BrandonVee/ai-gateway/common"
	"github.com/BrandonVee/ai-gateway/logger"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

const (
	PaymentProviderWeChatOfficial = "wechat_official"
	PaymentProviderAlipayOfficial = "alipay_official"
)

var ErrPaymentAmountMismatch = errors.New("payment amount mismatch")

// The amount and provider are checked under the same row lock as settlement,
// including duplicate notifications. Neither a client redirect nor polling can
// enter this path without a verified server-to-server payment receipt.
func RechargeOfficialPayment(tradeNo, provider string, paidCents int64, callerIP string) error {
	if provider != PaymentProviderWeChatOfficial && provider != PaymentProviderAlipayOfficial {
		return ErrPaymentMethodMismatch
	}
	var topup TopUp
	var creditedQuota int
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).Where("trade_no = ?", tradeNo).First(&topup).Error; err != nil {
			return err
		}
		if topup.PaymentProvider != provider || topup.PaymentMethod != provider {
			return ErrPaymentMethodMismatch
		}
		cents, err := common.OfficialPaymentCents(topup.Money)
		if err != nil || cents != paidCents {
			return ErrPaymentAmountMismatch
		}
		if topup.Status == common.TopUpStatusSuccess {
			return nil
		}
		if topup.Status != common.TopUpStatusPending {
			return ErrTopUpStatusInvalid
		}
		quota, err := common.WalletQuotaFromDecimalStrict(decimal.NewFromInt(topup.Amount).Mul(decimal.NewFromFloat(common.QuotaPerUnit)))
		if err != nil || quota <= 0 {
			return ErrInvalidTopUpQuota
		}
		if err := creditTopUpQuota(tx, topup.UserId, quota, nil); err != nil {
			return err
		}
		topup.Status = common.TopUpStatusSuccess
		topup.CompleteTime = common.GetTimestamp()
		if err := tx.Save(&topup).Error; err != nil {
			return err
		}
		creditedQuota = quota
		return nil
	})
	if err != nil {
		return err
	}
	if creditedQuota > 0 {
		syncCreditUserQuotaCache(topup.UserId, creditedQuota, "official payment")
		RecordTopupLog(topup.UserId, common.NewMessage("Online top-up succeeded, amount added: {{quota}}, payment amount: {{amount}}", map[string]any{
			"quota": logger.FormatQuota(creditedQuota), "amount": fmt.Sprintf("%.2f", topup.Money),
		}), callerIP, provider, provider)
	}
	return nil
}

func CompleteOfficialSubscriptionOrder(tradeNo, provider, providerPayload string, paidCents int64) error {
	if provider != PaymentProviderWeChatOfficial && provider != PaymentProviderAlipayOfficial {
		return ErrPaymentMethodMismatch
	}
	return completeSubscriptionOrder(tradeNo, providerPayload, provider, provider, &paidCents)
}
