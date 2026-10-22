package sub2api

import (
	"github.com/BrandonVee/ai-gateway/relay/channel/aigateway"
)

type Adaptor struct {
	aigateway.Adaptor
}

func (a *Adaptor) GetModelList() []string {
	return ModelList
}

func (a *Adaptor) GetChannelName() string {
	return ChannelName
}
