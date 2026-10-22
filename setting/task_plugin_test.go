package setting

import (
	"testing"

	"github.com/BrandonVee/ai-gateway/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTaskPluginDisabledFactoryKeysTest(t *testing.T) {
	t.Helper()
	originalMap := common.OptionMap
	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = originalMap
		common.OptionMapRWMutex.Unlock()
	})
}

func TestTaskPluginDisabledFactoryKeysRoundTripAndDedupe(t *testing.T) {
	setupTaskPluginDisabledFactoryKeysTest(t)

	assert.Empty(t, GetTaskPluginDisabledFactoryKeys())
	assert.False(t, IsTaskPluginFactoryDisabled("kling"))

	require.NoError(t, SetTaskPluginDisabledFactoryKeysOption([]string{"kling", "sora", "kling", " hailuo "}))
	assert.Equal(t, []string{"hailuo", "kling", "sora"}, GetTaskPluginDisabledFactoryKeys())
	assert.Equal(t, `["hailuo","kling","sora"]`, common.OptionMap[TaskPluginDisabledFactoryKeysKey])
	assert.True(t, IsTaskPluginFactoryDisabled("kling"))
	assert.True(t, IsTaskPluginFactoryDisabled("hailuo"))
	assert.False(t, IsTaskPluginFactoryDisabled("google"))
}

func TestTaskPluginDisabledFactoryKeysBadJSONReturnsEmpty(t *testing.T) {
	setupTaskPluginDisabledFactoryKeysTest(t)

	for _, testCase := range []struct {
		name string
		raw  string
	}{
		{name: "absent", raw: ""},
		{name: "null", raw: "null"},
		{name: "object", raw: "{}"},
		{name: "number", raw: "1"},
		{name: "truncated", raw: `["kling"`},
		{name: "not json", raw: "kling"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			common.OptionMapRWMutex.Lock()
			if testCase.raw == "" {
				delete(common.OptionMap, TaskPluginDisabledFactoryKeysKey)
			} else {
				common.OptionMap[TaskPluginDisabledFactoryKeysKey] = testCase.raw
			}
			common.OptionMapRWMutex.Unlock()

			assert.Empty(t, GetTaskPluginDisabledFactoryKeys())
			assert.False(t, IsTaskPluginFactoryDisabled("kling"))
		})
	}
}

func TestTaskPluginMarketplaceSourcesOnlyUseIndependentSources(t *testing.T) {
	setupTaskPluginDisabledFactoryKeysTest(t)
	custom := TaskPluginMarketplaceSource{Name: "Private", IndexURL: "https://plugins.gateway.example/index.json"}
	for _, testCase := range []struct {
		name string
		raw  string
		want []TaskPluginMarketplaceSource
	}{
		{name: "unset", raw: "", want: []TaskPluginMarketplaceSource{}},
		{name: "invalid", raw: "{", want: []TaskPluginMarketplaceSource{}},
		{name: "null", raw: "null", want: []TaskPluginMarketplaceSource{}},
		{name: "legacy defaults", raw: `[{"name":"Official","index_url":"https://www.newapi.ai/api/v1/plugins/index.json"},{"name":"GitHub","index_url":"https://raw.githubusercontent.com/QuantumNous/new-api-plugins/main/index.json"}]`, want: []TaskPluginMarketplaceSource{}},
		{name: "custom alongside legacy", raw: `[{"name":"Official","index_url":"https://www.newapi.ai/api/v1/plugins/index.json"},{"name":"Private","index_url":"https://plugins.gateway.example/index.json"}]`, want: []TaskPluginMarketplaceSource{custom}},
		{name: "independent source", raw: `[{"name":"Private","index_url":"https://plugins.gateway.example/index.json"}]`, want: []TaskPluginMarketplaceSource{custom}},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			common.OptionMapRWMutex.Lock()
			common.OptionMap[TaskPluginMarketplaceSourcesKey] = testCase.raw
			common.OptionMapRWMutex.Unlock()

			assert.Equal(t, testCase.want, GetTaskPluginMarketplaceSources())
		})
	}
}
