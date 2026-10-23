package middleware

import (
	"fmt"
	"net/http"
	"runtime/debug"

	"github.com/BrandonVee/ai-gateway/common"
	"github.com/gin-gonic/gin"
)

func RelayPanicRecover() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				common.SysLog(common.LogText("panic detected: %v", err))
				common.SysLog(common.LogText("stacktrace from panic: %s", string(debug.Stack())))
				c.JSON(http.StatusInternalServerError, gin.H{
					"error": gin.H{
						"message": fmt.Sprintf("Panic detected, error: %v. Please submit an issue here: https://github.com/BrandonVee/new-api/issues", err),
						"type":    "ai_gateway_panic",
					},
				})
				c.Abort()
			}
		}()
		c.Next()
	}
}
