package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/BrandonVee/ai-gateway/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestVersionPublishesGatewayHeader(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(Version())
	router.GET("/", func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/", nil))

	require.Equal(t, http.StatusNoContent, recorder.Code)
	assert.Equal(t, common.Version, recorder.Header().Get("X-Ai-Gateway-Version"))
}

func TestRelayPanicRecoveryPointsToCurrentIssueTracker(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(RelayPanicRecover())
	router.GET("/", func(c *gin.Context) {
		panic("test failure")
	})
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/", nil))

	require.Equal(t, http.StatusInternalServerError, recorder.Code)
	var response struct {
		Error struct {
			Message string `json:"message"`
			Type    string `json:"type"`
		} `json:"error"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.Contains(t, response.Error.Message, "https://github.com/BrandonVee/new-api/issues")
	assert.NotContains(t, response.Error.Message, "Calcium-Ion")
	assert.Equal(t, "ai_gateway_panic", response.Error.Type)
}
