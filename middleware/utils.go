package middleware

import (
	"net/http"

	"github.com/BrandonVee/ai-gateway/common"
	"github.com/BrandonVee/ai-gateway/dto"
	"github.com/BrandonVee/ai-gateway/logger"
	pluginruntime "github.com/BrandonVee/ai-gateway/pkg/jsplugin"
	"github.com/BrandonVee/ai-gateway/relaykit/types"
	"github.com/gin-gonic/gin"
)

func abortWithOpenAiMessage(c *gin.Context, statusCode int, message string, code ...types.ErrorCode) {
	codeStr := ""
	if len(code) > 0 {
		codeStr = string(code[0])
	}
	userId := c.GetInt("id")
	_, preparedPluginRoute := c.Get(pluginruntime.ContextKeyRouteRequest)
	if !preparedPluginRoute || !RespondTaskPluginError(c, &dto.TaskError{
		Code:       codeStr,
		Message:    message,
		StatusCode: statusCode,
	}) {
		c.JSON(statusCode, gin.H{
			"error": gin.H{
				"message": common.MessageWithRequestId(message, c.GetString(common.RequestIdKey)),
				"type":    "ai_gateway_error",
				"code":    codeStr,
			},
		})
	}
	c.Abort()
	logger.LogError(c.Request.Context(), common.LogText("user %d | %s", userId, message))
}

// invalidRequestStatus is the status of a request whose body could not be
// read or parsed: 413 when the body exceeds MAX_REQUEST_BODY_MB, else 400.
func invalidRequestStatus(err error) int {
	if common.IsRequestBodyTooLargeError(err) {
		return http.StatusRequestEntityTooLarge
	}
	return http.StatusBadRequest
}

func abortWithMidjourneyMessage(c *gin.Context, statusCode int, code int, description string) {
	c.JSON(statusCode, gin.H{
		"description": description,
		"type":        "ai_gateway_error",
		"code":        code,
	})
	c.Abort()
	logger.LogError(c.Request.Context(), description)
}
