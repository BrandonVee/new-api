package service

import (
	"context"
	"crypto"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"io"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/BrandonVee/ai-gateway/common"
	"github.com/BrandonVee/ai-gateway/model"
	"github.com/BrandonVee/ai-gateway/setting/operation_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOfficialPaymentAmountBounds(t *testing.T) {
	for _, tc := range []struct {
		name    string
		amount  float64
		cents   int64
		invalid bool
	}{
		{name: "one fen", amount: 0.01, cents: 1},
		{name: "round half up", amount: 10.005, cents: 1001},
		{name: "maximum order", amount: 1_000_000, cents: 100_000_000},
		{name: "above maximum", amount: 1_000_000.01, invalid: true},
		{name: "zero", amount: 0, invalid: true},
		{name: "negative", amount: -1, invalid: true},
		{name: "nonfinite", amount: math.Inf(1), invalid: true},
		{name: "nan", amount: math.NaN(), invalid: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			cents, err := common.OfficialPaymentCents(tc.amount)
			if tc.invalid {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tc.cents, cents)
		})
	}
}

func TestOfficialMerchantVerificationPreservesEnrolledFactorAssurance(t *testing.T) {
	for _, tc := range []struct {
		name   string
		state  model.UserVerificationState
		method string
	}{
		{name: "password fallback", state: model.UserVerificationState{Role: common.RoleRootUser, HasPassword: true}, method: VerificationMethodPassword},
		{name: "enrolled MFA cannot use password fallback", state: model.UserVerificationState{Role: common.RoleRootUser, HasPassword: true, HasTwoFA: true}, method: VerificationMethodTwoFA},
	} {
		t.Run(tc.name, func(t *testing.T) {
			methods, err := securityVerificationPolicy(VerificationScopePaymentMerchantUpdate, tc.state)
			require.NoError(t, err)
			require.Len(t, methods, 1)
			assert.Equal(t, tc.method, methods[0].Method)
		})
	}
}

type officialPaymentTransport func(*http.Request) (*http.Response, error)

func (transport officialPaymentTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	return transport(request)
}

func officialPaymentFixture(t *testing.T) (operation_setting.OfficialPaymentSettings, *rsa.PrivateKey, *rsa.PrivateKey) {
	t.Helper()
	merchant, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	provider, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	privatePEM := string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(merchant)}))
	publicDER, err := x509.MarshalPKIXPublicKey(&provider.PublicKey)
	require.NoError(t, err)
	publicPEM := string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: publicDER}))
	return operation_setting.OfficialPaymentSettings{
		CallbackURL: "https://gateway.example.com", WeChatEnabled: true, WeChatAppID: "wx-test", WeChatMchID: "1234567890",
		WeChatSerialNo: "ABC123", WeChatPublicKeyID: "PUB_KEY_ID_TEST", WeChatAPIv3Key: "0123456789abcdef0123456789abcdef",
		WeChatPrivateKey: privatePEM, WeChatPublicKey: publicPEM,
		AlipayEnabled: true, AlipayAppID: "2026000000000001", AlipaySellerID: "2088000000000001", AlipayPrivateKey: privatePEM, AlipayPublicKey: publicPEM,
	}, merchant, provider
}

func signOfficialPaymentFixture(t *testing.T, key *rsa.PrivateKey, content string) string {
	t.Helper()
	digest := sha256.Sum256([]byte(content))
	signature, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest[:])
	require.NoError(t, err)
	return base64.StdEncoding.EncodeToString(signature)
}

func wechatFixtureHeaders(t *testing.T, key *rsa.PrivateKey, body string) http.Header {
	t.Helper()
	header := http.Header{}
	header.Set("Wechatpay-Timestamp", strconv.FormatInt(time.Now().Unix(), 10))
	header.Set("Wechatpay-Nonce", "response-nonce")
	header.Set("Wechatpay-Serial", "PUB_KEY_ID_TEST")
	header.Set("Wechatpay-Signature", signOfficialPaymentFixture(t, key, header.Get("Wechatpay-Timestamp")+"\nresponse-nonce\n"+body+"\n"))
	return header
}

func TestOfficialPaymentCheckout_VerifiesBothGatewayResponses(t *testing.T) {
	settings, merchant, provider := officialPaymentFixture(t)
	previous := officialPaymentHTTPClient
	t.Cleanup(func() { officialPaymentHTTPClient = previous })
	for _, method := range []string{OfficialWeChat, OfficialAlipay} {
		for _, tamper := range []bool{false, true} {
			t.Run(method+"/tampered="+strconv.FormatBool(tamper), func(t *testing.T) {
				officialPaymentHTTPClient = &http.Client{Transport: officialPaymentTransport(func(req *http.Request) (*http.Response, error) {
					var body string
					header := http.Header{}
					if method == OfficialWeChat {
						assert.Equal(t, "api.mch.weixin.qq.com", req.URL.Host)
						raw, err := io.ReadAll(req.Body)
						require.NoError(t, err)
						attributes := map[string]string{}
						for _, pair := range regexp.MustCompile(`(\w+)="([^"]*)"`).FindAllStringSubmatch(req.Header.Get("Authorization"), -1) {
							attributes[pair[1]] = pair[2]
						}
						require.NoError(t, paymentRSAVerify(&merchant.PublicKey, "POST\n/v3/pay/transactions/native\n"+attributes["timestamp"]+"\n"+attributes["nonce_str"]+"\n"+string(raw)+"\n", attributes["signature"]))
						var payload struct {
							Amount struct {
								Total    int64  `json:"total"`
								Currency string `json:"currency"`
							} `json:"amount"`
							NotifyURL string `json:"notify_url"`
						}
						require.NoError(t, common.Unmarshal(raw, &payload))
						assert.EqualValues(t, 1234, payload.Amount.Total)
						assert.Equal(t, "CNY", payload.Amount.Currency)
						assert.Equal(t, settings.CallbackURL+"/api/payment/official/wechat/notify", payload.NotifyURL)
						body = `{"code_url":"weixin://wxpay/bizpayurl?pr=checkout"}`
						header = wechatFixtureHeaders(t, provider, body)
						if tamper {
							body = strings.ReplaceAll(body, "checkout", "tampered")
						}
					} else {
						assert.Equal(t, "openapi.alipay.com", req.URL.Host)
						require.NoError(t, req.ParseForm())
						assert.Equal(t, "alipay.trade.precreate", req.PostForm.Get("method"))
						assert.Equal(t, "RSA2", req.PostForm.Get("sign_type"))
						require.NoError(t, paymentRSAVerify(&merchant.PublicKey, alipaySigningContent(req.PostForm, false), req.PostForm.Get("sign")))
						var biz struct {
							Amount string `json:"total_amount"`
						}
						require.NoError(t, common.UnmarshalJsonStr(req.PostForm.Get("biz_content"), &biz))
						assert.Equal(t, "12.34", biz.Amount)
						result := `{"code":"10000","out_trade_no":"GWtest123","qr_code":"https://qr.alipay.com/checkout"}`
						signature := signOfficialPaymentFixture(t, provider, result)
						if tamper {
							result = strings.ReplaceAll(result, "checkout", "tampered")
						}
						raw, err := common.Marshal(map[string]any{"alipay_trade_precreate_response": json.RawMessage(result), "sign": signature})
						require.NoError(t, err)
						body = string(raw)
					}
					return &http.Response{StatusCode: 200, Header: header, Body: io.NopCloser(strings.NewReader(body))}, nil
				})}
				checkout, err := CreateOfficialPayment(context.Background(), settings, method, "GWtest123", "Wallet top-up", 1234)
				if tamper {
					require.Error(t, err)
					assert.Nil(t, checkout)
					return
				}
				require.NoError(t, err)
				assert.Equal(t, "12.34", checkout.Amount)
				assert.Equal(t, "CNY", checkout.Currency)
				assert.NotEmpty(t, checkout.QRCode)
			})
		}
	}
}

func TestWeChatOfficialNotification_RejectsUntrustedTransactions(t *testing.T) {
	settings, _, provider := officialPaymentFixture(t)
	for _, tc := range []struct {
		name    string
		change  func(map[string]any, http.Header)
		invalid bool
	}{
		{name: "paid"},
		{name: "different merchant", invalid: true, change: func(value map[string]any, _ http.Header) { value["mchid"] = "another-merchant" }},
		{name: "different app", invalid: true, change: func(value map[string]any, _ http.Header) { value["appid"] = "another-app" }},
		{name: "unpaid", invalid: true, change: func(value map[string]any, _ http.Header) { value["trade_state"] = "NOTPAY" }},
		{name: "wrong currency", invalid: true, change: func(value map[string]any, _ http.Header) {
			value["amount"] = map[string]any{"total": 1234, "currency": "USD"}
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			transaction := map[string]any{"appid": settings.WeChatAppID, "mchid": settings.WeChatMchID, "out_trade_no": "GWtest123", "transaction_id": "wx-transaction", "trade_state": "SUCCESS", "amount": map[string]any{"total": 1234, "currency": "CNY"}}
			if tc.change != nil {
				tc.change(transaction, nil)
			}
			plaintext, err := common.Marshal(transaction)
			require.NoError(t, err)
			block, err := aes.NewCipher([]byte(settings.WeChatAPIv3Key))
			require.NoError(t, err)
			gcm, err := cipher.NewGCM(block)
			require.NoError(t, err)
			ciphertext := gcm.Seal(nil, []byte("0123456789ab"), plaintext, []byte("transaction"))
			raw, err := common.Marshal(map[string]any{"event_type": "TRANSACTION.SUCCESS", "resource": map[string]string{"algorithm": "AEAD_AES_256_GCM", "nonce": "0123456789ab", "associated_data": "transaction", "ciphertext": base64.StdEncoding.EncodeToString(ciphertext)}})
			require.NoError(t, err)
			header := wechatFixtureHeaders(t, provider, string(raw))
			receipt, err := ParseWeChatPaymentNotification(settings, header, raw)
			if tc.invalid {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.EqualValues(t, 1234, receipt.AmountCents)
			assert.Equal(t, "GWtest123", receipt.TradeNo)
			assert.Error(t, VerifyWeChatPaymentSignature(settings, header, append(raw, ' ')), "body tampering must fail before decryption")
			header.Set("Wechatpay-Serial", "PUB_KEY_ID_UNTRUSTED")
			assert.Error(t, VerifyWeChatPaymentSignature(settings, header, raw))
			header = wechatFixtureHeaders(t, provider, string(raw))
			header.Set("Wechatpay-Timestamp", strconv.FormatInt(time.Now().Add(-10*time.Minute).Unix(), 10))
			header.Set("Wechatpay-Signature", signOfficialPaymentFixture(t, provider, header.Get("Wechatpay-Timestamp")+"\nresponse-nonce\n"+string(raw)+"\n"))
			assert.Error(t, VerifyWeChatPaymentSignature(settings, header, raw), "a correctly signed stale request must fail")
		})
	}
}

func TestAlipayOfficialNotification_VerifiesMerchantAmountAndRSA2(t *testing.T) {
	settings, _, provider := officialPaymentFixture(t)
	values := url.Values{"app_id": {settings.AlipayAppID}, "seller_id": {settings.AlipaySellerID}, "out_trade_no": {"GWtest123"}, "trade_no": {"ali-transaction"}, "trade_status": {"TRADE_SUCCESS"}, "total_amount": {"12.34"}, "sign_type": {"RSA2"}}
	assert.Equal(t, "app_id=2026000000000001&out_trade_no=GWtest123&seller_id=2088000000000001&total_amount=12.34&trade_no=ali-transaction&trade_status=TRADE_SUCCESS", alipaySigningContent(values, true))
	for _, tc := range []struct {
		name, key, value string
		invalid          bool
	}{
		{name: "paid"}, {name: "finished", key: "trade_status", value: "TRADE_FINISHED"},
		{name: "foreign app", key: "app_id", value: "other", invalid: true},
		{name: "foreign seller", key: "seller_id", value: "other", invalid: true},
		{name: "unpaid", key: "trade_status", value: "WAIT_BUYER_PAY", invalid: true},
		{name: "fractional fen", key: "total_amount", value: "12.345", invalid: true},
		{name: "negative amount", key: "total_amount", value: "-1", invalid: true},
		{name: "legacy signature", key: "sign_type", value: "RSA", invalid: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			params, err := url.ParseQuery(values.Encode())
			require.NoError(t, err)
			if tc.key != "" {
				params.Set(tc.key, tc.value)
			}
			params.Set("sign", signOfficialPaymentFixture(t, provider, alipaySigningContent(params, true)))
			receipt, err := ParseAlipayPaymentNotification(settings, params)
			if tc.invalid {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.EqualValues(t, 1234, receipt.AmountCents)
			params.Set("total_amount", "0.01")
			_, err = ParseAlipayPaymentNotification(settings, params)
			assert.Error(t, err, "changing the signed amount must fail")
			params.Add("app_id", settings.AlipayAppID)
			_, err = ParseAlipayPaymentNotification(settings, params)
			assert.Error(t, err, "duplicate form parameters must fail")
		})
	}
}

func TestOfficialPaymentQuery_OnlyAcceptsTheRequestedSignedOrder(t *testing.T) {
	settings, _, provider := officialPaymentFixture(t)
	settings.WeChatEnabled, settings.AlipayEnabled = false, false
	previous := officialPaymentHTTPClient
	t.Cleanup(func() { officialPaymentHTTPClient = previous })
	for _, method := range []string{OfficialWeChat, OfficialAlipay} {
		for _, state := range []string{"paid", "pending", "foreign order"} {
			t.Run(method+"/"+state, func(t *testing.T) {
				officialPaymentHTTPClient = &http.Client{Transport: officialPaymentTransport(func(req *http.Request) (*http.Response, error) {
					tradeNo := "GWquerytest"
					if state == "foreign order" {
						tradeNo = "GWotherorder"
					}
					var body []byte
					header := http.Header{}
					if method == OfficialWeChat {
						assert.Equal(t, http.MethodGet, req.Method)
						assert.Equal(t, "/v3/pay/transactions/out-trade-no/GWquerytest", req.URL.Path)
						assert.Equal(t, settings.WeChatMchID, req.URL.Query().Get("mchid"))
						status := "SUCCESS"
						if state == "pending" {
							status = "NOTPAY"
						}
						var err error
						body, err = common.Marshal(map[string]any{"appid": settings.WeChatAppID, "mchid": settings.WeChatMchID, "out_trade_no": tradeNo, "transaction_id": "wx-paid", "trade_state": status, "amount": map[string]any{"total": 1234, "currency": "CNY"}})
						require.NoError(t, err)
						header = wechatFixtureHeaders(t, provider, string(body))
					} else {
						require.NoError(t, req.ParseForm())
						assert.Equal(t, "alipay.trade.query", req.PostForm.Get("method"))
						status := "TRADE_SUCCESS"
						if state == "pending" {
							status = "WAIT_BUYER_PAY"
						}
						result, err := common.Marshal(map[string]any{"code": "10000", "out_trade_no": tradeNo, "trade_no": "ali-paid", "trade_status": status, "total_amount": 12.34})
						require.NoError(t, err)
						body, err = common.Marshal(map[string]any{"alipay_trade_query_response": json.RawMessage(result), "sign": signOfficialPaymentFixture(t, provider, string(result))})
						require.NoError(t, err)
					}
					return &http.Response{StatusCode: 200, Header: header, Body: io.NopCloser(strings.NewReader(string(body)))}, nil
				})}
				receipt, err := QueryOfficialPayment(context.Background(), settings, method, "GWquerytest")
				if state == "foreign order" {
					require.Error(t, err)
					return
				}
				require.NoError(t, err)
				if state == "pending" {
					assert.Nil(t, receipt)
					return
				}
				require.NotNil(t, receipt)
				assert.EqualValues(t, 1234, receipt.AmountCents)
				assert.Equal(t, "GWquerytest", receipt.TradeNo)
			})
		}
	}
}
