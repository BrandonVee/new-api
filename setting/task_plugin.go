package setting

import (
	"slices"
	"sort"
	"strings"

	"github.com/BrandonVee/ai-gateway/common"
)

const (
	TaskPluginMarketplaceSourcesKey  = "TaskPluginMarketplaceSources"
	TaskPluginDisabledFactoryKeysKey = "TaskPluginDisabledFactoryKeys"

	legacyOfficialTaskPluginMarketplaceIndexURL = "https://www.newapi.ai/api/v1/plugins/index.json"
	legacyGitHubTaskPluginMarketplaceIndexURL   = "https://raw.githubusercontent.com/QuantumNous/new-api-plugins/main/index.json"
)

type TaskPluginMarketplaceSource struct {
	Name     string `json:"name"`
	IndexURL string `json:"index_url"`
}

func GetTaskPluginMarketplaceSources() []TaskPluginMarketplaceSource {
	common.OptionMapRWMutex.RLock()
	raw := ""
	if common.OptionMap != nil {
		raw = common.OptionMap[TaskPluginMarketplaceSourcesKey]
	}
	common.OptionMapRWMutex.RUnlock()

	raw = strings.TrimSpace(raw)
	if raw == "" {
		return []TaskPluginMarketplaceSource{}
	}
	var sources []TaskPluginMarketplaceSource
	if err := common.UnmarshalJsonStr(raw, &sources); err != nil {
		return []TaskPluginMarketplaceSource{}
	}
	if sources == nil {
		return []TaskPluginMarketplaceSource{}
	}
	// Retire the upstream project's built-in sources even when an older
	// installation persisted them. Independently configured sources remain.
	return slices.DeleteFunc(sources, func(source TaskPluginMarketplaceSource) bool {
		indexURL := strings.TrimSpace(source.IndexURL)
		return indexURL == legacyOfficialTaskPluginMarketplaceIndexURL || indexURL == legacyGitHubTaskPluginMarketplaceIndexURL
	})
}

func TaskPluginMarketplaceSources2JsonString() string {
	return "[]"
}

func ParseTaskPluginDisabledFactoryKeys(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return []string{}
	}
	var keys []string
	if err := common.Unmarshal([]byte(raw), &keys); err != nil {
		return []string{}
	}
	if keys == nil {
		return []string{}
	}
	return keys
}

func GetTaskPluginDisabledFactoryKeys() []string {
	common.OptionMapRWMutex.RLock()
	raw := ""
	if common.OptionMap != nil {
		raw = common.OptionMap[TaskPluginDisabledFactoryKeysKey]
	}
	common.OptionMapRWMutex.RUnlock()
	return ParseTaskPluginDisabledFactoryKeys(raw)
}

func SetTaskPluginDisabledFactoryKeysOption(keys []string) error {
	normalized := make([]string, 0, len(keys))
	seen := make(map[string]struct{}, len(keys))
	for _, key := range keys {
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		normalized = append(normalized, key)
	}
	sort.Strings(normalized)
	encoded, err := common.Marshal(normalized)
	if err != nil {
		return err
	}
	common.OptionMapRWMutex.Lock()
	if common.OptionMap == nil {
		common.OptionMap = make(map[string]string)
	}
	common.OptionMap[TaskPluginDisabledFactoryKeysKey] = string(encoded)
	common.OptionMapRWMutex.Unlock()
	return nil
}

func IsTaskPluginFactoryDisabled(key string) bool {
	return slices.Contains(GetTaskPluginDisabledFactoryKeys(), key)
}
