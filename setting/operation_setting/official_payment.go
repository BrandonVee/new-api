package operation_setting

import (
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"strings"

	"github.com/BrandonVee/ai-gateway/common"
)

// Keep the merchant credentials in one option so configuration changes are atomic.
// The Secret suffix also excludes the entire option from the general settings API.
const OfficialPaymentOptionKey = "OfficialPaymentSecret"

type OfficialPaymentSettings struct {
	CallbackURL       string   `json:"callback_url"`
	WeChatEnabled     bool     `json:"wechat_enabled"`
	WeChatAppID       string   `json:"wechat_app_id"`
	WeChatMchID       string   `json:"wechat_mch_id"`
	WeChatSerialNo    string   `json:"wechat_serial_no"`
	WeChatPrivateKey  string   `json:"wechat_private_key"`
	WeChatAPIv3Key    string   `json:"wechat_api_v3_key"`
	WeChatPublicKeyID string   `json:"wechat_public_key_id"`
	WeChatPublicKey   string   `json:"wechat_public_key"`
	AlipayEnabled     bool     `json:"alipay_enabled"`
	AlipayAppID       string   `json:"alipay_app_id"`
	AlipaySellerID    string   `json:"alipay_seller_id"`
	AlipayPrivateKey  string   `json:"alipay_private_key"`
	AlipayPublicKey   string   `json:"alipay_public_key"`
	AlipayProducts    []string `json:"alipay_products"`
}

// NormalizePaymentPrivateKey adds the PEM envelope omitted by some Alipay
// key-copy flows. Existing PEM values are preserved unchanged.
func NormalizePaymentPrivateKey(value string) string {
	return normalizePaymentPEM(value, func(der []byte) string {
		if _, err := x509.ParsePKCS8PrivateKey(der); err == nil {
			return "PRIVATE KEY"
		}
		if _, err := x509.ParsePKCS1PrivateKey(der); err == nil {
			return "RSA PRIVATE KEY"
		}
		return ""
	})
}

// NormalizePaymentPublicKey adds the PEM envelope omitted by some Alipay key
// copy flows. Existing PEM values are preserved unchanged.
func NormalizePaymentPublicKey(value string) string {
	return normalizePaymentPEM(value, func(der []byte) string {
		if _, err := x509.ParsePKIXPublicKey(der); err == nil {
			return "PUBLIC KEY"
		}
		if _, err := x509.ParsePKCS1PublicKey(der); err == nil {
			return "RSA PUBLIC KEY"
		}
		if _, err := x509.ParseCertificate(der); err == nil {
			return "CERTIFICATE"
		}
		return ""
	})
}

func normalizePaymentPEM(value string, blockType func([]byte) string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if block, rest := pem.Decode([]byte(value)); block != nil && strings.TrimSpace(string(rest)) == "" {
		return value
	}
	compact := value
	if strings.Contains(compact, "-----BEGIN ") || strings.Contains(compact, "-----END ") {
		var body strings.Builder
		for line := range strings.SplitSeq(compact, "\n") {
			line = strings.TrimSpace(line)
			if (strings.HasPrefix(line, "-----BEGIN ") || strings.HasPrefix(line, "-----END ")) && strings.HasSuffix(line, "-----") {
				continue
			}
			body.WriteString(line)
		}
		compact = strings.Join(strings.Fields(body.String()), "")
	} else {
		compact = strings.Join(strings.Fields(compact), "")
	}
	der, err := base64.StdEncoding.DecodeString(compact)
	if err != nil {
		return value
	}
	typeName := blockType(der)
	if typeName == "" {
		return value
	}
	return string(pem.EncodeToMemory(&pem.Block{Type: typeName, Bytes: der}))
}

// NormalizeOfficialPaymentSettings canonicalizes keys before validation and
// persistence, while also allowing legacy raw key values to be used at runtime.
func NormalizeOfficialPaymentSettings(settings OfficialPaymentSettings) OfficialPaymentSettings {
	settings.WeChatPrivateKey = NormalizePaymentPrivateKey(settings.WeChatPrivateKey)
	settings.WeChatPublicKey = NormalizePaymentPublicKey(settings.WeChatPublicKey)
	settings.AlipayPrivateKey = NormalizePaymentPrivateKey(settings.AlipayPrivateKey)
	settings.AlipayPublicKey = NormalizePaymentPublicKey(settings.AlipayPublicKey)
	return settings
}

func GetOfficialPaymentSettings() OfficialPaymentSettings {
	common.OptionMapRWMutex.RLock()
	raw := common.OptionMap[OfficialPaymentOptionKey]
	common.OptionMapRWMutex.RUnlock()
	var settings OfficialPaymentSettings
	_ = common.UnmarshalJsonStr(raw, &settings)
	settings = NormalizeOfficialPaymentSettings(settings)
	// Existing merchants retain their original face-to-face checkout until they
	// explicitly enable additional products.
	if settings.AlipayProducts == nil {
		settings.AlipayProducts = []string{"face_to_face"}
	}
	return settings
}
