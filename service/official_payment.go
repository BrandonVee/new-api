package service

import (
	"bytes"
	"context"
	"crypto"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/BrandonVee/ai-gateway/common"
	"github.com/BrandonVee/ai-gateway/model"
	"github.com/BrandonVee/ai-gateway/setting/operation_setting"
	"github.com/shopspring/decimal"
)

const (
	OfficialWeChat   = model.PaymentProviderWeChatOfficial
	OfficialAlipay   = model.PaymentProviderAlipayOfficial
	AlipayFaceToFace = "face_to_face"
	AlipayPage       = "page"
	AlipayWap        = "wap"
	AlipayApp        = "app"
)

var officialPaymentHTTPClient = &http.Client{
	Timeout:       20 * time.Second,
	CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
}

type OfficialPaymentReceipt struct {
	TradeNo       string
	TransactionID string
	AmountCents   int64
}

type wechatOfficialTransaction struct {
	AppID         string `json:"appid"`
	MchID         string `json:"mchid"`
	TradeNo       string `json:"out_trade_no"`
	TransactionID string `json:"transaction_id"`
	TradeState    string `json:"trade_state"`
	Amount        struct {
		Total    int64  `json:"total"`
		Currency string `json:"currency"`
	} `json:"amount"`
}

func (transaction wechatOfficialTransaction) receipt(settings operation_setting.OfficialPaymentSettings) (*OfficialPaymentReceipt, error) {
	if transaction.AppID != settings.WeChatAppID || transaction.MchID != settings.WeChatMchID || transaction.TradeState != "SUCCESS" || transaction.Amount.Currency != "CNY" || transaction.Amount.Total <= 0 || transaction.Amount.Total > 100_000_000 || transaction.TradeNo == "" || transaction.TransactionID == "" {
		return nil, errors.New("WeChat Pay transaction verification failed")
	}
	return &OfficialPaymentReceipt{TradeNo: transaction.TradeNo, TransactionID: transaction.TransactionID, AmountCents: transaction.Amount.Total}, nil
}

type OfficialPaymentCheckout struct {
	TradeNo      string `json:"trade_no"`
	Method       string `json:"method"`
	QRCode       string `json:"qr_code"`
	Amount       string `json:"amount"`
	Currency     string `json:"currency"`
	ExpiresAt    int64  `json:"expires_at"`
	CheckoutType string `json:"checkout_type"`
	PayURL       string `json:"pay_url,omitempty"`
	OrderString  string `json:"order_string,omitempty"`
}

type OfficialPaymentCheckoutOptions struct {
	AlipayProduct string
	UserAgent     string
}

// ResolveAlipayProduct selects only merchant-enabled products. Native SDK
// checkout must be requested explicitly; browsers never receive an SDK order.
func ResolveAlipayProduct(settings operation_setting.OfficialPaymentSettings, requested, userAgent string) (string, error) {
	products := settings.AlipayProducts
	if products == nil {
		products = []string{AlipayFaceToFace}
	}
	if requested != "" && requested != "auto" {
		if slices.Contains(products, requested) && slices.Contains([]string{AlipayFaceToFace, AlipayPage, AlipayWap, AlipayApp}, requested) {
			return requested, nil
		}
		return "", errors.New("Alipay product is unavailable")
	}
	preferences := []string{AlipayPage, AlipayFaceToFace, AlipayWap}
	agent := strings.ToLower(userAgent)
	if strings.Contains(agent, "mobile") || strings.Contains(agent, "android") || strings.Contains(agent, "iphone") || strings.Contains(agent, "ipad") {
		preferences = []string{AlipayWap, AlipayFaceToFace, AlipayPage}
	}
	for _, product := range preferences {
		if slices.Contains(products, product) {
			return product, nil
		}
	}
	return "", errors.New("no Alipay web payment product is enabled")
}

func IsOfficialPaymentMethod(method string) bool {
	return method == OfficialWeChat || method == OfficialAlipay
}

func OfficialPaymentEnabled(settings operation_setting.OfficialPaymentSettings, method string) bool {
	return method == OfficialWeChat && settings.WeChatEnabled || method == OfficialAlipay && settings.AlipayEnabled
}

func ParsePaymentPrivateKey(value string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(strings.TrimSpace(value)))
	if block == nil {
		return nil, errors.New("merchant private key must be PEM encoded")
	}
	var key *rsa.PrivateKey
	if parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		key, _ = parsed.(*rsa.PrivateKey)
	} else {
		key, _ = x509.ParsePKCS1PrivateKey(block.Bytes)
	}
	if key == nil || key.N.BitLen() < 2048 || key.Validate() != nil {
		return nil, errors.New("merchant private key must be a valid RSA key of at least 2048 bits")
	}
	return key, nil
}

func ParsePaymentPublicKey(value string) (*rsa.PublicKey, error) {
	block, _ := pem.Decode([]byte(strings.TrimSpace(value)))
	if block == nil {
		return nil, errors.New("payment verification key must be PEM encoded")
	}
	var key *rsa.PublicKey
	if parsed, err := x509.ParsePKIXPublicKey(block.Bytes); err == nil {
		key, _ = parsed.(*rsa.PublicKey)
	} else if cert, err := x509.ParseCertificate(block.Bytes); err == nil {
		key, _ = cert.PublicKey.(*rsa.PublicKey)
	} else {
		key, _ = x509.ParsePKCS1PublicKey(block.Bytes)
	}
	if key == nil || key.N.BitLen() < 2048 {
		return nil, errors.New("payment verification key must be an RSA public key of at least 2048 bits")
	}
	return key, nil
}

func ValidateOfficialPaymentSettings(settings operation_setting.OfficialPaymentSettings) error {
	if len(settings.AlipayProducts) > 4 {
		return errors.New("invalid Alipay products")
	}
	for i, product := range settings.AlipayProducts {
		if !slices.Contains([]string{AlipayFaceToFace, AlipayPage, AlipayWap, AlipayApp}, product) || slices.Contains(settings.AlipayProducts[:i], product) {
			return errors.New("invalid Alipay products")
		}
	}
	if settings.AlipayEnabled && settings.AlipayProducts != nil && len(settings.AlipayProducts) == 0 {
		return errors.New("enable at least one Alipay product")
	}
	if settings.CallbackURL != "" || settings.WeChatEnabled || settings.AlipayEnabled {
		u, err := url.Parse(settings.CallbackURL)
		if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
			return errors.New("callback URL must be a public HTTPS base URL without query parameters")
		}
	}
	if settings.WeChatEnabled {
		if settings.WeChatAppID == "" || settings.WeChatMchID == "" || settings.WeChatSerialNo == "" || !strings.HasPrefix(settings.WeChatPublicKeyID, "PUB_KEY_ID_") || len(settings.WeChatAPIv3Key) != 32 {
			return errors.New("WeChat Pay requires App ID, merchant ID, certificate serial number, public key ID and a 32-byte API v3 key")
		}
		if _, err := ParsePaymentPrivateKey(settings.WeChatPrivateKey); err != nil {
			return err
		}
		if _, err := ParsePaymentPublicKey(settings.WeChatPublicKey); err != nil {
			return err
		}
	}
	if settings.AlipayEnabled {
		if settings.AlipayAppID == "" || settings.AlipaySellerID == "" {
			return errors.New("Alipay requires App ID and seller ID")
		}
		if _, err := ParsePaymentPrivateKey(settings.AlipayPrivateKey); err != nil {
			return err
		}
		if _, err := ParsePaymentPublicKey(settings.AlipayPublicKey); err != nil {
			return err
		}
	}
	return nil
}

func paymentRSASign(key *rsa.PrivateKey, message string) (string, error) {
	hash := sha256.Sum256([]byte(message))
	signature, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, hash[:])
	return base64.StdEncoding.EncodeToString(signature), err
}

func paymentRSAVerify(key *rsa.PublicKey, message string, signature string) error {
	decoded, err := base64.StdEncoding.DecodeString(signature)
	if err != nil {
		return errors.New("invalid payment signature")
	}
	hash := sha256.Sum256([]byte(message))
	return rsa.VerifyPKCS1v15(key, crypto.SHA256, hash[:], decoded)
}

func NewOfficialPaymentTradeNo(subscription bool) (string, error) {
	var random [16]byte
	if _, err := rand.Read(random[:]); err != nil {
		return "", err
	}
	prefix := "GW"
	if subscription {
		prefix = "GS"
	}
	return prefix + base64.RawURLEncoding.EncodeToString(random[:]), nil
}

func CreateOfficialPayment(ctx context.Context, settings operation_setting.OfficialPaymentSettings, method, tradeNo, description string, cents int64, options OfficialPaymentCheckoutOptions) (*OfficialPaymentCheckout, error) {
	if !OfficialPaymentEnabled(settings, method) || cents <= 0 || cents > 100_000_000 {
		return nil, errors.New("official payment method unavailable")
	}
	if err := ValidateOfficialPaymentSettings(settings); err != nil {
		return nil, err
	}
	expires := time.Now().Add(15 * time.Minute)
	amount := decimal.NewFromInt(cents).Shift(-2).StringFixed(2)
	checkout := &OfficialPaymentCheckout{TradeNo: tradeNo, Method: method, Amount: amount, Currency: "CNY", ExpiresAt: expires.Unix(), CheckoutType: "qr"}
	if method == OfficialWeChat {
		if options.AlipayProduct != "" {
			return nil, errors.New("Alipay product cannot be used with WeChat Pay")
		}
		qrCode, err := createWeChatNative(ctx, settings, tradeNo, description, cents, expires)
		if err != nil {
			return nil, err
		}
		checkout.QRCode = qrCode
		return checkout, nil
	}
	product, err := ResolveAlipayProduct(settings, options.AlipayProduct, options.UserAgent)
	if err != nil {
		return nil, err
	}
	if product == AlipayFaceToFace {
		qrCode, err := createAlipayPrecreate(ctx, settings, tradeNo, description, amount)
		if err != nil {
			return nil, err
		}
		checkout.QRCode = qrCode
		return checkout, nil
	}
	payload := map[string]string{"out_trade_no": tradeNo, "seller_id": settings.AlipaySellerID, "total_amount": amount, "subject": description, "timeout_express": "15m"}
	apiMethod, productCode := "alipay.trade.page.pay", "FAST_INSTANT_TRADE_PAY"
	switch product {
	case AlipayWap:
		apiMethod, productCode = "alipay.trade.wap.pay", "QUICK_WAP_WAY"
	case AlipayApp:
		apiMethod, productCode = "alipay.trade.app.pay", "QUICK_MSECURITY_PAY"
	}
	payload["product_code"] = productCode
	values, err := alipaySignedParameters(settings, apiMethod, payload)
	if err != nil {
		return nil, err
	}
	if product == AlipayApp {
		checkout.CheckoutType, checkout.OrderString = "app", values.Encode()
	} else {
		checkout.CheckoutType = "redirect"
		checkout.PayURL = "https://openapi.alipay.com/gateway.do?" + values.Encode()
	}
	return checkout, nil
}

func createWeChatNative(ctx context.Context, settings operation_setting.OfficialPaymentSettings, tradeNo, description string, cents int64, expires time.Time) (string, error) {
	body, err := common.Marshal(map[string]any{
		"appid": settings.WeChatAppID, "mchid": settings.WeChatMchID,
		"out_trade_no": tradeNo, "description": description, "time_expire": expires.Format(time.RFC3339),
		"notify_url": strings.TrimRight(settings.CallbackURL, "/") + "/api/payment/official/wechat/notify",
		"amount":     map[string]any{"total": cents, "currency": "CNY"},
	})
	if err != nil {
		return "", err
	}
	raw, err := wechatOfficialRequest(ctx, settings, http.MethodPost, "/v3/pay/transactions/native", body)
	if err != nil {
		return "", err
	}
	var response struct {
		CodeURL string `json:"code_url"`
	}
	if common.Unmarshal(raw, &response) != nil || !strings.HasPrefix(response.CodeURL, "weixin://wxpay/") {
		return "", errors.New("invalid WeChat Pay checkout response")
	}
	return response.CodeURL, nil
}

func wechatOfficialRequest(ctx context.Context, settings operation_setting.OfficialPaymentSettings, method, path string, body []byte) ([]byte, error) {
	key, err := ParsePaymentPrivateKey(settings.WeChatPrivateKey)
	if err != nil {
		return nil, err
	}
	var nonceBytes [16]byte
	if _, err := rand.Read(nonceBytes[:]); err != nil {
		return nil, err
	}
	nonce := hex.EncodeToString(nonceBytes[:])
	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	signature, err := paymentRSASign(key, method+"\n"+path+"\n"+timestamp+"\n"+nonce+"\n"+string(body)+"\n")
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, method, "https://api.mch.weixin.qq.com"+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", fmt.Sprintf(`WECHATPAY2-SHA256-RSA2048 mchid=%q,nonce_str=%q,timestamp=%q,serial_no=%q,signature=%q`, settings.WeChatMchID, nonce, timestamp, settings.WeChatSerialNo, signature))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Wechatpay-Serial", settings.WeChatPublicKeyID)
	resp, err := officialPaymentHTTPClient.Do(req)
	if err != nil {
		return nil, errors.New("WeChat Pay request failed")
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if err := VerifyWeChatPaymentSignature(settings, resp.Header, raw); err != nil {
		return nil, errors.New("WeChat Pay response signature verification failed")
	}
	if resp.StatusCode != http.StatusOK {
		return nil, errors.New("WeChat Pay rejected the order; check merchant configuration and Native Pay activation")
	}
	return raw, nil
}

func VerifyWeChatPaymentSignature(settings operation_setting.OfficialPaymentSettings, header http.Header, body []byte) error {
	timestamp, err := strconv.ParseInt(header.Get("Wechatpay-Timestamp"), 10, 64)
	now := time.Now().Unix()
	if err != nil || timestamp < now-300 || timestamp > now+300 || header.Get("Wechatpay-Nonce") == "" || header.Get("Wechatpay-Serial") != settings.WeChatPublicKeyID {
		return errors.New("invalid WeChat Pay signature headers")
	}
	key, err := ParsePaymentPublicKey(settings.WeChatPublicKey)
	if err != nil {
		return err
	}
	return paymentRSAVerify(key, header.Get("Wechatpay-Timestamp")+"\n"+header.Get("Wechatpay-Nonce")+"\n"+string(body)+"\n", header.Get("Wechatpay-Signature"))
}

func ParseWeChatPaymentNotification(settings operation_setting.OfficialPaymentSettings, header http.Header, raw []byte) (*OfficialPaymentReceipt, error) {
	if err := VerifyWeChatPaymentSignature(settings, header, raw); err != nil {
		return nil, err
	}
	var event struct {
		EventType string `json:"event_type"`
		Resource  struct {
			Algorithm      string `json:"algorithm"`
			Ciphertext     string `json:"ciphertext"`
			Nonce          string `json:"nonce"`
			AssociatedData string `json:"associated_data"`
		} `json:"resource"`
	}
	if err := common.Unmarshal(raw, &event); err != nil || event.EventType != "TRANSACTION.SUCCESS" || event.Resource.Algorithm != "AEAD_AES_256_GCM" || len(settings.WeChatAPIv3Key) != 32 {
		return nil, errors.New("invalid WeChat Pay notification")
	}
	block, err := aes.NewCipher([]byte(settings.WeChatAPIv3Key))
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	ciphertext, err := base64.StdEncoding.DecodeString(event.Resource.Ciphertext)
	if err != nil || len(event.Resource.Nonce) != gcm.NonceSize() {
		return nil, errors.New("invalid WeChat Pay encrypted resource")
	}
	plaintext, err := gcm.Open(nil, []byte(event.Resource.Nonce), ciphertext, []byte(event.Resource.AssociatedData))
	if err != nil {
		return nil, errors.New("WeChat Pay resource decryption failed")
	}
	var transaction wechatOfficialTransaction
	if common.Unmarshal(plaintext, &transaction) != nil {
		return nil, errors.New("WeChat Pay transaction verification failed")
	}
	return transaction.receipt(settings)
}

func alipaySigningContent(values url.Values, notification bool) string {
	keys := make([]string, 0, len(values))
	for key := range values {
		if key != "sign" && (!notification || key != "sign_type") && values.Get(key) != "" {
			keys = append(keys, key)
		}
	}
	slices.Sort(keys)
	var content strings.Builder
	for index, key := range keys {
		if index > 0 {
			content.WriteByte('&')
		}
		content.WriteString(key)
		content.WriteByte('=')
		content.WriteString(values.Get(key))
	}
	return content.String()
}

func createAlipayPrecreate(ctx context.Context, settings operation_setting.OfficialPaymentSettings, tradeNo, description, amount string) (string, error) {
	body, err := alipayOfficialRequest(ctx, settings, "alipay.trade.precreate", map[string]string{"out_trade_no": tradeNo, "seller_id": settings.AlipaySellerID, "total_amount": amount, "subject": description, "timeout_express": "15m"})
	if err != nil {
		return "", err
	}
	var result struct {
		Code    string `json:"code"`
		TradeNo string `json:"out_trade_no"`
		QRCode  string `json:"qr_code"`
	}
	if common.Unmarshal(body, &result) != nil || result.Code != "10000" || result.TradeNo != tradeNo || !strings.HasPrefix(result.QRCode, "https://qr.alipay.com/") {
		return "", errors.New("Alipay rejected the order; check merchant configuration and face-to-face payment activation")
	}
	return result.QRCode, nil
}

func alipaySignedParameters(settings operation_setting.OfficialPaymentSettings, method string, payload map[string]string) (url.Values, error) {
	biz, err := common.Marshal(payload)
	if err != nil {
		return nil, err
	}
	values := url.Values{
		"app_id": {settings.AlipayAppID}, "method": {method}, "format": {"JSON"},
		"charset": {"utf-8"}, "sign_type": {"RSA2"}, "timestamp": {time.Now().In(time.FixedZone("CST", 8*3600)).Format("2006-01-02 15:04:05")},
		"version": {"1.0"}, "biz_content": {string(biz)},
	}
	if method == "alipay.trade.precreate" || method == "alipay.trade.page.pay" || method == "alipay.trade.wap.pay" || method == "alipay.trade.app.pay" {
		values.Set("notify_url", strings.TrimRight(settings.CallbackURL, "/")+"/api/payment/official/alipay/notify")
	}
	if method == "alipay.trade.page.pay" || method == "alipay.trade.wap.pay" {
		returnPath := "/wallet"
		if strings.HasPrefix(payload["out_trade_no"], "GS") {
			returnPath = "/subscriptions"
		}
		values.Set("return_url", strings.TrimRight(settings.CallbackURL, "/")+returnPath)
	}
	key, err := ParsePaymentPrivateKey(settings.AlipayPrivateKey)
	if err != nil {
		return nil, err
	}
	signature, err := paymentRSASign(key, alipaySigningContent(values, false))
	if err != nil {
		return nil, err
	}
	values.Set("sign", signature)
	return values, nil
}

func alipayOfficialRequest(ctx context.Context, settings operation_setting.OfficialPaymentSettings, method string, payload map[string]string) (json.RawMessage, error) {
	values, err := alipaySignedParameters(settings, method, payload)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://openapi.alipay.com/gateway.do", strings.NewReader(values.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded;charset=utf-8")
	resp, err := officialPaymentHTTPClient.Do(req)
	if err != nil {
		return nil, errors.New("Alipay request failed")
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, errors.New("Alipay rejected the request")
	}
	var envelope map[string]json.RawMessage
	if common.Unmarshal(raw, &envelope) != nil {
		return nil, errors.New("invalid Alipay response")
	}
	var responseSign string
	_ = common.Unmarshal(envelope["sign"], &responseSign)
	publicKey, err := ParsePaymentPublicKey(settings.AlipayPublicKey)
	if err != nil {
		return nil, err
	}
	responseBody := envelope[strings.ReplaceAll(method, ".", "_")+"_response"]
	if err := paymentRSAVerify(publicKey, string(responseBody), responseSign); err != nil {
		return nil, errors.New("Alipay response signature verification failed")
	}
	return responseBody, nil
}

func ParseAlipayPaymentNotification(settings operation_setting.OfficialPaymentSettings, values url.Values) (*OfficialPaymentReceipt, error) {
	for _, value := range values {
		if len(value) != 1 {
			return nil, errors.New("duplicate Alipay notification parameter")
		}
	}
	if values.Get("sign_type") != "RSA2" || values.Get("app_id") != settings.AlipayAppID || settings.AlipayAppID == "" || values.Get("seller_id") != settings.AlipaySellerID || settings.AlipaySellerID == "" {
		return nil, errors.New("Alipay merchant verification failed")
	}
	key, err := ParsePaymentPublicKey(settings.AlipayPublicKey)
	if err != nil {
		return nil, err
	}
	if err := paymentRSAVerify(key, alipaySigningContent(values, true), values.Get("sign")); err != nil {
		return nil, err
	}
	if values.Get("trade_status") != "TRADE_SUCCESS" && values.Get("trade_status") != "TRADE_FINISHED" {
		return nil, errors.New("Alipay transaction is not paid")
	}
	amount, err := decimal.NewFromString(values.Get("total_amount"))
	if err != nil {
		return nil, errors.New("invalid Alipay payment amount")
	}
	cents := amount.Shift(2)
	if !cents.IsInteger() || cents.LessThan(decimal.NewFromInt(1)) || cents.GreaterThan(decimal.NewFromInt(100_000_000)) || values.Get("out_trade_no") == "" || values.Get("trade_no") == "" {
		return nil, errors.New("invalid Alipay transaction")
	}
	return &OfficialPaymentReceipt{TradeNo: values.Get("out_trade_no"), TransactionID: values.Get("trade_no"), AmountCents: cents.IntPart()}, nil
}

// QueryOfficialPayment can reconcile a missing notification. Only a signed
// response for this exact merchant order may enter the normal settlement path.
// Checkout switches intentionally do not disable reconciliation of old orders.
func QueryOfficialPayment(ctx context.Context, settings operation_setting.OfficialPaymentSettings, method, tradeNo string) (*OfficialPaymentReceipt, error) {
	if method == OfficialWeChat {
		path := "/v3/pay/transactions/out-trade-no/" + url.PathEscape(tradeNo) + "?mchid=" + url.QueryEscape(settings.WeChatMchID)
		raw, err := wechatOfficialRequest(ctx, settings, http.MethodGet, path, nil)
		if err != nil {
			return nil, err
		}
		var transaction wechatOfficialTransaction
		if common.Unmarshal(raw, &transaction) != nil || transaction.TradeNo != tradeNo || transaction.AppID != settings.WeChatAppID || transaction.MchID != settings.WeChatMchID {
			return nil, errors.New("WeChat Pay order query mismatch")
		}
		if transaction.TradeState != "SUCCESS" {
			return nil, nil
		}
		return transaction.receipt(settings)
	}
	if method != OfficialAlipay {
		return nil, errors.New("unsupported official payment method")
	}
	raw, err := alipayOfficialRequest(ctx, settings, "alipay.trade.query", map[string]string{"out_trade_no": tradeNo})
	if err != nil {
		return nil, err
	}
	var transaction struct {
		Code          string      `json:"code"`
		TradeNo       string      `json:"out_trade_no"`
		TransactionID string      `json:"trade_no"`
		Status        string      `json:"trade_status"`
		Amount        json.Number `json:"total_amount"`
	}
	if common.Unmarshal(raw, &transaction) != nil || transaction.Code != "10000" || transaction.TradeNo != tradeNo {
		return nil, errors.New("Alipay order query mismatch")
	}
	if transaction.Status != "TRADE_SUCCESS" && transaction.Status != "TRADE_FINISHED" {
		return nil, nil
	}
	amount, err := decimal.NewFromString(transaction.Amount.String())
	if err != nil {
		return nil, errors.New("invalid Alipay order amount")
	}
	cents := amount.Shift(2)
	if !cents.IsInteger() || cents.LessThan(decimal.NewFromInt(1)) || cents.GreaterThan(decimal.NewFromInt(100_000_000)) || transaction.TransactionID == "" {
		return nil, errors.New("invalid Alipay order transaction")
	}
	return &OfficialPaymentReceipt{TradeNo: tradeNo, TransactionID: transaction.TransactionID, AmountCents: cents.IntPart()}, nil
}
