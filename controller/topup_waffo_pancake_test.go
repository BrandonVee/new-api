package controller

import (
	"maps"
	"strings"
	"testing"

	"github.com/BrandonVee/ai-gateway/common"
	"github.com/BrandonVee/ai-gateway/model"
	"github.com/BrandonVee/ai-gateway/service"
	"github.com/BrandonVee/ai-gateway/setting"
	"github.com/BrandonVee/ai-gateway/setting/operation_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestFormatWaffoPancakeAmount_UsesDisplayPriceString(t *testing.T) {
	testCases := []struct {
		name     string
		amount   float64
		expected string
	}{
		{name: "whole amount", amount: 29, expected: "29.00"},
		{name: "decimal amount", amount: 29.9, expected: "29.90"},
		{name: "round half up to cents", amount: 29.999, expected: "30.00"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.expected, formatWaffoPancakeAmount(tc.amount))
		})
	}
}

func TestGetWaffoPancakePayMoney(t *testing.T) {
	originalUnitPrice := setting.WaffoPancakeUnitPrice
	originalQuotaDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
	originalDiscounts := make(map[int]float64, len(operation_setting.GetPaymentSetting().AmountDiscount))
	maps.Copy(originalDiscounts, operation_setting.GetPaymentSetting().AmountDiscount)
	originalTopupGroupRatio := common.TopupGroupRatio2JSONString()

	t.Cleanup(func() {
		setting.WaffoPancakeUnitPrice = originalUnitPrice
		operation_setting.GetGeneralSetting().QuotaDisplayType = originalQuotaDisplayType
		operation_setting.GetPaymentSetting().AmountDiscount = originalDiscounts
		require.NoError(t, common.UpdateTopupGroupRatioByJSONString(originalTopupGroupRatio))
	})

	setting.WaffoPancakeUnitPrice = 2.5
	operation_setting.GetPaymentSetting().AmountDiscount = map[int]float64{
		10:                           0.8,
		int(common.QuotaPerUnit * 3): 0.5,
		20:                           0,
	}
	require.NoError(t, common.UpdateTopupGroupRatioByJSONString(`{"default":1,"vip":1.2}`))

	testCases := []struct {
		name             string
		amount           int64
		group            string
		quotaDisplayType string
		expected         float64
	}{
		{
			name:             "currency display applies unit price group ratio and discount",
			amount:           10,
			group:            "vip",
			quotaDisplayType: operation_setting.QuotaDisplayTypeUSD,
			expected:         24,
		},
		{
			name:             "tokens display converts quota to display units before pricing",
			amount:           int64(common.QuotaPerUnit * 3),
			group:            "vip",
			quotaDisplayType: operation_setting.QuotaDisplayTypeTokens,
			expected:         4.5,
		},
		{
			name:             "non-positive discount falls back to no discount",
			amount:           20,
			group:            "default",
			quotaDisplayType: operation_setting.QuotaDisplayTypeUSD,
			expected:         50,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			operation_setting.GetGeneralSetting().QuotaDisplayType = tc.quotaDisplayType
			actual := getWaffoPancakePayMoney(tc.amount, tc.group)
			require.InDelta(t, tc.expected, actual, 0.000001)
		})
	}
}

func TestWaffoPancakeBuyerRenamePreservesOrderOwnership(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&model.TopUp{}, &model.SubscriptionOrder{}))
	previousDB := model.DB
	model.DB = db
	t.Cleanup(func() {
		model.DB = previousDB
		require.NoError(t, sqlDB.Close())
	})

	assert.Equal(t, "ai-gateway-user-42", getWaffoPancakeBuyerIdentity(&model.User{Id: 42}))
	for _, tc := range []struct {
		name, buyer, provider string
		valid                 bool
	}{
		{name: "gateway buyer", buyer: "ai-gateway-user-42", valid: true},
		{name: "already issued checkout", buyer: "new-api-user-42", valid: true},
		{name: "another gateway user", buyer: "ai-gateway-user-7"},
		{name: "another historical user", buyer: "new-api-user-7"},
		{name: "missing buyer"},
		{name: "different payment provider", buyer: "ai-gateway-user-42", provider: model.PaymentProviderEpay},
	} {
		t.Run(tc.name, func(t *testing.T) {
			provider := tc.provider
			if provider == "" {
				provider = model.PaymentProviderWaffoPancake
			}
			tradeNo := "buyer-wallet-" + strings.ReplaceAll(tc.name, " ", "-")
			require.NoError(t, db.Create(&model.TopUp{UserId: 42, TradeNo: tradeNo, PaymentProvider: provider}).Error)
			event := &service.WaffoPancakeWebhookEvent{}
			event.Data.OrderMerchantExternalID = tradeNo
			event.Data.MerchantProvidedBuyerIdentity = tc.buyer
			resolved, err := service.ResolveWaffoPancakeTradeNo(event)
			if tc.valid {
				require.NoError(t, err)
				assert.Equal(t, tradeNo, resolved)
			} else {
				assert.Error(t, err)
				assert.Empty(t, resolved)
			}

			tradeNo = "buyer-sub-" + strings.ReplaceAll(tc.name, " ", "-")
			require.NoError(t, db.Create(&model.SubscriptionOrder{UserId: 42, TradeNo: tradeNo, PaymentProvider: provider}).Error)
			event.Data.OrderMerchantExternalID = tradeNo
			resolved, err = service.ResolveWaffoPancakeSubscriptionTradeNo(event)
			if tc.valid {
				require.NoError(t, err)
				assert.Equal(t, tradeNo, resolved)
			} else {
				assert.Error(t, err)
				assert.Empty(t, resolved)
			}
		})
	}
}
