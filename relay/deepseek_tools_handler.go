package relay

import (
	"errors"
	"fmt"
	"io"
	"net/http"

	"github.com/BrandonVee/ai-gateway/constant"
	"github.com/BrandonVee/ai-gateway/logger"
	relaycommon "github.com/BrandonVee/ai-gateway/relay/common"
	relayconstant "github.com/BrandonVee/ai-gateway/relay/constant"
	"github.com/BrandonVee/ai-gateway/relay/helper"
	"github.com/BrandonVee/ai-gateway/relaykit/dto"
	"github.com/BrandonVee/ai-gateway/relaykit/types"
	"github.com/BrandonVee/ai-gateway/service"

	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
)

// DeepSeekToolsHelper relays the DeepSeek Search and Fetch APIs like
// /v1/alpha/search: the raw body is forwarded, the response is returned
// unchanged, and the call is billed at the routing name's request price with
// no tokens.
func DeepSeekToolsHelper(c *gin.Context, info *relaycommon.RelayInfo) (aiGatewayError *types.AiGatewayError) {
	info.InitChannelMeta(c)

	switch info.ChannelType {
	case constant.ChannelTypeDeepSeek,
		constant.ChannelTypeAiGateway,
		constant.ChannelTypeSub2API,
		constant.ChannelTypeAdvancedCustom:
	default:
		// Allow retry onto another channel that may support this endpoint.
		return types.NewError(
			fmt.Errorf("channel does not support %s", c.Request.URL.Path),
			types.ErrorCodeInvalidRequest,
		)
	}

	request, ok := info.Request.(*dto.DeepSeekToolsRequest)
	if !ok {
		return types.NewErrorWithStatusCode(
			fmt.Errorf("invalid request type, expected *dto.DeepSeekToolsRequest, got %T", info.Request),
			types.ErrorCodeInvalidRequest,
			http.StatusBadRequest,
			types.ErrOptionWithSkipRetry(),
		)
	}

	err := helper.ModelMappedHelper(c, info, request)
	if err != nil {
		return types.NewError(err, types.ErrorCodeChannelModelMappedError, types.ErrOptionWithSkipRetry())
	}

	jsonData, err := buildAlphaSearchRequestBody(request.RawBody, info.OriginModelName, info.UpstreamModelName)
	if err != nil {
		return types.NewError(err, types.ErrorCodeConvertRequestFailed, types.ErrOptionWithSkipRetry())
	}

	if len(info.ParamOverride) > 0 {
		jsonData, err = relaycommon.ApplyParamOverrideWithRelayInfo(jsonData, info)
		if err != nil {
			return aiGatewayErrorFromParamOverride(err)
		}
	}

	logger.LogDebug(c, "requestBody: %s", jsonData)
	body, closer, err := relaycommon.NewOutboundJSONBody(jsonData)
	if err != nil {
		return types.NewError(err, types.ErrorCodeConvertRequestFailed, types.ErrOptionWithSkipRetry())
	}
	defer closer.Close()

	adaptor := GetAdaptor(info.ApiType)
	if adaptor == nil {
		return types.NewError(fmt.Errorf("invalid api type: %d", info.ApiType), types.ErrorCodeInvalidApiType, types.ErrOptionWithSkipRetry())
	}
	adaptor.Init(info)

	resp, err := adaptor.DoRequest(c, info, body)
	if err != nil {
		return types.NewOpenAIError(err, types.ErrorCodeDoRequestFailed, http.StatusInternalServerError)
	}

	statusCodeMappingStr := c.GetString("status_code_mapping")
	httpResp, ok := resp.(*http.Response)
	if !ok || httpResp == nil {
		return types.NewOpenAIError(errors.New("invalid http response"), types.ErrorCodeDoRequestFailed, http.StatusInternalServerError)
	}
	defer httpResp.Body.Close()

	if httpResp.StatusCode < 200 || httpResp.StatusCode >= 300 {
		aiGatewayError = service.RelayErrorHandler(c.Request.Context(), httpResp, false)
		service.ResetStatusCode(aiGatewayError, statusCodeMappingStr)
		return aiGatewayError
	}

	responseBody, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return types.NewOpenAIError(err, types.ErrorCodeReadResponseBodyFailed, http.StatusInternalServerError, types.ErrOptionWithSkipRetry())
	}
	service.IOCopyBytesGracefully(c, httpResp, responseBody)

	// DeepSeek bills a successful request only when it returns something: a
	// non-empty results array for Search, page content for Fetch. A billable
	// call settles at the routing name's request price; any other response
	// releases the reservation.
	var billable bool
	switch info.RelayMode {
	case relayconstant.RelayModeToolsFetch:
		billable = gjson.GetBytes(responseBody, "content").String() != ""
	default:
		results := gjson.GetBytes(responseBody, "results")
		billable = results.IsArray() && len(results.Array()) > 0
	}
	if !billable {
		if info.Billing != nil {
			info.Billing.Refund(c)
		}
		return nil
	}

	service.PostTextConsumeQuota(c, info, &dto.Usage{}, nil)
	return nil
}
