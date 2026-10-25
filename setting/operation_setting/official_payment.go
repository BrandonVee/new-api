package operation_setting

import "github.com/BrandonVee/ai-gateway/common"

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

func GetOfficialPaymentSettings() OfficialPaymentSettings {
	common.OptionMapRWMutex.RLock()
	raw := common.OptionMap[OfficialPaymentOptionKey]
	common.OptionMapRWMutex.RUnlock()
	var settings OfficialPaymentSettings
	_ = common.UnmarshalJsonStr(raw, &settings)
	// Existing merchants retain their original face-to-face checkout until they
	// explicitly enable additional products.
	if settings.AlipayProducts == nil {
		settings.AlipayProducts = []string{"face_to_face"}
	}
	return settings
}
