package relay

import (
	relaycommon "github.com/BrandonVee/ai-gateway/relay/common"
	"github.com/BrandonVee/ai-gateway/relaykit/types"
)

func aiGatewayErrorFromParamOverride(err error) *types.AiGatewayError {
	if fixedErr, ok := relaycommon.AsParamOverrideReturnError(err); ok {
		return relaycommon.AiGatewayErrorFromParamOverride(fixedErr)
	}
	return types.NewError(err, types.ErrorCodeChannelParamOverrideInvalid, types.ErrOptionWithSkipRetry())
}
