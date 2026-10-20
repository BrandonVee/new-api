package controller

import (
	"errors"
	"io"
	"math"
	"net/http"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
)

var officialPaymentSettingsMutex sync.Mutex

func GetOfficialPaymentSettings(c *gin.Context) {
	settings := operation_setting.GetOfficialPaymentSettings()
	configured := gin.H{
		"wechat_private_key": settings.WeChatPrivateKey != "", "wechat_api_v3_key": settings.WeChatAPIv3Key != "",
		"alipay_private_key": settings.AlipayPrivateKey != "",
	}
	settings.WeChatPrivateKey, settings.WeChatAPIv3Key, settings.AlipayPrivateKey = "", "", ""
	common.ApiSuccess(c, gin.H{"settings": settings, "configured": configured, "compliance_confirmed": operation_setting.IsPaymentComplianceConfirmed()})
}

func UpdateOfficialPaymentSettings(c *gin.Context) {
	var settings operation_setting.OfficialPaymentSettings
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 64<<10)
	if common.DecodeJson(c.Request.Body, &settings) != nil {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	officialPaymentSettingsMutex.Lock()
	defer officialPaymentSettingsMutex.Unlock()
	previous := operation_setting.GetOfficialPaymentSettings()
	// Empty secret fields mean retain; the API never sends usable secrets back.
	if strings.TrimSpace(settings.WeChatPrivateKey) == "" {
		settings.WeChatPrivateKey = previous.WeChatPrivateKey
	}
	if strings.TrimSpace(settings.WeChatAPIv3Key) == "" {
		settings.WeChatAPIv3Key = previous.WeChatAPIv3Key
	}
	if strings.TrimSpace(settings.AlipayPrivateKey) == "" {
		settings.AlipayPrivateKey = previous.AlipayPrivateKey
	}
	settings.CallbackURL = strings.TrimRight(strings.TrimSpace(settings.CallbackURL), "/")
	settings.WeChatAppID = strings.TrimSpace(settings.WeChatAppID)
	settings.WeChatMchID = strings.TrimSpace(settings.WeChatMchID)
	settings.WeChatSerialNo = strings.TrimSpace(settings.WeChatSerialNo)
	settings.WeChatPublicKeyID = strings.TrimSpace(settings.WeChatPublicKeyID)
	settings.AlipayAppID = strings.TrimSpace(settings.AlipayAppID)
	settings.AlipaySellerID = strings.TrimSpace(settings.AlipaySellerID)
	if err := service.ValidateOfficialPaymentSettings(settings); err != nil {
		common.ApiErrorT(c, "Official payment configuration is invalid. Check the HTTPS callback URL, merchant identifiers and PEM keys.")
		return
	}
	raw, err := common.Marshal(settings)
	if err == nil {
		err = model.UpdateOptionsBulk(map[string]string{operation_setting.OfficialPaymentOptionKey: string(raw)})
	}
	if err != nil {
		common.ApiErrorT(c, "Failed to save settings")
		return
	}
	GetOfficialPaymentSettings(c)
}

// Wallet top-ups use the same unit price, group ratio and preset discounts as
// the existing CNY checkout, but an independent official merchant connection.
func RequestOfficialPayment(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}
	var req EpayRequest
	if c.ShouldBindJSON(&req) != nil {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	settings := operation_setting.GetOfficialPaymentSettings()
	if !service.OfficialPaymentEnabled(settings, req.PaymentMethod) {
		common.ApiErrorT(c, "Official payment method is unavailable")
		return
	}
	userID := c.GetInt("id")
	amount, cents, err := officialWalletQuote(userID, req.Amount)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	tradeNo, err := service.NewOfficialPaymentTradeNo(false)
	if err != nil {
		common.ApiErrorT(c, "Payment request failed")
		return
	}
	money, _ := decimal.NewFromInt(cents).Shift(-2).Float64()
	order := model.TopUp{UserId: userID, Amount: amount, Money: money, TradeNo: tradeNo, PaymentMethod: req.PaymentMethod, PaymentProvider: req.PaymentMethod, CreateTime: common.GetTimestamp(), Status: common.TopUpStatusPending}
	if err := order.Insert(); err != nil {
		common.ApiErrorT(c, "Failed to create order")
		return
	}
	checkout, err := service.CreateOfficialPayment(c.Request.Context(), settings, req.PaymentMethod, tradeNo, "Wallet top-up", cents)
	if err != nil {
		// A timeout is ambiguous: retain pending orders so a later signed payment
		// notification can still settle an order created by the provider.
		logger.LogWarn(c.Request.Context(), common.LogText("Official payment checkout failed provider=%s trade_no=%s reason=%s", req.PaymentMethod, tradeNo, err.Error()))
		common.ApiErrorT(c, "Official payment request failed. Check merchant settings and payment product activation.")
		return
	}
	common.ApiSuccess(c, checkout)
}

// Official checkout and its confirmation quote share the same decimal rounding
// and quota normalization, so the amount shown before scanning cannot diverge.
func officialWalletQuote(userID int, requestedAmount int64) (int64, int64, error) {
	if common.QuotaPerUnit <= 0 || math.IsNaN(common.QuotaPerUnit) || math.IsInf(common.QuotaPerUnit, 0) {
		return 0, 0, model.ErrInvalidTopUpQuota
	}
	if requestedAmount < getMinTopup() {
		return 0, 0, common.NewMessage("Top-up amount cannot be less than {{min}}", map[string]any{"min": getMinTopup()})
	}
	units := requestedAmount
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		normalized := decimal.NewFromInt(requestedAmount).Div(decimal.NewFromFloat(common.QuotaPerUnit))
		if !normalized.IsInteger() || !normalized.IsPositive() || normalized.GreaterThan(decimal.NewFromInt(math.MaxInt64)) {
			return 0, 0, model.ErrInvalidTopUpQuota
		}
		units = normalized.IntPart()
	}
	quota, err := validateCreditedQuota(decimal.NewFromInt(units).Mul(decimal.NewFromFloat(common.QuotaPerUnit)))
	if err != nil {
		return 0, 0, err
	}
	if err := model.ValidateTopUpQuotaCapacity(userID, quota); err != nil {
		return 0, 0, err
	}
	user, err := model.GetUserById(userID, false)
	if err != nil {
		return 0, 0, common.NewMessage("Failed to get the user group")
	}
	if operation_setting.Price <= 0 || math.IsNaN(operation_setting.Price) || math.IsInf(operation_setting.Price, 0) {
		return 0, 0, common.NewMessage("Invalid payment amount")
	}
	cents, err := common.OfficialPaymentDecimalCents(quoteWalletTopUpPrice(requestedAmount, user.Group))
	if err != nil {
		return 0, 0, common.NewMessage("Invalid payment amount")
	}
	return units, cents, nil
}

func RequestOfficialPaymentAmount(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}
	var req AmountRequest
	if c.ShouldBindJSON(&req) != nil {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	settings := operation_setting.GetOfficialPaymentSettings()
	if !settings.WeChatEnabled && !settings.AlipayEnabled {
		common.ApiErrorT(c, "Official payment method is unavailable")
		return
	}
	_, cents, err := officialWalletQuote(c.GetInt("id"), req.Amount)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, decimal.NewFromInt(cents).Shift(-2).StringFixed(2))
}

func SubscriptionRequestOfficialPayment(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}
	var req SubscriptionEpayPayRequest
	if c.ShouldBindJSON(&req) != nil || req.PlanId <= 0 {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	settings := operation_setting.GetOfficialPaymentSettings()
	if !service.OfficialPaymentEnabled(settings, req.PaymentMethod) {
		common.ApiErrorT(c, "Official payment method is unavailable")
		return
	}
	plan, err := model.GetSubscriptionPlanById(req.PlanId)
	if err != nil || !plan.Enabled {
		common.ApiErrorT(c, "Subscription plan is not enabled")
		return
	}
	userID := c.GetInt("id")
	if plan.MaxPurchasePerUser > 0 {
		count, err := model.CountUserSubscriptionsByPlan(userID, plan.Id)
		if err != nil {
			common.ApiErrorT(c, "Payment request failed")
			return
		}
		if count >= int64(plan.MaxPurchasePerUser) {
			common.ApiErrorT(c, "Purchase limit for this plan has been reached")
			return
		}
	}
	price := plan.PriceAmount
	if price <= 0 || math.IsNaN(price) || math.IsInf(price, 0) {
		common.ApiErrorT(c, "Invalid payment amount")
		return
	}
	priceDecimal := decimal.NewFromFloat(price)
	if plan.Currency == "USD" || plan.Currency == "" {
		rate := operation_setting.USDExchangeRate
		if rate <= 0 || math.IsNaN(rate) || math.IsInf(rate, 0) {
			common.ApiErrorT(c, "Invalid payment amount")
			return
		}
		priceDecimal = priceDecimal.Mul(decimal.NewFromFloat(rate))
	} else if plan.Currency != "CNY" {
		common.ApiErrorT(c, "Official payments support CNY and USD subscription plans only")
		return
	}
	cents, err := common.OfficialPaymentDecimalCents(priceDecimal)
	if err != nil {
		common.ApiErrorT(c, "Invalid payment amount")
		return
	}
	tradeNo, err := service.NewOfficialPaymentTradeNo(true)
	if err != nil {
		common.ApiErrorT(c, "Payment request failed")
		return
	}
	money, _ := decimal.NewFromInt(cents).Shift(-2).Float64()
	order := model.SubscriptionOrder{UserId: userID, PlanId: plan.Id, Money: money, TradeNo: tradeNo, PaymentMethod: req.PaymentMethod, PaymentProvider: req.PaymentMethod, Status: common.TopUpStatusPending, CreateTime: common.GetTimestamp()}
	if err := model.DB.Create(&order).Error; err != nil {
		common.ApiErrorT(c, "Failed to create order")
		return
	}
	checkout, err := service.CreateOfficialPayment(c.Request.Context(), settings, req.PaymentMethod, tradeNo, "Subscription purchase", cents)
	if err != nil {
		logger.LogWarn(c.Request.Context(), common.LogText("Official subscription checkout failed provider=%s trade_no=%s reason=%s", req.PaymentMethod, tradeNo, err.Error()))
		common.ApiErrorT(c, "Official payment request failed. Check merchant settings and payment product activation.")
		return
	}
	common.ApiSuccess(c, checkout)
}

func GetOfficialPaymentOrder(c *gin.Context) {
	officialPaymentOrderStatus(c, false)
}

func CheckOfficialPaymentOrder(c *gin.Context) {
	officialPaymentOrderStatus(c, true)
}

func officialPaymentOrderStatus(c *gin.Context, reconcile bool) {
	tradeNo := c.Param("trade_no")
	userID := c.GetInt("id")
	var status, provider string
	if strings.HasPrefix(tradeNo, "GS") {
		order := model.GetSubscriptionOrderByTradeNo(tradeNo)
		if order != nil && order.UserId == userID && service.IsOfficialPaymentMethod(order.PaymentProvider) {
			status, provider = order.Status, order.PaymentProvider
		}
	} else {
		order := model.GetTopUpByTradeNo(tradeNo)
		if order != nil && order.UserId == userID && service.IsOfficialPaymentMethod(order.PaymentProvider) {
			status, provider = order.Status, order.PaymentProvider
		}
	}
	if provider == "" {
		common.ApiErrorStatus(c, http.StatusNotFound, common.NewMessage("Order not found"))
		return
	}
	if reconcile && status == common.TopUpStatusPending {
		receipt, err := service.QueryOfficialPayment(c.Request.Context(), operation_setting.GetOfficialPaymentSettings(), provider, tradeNo)
		if err == nil && receipt != nil {
			err = settleOfficialPayment(receipt, provider, c.ClientIP())
			if err == nil {
				status = common.TopUpStatusSuccess
			}
		}
		if err != nil {
			logger.LogWarn(c.Request.Context(), common.LogText("Official payment reconciliation failed provider=%s trade_no=%s reason=%s", provider, tradeNo, err.Error()))
			common.ApiErrorT(c, "Unable to check payment status. Please retry.")
			return
		}
	}
	common.ApiSuccess(c, gin.H{"status": status})
}

func settleOfficialPayment(receipt *service.OfficialPaymentReceipt, method, clientIP string) error {
	if receipt == nil {
		return errors.New("missing payment receipt")
	}
	LockOrder(receipt.TradeNo)
	defer UnlockOrder(receipt.TradeNo)
	if strings.HasPrefix(receipt.TradeNo, "GS") {
		payload, err := common.Marshal(map[string]string{"transaction_id": receipt.TransactionID})
		if err != nil {
			return err
		}
		return model.CompleteOfficialSubscriptionOrder(receipt.TradeNo, method, string(payload), receipt.AmountCents)
	}
	return model.RechargeOfficialPayment(receipt.TradeNo, method, receipt.AmountCents, clientIP)
}

func WeChatOfficialPaymentNotify(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1<<20)
	raw, err := io.ReadAll(c.Request.Body)
	if err == nil {
		var receipt *service.OfficialPaymentReceipt
		receipt, err = service.ParseWeChatPaymentNotification(operation_setting.GetOfficialPaymentSettings(), c.Request.Header, raw)
		if err == nil {
			err = settleOfficialPayment(receipt, service.OfficialWeChat, c.ClientIP())
		}
	}
	if err != nil {
		logger.LogWarn(c.Request.Context(), common.LogText("WeChat Pay notification rejected: %s", err.Error()))
		c.JSON(http.StatusInternalServerError, gin.H{"code": "FAIL", "message": "Notification could not be processed"})
		return
	}
	c.Status(http.StatusNoContent)
}

func AlipayOfficialPaymentNotify(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1<<20)
	err := c.Request.ParseForm()
	if err == nil {
		var receipt *service.OfficialPaymentReceipt
		receipt, err = service.ParseAlipayPaymentNotification(operation_setting.GetOfficialPaymentSettings(), c.Request.PostForm)
		if err == nil {
			err = settleOfficialPayment(receipt, service.OfficialAlipay, c.ClientIP())
		}
	}
	if err != nil {
		logger.LogWarn(c.Request.Context(), common.LogText("Alipay notification rejected: %s", err.Error()))
		c.String(http.StatusInternalServerError, "failure")
		return
	}
	c.String(http.StatusOK, "success")
}
