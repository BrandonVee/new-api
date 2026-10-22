package controller

import (
	"crypto/sha256"
	"encoding/hex"
	"maps"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/BrandonVee/ai-gateway/common"
	"github.com/BrandonVee/ai-gateway/middleware"
	"github.com/BrandonVee/ai-gateway/model"
	"github.com/BrandonVee/ai-gateway/service"
	"github.com/BrandonVee/ai-gateway/setting"
	"github.com/BrandonVee/ai-gateway/setting/operation_setting"
	"github.com/BrandonVee/ai-gateway/setting/system_setting"
	"github.com/Calcium-Ion/go-epay/epay"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestOfficialMerchantSettingsRequireBoundSingleUseProof(t *testing.T) {
	user, identity := setupSecurityEnrollmentTest(t)
	require.NoError(t, model.DB.Model(user).Update("role", common.RoleRootUser).Error)
	common.OptionMapRWMutex.Lock()
	previousOptions := common.OptionMap
	common.OptionMap = make(map[string]string)
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptions
		common.OptionMapRWMutex.Unlock()
	})
	const body = `{"callback_url":"https://gateway.example.com","alipay_app_id":"verified-app"}`
	digest := sha256.Sum256([]byte(body))
	context, err := common.Marshal(service.PaymentMerchantContext{SettingsDigest: hex.EncodeToString(digest[:])})
	require.NoError(t, err)
	operation := service.VerificationOperation{Scope: service.VerificationScopePaymentMerchantUpdate, Context: context}
	guard := middleware.OfficialPaymentSettingsVerificationRequired()
	handler := func(c *gin.Context) {
		guard(c)
		if !c.IsAborted() {
			UpdateOfficialPaymentSettings(c)
		}
	}
	request := func(payload, proof string) *httptest.ResponseRecorder {
		return securityEnrollmentRequest(http.MethodPut, "/api/option/official_payment", payload, proof, identity, handler)
	}
	missing := request(body, "")
	assert.Equal(t, http.StatusForbidden, missing.Code)
	assert.Contains(t, missing.Body.String(), "SECURITY_PROOF_REQUIRED")
	assert.Empty(t, operation_setting.GetOfficialPaymentSettings().AlipayAppID)

	proof, err := service.VerifySecurityInput(identity, service.VerificationInput{Method: "password", Password: "enrollment-password", Scope: operation.Scope, Context: operation.Context})
	require.NoError(t, err)
	mismatch := request(strings.ReplaceAll(body, "verified-app", "unapproved-app"), proof.ProofToken)
	assert.Equal(t, http.StatusForbidden, mismatch.Code)
	assert.Contains(t, mismatch.Body.String(), "SECURITY_PROOF_CONTEXT_MISMATCH")
	assert.Empty(t, operation_setting.GetOfficialPaymentSettings().AlipayAppID)

	saved := request(body, proof.ProofToken)
	assert.Equal(t, http.StatusOK, saved.Code)
	assert.Contains(t, saved.Body.String(), `"success":true`)
	assert.Equal(t, "verified-app", operation_setting.GetOfficialPaymentSettings().AlipayAppID)
	replayed := request(body, proof.ProofToken)
	assert.Equal(t, http.StatusForbidden, replayed.Code)
	assert.Contains(t, replayed.Body.String(), "SECURITY_PROOF_CONSUMED")

	expiredProof := issueSecurityEnrollmentProof(t, identity, operation, "password")
	require.NoError(t, model.DB.Model(&model.AuthFlow{}).Where("purpose = ?", model.AuthFlowPurposeSecurityProof).Update("expires_at", time.Now().Add(-time.Minute)).Error)
	expired := request(body, expiredProof)
	assert.Equal(t, http.StatusForbidden, expired.Code)
	assert.Contains(t, expired.Body.String(), "SECURITY_PROOF_EXPIRED")

	require.NoError(t, model.DB.Model(user).Update("role", common.RoleCommonUser).Error)
	_, err = service.GetVerificationRequirements(identity, operation.Scope)
	assert.ErrorIs(t, err, service.ErrVerificationForbidden)
}

func TestOfficialWalletQuotePreservesCentsAndQuotaUnits(t *testing.T) {
	user, _ := setupSecurityEnrollmentTest(t)
	oldPrice, oldMin, oldQuota := operation_setting.Price, operation_setting.MinTopUp, common.QuotaPerUnit
	oldDisplay := operation_setting.GetGeneralSetting().QuotaDisplayType
	oldDiscounts := operation_setting.GetPaymentSetting().AmountDiscount
	oldRatios := common.TopupGroupRatio2JSONString()
	t.Cleanup(func() {
		operation_setting.Price, operation_setting.MinTopUp, common.QuotaPerUnit = oldPrice, oldMin, oldQuota
		operation_setting.GetGeneralSetting().QuotaDisplayType = oldDisplay
		operation_setting.GetPaymentSetting().AmountDiscount = oldDiscounts
		require.NoError(t, common.UpdateTopupGroupRatioByJSONString(oldRatios))
	})
	operation_setting.Price, operation_setting.MinTopUp, common.QuotaPerUnit = 2.675, 1, 500000
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	operation_setting.GetPaymentSetting().AmountDiscount = map[int]float64{}
	require.NoError(t, common.UpdateTopupGroupRatioByJSONString(`{"default":1}`))
	units, cents, err := officialWalletQuote(user.Id, 1)
	require.NoError(t, err)
	assert.EqualValues(t, 1, units)
	assert.EqualValues(t, 268, cents, "confirmation and checkout must use the same decimal cent rounding")
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeTokens
	units, cents, err = officialWalletQuote(user.Id, 500000)
	require.NoError(t, err)
	assert.EqualValues(t, 1, units)
	assert.EqualValues(t, 268, cents)
	_, _, err = officialWalletQuote(user.Id, 750000)
	assert.ErrorIs(t, err, model.ErrInvalidTopUpQuota, "fractional stored units cannot silently discard paid quota")
}

func TestOfficialPaymentSettingsAndOwnedOrderStatus(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&model.Option{}, &model.TopUp{}, &model.SubscriptionOrder{}))
	previousDB := model.DB
	model.DB = db
	common.OptionMapRWMutex.Lock()
	previousOptions := common.OptionMap
	common.OptionMap = maps.Clone(previousOptions)
	if common.OptionMap == nil {
		common.OptionMap = make(map[string]string)
	}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		model.DB = previousDB
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptions
		common.OptionMapRWMutex.Unlock()
		require.NoError(t, sqlDB.Close())
	})
	stored := operation_setting.OfficialPaymentSettings{CallbackURL: "https://gateway.example.com", WeChatPrivateKey: "wechat-private-sentinel", WeChatAPIv3Key: "0123456789abcdef0123456789abcdef", AlipayPrivateKey: "alipay-private-sentinel", AlipayAppID: "test-app"}
	raw, err := common.Marshal(stored)
	require.NoError(t, err)
	require.NoError(t, model.UpdateOptionsBulk(map[string]string{operation_setting.OfficialPaymentOptionKey: string(raw)}))
	router := gin.New()
	router.GET("/settings", GetOfficialPaymentSettings)
	router.PUT("/settings", UpdateOfficialPaymentSettings)
	router.GET("/general", GetOptions)
	router.PUT("/general", UpdateOption)
	router.GET("/orders/:trade_no", func(c *gin.Context) { c.Set("id", 42); GetOfficialPaymentOrder(c) })
	router.POST("/orders/:trade_no/check", func(c *gin.Context) { c.Set("id", 42); CheckOfficialPaymentOrder(c) })
	router.POST("/wechat", WeChatOfficialPaymentNotify)
	router.POST("/alipay", AlipayOfficialPaymentNotify)

	t.Run("settings never return usable secrets", func(t *testing.T) {
		for _, path := range []string{"/settings", "/general"} {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
			assert.Equal(t, http.StatusOK, recorder.Code)
			for _, secret := range []string{stored.WeChatPrivateKey, stored.WeChatAPIv3Key, stored.AlipayPrivateKey} {
				assert.NotContains(t, recorder.Body.String(), secret)
			}
			if path == "/general" {
				assert.NotContains(t, recorder.Body.String(), operation_setting.OfficialPaymentOptionKey)
			}
		}
	})
	t.Run("blank secrets retain stored keys", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodPut, "/settings", strings.NewReader(`{"callback_url":"https://new.example.com/","alipay_app_id":"new-app"}`))
		request.Header.Set("Content-Type", "application/json")
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, request)
		var result struct {
			Success bool `json:"success"`
		}
		require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &result))
		require.True(t, result.Success)
		updated := operation_setting.GetOfficialPaymentSettings()
		assert.Equal(t, stored.WeChatPrivateKey, updated.WeChatPrivateKey)
		assert.Equal(t, stored.WeChatAPIv3Key, updated.WeChatAPIv3Key)
		assert.Equal(t, stored.AlipayPrivateKey, updated.AlipayPrivateKey)
		assert.Equal(t, "https://new.example.com", updated.CallbackURL)
		assert.NotContains(t, recorder.Body.String(), stored.AlipayPrivateKey)
	})
	t.Run("general options cannot bypass merchant validation", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPut, "/general", strings.NewReader(`{"key":"OfficialPaymentSecret","value":"{}"}`)))
		assert.Contains(t, recorder.Body.String(), `"success":false`)
		assert.Equal(t, "new-app", operation_setting.GetOfficialPaymentSettings().AlipayAppID)
	})
	t.Run("invalid enabled settings do not replace credentials", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPut, "/settings", strings.NewReader(`{"callback_url":"http://localhost","alipay_enabled":true,"alipay_app_id":"bad-app"}`)))
		assert.Contains(t, recorder.Body.String(), `"success":false`)
		assert.Equal(t, "new-app", operation_setting.GetOfficialPaymentSettings().AlipayAppID)
	})
	t.Run("status query only exposes the authenticated user's orders", func(t *testing.T) {
		require.NoError(t, db.Create(&model.TopUp{UserId: 42, TradeNo: "GWowned", Status: common.TopUpStatusPending, PaymentProvider: model.PaymentProviderAlipayOfficial}).Error)
		require.NoError(t, db.Create(&model.TopUp{UserId: 7, TradeNo: "GWforeign", Status: common.TopUpStatusSuccess, PaymentProvider: model.PaymentProviderAlipayOfficial}).Error)
		require.NoError(t, db.Create(&model.SubscriptionOrder{UserId: 42, TradeNo: "GSowned", Status: common.TopUpStatusSuccess, PaymentProvider: model.PaymentProviderWeChatOfficial}).Error)
		for _, tc := range []struct {
			tradeNo string
			status  int
		}{{"GWowned", 200}, {"GSowned", 200}, {"GWforeign", 404}, {"GWmissing", 404}} {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/orders/"+tc.tradeNo, nil))
			assert.Equal(t, tc.status, recorder.Code)
		}
	})
	t.Run("unsigned callbacks receive failure acknowledgements", func(t *testing.T) {
		for _, tradeNo := range []string{"GWforeign", "GWmissing"} {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/orders/"+tradeNo+"/check", nil))
			assert.Equal(t, http.StatusNotFound, recorder.Code)
		}
		for _, path := range []string{"/wechat", "/alipay"} {
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPost, path, strings.NewReader("{}"))
			request.Header.Set("Content-Type", "application/json")
			router.ServeHTTP(recorder, request)
			assert.Equal(t, http.StatusInternalServerError, recorder.Code)
		}
	})
}

func confirmPaymentComplianceForTest(t *testing.T) {
	t.Helper()
	paymentSetting := operation_setting.GetPaymentSetting()
	originalConfirmed := paymentSetting.ComplianceConfirmed
	originalTermsVersion := paymentSetting.ComplianceTermsVersion
	t.Cleanup(func() {
		paymentSetting.ComplianceConfirmed = originalConfirmed
		paymentSetting.ComplianceTermsVersion = originalTermsVersion
	})
	paymentSetting.ComplianceConfirmed = true
	paymentSetting.ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion
}

func TestOfficialTopUpInfoOnlyListsEnabledGateways(t *testing.T) {
	confirmPaymentComplianceForTest(t)
	previousMethods := operation_setting.PayMethods
	previousAddress, previousID, previousKey := operation_setting.PayAddress, operation_setting.EpayId, operation_setting.EpayKey
	common.OptionMapRWMutex.Lock()
	previousOptions := common.OptionMap
	common.OptionMap = map[string]string{operation_setting.OfficialPaymentOptionKey: `{"wechat_enabled":true,"alipay_enabled":true}`}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		operation_setting.PayMethods = previousMethods
		operation_setting.PayAddress, operation_setting.EpayId, operation_setting.EpayKey = previousAddress, previousID, previousKey
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptions
		common.OptionMapRWMutex.Unlock()
	})
	operation_setting.PayMethods = []map[string]string{{"name": "Unconfigured Epay", "type": "alipay"}}
	operation_setting.PayAddress, operation_setting.EpayId, operation_setting.EpayKey = "", "", ""
	for _, confirmed := range []bool{true, false} {
		operation_setting.GetPaymentSetting().ComplianceConfirmed = confirmed
		recorder := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(recorder)
		c.Request = httptest.NewRequest(http.MethodGet, "/api/user/topup/info", nil)
		GetTopUpInfo(c)
		var response struct {
			Data struct {
				Enabled bool                `json:"enable_online_topup"`
				Methods []map[string]string `json:"pay_methods"`
			} `json:"data"`
		}
		require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
		assert.Equal(t, confirmed, response.Data.Enabled)
		if !confirmed {
			assert.Empty(t, response.Data.Methods)
			continue
		}
		var methods []string
		for _, method := range response.Data.Methods {
			methods = append(methods, method["type"])
		}
		assert.Contains(t, methods, service.OfficialWeChat)
		assert.Contains(t, methods, service.OfficialAlipay)
		assert.NotContains(t, methods, "alipay")
	}
}

func TestStripeWebhookEnabledRequiresTopUpAndWebhookConfig(t *testing.T) {
	confirmPaymentComplianceForTest(t)
	originalAPISecret := setting.StripeApiSecret
	originalWebhookSecret := setting.StripeWebhookSecret
	originalPriceID := setting.StripePriceId
	t.Cleanup(func() {
		setting.StripeApiSecret = originalAPISecret
		setting.StripeWebhookSecret = originalWebhookSecret
		setting.StripePriceId = originalPriceID
	})

	setting.StripeWebhookSecret = ""
	setting.StripeApiSecret = "sk_test_123"
	setting.StripePriceId = "price_123"
	require.False(t, isStripeWebhookEnabled())

	setting.StripeWebhookSecret = "whsec_test"
	require.True(t, isStripeWebhookEnabled())

	setting.StripePriceId = ""
	require.False(t, isStripeWebhookEnabled())
}

func TestCreemWebhookEnabledRequiresTopUpAndWebhookConfig(t *testing.T) {
	confirmPaymentComplianceForTest(t)
	originalAPIKey := setting.CreemApiKey
	originalProducts := setting.CreemProducts
	originalWebhookSecret := setting.CreemWebhookSecret
	t.Cleanup(func() {
		setting.CreemApiKey = originalAPIKey
		setting.CreemProducts = originalProducts
		setting.CreemWebhookSecret = originalWebhookSecret
	})

	setting.CreemWebhookSecret = ""
	setting.CreemApiKey = "creem_api_key"
	setting.CreemProducts = `[{"productId":"prod_123"}]`
	require.False(t, isCreemWebhookEnabled())

	setting.CreemWebhookSecret = "creem_secret"
	require.True(t, isCreemWebhookEnabled())

	setting.CreemProducts = "[]"
	require.False(t, isCreemWebhookEnabled())
}

func TestWaffoWebhookEnabledRequiresTopUpAndWebhookConfig(t *testing.T) {
	confirmPaymentComplianceForTest(t)
	originalEnabled := setting.WaffoEnabled
	originalSandbox := setting.WaffoSandbox
	originalAPIKey := setting.WaffoApiKey
	originalPrivateKey := setting.WaffoPrivateKey
	originalPublicCert := setting.WaffoPublicCert
	originalSandboxAPIKey := setting.WaffoSandboxApiKey
	originalSandboxPrivateKey := setting.WaffoSandboxPrivateKey
	originalSandboxPublicCert := setting.WaffoSandboxPublicCert
	t.Cleanup(func() {
		setting.WaffoEnabled = originalEnabled
		setting.WaffoSandbox = originalSandbox
		setting.WaffoApiKey = originalAPIKey
		setting.WaffoPrivateKey = originalPrivateKey
		setting.WaffoPublicCert = originalPublicCert
		setting.WaffoSandboxApiKey = originalSandboxAPIKey
		setting.WaffoSandboxPrivateKey = originalSandboxPrivateKey
		setting.WaffoSandboxPublicCert = originalSandboxPublicCert
	})

	setting.WaffoEnabled = true
	setting.WaffoSandbox = false
	setting.WaffoApiKey = ""
	setting.WaffoPrivateKey = "private"
	setting.WaffoPublicCert = "public"
	require.False(t, isWaffoWebhookEnabled())

	setting.WaffoApiKey = "api"
	require.True(t, isWaffoWebhookEnabled())

	setting.WaffoEnabled = false
	require.False(t, isWaffoWebhookEnabled())

	setting.WaffoEnabled = true
	setting.WaffoSandbox = true
	setting.WaffoSandboxApiKey = ""
	setting.WaffoSandboxPrivateKey = "sandbox_private"
	setting.WaffoSandboxPublicCert = "sandbox_public"
	require.False(t, isWaffoWebhookEnabled())

	setting.WaffoSandboxApiKey = "sandbox_api"
	require.True(t, isWaffoWebhookEnabled())
}

func TestWaffoPancakeWebhookEnabledRequiresTopUpAndWebhookConfig(t *testing.T) {
	confirmPaymentComplianceForTest(t)
	originalMerchantID := setting.WaffoPancakeMerchantID
	originalPrivateKey := setting.WaffoPancakePrivateKey
	originalProductID := setting.WaffoPancakeProductID
	t.Cleanup(func() {
		setting.WaffoPancakeMerchantID = originalMerchantID
		setting.WaffoPancakePrivateKey = originalPrivateKey
		setting.WaffoPancakeProductID = originalProductID
	})

	// Presence of all three credentials enables the gateway. Webhook public
	// keys are bundled in the SDK and there is no separate Enabled toggle —
	// clear any of the three fields to disable.
	setting.WaffoPancakeMerchantID = ""
	setting.WaffoPancakePrivateKey = "private"
	setting.WaffoPancakeProductID = "product"
	require.False(t, isWaffoPancakeWebhookEnabled())

	setting.WaffoPancakeMerchantID = "merchant"
	require.True(t, isWaffoPancakeWebhookEnabled())

	setting.WaffoPancakeProductID = ""
	require.False(t, isWaffoPancakeWebhookEnabled())

	setting.WaffoPancakeProductID = "product"
	setting.WaffoPancakePrivateKey = ""
	require.False(t, isWaffoPancakeWebhookEnabled())
}

func TestEpayWebhookEnabledRequiresTopUpAndWebhookConfig(t *testing.T) {
	confirmPaymentComplianceForTest(t)
	originalPayAddress := operation_setting.PayAddress
	originalEpayID := operation_setting.EpayId
	originalEpayKey := operation_setting.EpayKey
	originalPayMethods := operation_setting.PayMethods
	t.Cleanup(func() {
		operation_setting.PayAddress = originalPayAddress
		operation_setting.EpayId = originalEpayID
		operation_setting.EpayKey = originalEpayKey
		operation_setting.PayMethods = originalPayMethods
	})

	operation_setting.PayAddress = "https://pay.example.com"
	operation_setting.EpayId = "epay_id"
	operation_setting.EpayKey = ""
	operation_setting.PayMethods = []map[string]string{{"type": "alipay"}}
	require.False(t, isEpayWebhookEnabled())

	operation_setting.EpayKey = "epay_key"
	require.True(t, isEpayWebhookEnabled())

	operation_setting.PayMethods = nil
	require.False(t, isEpayWebhookEnabled())
}

func TestEpayCallbacksVerifyBeforeSettlement(t *testing.T) {
	confirmPaymentComplianceForTest(t)
	originalPayAddress := operation_setting.PayAddress
	originalEpayID := operation_setting.EpayId
	originalEpayKey := operation_setting.EpayKey
	originalPayMethods := operation_setting.PayMethods
	originalServerAddress := system_setting.ServerAddress
	originalDB := model.DB
	t.Cleanup(func() {
		operation_setting.PayAddress = originalPayAddress
		operation_setting.EpayId = originalEpayID
		operation_setting.EpayKey = originalEpayKey
		operation_setting.PayMethods = originalPayMethods
		system_setting.ServerAddress = originalServerAddress
		model.DB = originalDB
	})
	operation_setting.PayAddress = "https://pay.example.com"
	operation_setting.EpayId = "epay_id"
	operation_setting.EpayKey = "test-key"
	operation_setting.PayMethods = []map[string]string{{"type": "alipay"}}
	system_setting.ServerAddress = "https://dashboard.example.com"
	// Rejected callbacks and valid non-success events must never reach settlement.
	// A nil database makes an accidental attempt to settle fail the test.
	model.DB = nil
	require.True(t, isEpayWebhookEnabled())

	// Both ambiguous maps below had this same valid signing string in v0.0.4.
	// This must fail because of parameter ambiguity, not a mismatched signature.
	ambiguousSign := epay.MD5String("money=1.00&name=item&out_trade_no=other&out_trade_no=order&pid=epay_id&trade_status=TRADE_SUCCESS&type=alipay", "test-key")
	pendingSign := epay.MD5String("money=1.00&name=item%26other&out_trade_no=order&pid=epay_id&trade_status=WAIT_BUYER_PAY&type=alipay", "test-key")
	cases := []struct {
		name         string
		productName  string
		tradeNo      string
		status       string
		sign         string
		validPending bool
	}{
		{"separator in product name", "item&out_trade_no=other", "order", epay.StatusTradeSuccess, ambiguousSign, false},
		{"separator in order number", "item", "other&out_trade_no=order", epay.StatusTradeSuccess, ambiguousSign, false},
		{"invalid signature", "item", "order", epay.StatusTradeSuccess, "invalid", false},
		{"missing signature", "item", "order", epay.StatusTradeSuccess, "", false},
		{"valid pending with literal percent escape", "item%26other", "order", "WAIT_BUYER_PAY", pendingSign, true},
	}
	endpoints := []struct {
		name             string
		path             string
		handler          gin.HandlerFunc
		status           int
		rejectedBody     string
		pendingBody      string
		rejectedLocation string
		pendingLocation  string
	}{
		{
			name: "topup notify", path: "/api/user/epay/notify", handler: EpayNotify,
			status: http.StatusOK, rejectedBody: "fail", pendingBody: "success",
		},
		{
			name: "subscription notify", path: "/api/subscription/epay/notify", handler: SubscriptionEpayNotify,
			status: http.StatusOK, rejectedBody: "fail", pendingBody: "fail",
		},
		{
			name: "subscription return", path: "/api/subscription/epay/return", handler: SubscriptionEpayReturn,
			status:           http.StatusFound,
			rejectedLocation: "https://dashboard.example.com/wallet?pay=fail",
			pendingLocation:  "https://dashboard.example.com/wallet?pay=pending",
		},
	}
	router := gin.New()
	for _, endpoint := range endpoints {
		router.Any(endpoint.path, endpoint.handler)
	}
	for _, endpoint := range endpoints {
		for _, method := range []string{http.MethodGet, http.MethodPost} {
			for _, tc := range cases {
				t.Run(endpoint.name+"/"+method+"/"+tc.name, func(t *testing.T) {
					params := url.Values{
						"pid": {"epay_id"}, "type": {"alipay"}, "money": {"1.00"},
						"name": {tc.productName}, "out_trade_no": {tc.tradeNo},
						"trade_status": {tc.status}, "sign_type": {"MD5"},
					}
					if tc.sign != "" {
						params.Set("sign", tc.sign)
					}
					request := httptest.NewRequest(method, endpoint.path+"?"+params.Encode(), nil)
					if method == http.MethodPost {
						request = httptest.NewRequest(method, endpoint.path, strings.NewReader(params.Encode()))
						request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
					}
					recorder := httptest.NewRecorder()
					require.NotPanics(t, func() { router.ServeHTTP(recorder, request) })
					assert.Equal(t, endpoint.status, recorder.Code)
					wantBody, wantLocation := endpoint.rejectedBody, endpoint.rejectedLocation
					if tc.validPending {
						wantBody, wantLocation = endpoint.pendingBody, endpoint.pendingLocation
					}
					if wantBody != "" {
						assert.Equal(t, wantBody, recorder.Body.String())
					}
					assert.Equal(t, wantLocation, recorder.Header().Get("Location"))
				})
			}
		}
	}
}
